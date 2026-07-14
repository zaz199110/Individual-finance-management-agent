"use client";

import {
  citationHostname,
  formatCitationTitle,
  shouldShowMessageCitations,
  stripTrailingCitationSection,
} from "@/lib/chat/citation-display";
import { stripTrailingComplianceNotice } from "@/lib/chat/compliance";
import { ChatMarkdownContent } from "./ChatMarkdownContent";
import { ConfirmCard } from "./ConfirmCard";
import { HandoffCard } from "./HandoffCard";
import { ReportPublishCard } from "./ReportPublishCard";
import { SceneEmptyState } from "./SceneEmptyState";
import { TaskProgressCard } from "./TaskProgressCard";
import { AssistantTypingIndicator } from "./AssistantTypingIndicator";
import {
  isAssistantWaitingForResponse,
  isTaskProgressExpanded,
} from "@/lib/chat/message-workflow";
import type {
  ChatMessage,
  ConfirmCardBlock,
  HandoffBlock,
  MessageContentBlock,
  ReportPublishCardBlock,
  SuggestedAction,
} from "./types";
import type { SceneId } from "@/harness/registry/load";
import {
  isLatestReportPublishCard,
  previewTargetKey,
  previewTargetFromCard,
} from "@/lib/chat/report-publish-card";
import {
  CHAT_ASSISTANT_MESSAGE_WIDTH,
  CHAT_USER_MESSAGE_WIDTH,
} from "./chat-layout";

interface MessageListProps {
  messages: ChatMessage[];
  activeTab?: SceneId;
  sceneEmptyTitle?: string;
  sceneEmptyBody?: string;
  onHandoffGo?: (messageId: string, card: HandoffBlock) => void;
  onHandoffDismiss?: (messageId: string, card: HandoffBlock) => void;
  onConfirmCard?: (messageId: string, card: ConfirmCardBlock) => void;
  onDismissCard?: (messageId: string, card: ConfirmCardBlock) => void;
  onConfirmCardStatusChange?: (messageId: string, cardId: string, newStatus: ConfirmCardBlock["status"]) => void;
  onPublishReport?: (messageId: string, card: ReportPublishCardBlock) => void;
  onDismissReport?: (messageId: string, card: ReportPublishCardBlock) => void;
  onViewReportDraft?: (messageId: string, card: ReportPublishCardBlock) => void;
  latestDraftFilePath?: string;
  viewingDraftKey?: string;
  confirmBusy?: boolean;
  onEditStart?: (messageId: string, content: string) => void;
  onToggleTaskProgress?: (messageId: string) => void;
  onSuggestedAction?: (sendText: string) => void;
}

function isHandoffBlock(b: MessageContentBlock): b is HandoffBlock {
  return b.type === "handoff_card";
}

function isConfirmBlock(b: MessageContentBlock): b is ConfirmCardBlock {
  return b.type === "confirm_card";
}

function isReportPublishBlock(b: MessageContentBlock): b is ReportPublishCardBlock {
  return b.type === "report_publish_card";
}

export function MessageList({
  messages,
  activeTab = "chat",
  sceneEmptyTitle,
  sceneEmptyBody,
  onHandoffGo,
  onHandoffDismiss,
  onConfirmCard,
  onDismissCard,
  onConfirmCardStatusChange,
  onPublishReport,
  onDismissReport,
  onViewReportDraft,
  latestDraftFilePath,
  viewingDraftKey = "",
  confirmBusy,
  onEditStart,
  onToggleTaskProgress,
  onSuggestedAction,
}: MessageListProps) {
  const showCitations = shouldShowMessageCitations(activeTab);

  if (!messages.length) {
    return (
      <SceneEmptyState
        activeTab={activeTab}
        sceneTitle={sceneEmptyTitle}
        sceneBody={sceneEmptyBody}
      />
    );
  }

  return (
    <div className="space-y-5">
      {messages.map((m, idx) => {
        const isLastUserMsg =
          m.role === "user" &&
          (() => {
            for (let i = idx + 1; i < messages.length; i++) {
              if (messages[i].role === "user") return false;
            }
            return true;
          })();

        const assistantBody =
          m.role === "assistant"
            ? stripTrailingComplianceNotice(
                (showCitations ? Boolean(m.citations?.length) : true)
                  ? stripTrailingCitationSection(m.content)
                  : m.content,
              )
            : m.content;

        const taskProgressExpanded = isTaskProgressExpanded(m);
        const waitingForResponse = isAssistantWaitingForResponse(m);
        const hasStreamedText = m.role === "assistant" && assistantBody.trim().length > 0;

        return (
          <div
            key={m.id}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`flex flex-col gap-1 ${
                m.role === "user" ? CHAT_USER_MESSAGE_WIDTH : CHAT_ASSISTANT_MESSAGE_WIDTH
              }`}
            >
              {waitingForResponse ? (
                <AssistantTypingIndicator />
              ) : (
              <div
                className={`rounded-2xl px-4 py-3 leading-[1.75] ${
                  m.role === "user"
                    ? "bg-[#0075de] text-white whitespace-pre-wrap"
                    : "bg-[#f6f5f4] text-[rgba(0,0,0,0.95)]"
                }`}
              >
                {m.role === "assistant" && (m.workflowTasks?.length ?? 0) > 0 ? (
                  <TaskProgressCard
                    tasks={m.workflowTasks ?? []}
                    reasoningSummary={m.reasoningSummary}
                    expanded={taskProgressExpanded}
                    streaming={m.streaming}
                    onToggleExpand={() => onToggleTaskProgress?.(m.id)}
                  />
                ) : null}
                {m.role === "assistant" ? (
                  <ChatMarkdownContent content={assistantBody} streaming={m.streaming} />
                ) : (
                  m.content
                )}
                {m.streaming && hasStreamedText ? (
                  <span className="chat-stream-cursor" aria-hidden />
                ) : null}
                {m.contentBlocks?.map((block, i) => {
                  if (isHandoffBlock(block)) {
                    return (
                      <HandoffCard
                        key={`${m.id}-handoff-${i}`}
                        card={block}
                        onGo={() => onHandoffGo?.(m.id, block)}
                        onDismiss={() => onHandoffDismiss?.(m.id, block)}
                      />
                    );
                  }
                  if (isConfirmBlock(block)) {
                    return (
                      <ConfirmCard
                        key={`${m.id}-confirm-${i}`}
                        card={block}
                        busy={confirmBusy}
                        onConfirm={() => onConfirmCard?.(m.id, block)}
                        onDismiss={() => onDismissCard?.(m.id, block)}
                        onStatusChange={(newStatus) => onConfirmCardStatusChange?.(m.id, block.artifact_id, newStatus)}
                      />
                    );
                  }
                  if (isReportPublishBlock(block)) {
                    const isLatest = isLatestReportPublishCard(
                      block,
                      latestDraftFilePath,
                    );
                    const isViewing =
                      previewTargetKey(previewTargetFromCard(block)) ===
                      viewingDraftKey;
                    return (
                      <ReportPublishCard
                        key={`${m.id}-report-${i}`}
                        card={block}
                        isLatest={isLatest}
                        isViewing={isViewing}
                        busy={confirmBusy}
                        onPublish={() => onPublishReport?.(m.id, block)}
                        onDismiss={() => onDismissReport?.(m.id, block)}
                        onViewDraft={() => onViewReportDraft?.(m.id, block)}
                      />
                    );
                  }
                  return null;
                })}
                {showCitations && m.citations && m.citations.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-[rgba(0,0,0,0.08)] text-sm">
                    <div className="font-semibold mb-2 text-[#615d59]">参考来源</div>
                    <ul className="m-0 p-0 list-none space-y-2">
                      {m.citations.slice(0, 5).map((c) => {
                        const host = citationHostname(c.url);
                        const label = formatCitationTitle(c.title);
                        return (
                          <li key={c.url}>
                            <a
                              href={c.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={c.title}
                              className="block rounded-lg border border-[rgba(0,0,0,0.06)] bg-white/70 px-3 py-2 text-[#0075de] hover:bg-white hover:underline transition-colors"
                            >
                              <span className="block text-[13px] leading-normal text-[rgba(0,0,0,0.88)]">
                                {label}
                              </span>
                              {host ? (
                                <span className="mt-0.5 block text-xs text-[#999]">{host}</span>
                              ) : null}
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
              )}
              {m.suggestedActions && m.suggestedActions.length > 0 && !m.streaming && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {m.suggestedActions.map((action) => (
                    <button
                      key={action.sendText}
                      type="button"
                      onClick={() => onSuggestedAction?.(action.sendText)}
                      className="rounded-lg bg-[#0075de] text-white px-4 py-2 text-[15px] font-semibold border-0 cursor-pointer hover:bg-[#005bb5] active:bg-[#004a94] transition-colors shadow-sm"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
              {!m.streaming && isLastUserMsg && (
                <div className="flex gap-1 mt-0.5 justify-end">
                  <button
                    type="button"
                    onClick={() => onEditStart?.(m.id, m.content)}
                    className="px-2 py-0.5 text-xs text-[#999] hover:text-[#333] bg-transparent border-0 cursor-pointer rounded hover:bg-[rgba(0,0,0,0.05)] transition-colors"
                  >
                    编辑
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
