"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SidebarNavFooter } from "@/components/layout/SidebarNavFooter";
import { SidebarNewChatHeader } from "@/components/layout/SidebarNewChatHeader";
import {
  SIDEBAR_SEARCH_INPUT,
  SIDEBAR_CONVERSATION_ROW,
  SIDEBAR_CONVERSATION_TITLE_BTN,
  sidebarSectionClasses,
} from "@/components/layout/sidebar-layout";
import { prepareSidebarConversations } from "@/components/chat/conversation-sidebar";
import { applySinglePinToConversationList } from "@/lib/chat/conversation-pin";
import { createConversationEntry } from "@/lib/chat/conversation-entry";
import {
  commitRenameTitle,
  getRenameDraft,
  type ParsedConversationTitle,
} from "@/lib/chat/conversation-title";
import { navigateToConversation } from "@/lib/chat/navigate-conversation";
import {
  appendConversationQuery,
  resolveSidebarActive,
} from "@/lib/layout/shell-route";
import { CONVERSATION_TITLE_LINE_CLAMP_CLASS } from "@/lib/chat/user-content";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ContextMenu, type ContextMenuItem } from "@/components/ui/ContextMenu";
import {
  useConversationList,
  type AppConversationSummary,
} from "@/contexts/ConversationListContext";

export function ConversationSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const {
    conversations,
    setConversations,
    refreshConversations,
    conversationId,
    loadingConversations,
  } = useConversationList();

  const [searchQuery, setSearchQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameParsed, setRenameParsed] = useState<ParsedConversationTitle | null>(
    null,
  );
  const [sidebarError, setSidebarError] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [conversationContextMenu, setConversationContextMenu] = useState<{
    convId: string;
    x: number;
    y: number;
  } | null>(null);

  const activeNav = resolveSidebarActive(pathname);
  const filteredConversations = prepareSidebarConversations(
    conversations,
    searchQuery,
  );

  useEffect(() => {
    if (!renamingId) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [renamingId]);

  async function createConversation() {
    const id = await createConversationEntry();
    if (!id) return;
    await refreshConversations();
    navigateToConversation(router, id);
  }

  async function handleDeleteConversation(convId: string) {
    setDeleteConfirm(null);
    try {
      await fetch(`/api/conversations/${convId}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (convId === conversationId) {
        const remaining = conversations.filter((c) => c.id !== convId);
        if (remaining.length > 0) {
          navigateToConversation(router, remaining[0].id);
        } else {
          await createConversation();
        }
      }
    } catch {
      setSidebarError("删除对话失败");
    }
  }

  function startRenameConversation(convId: string, currentTitle: string) {
    const { draft, parsed } = getRenameDraft(currentTitle);
    setRenamingId(convId);
    setRenameDraft(draft);
    setRenameParsed(parsed);
  }

  function cancelRenameConversation() {
    setRenamingId(null);
    setRenameDraft("");
    setRenameParsed(null);
  }

  async function commitRenameConversation(convId: string) {
    const trimmed = renameDraft.trim();
    if (!trimmed) {
      cancelRenameConversation();
      return;
    }
    const conv = conversations.find((c) => c.id === convId);
    const nextTitle = commitRenameTitle(
      conv?.title ?? trimmed,
      trimmed,
      conv?.conversation_type,
      conv?.created_at,
    );
    if (conv && nextTitle === conv.title) {
      cancelRenameConversation();
      return;
    }
    try {
      const res = await fetch(`/api/conversations/${convId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: nextTitle }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "重命名失败");
      }
      const updated = (await res.json()) as AppConversationSummary;
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, title: updated.title } : c)),
      );
      cancelRenameConversation();
    } catch (err) {
      setSidebarError(err instanceof Error ? err.message : "重命名失败");
      cancelRenameConversation();
    }
  }

  async function togglePinConversation(convId: string) {
    const conv = conversations.find((c) => c.id === convId);
    if (!conv) return;
    const pinned = !(conv.metadata?.pinned ?? false);
    try {
      const res = await fetch(`/api/conversations/${convId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "置顶操作失败");
      }
      const updated = (await res.json()) as AppConversationSummary;
      setConversations((prev) =>
        applySinglePinToConversationList(
          prev,
          convId,
          updated.metadata?.pinned ?? false,
          updated.metadata?.pinned_at ?? null,
        ),
      );
    } catch (err) {
      setSidebarError(err instanceof Error ? err.message : "置顶操作失败");
    }
  }

  function buildConversationContextMenuItems(convId: string): ContextMenuItem[] {
    const conv = conversations.find((c) => c.id === convId);
    const pinned = conv?.metadata?.pinned ?? false;
    return [
      {
        id: "pin",
        label: pinned ? "取消置顶" : "置顶",
        onSelect: () => void togglePinConversation(convId),
      },
      {
        id: "rename",
        label: "重命名",
        onSelect: () => startRenameConversation(convId, conv?.title ?? ""),
      },
      {
        id: "delete",
        label: "删除",
        danger: true,
        onSelect: () => setDeleteConfirm(convId),
      },
    ];
  }

  function getDeleteConfirmInfo(convId: string): {
    title: string;
    message: string;
  } {
    const conv = conversations.find((c) => c.id === convId);
    const hasUnconfirmed = conv?.metadata?.has_unconfirmed ?? false;
    return {
      title: "删除这条对话？",
      message: hasUnconfirmed
        ? "这条对话里还有尚未发布的报告，或等待您确认的内容。删除后，这些内容将一并清除且无法恢复。\n\n已发布到「我的报告」的内容不会被删除，您仍可在侧栏「我的报告」中查看。"
        : "删除后，聊天记录将无法恢复。",
    };
  }

  return (
    <>
      <SidebarNewChatHeader onNewConversation={() => void createConversation()} />
      <div className={sidebarSectionClasses.search}>
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索对话…"
            className={SIDEBAR_SEARCH_INPUT}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#999] hover:text-[#333] text-sm border-0 bg-transparent cursor-pointer p-0 leading-none"
            >
              ✕
            </button>
          )}
        </div>
      </div>
      {sidebarError && (
        <div className="mx-3 mb-2 rounded-lg border border-[#e03e3e] bg-[#fef2f2] px-3 py-2 text-xs text-[#e03e3e] flex justify-between gap-2">
          <span>{sidebarError}</span>
          <button
            type="button"
            className="shrink-0 underline border-0 bg-transparent cursor-pointer"
            onClick={() => setSidebarError(null)}
          >
            关闭
          </button>
        </div>
      )}
      <div className={sidebarSectionClasses.scroll}>
        {loadingConversations ? (
          <div className="p-4 text-center text-[#615d59] text-sm">加载中…</div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-4 text-center text-[#615d59] text-sm">
            {searchQuery ? "没有匹配的对话" : "暂无对话"}
          </div>
        ) : (
          filteredConversations.map((c) => (
            <div
              key={c.id}
              className={`${SIDEBAR_CONVERSATION_ROW} ${
                c.id === conversationId && activeNav === "chat"
                  ? "bg-[#f6f5f4] font-semibold"
                  : "bg-transparent hover:bg-[#f6f5f4]"
              }`}
              onContextMenu={(e) => {
                if (renamingId === c.id) return;
                e.preventDefault();
                setConversationContextMenu({
                  convId: c.id,
                  x: e.clientX,
                  y: e.clientY,
                });
              }}
            >
              {renamingId === c.id ? (
                <div className="flex flex-1 items-center gap-1 min-w-0 px-1 py-0.5">
                  {renameParsed ? (
                    <>
                      <span className="shrink-0 text-xs text-[#615d59] truncate max-w-[88px]">
                        【{renameParsed.sceneLabel}】-
                      </span>
                      <input
                        ref={renameInputRef}
                        type="text"
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void commitRenameConversation(c.id);
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            cancelRenameConversation();
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 min-w-0 rounded border border-[#0075de] px-2 py-1 text-sm outline-none bg-white"
                        aria-label="编辑对话摘要"
                      />
                      <span className="shrink-0 text-xs text-[#615d59]">
                        -{renameParsed.date}
                      </span>
                    </>
                  ) : (
                    <input
                      ref={renameInputRef}
                      type="text"
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void commitRenameConversation(c.id);
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          cancelRenameConversation();
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 rounded border border-[#0075de] px-2 py-1 text-[15px] outline-none bg-white"
                      aria-label="重命名对话"
                    />
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void commitRenameConversation(c.id);
                    }}
                    className="shrink-0 px-1.5 py-1 text-xs text-[#0075de] border-0 bg-transparent cursor-pointer"
                    title="确认"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      cancelRenameConversation();
                    }}
                    className="shrink-0 px-1 py-1 text-xs text-[#999] border-0 bg-transparent cursor-pointer"
                    title="取消"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => navigateToConversation(router, c.id)}
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    startRenameConversation(c.id, c.title);
                  }}
                  className={SIDEBAR_CONVERSATION_TITLE_BTN}
                  title="双击重命名摘要；右键更多操作"
                >
                  <span className={CONVERSATION_TITLE_LINE_CLAMP_CLASS}>
                    {c.metadata?.pinned && (
                      <span className="inline-block mr-1 text-[#0075de]">📌</span>
                    )}
                    {c.metadata?.has_unconfirmed && (
                      <span
                        className="inline-block w-2 h-2 rounded-full bg-[#f59e0b] mr-2 align-middle"
                        title="有待确认的内容"
                      />
                    )}
                    {c.title}
                  </span>
                </button>
              )}
            </div>
          ))
        )}
      </div>
      <SidebarNavFooter
        active={activeNav}
        conversationId={conversationId}
        reportsHref={appendConversationQuery("/reports", conversationId)}
        fundKnowledgeHref={appendConversationQuery(
          "/fund-knowledge",
          conversationId,
        )}
        scheduledJobsHref={appendConversationQuery(
          "/scheduled-jobs",
          conversationId,
        )}
        settingsHref={appendConversationQuery("/settings/models", conversationId)}
      />

      {conversationContextMenu && (
        <ContextMenu
          x={conversationContextMenu.x}
          y={conversationContextMenu.y}
          items={buildConversationContextMenuItems(conversationContextMenu.convId)}
          onClose={() => setConversationContextMenu(null)}
        />
      )}

      {deleteConfirm && (() => {
        const info = getDeleteConfirmInfo(deleteConfirm);
        return (
          <ConfirmDialog
            open
            title={info.title}
            message={info.message}
            confirmText="删除"
            cancelText="取消"
            danger
            onConfirm={() => void handleDeleteConversation(deleteConfirm)}
            onCancel={() => setDeleteConfirm(null)}
          />
        );
      })()}
    </>
  );
}
