"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, startTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ComplianceNotice } from "@/components/chat/ComplianceNotice";
import { MessageList } from "@/components/chat/MessageList";
import {
  PLACEHOLDERS,
  SCENE_TABS,
  type ChatMessage,
  type ConfirmCardBlock,
  type HandoffBlock,
  type MessageContentBlock,
  type ReportPublishCardBlock,
} from "@/components/chat/types";
import { HANDOFF_DISMISS_REPLY } from "@/lib/handoff/constants";
import { buildFundWatchlistAnalyzePrompt, buildFundWatchlistInputHint } from "@/lib/fund/placeholder";
import { settingsPath } from "@/lib/settings/copy";
import { MSG_STOPPED_TEXT } from "@/lib/chat/stop-generation";
import {
  applyAssistantStreamContent,
  applyDoneEventToMessages,
  applyReasoningSummaryToMessage,
  applyStageEventToMessage,
  applyUserPersistedToMessages,
  appendStoppedTask,
  createOptimisticPlannerTask,
  finalizeStreamingMessage,
  hydrateWorkflowTasksBatch,
  isTaskProgressExpanded,
  mapApiMessageToChatMessage,
  mergeConversationMessages,
  toggleTaskProgressExpanded,
  type LoadConversationOptions,
} from "@/lib/chat/message-workflow";
import { mergeWorkflowTaskLists } from "@/lib/chat/task-progress";
import { createStreamContentBatcher } from "@/lib/chat/stream-content-batcher";
import {
  findConversationTabHint,
  getCachedConversationSnapshot,
  getCachedConversations,
  writeConversationSnapshot,
} from "@/lib/chat/chat-session-cache";
import {
  useCachedConversationBootstrap,
} from "@/lib/chat/use-chat-session-cache";
import { navigateToConversation } from "@/lib/chat/navigate-conversation";
import { CONVERSATION_MESSAGES_LIMIT } from "@/lib/chat/conversation-messages-limit";
import {
  fetchScenePlaceholder,
  invalidateScenePlaceholder,
} from "@/lib/chat/placeholder-cache";
import { useConversationList } from "@/contexts/ConversationListContext";
import { useReadiness } from "@/contexts/ReadinessContext";
import {
  clampSlashHighlightIndex,
  dismissSlashMenuInput,
  filterSlashCommands,
  formatSlashCommandInsert,
  getChatInputPlaceholder,
  isChatInputBlocked,
  isChatSendBlocked,
  shouldShowSlashMenu,
  stepSlashHighlightIndex,
} from "@/lib/chat/input-policy";
import {
  ModeBLeftTabs,
  ModeBReportPane,
  type ModeBLeftTab,
} from "@/components/chat/ModeBReportPane";
import {
  CHAT_MODE_A_CONTENT,
  chatColumnInnerClass,
  chatColumnOuterClass,
  chatFooterWrapClass,
  chatMainClass,
  chatScrollAreaClass,
  chatScrollBodyClass,
} from "@/components/chat/chat-layout";
import { ResizableChatPane } from "@/components/chat/ResizableChatPane";
import type { SceneId } from "@/harness/registry/load";
import {
  sanitizeUserContent,
} from "@/lib/chat/user-content";
import {
  abortActiveStream,
  clearLiveStreamBuffer,
  finishStreamSession,
  getActiveStreamSession,
  getLiveStreamBuffer,
  isStreamActive,
  isStreamOwner,
  patchLiveStreamBuffer,
  startStreamSession,
} from "@/lib/chat/active-stream";
import {
  useActiveStreamConversationId,
  useIsSendBlocked,
  useIsStreamOwner,
} from "@/lib/chat/use-active-stream";
import { MessageSkeleton } from "@/components/ui/Skeleton";
import { ErrorWithRetry } from "@/components/ui/ErrorWithRetry";
import { Banner } from "@/components/ui/Banner";
import { TRANSIENT_NOTICE_MS, useAutoDismissEffect } from "@/lib/ui/transient-notice";
import { Spinner } from "@/components/ui/Spinner";
import {
  decideLockedTabSwitch,
  isPreviewingOtherScene,
  lockedTabCreateConfirmMessage,
  shouldUseLockedTabSwitch,
} from "@/lib/chat/chat-tab-switch";
import {
  createConversationEntry,
  resolveConversationEntry,
} from "@/lib/chat/conversation-entry";
import { createClientMessageId } from "@/lib/chat/client-message-id";
import {
  extractRunIdFromDraftPath,
  isLatestReportPublishCard,
  previewTargetFromCard,
  previewTargetFromPending,
  previewTargetKey,
  reportCardKey,
  type ReportPreviewTarget,
} from "@/lib/chat/report-publish-card";

interface PendingReportDraft {
  report_type: "profile" | "plan" | "portfolio" | "fund";
  report_name?: string;
  file_path?: string;
  run_id?: string;
  fund_code?: string;
}

type ChatReadiness = {
  models: NonNullable<ReturnType<typeof useReadiness>["readiness"]>["models"];
  database: NonNullable<ReturnType<typeof useReadiness>["readiness"]>["database"];
};

export function ChatShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversationId = searchParams.get("c");
  const conversationBootstrap = useCachedConversationBootstrap(conversationId);
  const { conversations, setConversations, refreshConversations } =
    useConversationList();
  const { readiness: readinessResult, readinessLoading } = useReadiness();
  const readiness: ChatReadiness | null = readinessResult
    ? {
        models: readinessResult.models,
        database: readinessResult.database,
      }
    : null;

  const [activeTab, setActiveTab] = useState<SceneId>(
    () => conversationBootstrap.activeTab,
  );
  const [fundSubTab, setFundSubTab] = useState<"chat" | "watchlist">("chat");
  const [modeBLeftTab, setModeBLeftTab] = useState<ModeBLeftTab>("preview");
  const [pendingDraft, setPendingDraft] = useState<PendingReportDraft | null>(
    null,
  );
  const [previewDraftTarget, setPreviewDraftTarget] =
    useState<ReportPreviewTarget | null>(null);
  const [previewScrollToken, setPreviewScrollToken] = useState(0);
  const [previewRefreshToken, setPreviewRefreshToken] = useState(0);
  const [holdingsRefreshToken, setHoldingsRefreshToken] = useState(0);
  const [configRefreshToken, setConfigRefreshToken] = useState(0);
  const prevPendingDraftKeyRef = useRef("");
  const [messages, setMessages] = useState<ChatMessage[]>(
    () => conversationBootstrap.messages,
  );
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const [input, setInput] = useState("");
  /** programmatic send text (set by panel, consumed by sendMessage) */
  const programmaticTextRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slashCommands, setSlashCommands] = useState<
    Array<{ id: string; description_zh: string }>
  >([]);
  const [slashHighlightIndex, setSlashHighlightIndex] = useState(0);
  const [scenePlaceholder, setScenePlaceholder] = useState<{
    title?: string;
    body?: string;
    hint?: string;
  }>({});
  const [confirmBusy, setConfirmBusy] = useState(false);
  const conversationIdRef = useRef<string | null>(conversationId);
  conversationIdRef.current = conversationId;
  const activeStreamConversationId = useActiveStreamConversationId();
  const isStreamingHere = useIsStreamOwner(conversationId);
  const isSendBlocked = useIsSendBlocked(conversationId);
  const [handoffToast, setHandoffToast] = useState<string | null>(null);
  const bgPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bgPollJobIdsRef = useRef<string[]>([]);
  const bgPollScheduleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tabPatchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTabPatchRef = useRef<{ convId: string; tab: SceneId } | null>(
    null,
  );
  const [bgNotice, setBgNotice] = useState<string | null>(null);
  // 首屏：切换对话时的消息加载骨架
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [convNotFound, setConvNotFound] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const inputTextareaRef = useRef<HTMLTextAreaElement>(null);
  // F2: 待发图片
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImages, setPendingImages] = useState<
    Array<{ file: File; preview: string }>
  >([]);
  // G1: Vision 识别 Toast
  const [visionToast, setVisionToast] = useState<string | null>(null);
  const skipConvLoadRef = useRef<string | null>(null);
  const bootstrapInFlightRef = useRef(false);
  const loadConversationGenRef = useRef(0);
  const sendInFlightRef = useRef(false);
  // 管线锁定：进入某个修改管线后，禁止切换修改其他管线
  const [editingPipeline, setEditingPipeline] = useState<string | null>(null);

  // 切换对话时重置管线锁定
  useEffect(() => {
    setEditingPipeline(null);
  }, [conversationId]);

  // 根据当前场景设置左侧标签默认值
  useEffect(() => {
    if (activeTab === "profile") {
      setModeBLeftTab("profile_view");
    } else if (activeTab === "plan") {
      // plan 场景默认显示"当前配置"标签
      setModeBLeftTab("current_config");
    } else {
      if (modeBLeftTab !== "preview" && modeBLeftTab !== "watchlist" && modeBLeftTab !== "holdings") {
        setModeBLeftTab("preview");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // 场景切换时校验草稿类型：仅当 pendingDraft.report_type 匹配当前场景才展示预览
  const pendingDraftRef = useRef(pendingDraft);
  pendingDraftRef.current = pendingDraft;
  useEffect(() => {
    const pending = pendingDraftRef.current;
    if (activeTab === "chat") {
      setPreviewDraftTarget(null);
      prevPendingDraftKeyRef.current = "";
      return;
    }
    if (pending?.report_type === activeTab && pending.run_id) {
      syncPreviewWithPending(pending);
    } else {
      setPreviewDraftTarget(null);
      prevPendingDraftKeyRef.current = "";
    }
  }, [activeTab, pendingDraft]);

  /** 将 SSE 更新写入对应对话的 live buffer；仅当用户正在查看该对话时同步到 UI */
  function patchStreamMessages(
    streamConvId: string,
    patch: (prev: ChatMessage[]) => ChatMessage[],
  ) {
    const initial =
      conversationIdRef.current === streamConvId ? messagesRef.current : [];
    const next = patchLiveStreamBuffer(streamConvId, patch, initial);
    if (conversationIdRef.current === streamConvId) {
      setMessages(next);
    }
  }

  /** 切换 ?c= 时同步本地缓存，避免先清空再加载的闪烁 */
  useLayoutEffect(() => {
    if (!conversationId) return;
    const live = getLiveStreamBuffer(conversationId);
    if (live) {
      setMessages(live);
      const snap = getCachedConversationSnapshot(conversationId);
      if (snap) setActiveTab(snap.activeTab);
      setLoadingMessages(false);
      return;
    }
    const snap = getCachedConversationSnapshot(conversationId);
    if (snap) {
      setMessages(snap.messages);
      setActiveTab(snap.activeTab);
      setLoadingMessages(false);
      return;
    }
    setMessages([]);
    const tabHint = findConversationTabHint(
      conversationId,
      getCachedConversations(),
    );
    if (tabHint) setActiveTab(tabHint);
  }, [conversationId]);

  useEffect(() => {
    void fetch(`/api/commands?scene=${activeTab}&slash_only=true`)
      .then((r) => r.json())
      .then((d) => setSlashCommands(d.commands ?? []));
  }, [activeTab]);

  // G1: Vision toast auto-dismiss
  useEffect(() => {
    if (!visionToast) return;
    const t = setTimeout(() => setVisionToast(null), TRANSIENT_NOTICE_MS);
    return () => clearTimeout(t);
  }, [visionToast]);

  useEffect(() => {
    if (!handoffToast) return;
    const t = setTimeout(() => setHandoffToast(null), TRANSIENT_NOTICE_MS);
    return () => clearTimeout(t);
  }, [handoffToast]);

  const clearBgNotice = useCallback(() => setBgNotice(null), []);
  useAutoDismissEffect(bgNotice, clearBgNotice);

  useEffect(() => {
    if (!readiness?.database.ready) return;
    if (activeTab === "chat") return;
    void fetchScenePlaceholder(activeTab)
      .then((d) => setScenePlaceholder(d))
      .catch(() => setScenePlaceholder({}));
  }, [activeTab, readiness?.database.ready, messages.length]);

  function scheduleBackgroundPoll(convId: string) {
    if (bgPollScheduleRef.current) {
      clearTimeout(bgPollScheduleRef.current);
    }
    bgPollScheduleRef.current = setTimeout(() => {
      bgPollScheduleRef.current = null;
      void pollBackgroundJobs(convId);
    }, 300);
  }

  function scheduleActiveTabPatch(convId: string, tab: SceneId) {
    pendingTabPatchRef.current = { convId, tab };
    if (tabPatchTimerRef.current) clearTimeout(tabPatchTimerRef.current);
    tabPatchTimerRef.current = setTimeout(() => {
      tabPatchTimerRef.current = null;
      const pending = pendingTabPatchRef.current;
      if (!pending) return;
      void fetch(`/api/conversations/${pending.convId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata: { active_tab: pending.tab } }),
      }).catch(() => {});
    }, 300);
  }

  function refreshScenePlaceholder(tab: SceneId = activeTab) {
    invalidateScenePlaceholder(tab);
    void fetchScenePlaceholder(tab)
      .then((d) => setScenePlaceholder(d))
      .catch(() => setScenePlaceholder({}));
  }

  useEffect(() => {
    if (!conversationId) {
      void bootstrapConversation();
      return;
    }
    if (skipConvLoadRef.current === conversationId) {
      skipConvLoadRef.current = null;
      scheduleBackgroundPoll(conversationId);
      return () => {
        if (bgPollScheduleRef.current) {
          clearTimeout(bgPollScheduleRef.current);
          bgPollScheduleRef.current = null;
        }
        if (bgPollRef.current) {
          clearInterval(bgPollRef.current);
          bgPollRef.current = null;
        }
      };
    }
    const cached = getCachedConversationSnapshot(conversationId);
    void loadConversation(conversationId, { showSkeleton: !cached });
    scheduleBackgroundPoll(conversationId);
    return () => {
      if (bgPollScheduleRef.current) {
        clearTimeout(bgPollScheduleRef.current);
        bgPollScheduleRef.current = null;
      }
      if (bgPollRef.current) {
        clearInterval(bgPollRef.current);
        bgPollRef.current = null;
      }
    };
  }, [conversationId]);

  async function pollBackgroundJobs(convId: string) {
    try {
      const res = await fetch(
        `/api/conversations/${convId}/background-jobs?status=running`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        jobs?: Array<{ id: string; status: string; run_id: string }>;
      };
      if (!data.jobs?.length) return;

      bgPollJobIdsRef.current = data.jobs.map((j) => j.id);

      async function syncBackgroundTaskProgress(
        jobs: Array<{ id: string; run_id: string }>,
      ) {
        if (conversationIdRef.current !== convId) return;
        for (const job of jobs) {
          const tasksRes = await fetch(
            `/api/conversations/${convId}/workflow-tasks?run_id=${encodeURIComponent(job.run_id)}`,
          );
          if (!tasksRes.ok) continue;
          const body = (await tasksRes.json()) as {
            tasks?: import("@/lib/chat/task-progress").WorkflowTaskItem[];
          };
          if (!body.tasks?.length) continue;
          setMessages((prev) =>
            prev.map((m) =>
              m.backgroundJobId === job.id
                ? {
                    ...m,
                    workflowTasks: mergeWorkflowTaskLists(
                      m.workflowTasks,
                      body.tasks!,
                    ),
                    backgroundRunId: job.run_id,
                    taskProgressExpanded: true,
                  }
                : m,
            ),
          );
        }
      }

      await syncBackgroundTaskProgress(data.jobs);

      if (bgPollRef.current) clearInterval(bgPollRef.current);
      bgPollRef.current = setInterval(() => {
        void (async () => {
          const r = await fetch(
            `/api/conversations/${convId}/background-jobs?status=running`,
          );
          if (!r.ok) return;
          const body = (await r.json()) as {
            jobs?: Array<{ id: string; status: string; run_id: string }>;
          };
          if (body.jobs?.length) {
            await syncBackgroundTaskProgress(body.jobs);
            return;
          }
          if (bgPollRef.current) {
            clearInterval(bgPollRef.current);
            bgPollRef.current = null;
          }
          const completedJobId = bgPollJobIdsRef.current[0];
          bgPollJobIdsRef.current = [];
          await syncJobDoneConversation(convId, completedJobId);
          setBgNotice("后台任务已完成，对话已更新。");
        })();
      }, 800);
    } catch {
      /* ignore poll errors */
    }
  }

  async function bootstrapConversation() {
    if (bootstrapInFlightRef.current) return;
    bootstrapInFlightRef.current = true;
    try {
      const id = await resolveConversationEntry();
      if (!id) return;

      await refreshConversations();

      const cached = getCachedConversationSnapshot(id);
      if (cached) {
        setMessages(cached.messages);
        setActiveTab(cached.activeTab);
      }
      skipConvLoadRef.current = id;
      // CH-FIRST-01：先写入 ?c=，首屏不展示消息骨架（侧栏已有上下文）
      navigateToConversation(router, id);
      await loadConversation(id, { showSkeleton: false });
    } finally {
      bootstrapInFlightRef.current = false;
    }
  }

  function parseContentBlock(raw: Record<string, unknown>): MessageContentBlock | null {
    if (raw.type === "handoff_card") {
      return {
        type: "handoff_card",
        target_scene: raw.target_scene as HandoffBlock["target_scene"],
        target_label: String(raw.target_label ?? ""),
        status: (raw.status as HandoffBlock["status"]) ?? "pending",
        handoff_summary:
          typeof raw.handoff_summary === "string" ? raw.handoff_summary : undefined,
      };
    }
    if (raw.type === "confirm_card") {
      return {
        type: "confirm_card",
        status: (raw.status as ConfirmCardBlock["status"]) ?? "active",
        artifact_id: String(raw.artifact_id),
        card_kind: String(raw.card_kind ?? "profile_basic"),
        summary_zh: String(raw.summary_zh ?? ""),
        card_title: typeof raw.card_title === "string" ? raw.card_title : undefined,
      };
    }
    if (raw.type === "report_publish_card") {
      const rt = String(raw.report_type ?? "profile");
      const reportType =
        rt === "plan" || rt === "portfolio" || rt === "fund" ? rt : "profile";
      return {
        type: "report_publish_card",
        status: (raw.status as ReportPublishCardBlock["status"]) ?? "active",
        report_type: reportType,
        goal_constraint_id:
          typeof raw.goal_constraint_id === "string"
            ? raw.goal_constraint_id
            : undefined,
        holdings_version_id:
          typeof raw.holdings_version_id === "string"
            ? raw.holdings_version_id
            : undefined,
        fund_code: typeof raw.fund_code === "string" ? raw.fund_code : undefined,
        scope: typeof raw.scope === "string" ? raw.scope : undefined,
        report_name: String(raw.report_name ?? "报告"),
        file_path: typeof raw.file_path === "string" ? raw.file_path : undefined,
        notice_zh: typeof raw.notice_zh === "string" ? raw.notice_zh : undefined,
      };
    }
    return null;
  }

  function syncPreviewWithPending(
    pending: PendingReportDraft | null | undefined,
    options?: { forceScroll?: boolean },
  ) {
    const target = previewTargetFromPending(pending);
    if (!target?.run_id && !target?.file_path) {
      setPreviewDraftTarget(null);
      prevPendingDraftKeyRef.current = "";
      return;
    }
    const key = previewTargetKey(target);
    const changed = key !== prevPendingDraftKeyRef.current;
    prevPendingDraftKeyRef.current = key;
    if (changed) {
      setPreviewDraftTarget(target);
      setPreviewScrollToken((t) => t + 1);
    } else {
      setPreviewRefreshToken((t) => t + 1);
    }
    setModeBLeftTab("preview");
    if (options?.forceScroll) {
      setPreviewScrollToken((t) => t + 1);
    }
  }

  function focusPreviewOnReportCard(card: ReportPublishCardBlock) {
    const target = previewTargetFromCard(card);
    if (!target.run_id && !target.file_path) {
      return;
    }
    prevPendingDraftKeyRef.current = previewTargetKey(target);
    setPreviewDraftTarget(target);
    setModeBLeftTab("preview");
    setPreviewScrollToken((t) => t + 1);
  }

  function applyReportCardDraftFromStream(card: ReportPublishCardBlock) {
    const runId = card.file_path
      ? extractRunIdFromDraftPath(card.file_path)
      : undefined;
    const pendingData: PendingReportDraft = {
      report_type: card.report_type,
      report_name: card.report_name,
      file_path: card.file_path,
      run_id: runId,
      fund_code: card.fund_code,
    };
    setPendingDraft(pendingData);
    focusPreviewOnReportCard(card);
    syncPreviewWithPending(pendingData);
  }

  async function loadConversation(id: string, options: LoadConversationOptions = {}) {
    const loadGen = ++loadConversationGenRef.current;
    const snapshot = getCachedConversationSnapshot(id);
    const showSkeleton = options.showSkeleton ?? !snapshot;
    // 仅切换对话时用缓存打底；流式结束后的静默刷新（showSkeleton: false）不能覆盖当前 live 消息
    const primeFromSnapshot =
      snapshot &&
      options.showSkeleton !== true &&
      options.showSkeleton !== false;
    if (primeFromSnapshot) {
      setMessages(snapshot.messages);
      setActiveTab(snapshot.activeTab);
      setLoadingMessages(false);
    }
    if (showSkeleton) {
      setLoadingMessages(true);
    }
    setConvNotFound(false);
    try {
      const res = await fetch(
        `/api/conversations/${id}?messages_limit=${CONVERSATION_MESSAGES_LIMIT}`,
      );
      if (!res.ok) {
        if (res.status === 404) {
          setConvNotFound(true);
          setError("这条对话不存在或已被删除。");
          // CH-FIRST-01: 定位最近历史；仅无历史时才 POST 新建
          void (async () => {
            const id = await resolveConversationEntry();
            if (id && loadConversationGenRef.current === loadGen) {
              skipConvLoadRef.current = id;
              navigateToConversation(router, id);
            }
          })();
          return;
        }
        setError("消息加载失败，请重试");
        return;
      }
      const data = await res.json();
      if (loadConversationGenRef.current !== loadGen) return;
      const conv = data.conversation;
      const tab = conv.metadata?.type_locked
        ? conv.conversation_type
        : (conv.metadata?.active_tab ?? "chat");
      const pending = conv.metadata?.pending_report_draft as
        | PendingReportDraft
        | undefined;
      const mapped = (data.messages ?? []).map(
        (m: {
          id: string;
          role: string;
          content: string | null;
          citations?: Array<{ title: string; url: string }>;
          metadata?: { content_blocks?: Record<string, unknown>[] } & Record<
            string,
            unknown
          >;
        }) => {
          const base = mapApiMessageToChatMessage(m);
          return {
            ...base,
            contentBlocks: (m.metadata?.content_blocks ?? [])
              .map((b) => parseContentBlock(b))
              .filter((b): b is MessageContentBlock => b !== null),
          };
        },
      );
      writeConversationSnapshot(id, { messages: mapped, activeTab: tab });
      const viewingThisConv = conversationIdRef.current === id;
      const streamingHere = isStreamOwner(id);
      if (viewingThisConv) {
        startTransition(() => {
          setActiveTab(tab);
          const nextPending = pending?.run_id ? pending : null;
          setPendingDraft(nextPending);
          if (nextPending) {
            syncPreviewWithPending(nextPending);
          } else {
            setPreviewDraftTarget(null);
            prevPendingDraftKeyRef.current = "";
          }
        });
        if (!streamingHere) {
          if (options.showSkeleton === false) {
            setMessages((prev) => mergeConversationMessages(prev, mapped));
          } else {
            setMessages(mapped);
          }
        }
      }

      const needsHydrate = mapped.some(
        (m: ChatMessage) => m.runId && !m.workflowTasks?.length,
      );
      if (needsHydrate) {
        const hydrated = await hydrateWorkflowTasksBatch(id, mapped);
        if (loadConversationGenRef.current !== loadGen) return;
        writeConversationSnapshot(id, { messages: hydrated, activeTab: tab });
        if (conversationIdRef.current === id && !isStreamOwner(id)) {
          if (options.showSkeleton === false) {
            setMessages((prev) => mergeConversationMessages(prev, hydrated));
          } else {
            setMessages(hydrated);
          }
        }
      }
    } catch {
      if (loadConversationGenRef.current === loadGen) {
        setError("加载对话失败，请刷新页面。");
      }
    } finally {
      if (loadConversationGenRef.current === loadGen) {
        setLoadingMessages(false);
      }
    }
  }

  function staleLocalHandoffCards(): void {
    setMessages((prev) =>
      prev.map((m) => ({
        ...m,
        contentBlocks: m.contentBlocks?.map((b) =>
          b.type === "handoff_card" && b.status === "pending"
            ? { ...b, status: "stale" as const }
            : b,
        ),
      })),
    );
  }

  async function runStream(
    body: Record<string, unknown>,
    assistantId: string,
    signal?: AbortSignal,
    userTempId?: string,
  ): Promise<{ timedOut?: boolean; backgroundJobSubmitted?: boolean }> {
    const streamConvId = String(body.conversation_id ?? "");
    if (!streamConvId) return {};

    const timeoutMs = 120_000;
    let timedOut = false;
    let backgroundJobSubmitted = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      abortActiveStream();
    }, timeoutMs);

    let contentBatcher: ReturnType<typeof createStreamContentBatcher> | null = null;

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });

      if (!res.ok || !res.body) {
        throw new Error("无法建立流式连接");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";
      const streamBlocks: MessageContentBlock[] = [];
      let activeAssistantId = assistantId;

      contentBatcher = createStreamContentBatcher((update) => {
        patchStreamMessages(streamConvId, (prev) =>
          applyAssistantStreamContent(
            prev,
            update.assistantId,
            update.content,
            update.contentBlocks,
          ),
        );
      });

      function pushAssistantContent() {
        contentBatcher!.push({
          assistantId: activeAssistantId,
          content: assistantText,
          contentBlocks: streamBlocks,
        });
      }

      function flushAssistantContent() {
        contentBatcher!.flushNow({
          assistantId: activeAssistantId,
          content: assistantText,
          contentBlocks: streamBlocks,
        });
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const lines = part.split("\n");
          let event = "message";
          let dataLine = "";
          for (const line of lines) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            if (line.startsWith("data:")) dataLine = line.slice(5).trim();
          }
          if (!dataLine) continue;

          const data = JSON.parse(dataLine) as Record<string, unknown>;

          if (
            event === "user_persisted" &&
            userTempId &&
            typeof data.message_id === "string"
          ) {
            patchStreamMessages(streamConvId, (prev) =>
              applyUserPersistedToMessages(prev, userTempId, data.message_id as string),
            );
          }

          if (event === "stage") {
            patchStreamMessages(streamConvId, (prev) =>
              prev.map((m) =>
                m.id === activeAssistantId
                  ? applyStageEventToMessage(m, data)
                  : m,
              ),
            );
          }

          if (event === "reasoning_summary" && typeof data.text === "string") {
            patchStreamMessages(streamConvId, (prev) =>
              prev.map((m) =>
                m.id === activeAssistantId
                  ? applyReasoningSummaryToMessage(m, data.text as string)
                  : m,
              ),
            );
          }

          if (event === "token_delta" && typeof data.text === "string") {
            assistantText += data.text;
            pushAssistantContent();
          }

          if (event === "content_block") {
            if (data.type === "text") {
              if (!assistantText.trim()) {
                assistantText = String(data.text);
              }
            } else {
              const block = parseContentBlock(data);
              if (block) {
                streamBlocks.push(block);
                if (
                  block.type === "report_publish_card" &&
                  conversationIdRef.current === streamConvId
                ) {
                  applyReportCardDraftFromStream(block);
                }
              }
            }
            pushAssistantContent();
          }

          if (event === "handoff_ready" && typeof data.target_conversation_id === "string") {
            navigateToConversation(router, data.target_conversation_id);
          }

          if (event === "conversation_title" && typeof data.title === "string") {
            setConversations((prev) =>
              prev.map((c) =>
                c.id === streamConvId ? { ...c, title: String(data.title) } : c,
              ),
            );
          }

          if (event === "error") {
            if (conversationIdRef.current === streamConvId) {
              setError(String(data.message));
            }
          }

          if (event === "stopped") {
            flushAssistantContent();
            patchStreamMessages(streamConvId, (prev) =>
              prev.map((m) =>
                m.id === activeAssistantId
                  ? appendStoppedTask(
                      { ...m, streaming: false, stopped: true, taskProgressExpanded: true },
                      String(data.message ?? MSG_STOPPED_TEXT),
                    )
                  : m,
              ),
            );
          }

          if (event === "done") {
            flushAssistantContent();
            let nextAssistantId = activeAssistantId;
            patchStreamMessages(streamConvId, (prev) => {
              let next = prev;
              if (userTempId && typeof data.user_message_id === "string") {
                next = applyUserPersistedToMessages(
                  next,
                  userTempId,
                  data.user_message_id as string,
                );
              }
              const result = applyDoneEventToMessages(
                next,
                activeAssistantId,
                {
                  stopped: Boolean(data.stopped),
                  run_id: typeof data.run_id === "string" ? data.run_id : undefined,
                  message_id:
                    typeof data.message_id === "string" ? data.message_id : undefined,
                  user_message_id:
                    typeof data.user_message_id === "string"
                      ? data.user_message_id
                      : undefined,
                  background_job_id:
                    typeof data.background_job_id === "string"
                      ? data.background_job_id
                      : undefined,
                },
                MSG_STOPPED_TEXT,
              );
              nextAssistantId = result.assistantId;
              return result.messages;
            });
            activeAssistantId = nextAssistantId;
            if (typeof data.background_job_id === "string") {
              backgroundJobSubmitted = true;
              const bgJobId = data.background_job_id;
              const bgRunId =
                typeof data.background_run_id === "string"
                  ? data.background_run_id
                  : undefined;
              patchStreamMessages(streamConvId, (prev) =>
                prev.map((m) =>
                  m.id === activeAssistantId
                    ? {
                        ...m,
                        backgroundJobId: bgJobId,
                        backgroundRunId: bgRunId,
                        taskProgressExpanded: true,
                      }
                    : m,
                ),
              );
              scheduleBackgroundPoll(streamConvId);
            }
          }

          if (event === "job_done") {
            const summary =
              typeof data.summary === "string"
                ? data.summary
                : "后台任务已完成。";
            const jobId =
              typeof data.job_id === "string" ? data.job_id : undefined;
            if (conversationIdRef.current === streamConvId) {
              setBgNotice(summary);
            }
            void syncJobDoneConversation(streamConvId, jobId);
          }
        }
      }
    } finally {
      contentBatcher?.cancel();
      clearTimeout(timeoutId);
    }
    return { timedOut, backgroundJobSubmitted };
  }

  async function syncJobDoneConversation(
    convId: string,
    completedJobId?: string,
  ) {
    try {
      const res = await fetch(
        `/api/conversations/${convId}?messages_limit=${CONVERSATION_MESSAGES_LIMIT}`,
      );
      if (!res.ok) return;
      const data = await res.json();
      const conv = data.conversation;
      const pending = conv.metadata?.pending_report_draft as
        | PendingReportDraft
        | undefined;
      const mapped = (data.messages ?? []).map(
        (m: {
          id: string;
          role: string;
          content: string | null;
          citations?: Array<{ title: string; url: string }>;
          metadata?: { content_blocks?: Record<string, unknown>[] } & Record<
            string,
            unknown
          >;
        }) => {
          const base = mapApiMessageToChatMessage(m);
          return {
            ...base,
            contentBlocks: (m.metadata?.content_blocks ?? [])
              .map((b) => parseContentBlock(b))
              .filter((b): b is MessageContentBlock => b !== null),
          };
        },
      );
      let hydrated = mapped;
      if (
        mapped.some((m: ChatMessage) => m.runId && !m.workflowTasks?.length)
      ) {
        hydrated = await hydrateWorkflowTasksBatch(convId, mapped);
      }
      if (conversationIdRef.current !== convId) return;
      setMessages((prev) =>
        mergeConversationMessages(prev, hydrated, {
          completedBackgroundJobId: completedJobId,
        }),
      );
      const nextPending = pending?.run_id ? pending : null;
      setPendingDraft(nextPending);
      if (nextPending) {
        syncPreviewWithPending(nextPending);
      } else {
        setPreviewDraftTarget(null);
        prevPendingDraftKeyRef.current = "";
      }
      void refreshConversations();
    } catch {
      /* ignore sync errors */
    }
  }

  function stopGeneration() {
    const active = getActiveStreamSession();
    if (!active) return;
    const { conversationId: streamConvId, assistantId, abortController } = active;
    abortController.abort();
    void fetch(`/api/conversations/${streamConvId}/background-jobs/cancel`, {
      method: "POST",
    }).catch(() => {});
    patchStreamMessages(streamConvId, (prev) =>
      prev.map((m) => {
        if (m.id !== assistantId) return m;
        const withStopped = appendStoppedTask(
          finalizeStreamingMessage(
            { ...m, stopped: true, taskProgressExpanded: true },
            { stopped: true },
          ),
          MSG_STOPPED_TEXT,
        );
        const workflowTasks = (withStopped.workflowTasks ?? []).map((t) =>
          t.status === "running" ? { ...t, status: "cancelled" as const } : t,
        );
        return { ...withStopped, workflowTasks };
      }),
    );
    finishStreamSession(streamConvId);
  }

  function isAbortError(err: unknown): boolean {
    return (
      (err instanceof DOMException && err.name === "AbortError") ||
      (err instanceof Error && err.name === "AbortError")
    );
  }

  async function handleHandoffGo(messageId: string, card: HandoffBlock) {
    if (!conversationId || card.status !== "pending") return;
    if (isStreamActive()) {
      setHandoffToast("当前有对话正在生成中，请稍候再跳转。");
      return;
    }
    setError(null);
    let streamTargetId: string | null = null;
    try {
      const prep = await fetch("/api/handoff/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_conversation_id: conversationId,
          target_scene: card.target_scene,
          handoff_card_message_id: messageId.startsWith("temp-") ? undefined : messageId,
        }),
      });
      const prepData = await prep.json();
      if (!prep.ok) throw new Error(prepData.error ?? "Handoff 失败");

      const targetId = prepData.target_conversation_id as string;
      streamTargetId = targetId;
      navigateToConversation(router, targetId);
      setActiveTab(card.target_scene);

      const assistantId = `assistant-handoff-${Date.now()}`;
      const abortController = new AbortController();
      startStreamSession(targetId, assistantId, abortController);
      patchStreamMessages(targetId, () => [
        {
          id: assistantId,
          role: "assistant",
          content: "",
          streaming: true,
        },
      ]);

      await runStream(
        {
          conversation_id: targetId,
          scene: card.target_scene,
          trigger: "handoff_autostart",
          target_scene: card.target_scene,
          handoff_summary: card.handoff_summary ?? "",
          source_conversation_id: conversationId,
          handoff_card_message_id: messageId.startsWith("temp-") ? undefined : messageId,
        },
        assistantId,
        abortController.signal,
      );
    } catch (err) {
      if (conversationIdRef.current === conversationId) {
        setError(err instanceof Error ? err.message : "跳转失败");
      }
    } finally {
      if (streamTargetId) {
        finishStreamSession(streamTargetId);
        await loadConversation(streamTargetId, { showSkeleton: false });
        clearLiveStreamBuffer(streamTargetId);
      }
    }
  }

  async function handleHandoffDismiss(messageId: string, card: HandoffBlock) {
    if (card.status !== "pending") return;
    if (!messageId.startsWith("temp-")) {
      await fetch(`/api/messages/${messageId}/handoff-card`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "dismissed" }),
      });
    }
    setMessages((prev) =>
      prev.map((m) => ({
        ...m,
        contentBlocks: m.contentBlocks?.map((b) =>
          b.type === "handoff_card" && b.target_scene === card.target_scene
            ? { ...b, status: "dismissed" as const }
            : b,
        ),
      })),
    );
    setMessages((prev) => [
      ...prev,
      {
        id: `assistant-dismiss-${Date.now()}`,
        role: "assistant",
        content: HANDOFF_DISMISS_REPLY,
      },
    ]);
  }

  async function handleConfirmCard(messageId: string, card: ConfirmCardBlock) {
    if (!conversationId || card.status !== "active") return;
    setConfirmBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/artifacts/${card.artifact_id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId, action: "confirm" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "确认失败");

      setMessages((prev) =>
        prev.map((m) => ({
          ...m,
          contentBlocks: m.contentBlocks?.map((b) =>
            b.type === "confirm_card" && b.artifact_id === card.artifact_id
              ? { ...b, status: "confirmed" as const }
              : b,
          ),
        })),
      );
      // 根据 card_kind 和 validation 状态生成引导文案
      const validation = data.validation as {
        has_basic_info?: boolean;
        has_goal_selected?: boolean;
        goal_count?: number;
      } | null;

      let reply: string;
      if (card.card_kind === "holdings") {
        reply = "持仓快照已确认并保存。您可以继续提问，或在下方 Tab 查看分析。";
      } else if (card.card_kind === "plan_allocation") {
        const goalLabel = card.card_title ?? "当前";
        reply = `**${goalLabel} - 已确认**，建议您输入【生成基金明细】，后续为您匹配最适合的基金组合。`;
      } else if (card.card_kind === "plan_detail") {
        reply = "基金明细确认已保存。您可以继续调整配置或查看报告。";
      } else if (card.card_kind === "goal_constraint") {
        reply = "目标与约束已确认并保存。您可以继续完善资产配置方案。";
      } else if (card.card_kind === "profile_basic") {
        // 基本信息确认后，根据校验状态引导下一步
        if (validation && !validation.has_goal_selected) {
          reply = "基本信息已确认并保存。\n\n请继续选择至少一个投资场景（如养老、子女教育、买房等），我会帮您梳理对应的需求。";
        } else {
          reply = "基本信息已确认并保存。接下来您可以继续对话，或按提示进入下一步。";
        }
      } else {
        reply = "信息已确认并保存。接下来您可以继续对话，或按提示进入下一步。";
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-confirm-${Date.now()}`,
          role: "assistant",
          content: reply,
        },
      ]);
      if (card.card_kind === "holdings") {
        setHoldingsRefreshToken((t) => t + 1);
      }
      if (card.card_kind === "plan_allocation" || card.card_kind === "plan_detail") {
        setConfigRefreshToken((t) => t + 1);
      }
      refreshScenePlaceholder();
      // 确认后清除管线锁定
      if (card.card_kind === "profile_basic" || card.card_kind === "goal_constraint") {
        setEditingPipeline(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "确认失败");
    } finally {
      setConfirmBusy(false);
    }
  }

  async function handleDismissCard(messageId: string, card: ConfirmCardBlock) {
    if (!conversationId || card.status !== "active") return;
    setConfirmBusy(true);
    try {
      await fetch(`/api/artifacts/${card.artifact_id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId, action: "dismiss" }),
      });
      setMessages((prev) =>
        prev.map((m) => ({
          ...m,
          contentBlocks: m.contentBlocks?.map((b) =>
            b.type === "confirm_card" && b.artifact_id === card.artifact_id
              ? { ...b, status: "dismissed" as const }
              : b,
          ),
        })),
      );
      // 放弃确认后清除管线锁定
      if (card.card_kind === "profile_basic" || card.card_kind === "goal_constraint") {
        setEditingPipeline(null);
      }
    } finally {
      setConfirmBusy(false);
    }
  }

  function handleConfirmCardStatusChange(messageId: string, artifactId: string, newStatus: ConfirmCardBlock["status"]) {
    setMessages((prev) =>
      prev.map((m) => ({
        ...m,
        contentBlocks: m.contentBlocks?.map((b) =>
          b.type === "confirm_card" && b.artifact_id === artifactId
            ? { ...b, status: newStatus }
            : b,
        ),
      })),
    );
  }

  function handleProfileGenerateReport(result: {
    ok: boolean;
    markdown?: string;
    report_name?: string;
    file_path?: string;
    error?: string;
  }) {
    if (!result.ok || !result.markdown || !result.file_path || !result.report_name) {
      setError(result.error ?? "生成报告失败。");
      return;
    }

    const card: ReportPublishCardBlock = {
      type: "report_publish_card",
      status: "active",
      report_type: "profile",
      scope: "combined",
      report_name: result.report_name,
      file_path: result.file_path,
    };

    setMessages((prev) => [
      ...prev,
      {
        id: `assistant-report-card-${Date.now()}`,
        role: "assistant",
        content: "",
        contentBlocks: [card],
      },
    ]);

    applyReportCardDraftFromStream(card);
  }

  function handleViewReportDraft(_messageId: string, card: ReportPublishCardBlock) {
    focusPreviewOnReportCard(card);
  }

  async function handlePublishReport(messageId: string, card: ReportPublishCardBlock) {
    if (!conversationId || card.status !== "active") return;
    if (!isLatestReportPublishCard(card, pendingDraft?.file_path)) {
      setError("请在新版报告卡片上确认发布。");
      return;
    }
    setConfirmBusy(true);
    setError(null);
    const cardKey = reportCardKey(card);
    try {
      const res = await fetch("/api/reports/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          goal_constraint_id: card.goal_constraint_id,
          holdings_version_id: card.holdings_version_id,
          fund_code: card.fund_code,
          draft_path: card.file_path,
          report_type: card.report_type,
          scope: card.scope,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "发布失败");

      setMessages((prev) =>
        prev.map((m) => ({
          ...m,
          contentBlocks: m.contentBlocks?.map((b) =>
            b.type === "report_publish_card" && reportCardKey(b) === cardKey
              ? { ...b, status: "published" as const }
              : b,
          ),
        })),
      );
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-publish-${Date.now()}`,
          role: "assistant",
          content:
            card.report_type === "fund"
              ? "基金报告已发布。您可在侧栏「我的报告」中查看，或继续在本对话提问。"
              : card.report_type === "portfolio"
                ? "持仓报告已发布。您可在侧栏「我的报告」中查看，或继续分析。"
                : card.report_type === "plan"
                  ? "配置报告已发布。您可切换到 **报告** Tab 查看完整方案，或继续调整。"
                  : "需求报告已发布。您可在侧栏「我的报告」中查看，或切换到 **需求梳理** Tab 继续完善。",
        },
      ]);
      setPendingDraft(null);
      setPreviewDraftTarget(null);
      prevPendingDraftKeyRef.current = "";
      refreshScenePlaceholder();
    } catch (err) {
      setError(err instanceof Error ? err.message : "发布失败");
    } finally {
      setConfirmBusy(false);
    }
  }

  async function handleDismissReport(messageId: string, card: ReportPublishCardBlock) {
    const cardKey = reportCardKey(card);
    setMessages((prev) =>
      prev.map((m) => ({
        ...m,
        contentBlocks: m.contentBlocks?.map((b) =>
          b.type === "report_publish_card" && reportCardKey(b) === cardKey
            ? { ...b, status: "dismissed" as const }
            : b,
        ),
      })),
    );
  }

  // F7: 查找当前会话对象
  function getCurrentConversation() {
    return conversations.find((c) => c.id === conversationId);
  }

  async function resolveConversationForLockedTabSend(
    tab: SceneId,
  ): Promise<string | null> {
    if (!conversationId) return null;

    const current = getCurrentConversation();
    const currentType = current?.conversation_type ?? "chat";
    if (
      !shouldUseLockedTabSwitch({
        typeLocked: current?.metadata?.type_locked ?? false,
        messageCount: messages.length,
        currentType,
        targetTab: tab,
      })
    ) {
      return conversationId;
    }

    const sceneName = SCENE_TABS.find((t) => t.id === tab)?.label ?? tab;

    async function createAndNavigateToSceneTab() {
      const newId = await createConversationEntry(fetch, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active_tab: tab }),
      });
      if (newId) {
        await refreshConversations();
        setActiveTab(tab);
        setMessages([]);
        navigateToConversation(router, newId);
      }
      return newId;
    }

    try {
      const res = await fetch(
        `/api/conversations?conversation_type=${tab}&type_locked=true&limit=1`,
      );
      const data = await res.json();
      const hasExisting = (data.conversations?.length ?? 0) > 0;
      const decision = decideLockedTabSwitch(hasExisting);

      if (decision === "create") {
        return await createAndNavigateToSceneTab();
      }
      if (window.confirm(lockedTabCreateConfirmMessage(sceneName))) {
        return await createAndNavigateToSceneTab();
      }
      return null;
    } catch {
      setError("切换场景失败，请重试。");
      return null;
    }
  }

  async function switchTab(tab: SceneId) {
    if (tab === activeTab) return;
    if (tab === "fund") setFundSubTab("chat");
    setActiveTab(tab);
    if (!conversationId) return;

    const current = getCurrentConversation();
    if (current?.metadata?.type_locked) return;

    scheduleActiveTabPatch(conversationId, tab);
  }

  // F2: 待发图片附件
  const handleImageSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (!files.length) return;

      const isPortfolio = activeTab === "portfolio";
      const maxCount = isPortfolio ? 20 : 5;
      const remaining = maxCount - pendingImages.length;
      const toAdd = files.slice(0, remaining);

      const newImages = toAdd.map((file) => ({
        file,
        preview: URL.createObjectURL(file),
      }));
      setPendingImages((prev) => [...prev, ...newImages]);

      // Reset input so same file can be selected again
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [activeTab, pendingImages.length],
  );

  const removePendingImage = useCallback((index: number) => {
    setPendingImages((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const visionReady = readiness?.models.vision ?? false;
  const showSlashMenu = shouldShowSlashMenu(input, slashCommands);
  const visibleSlashCommands = filterSlashCommands(slashCommands, input);
  const slashHighlightSafe = clampSlashHighlightIndex(
    slashHighlightIndex,
    visibleSlashCommands.length,
  );

  useEffect(() => {
    setSlashHighlightIndex(0);
  }, [input, visibleSlashCommands.length]);

  function insertSlashCommand(commandId: string) {
    setInput(formatSlashCommandInsert(commandId));
    setSlashHighlightIndex(0);
    inputTextareaRef.current?.focus();
  }

  useEffect(() => {
    const el = inputTextareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxHeight = 24 * 6;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [input]);

  function startEditMessage(messageId: string, content: string) {
    setEditingMessageId(messageId);
    setInput(sanitizeUserContent(content));
    inputTextareaRef.current?.focus();
  }

  function cancelEditMessage() {
    setEditingMessageId(null);
    setInput("");
  }


  function isInputBlocked(): boolean {
    if (isChatInputBlocked(readiness, activeTab, { readinessLoading })) return true;
    if (activeTab === "fund" && fundSubTab === "watchlist") return true;
    return false;
  }

  // 管线标签映射
  function getPipelineLabel(id: string): string {
    const labels: Record<string, string> = {
      basic_info: "个人基本信息",
      marriage_child: "结婚生育",
      housing: "购房置业",
      education: "子女教育",
      retirement: "退休养老",
      wealth_growth: "财富增值",
    };
    return labels[id] ?? id;
  }

  // 检测用户消息是否触发某个修改管线（与 resolveGoalTypeFromMessage / isModifyBasicInfoIntent 保持一致）
  function detectPipelineFromMessage(text: string): string | null {
    const t = text.trim().toLowerCase();

    // 基本信息的修改意图
    if (
      /(?:修改|更改|更新|调整|改).{0,6}(?:个人|基本).{0,4}(?:信息|情况)|涨工资|换工作|贷款还清|刚结婚|有孩子|开支变了|可投资钱多了|可投资钱少了|收入变了/i.test(
        t,
      )
    ) {
      return "basic_info";
    }

    // 先检查是否包含【xxx】标题模式
    const titleMatch = t.match(/【([^】]+)】/);
    if (titleMatch) {
      const title = titleMatch[1];
      if (/养老|退休|retirement/i.test(title)) return "retirement";
      if (/教育|子女|education/i.test(title)) return "education";
      if (/买房|住房|购房|housing/i.test(title)) return "housing";
      if (/婚育|结婚|生育|marriage/i.test(title)) return "marriage_child";
      if (/闲钱|增值|wealth/i.test(title)) return "wealth_growth";
    }

    // key-value 格式数据（>=3 行），需含投资约束特有字段
    const kvLineCount = (text.match(/[\u4e00-\u9fa5]{2,10}[：:].+/g) ?? []).length;
    if (kvLineCount >= 3) {
      const constraintFields = /风险偏好|一次性投入|每月投入|目标年化收益|最大回撤承受/;
      if (!constraintFields.test(text)) return null;
      if (/退休|养老/.test(t)) return "retirement";
      if (/子女教育|教育金/.test(t)) return "education";
      if (/购房|买房|首付|housing/i.test(t)) return "housing";
      if (/婚育|结婚|生育/.test(t)) return "marriage_child";
      if (/闲钱|增值/.test(t)) return "wealth_growth";
      return null;
    }

    // 自然语言匹配
    if (/养老|退休|retirement|^4$/.test(t)) return "retirement";
    if (/教育|子女|education|^3$/.test(t)) return "education";
    if (/买房|住房|购房|housing|^2$/.test(t)) return "housing";
    if (/婚育|结婚|生育|marriage|^1$/.test(t)) return "marriage_child";
    if (/闲钱|增值|wealth|^5$/.test(t)) return "wealth_growth";

    return null;
  }

  function getPlaceholder(): string {
    if (readinessLoading && !readiness) {
      return getChatInputPlaceholder(null, activeTab, PLACEHOLDERS, {
        readinessLoading: true,
      });
    }
    if (!readiness?.models.chat_ready) {
      return `请先完成${settingsPath("models")}中「日常对话」的检测，之后即可开始对话。`;
    }
    if (activeTab !== "chat" && !readiness.database.ready) {
      return PLACEHOLDERS[activeTab];
    }
    if (activeTab === "fund" && fundSubTab === "watchlist") {
      return buildFundWatchlistInputHint();
    }
    if (activeTab !== "chat") {
      return scenePlaceholder.hint ?? PLACEHOLDERS[activeTab];
    }
    if (activeTab === "chat") return PLACEHOLDERS.chat;
    return PLACEHOLDERS[activeTab];
  }

  async function handleWatchlistAnalyze(fundCode: string, _fundName: string) {
    if (isStreamActive()) {
      setHandoffToast("当前有对话正在生成中，请稍候再解析。");
      return;
    }
    if (!readiness?.models.chat_ready) {
      setVisionToast(
        `请先完成${settingsPath("models")}中「日常对话」的检测后再解析。`,
      );
      return;
    }
    if (sendInFlightRef.current) return;

    const text = buildFundWatchlistAnalyzePrompt(fundCode);
    sendInFlightRef.current = true;
    let targetConversationId: string | null = null;

    try {
      const newId = await createConversationEntry(fetch, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active_tab: "fund" }),
      });
      if (!newId) {
        setError("无法新建对话，请重试。");
        return;
      }
      targetConversationId = newId;

      setActiveTab("fund");
      setFundSubTab("chat");
      setModeBLeftTab("preview");
      setPendingDraft(null);
      setPreviewDraftTarget(null);
      setInput("");
      setError(null);

      skipConvLoadRef.current = newId;
      navigateToConversation(router, newId);

      const userMsg: ChatMessage = {
        id: createClientMessageId("user"),
        role: "user",
        content: text,
      };
      const assistantId = createClientMessageId("assistant");
      const abortController = new AbortController();
      startStreamSession(newId, assistantId, abortController);
      patchStreamMessages(newId, () => [
        userMsg,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          streaming: true,
          workflowTasks: [createOptimisticPlannerTask()],
          taskProgressExpanded: true,
        },
      ]);

      await refreshConversations();

      let streamResult:
        | { timedOut?: boolean; backgroundJobSubmitted?: boolean }
        | undefined;
      try {
        streamResult = await runStream(
          {
            conversation_id: newId,
            content: text,
            scene: "fund",
          },
          assistantId,
          abortController.signal,
          userMsg.id,
        );
      } catch (err) {
        if (isAbortError(err)) {
          if (streamResult?.timedOut) {
            setError(
              "等待时间较长，本次回复可能仍在后台生成。请稍候刷新对话，勿重复发送以免重复跑任务。",
            );
            patchStreamMessages(newId, (prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? appendStoppedTask(
                      finalizeStreamingMessage(
                        {
                          ...m,
                          streaming: false,
                          stopped: true,
                          taskProgressExpanded: true,
                        },
                        { stopped: true },
                      ),
                      "等待超时，任务可能仍在后台继续。",
                    )
                  : m,
              ),
            );
            scheduleBackgroundPoll(newId);
            void loadConversation(newId, { showSkeleton: false });
          } else {
            stopGeneration();
          }
          return;
        }
        setError(err instanceof Error ? err.message : "发起解析失败");
        patchStreamMessages(newId, (prev) =>
          prev.filter((m) => m.id !== assistantId),
        );
        return;
      } finally {
        finishStreamSession(newId);
      }

      if (!streamResult?.backgroundJobSubmitted) {
        await loadConversation(newId, { showSkeleton: false });
        void refreshConversations();
      } else {
        void refreshConversations();
      }
    } finally {
      if (targetConversationId) clearLiveStreamBuffer(targetConversationId);
      sendInFlightRef.current = false;
    }
  }

  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

  const handleSendFromPanel = useCallback((text: string) => {
    programmaticTextRef.current = text;
    void sendMessageRef.current();
  }, []);

  const isModeB =
    activeTab === "profile" ||
    activeTab === "plan" ||
    activeTab === "portfolio" ||
    activeTab === "fund";

  function toggleTaskProgress(messageId: string) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? toggleTaskProgressExpanded(m) : m,
      ),
    );
  }

  function renderMainContent() {
    const current = getCurrentConversation();
    const previewingOtherScene = isPreviewingOtherScene({
      typeLocked: current?.metadata?.type_locked ?? false,
      conversationType: current?.conversation_type ?? "chat",
      activeTab,
      messageCount: messages.length,
    });
    return (
      <MessageList
        messages={previewingOtherScene ? [] : messages}
        activeTab={activeTab}
        sceneEmptyTitle={scenePlaceholder.title}
        sceneEmptyBody={scenePlaceholder.body}
        confirmBusy={confirmBusy}
        onHandoffGo={(id, card) => void handleHandoffGo(id, card)}
        onHandoffDismiss={(id, card) => void handleHandoffDismiss(id, card)}
        onConfirmCard={(id, card) => void handleConfirmCard(id, card)}
        onDismissCard={(id, card) => void handleDismissCard(id, card)}
        onConfirmCardStatusChange={handleConfirmCardStatusChange}
        onPublishReport={(id, card) => void handlePublishReport(id, card)}
        onDismissReport={(id, card) => void handleDismissReport(id, card)}
        onViewReportDraft={(id, card) => handleViewReportDraft(id, card)}
        latestDraftFilePath={pendingDraft?.file_path}
        viewingDraftKey={previewTargetKey(previewDraftTarget)}
        onEditStart={(id, content) => startEditMessage(id, content)}
        onToggleTaskProgress={toggleTaskProgress}
        onSuggestedAction={handleSendFromPanel}
      />
    );
  }

  async function sendMessage() {
    const text = sanitizeUserContent(programmaticTextRef.current ?? input);
    programmaticTextRef.current = null;
    if ((!text && pendingImages.length === 0) || !conversationId || isInputBlocked()) return;
    if (isChatSendBlocked(conversationId, activeStreamConversationId)) return;
    if (isStreamingHere && !editingMessageId) return;
    if (sendInFlightRef.current) return;

    if (pendingImages.length > 0 && !visionReady) {
      setVisionToast(`当前无法识别图片。请先在${settingsPath("models")}中配置「图片识别」并通过检测。`);
      return;
    }

    // 管线锁定：profile 场景下防止跨管线修改
    if (activeTab === "profile") {
      if (editingPipeline) {
        const trimmedText = text.trim();
        if (trimmedText === "【放弃修改】") {
          setEditingPipeline(null);
        } else {
          const targetPipeline = detectPipelineFromMessage(text);
          if (targetPipeline && targetPipeline !== editingPipeline) {
            setError(
              `当前正在修改「${getPipelineLabel(editingPipeline)}」，请先完成修改或发送【放弃修改】后再切换。`,
            );
            return;
          }
        }
      } else {
        const targetPipeline = detectPipelineFromMessage(text);
        if (targetPipeline) {
          setEditingPipeline(targetPipeline);
        }
      }
    }

    sendInFlightRef.current = true;
    setInput("");

    let shouldReload = false;
    let targetConversationId = conversationId;

    try {
      if (!editingMessageId) {
        const resolved = await resolveConversationForLockedTabSend(activeTab);
        if (!resolved) {
          sendInFlightRef.current = false;
          return;
        }
        targetConversationId = resolved;
      }

      const editId = editingMessageId;
      let editResendMessageId: string | undefined;

      if (editId) {
        if (isStreamOwner(conversationId)) stopGeneration();
        let resolvedEditId = editId;
        if (editId.startsWith("temp-")) {
          const res = await fetch(
            `/api/conversations/${conversationId}?messages_limit=${CONVERSATION_MESSAGES_LIMIT}`,
          );
          const data = (await res.json()) as {
            messages?: Array<{ id: string; role: string }>;
          };
          const lastUser = [...(data.messages ?? [])]
            .reverse()
            .find((m) => m.role === "user");
          if (!lastUser) {
            setError("无法定位要编辑的消息，请稍后重试。");
            return;
          }
          resolvedEditId = lastUser.id;
        }
        editResendMessageId = resolvedEditId;
        try {
          const res = await fetch(`/api/conversations/${conversationId}/edit-resend`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message_id: resolvedEditId, content: text }),
          });
          if (!res.ok) {
            const data = (await res.json()) as { error?: string };
            setError(data.error ?? "编辑发送失败");
            return;
          }
        } catch {
          setError("编辑发送失败");
          return;
        }
        setEditingMessageId(null);
      }

      staleLocalHandoffCards();
      setError(null);

      const attachments = pendingImages.length
        ? await Promise.all(
            pendingImages.map(async (img) => {
              const buffer = await img.file.arrayBuffer();
              const base64 = btoa(
                new Uint8Array(buffer).reduce(
                  (data, byte) => data + String.fromCharCode(byte),
                  "",
                ),
              );
              return {
                type: "image",
                mime: img.file.type,
                data: base64,
                filename: img.file.name,
              };
            }),
          )
        : undefined;

      pendingImages.forEach((img) => URL.revokeObjectURL(img.preview));
      setPendingImages([]);

      const assistantId = createClientMessageId("assistant");
      const abortController = new AbortController();
      startStreamSession(targetConversationId, assistantId, abortController);

      let userTempId: string | undefined;

      if (editId) {
        await loadConversation(conversationId, { showSkeleton: false });
        patchStreamMessages(conversationId, (prev) => [
          ...prev,
          { id: assistantId, role: "assistant", content: "", streaming: true, workflowTasks: [createOptimisticPlannerTask()], taskProgressExpanded: true },
        ]);
      } else {
        const userMsg: ChatMessage = {
          id: createClientMessageId("user"),
          role: "user",
          content: text,
        };
        userTempId = userMsg.id;
        patchStreamMessages(targetConversationId, (prev) => [
          ...prev,
          userMsg,
          { id: assistantId, role: "assistant", content: "", streaming: true, workflowTasks: [createOptimisticPlannerTask()], taskProgressExpanded: true },
        ]);
      }

      let streamResult:
        | { timedOut?: boolean; backgroundJobSubmitted?: boolean }
        | undefined;
      try {
        streamResult = await runStream(
          {
            conversation_id: targetConversationId,
            content: text,
            scene: activeTab,
            ...(editResendMessageId
              ? {
                  edit_resend_message_id: editResendMessageId,
                  trigger: "edit_resend" as const,
                }
              : {}),
            ...(attachments ? { attachments } : {}),
          },
          assistantId,
          abortController.signal,
          userTempId,
        );
        shouldReload = !abortController.signal.aborted;
      } catch (err) {
        if (isAbortError(err)) {
          if (streamResult?.timedOut) {
            setError(
              "等待时间较长，本次回复可能仍在后台生成。请稍候刷新对话，勿重复发送以免重复跑任务。",
            );
            patchStreamMessages(targetConversationId, (prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? appendStoppedTask(
                      finalizeStreamingMessage(
                        { ...m, streaming: false, stopped: true, taskProgressExpanded: true },
                        { stopped: true },
                      ),
                      "等待超时，任务可能仍在后台继续。",
                    )
                  : m,
              ),
            );
            scheduleBackgroundPoll(targetConversationId);
            void loadConversation(targetConversationId, { showSkeleton: false });
          } else {
            stopGeneration();
          }
          return;
        }
        setError(err instanceof Error ? err.message : "发送失败");
        patchStreamMessages(targetConversationId, (prev) =>
          prev.filter((m) => m.id !== assistantId),
        );
      } finally {
        finishStreamSession(targetConversationId);
      }

      if (shouldReload && !streamResult?.backgroundJobSubmitted) {
        await loadConversation(targetConversationId, { showSkeleton: false });
        void refreshConversations();
      } else if (streamResult?.backgroundJobSubmitted) {
        void refreshConversations();
      }
    } finally {
      clearLiveStreamBuffer(targetConversationId);
      sendInFlightRef.current = false;
    }
  }

  const activeStreamConversation = activeStreamConversationId
    ? conversations.find((c) => c.id === activeStreamConversationId)
    : undefined;
  const activeStreamTitle =
    activeStreamConversation?.title?.trim() || "另一对话";

  return (
    <main className={chatMainClass(isModeB)}>
        {isModeB && conversationId && (
          <div className="flex-1 flex flex-col min-w-0 border-r border-[rgba(0,0,0,0.1)] bg-white">
            <ModeBLeftTabs
              activeTab={activeTab}
              leftTab={modeBLeftTab}
              onChange={setModeBLeftTab}
            />
            <div className="flex-1 min-h-0 overflow-hidden">
              <ModeBReportPane
                conversationId={conversationId}
                activeTab={activeTab}
                leftTab={modeBLeftTab}
                previewTarget={previewDraftTarget}
                scrollToTopToken={previewScrollToken}
                previewRefreshToken={previewRefreshToken}
                holdingsRefreshToken={holdingsRefreshToken}
                configRefreshToken={configRefreshToken}
                onAnalyzeFund={handleWatchlistAnalyze}
                onProfileGenerateReport={handleProfileGenerateReport}
                onSetInput={setInput}
                onSendMessage={handleSendFromPanel}
                isStreamActive={isStreamActive}
              />
            </div>
          </div>
        )}

        <ResizableChatPane
          resizable={isModeB}
          className={chatColumnOuterClass(isModeB)}
        >
        <div className={chatColumnInnerClass(isModeB)}>
        <div className={chatScrollAreaClass(isModeB)}>
          {loadingMessages && messages.length > 0 ? (
            <div
              className="absolute top-0 inset-x-0 z-10 h-0.5 bg-[#0075de]/15"
              aria-hidden
            >
              <div className="h-full w-1/4 bg-[#0075de] animate-pulse" />
            </div>
          ) : null}
          {loadingMessages && messages.length === 0 ? (
            <div className={chatScrollBodyClass(isModeB)}>
              <MessageSkeleton />
            </div>
          ) : (
            <div className={chatScrollBodyClass(isModeB)}>
              {renderMainContent()}
            </div>
          )}
        </div>

        <div className={chatFooterWrapClass(isModeB)}>
          {readinessLoading && !readiness && (
            <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#f6f5f4] px-4 py-2 text-sm leading-[1.75] text-[#615d59] flex items-center gap-2">
              <Spinner className="w-4 h-4" />
              <span>正在检查模型与数据库连接…</span>
            </div>
          )}

          {readiness?.models && !readiness.models.chat_ready && (
            <Banner
              type="warning"
              message={`请先完成${settingsPath("models")}中「日常对话」与「联网搜索」的检测后再对话。`}
              linkText="前往设置"
              linkHref="/settings/models"
            />
          )}

          {readiness?.database &&
            !readiness.database.ready &&
            readiness.models?.chat_ready && (
            <Banner
              type="info"
              message={
                readiness.database.local_managed
                  ? "本地 Supabase 未就绪。请启动 Docker Desktop，在终端运行 npm run supabase:recover 后刷新页面。"
                  : `保存投资方案与持仓需要先连接个人数据空间。请先到${settingsPath("database")}完成检测。`
              }
              linkText={readiness.database.local_managed ? undefined : "前往设置"}
              linkHref={
                readiness.database.local_managed ? undefined : "/settings/database"
              }
            />
          )}

          {bgNotice && (
            <div className="rounded-lg border border-[#2563eb] bg-[#eff6ff] px-4 py-2 text-sm leading-[1.75] text-[#1d4ed8] flex justify-between gap-2">
              <span>{bgNotice}</span>
              <button
                type="button"
                className="shrink-0 underline"
                onClick={() => setBgNotice(null)}
              >
                关闭
              </button>
            </div>
          )}

          {isSendBlocked && activeStreamConversationId && (
            <div className="rounded-lg border border-[#2563eb] bg-[#eff6ff] px-4 py-2 text-sm leading-[1.75] text-[#1d4ed8] flex flex-wrap items-center justify-between gap-2">
              <span>
                「{activeStreamTitle}」正在生成中，请稍候或切回该对话。
              </span>
              <button
                type="button"
                className="shrink-0 underline font-semibold"
                onClick={() => navigateToConversation(router, activeStreamConversationId)}
              >
                切回该对话
              </button>
            </div>
          )}

          {/* G1: Vision 不可用 Toast */}
          {handoffToast && (
            <div className="rounded-lg border border-[#f59e0b] bg-[#fffbeb] px-4 py-2 text-sm leading-[1.75] text-[#92400e] flex justify-between gap-2">
              <span>{handoffToast}</span>
              <button
                type="button"
                className="shrink-0 underline"
                onClick={() => setHandoffToast(null)}
              >
                关闭
              </button>
            </div>
          )}

          {visionToast && (
            <div className="rounded-lg border border-[#f59e0b] bg-[#fffbeb] px-4 py-2 text-sm leading-[1.75] text-[#92400e] flex justify-between gap-2">
              <span>{visionToast}</span>
              <button
                type="button"
                className="shrink-0 underline"
                onClick={() => setVisionToast(null)}
              >
                关闭
              </button>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-[#e03e3e] bg-[#fef2f2] px-4 py-2 text-sm leading-[1.75] text-[#e03e3e] flex justify-between gap-2">
              <span>{error}</span>
              <button
                type="button"
                className="shrink-0 underline"
                onClick={() => setError(null)}
              >
                关闭
              </button>
            </div>
          )}

          <ComplianceNotice />

          <div className="flex flex-wrap gap-2 justify-center">
            {SCENE_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => void switchTab(tab.id)}
                className={`rounded-full px-4 py-1.5 text-[15px] font-semibold border cursor-pointer ${
                  activeTab === tab.id
                    ? "bg-[#0075de] text-white border-[#0075de]"
                    : "bg-white text-[#615d59] border-[rgba(0,0,0,0.1)]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-[rgba(0,0,0,0.1)] p-3 flex flex-col gap-2">
            {editingMessageId && (
              <div className="flex items-center justify-between gap-2 rounded-lg bg-[#f6f5f4] px-3 py-2 text-sm leading-[1.75] text-[#615d59]">
                <span>正在编辑上一条消息，发送将替换并重新生成</span>
                <button
                  type="button"
                  onClick={cancelEditMessage}
                  className="shrink-0 text-[#0075de] border-0 bg-transparent cursor-pointer text-sm"
                >
                  取消
                </button>
              </div>
            )}
            {showSlashMenu && visibleSlashCommands.length > 0 && (
              <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white max-h-40 overflow-y-auto">
                {visibleSlashCommands.map((c, idx) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`w-full text-left px-3 py-2 text-[15px] border-0 cursor-pointer ${
                        idx === slashHighlightSafe
                          ? "bg-[#eef6fd]"
                          : "bg-transparent hover:bg-[#f6f5f4]"
                      }`}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setSlashHighlightIndex(idx)}
                      onClick={() => insertSlashCommand(c.id)}
                    >
                      <span className="font-semibold">/{c.id}</span>
                      <span className="text-[#615d59] ml-2">{c.description_zh}</span>
                    </button>
                  ))}
              </div>
            )}
            {pendingImages.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {pendingImages.map((img, idx) => (
                  <div key={idx} className="relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.preview}
                      alt=""
                      className="w-16 h-16 object-cover rounded-lg border border-[rgba(0,0,0,0.1)]"
                    />
                    <button
                      type="button"
                      onClick={() => removePendingImage(idx)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#e03e3e] text-white text-xs flex items-center justify-center border-0 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 items-center">
            {visionReady && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={handleImageSelect}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isInputBlocked()}
                  className="shrink-0 w-9 h-9 rounded-lg border border-[rgba(0,0,0,0.15)] bg-white text-[#615d59] text-xl flex items-center justify-center cursor-pointer disabled:opacity-50 hover:bg-[#f6f5f4]"
                  title="上传图片"
                >
                  +
                </button>
              </>
            )}
            <textarea
              ref={inputTextareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={getPlaceholder()}
              disabled={isInputBlocked()}
              rows={1}
              className="flex-1 resize-none border-0 outline-none bg-transparent text-[16px] leading-[1.75] min-h-[36px] max-h-[144px] py-1.5 overflow-y-auto"
              onKeyDown={(e) => {
                if (showSlashMenu && visibleSlashCommands.length > 0) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSlashHighlightIndex((i) =>
                      stepSlashHighlightIndex(i, visibleSlashCommands.length, "down"),
                    );
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSlashHighlightIndex((i) =>
                      stepSlashHighlightIndex(i, visibleSlashCommands.length, "up"),
                    );
                    return;
                  }
                  if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey) {
                    e.preventDefault();
                    const selected = visibleSlashCommands[slashHighlightSafe];
                    if (selected) insertSlashCommand(selected.id);
                    return;
                  }
                }
                if (e.key === "Escape") {
                  if (shouldShowSlashMenu(input, slashCommands)) {
                    e.preventDefault();
                    setInput(dismissSlashMenuInput(input));
                    setSlashHighlightIndex(0);
                    return;
                  }
                  if (editingMessageId) {
                    e.preventDefault();
                    cancelEditMessage();
                  }
                  return;
                }
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
            />
            {isStreamingHere ? (
              <button
                type="button"
                onClick={stopGeneration}
                className="rounded-xl border border-[#e03e3e] text-[#e03e3e] px-4 py-2 font-semibold bg-white cursor-pointer flex items-center gap-2"
              >
                <Spinner size="sm" className="text-[#e03e3e]" />
                停止生成
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void sendMessage()}
                disabled={
                  isInputBlocked() ||
                  !input.trim() ||
                  isChatSendBlocked(conversationId, activeStreamConversationId)
                }
                className="rounded-xl bg-[#0075de] text-white px-4 py-2 font-semibold border-0 cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                发送
              </button>
            )}
            </div>
          </div>
        </div>
        </div>
        </ResizableChatPane>
      </main>
  );
}
