"use client";

import { useEffect, useState, useCallback } from "react";
import type { ConfirmCardBlock } from "./types";
import { FundEditor, type PlanCategory } from "./FundEditor";

interface ConfirmCardProps {
  card: ConfirmCardBlock;
  onConfirm?: () => void;
  onDismiss?: () => void;
  onStatusChange?: (newStatus: ConfirmCardBlock["status"]) => void;
  busy?: boolean;
}

export function ConfirmCard({
  card,
  onConfirm,
  onDismiss,
  onStatusChange,
  busy,
}: ConfirmCardProps) {
  const [body, setBody] = useState<string | null>(null);
  const [payload, setPayload] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [editedCategories, setEditedCategories] = useState<
    { category: string; allocation_pct: number }[]
  >([]);
  const [saving, setSaving] = useState(false);
  const [editingError, setEditingError] = useState("");

  // plan_detail editing state
  const [detailCategories, setDetailCategories] = useState<PlanCategory[]>([]);
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailWarnings, setDetailWarnings] = useState<string[]>([]);

  const disabled = card.status !== "active" || busy;
  const isPlanAllocation = card.card_kind === "plan_allocation";
  const isPlanDetail = card.card_kind === "plan_detail";
  const showEdit =
    (isPlanAllocation || isPlanDetail) && card.status === "active" && !editing;

  /**
   * Check the database status of this artifact.
   * If it has changed (e.g., superseded by a newer card), update the frontend status.
   * Returns true if the card is still active (pending in DB), false otherwise.
   */
  const checkAndSyncStatus = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`/api/artifacts/${card.artifact_id}`);
      if (!res.ok) return false;
      const data = await res.json();
      const dbStatus = data.status as string | undefined;
      // Map DB status to frontend status
      const statusMap: Record<string, ConfirmCardBlock["status"]> = {
        pending: "active",
        confirmed: "confirmed",
        abandoned: "dismissed",
        superseded: "superseded",
      };
      const frontendStatus = statusMap[dbStatus ?? ""] ?? "superseded";
      if (frontendStatus !== card.status) {
        onStatusChange?.(frontendStatus);
        return frontendStatus === "active";
      }
      return frontendStatus === "active";
    } catch {
      return false;
    }
  }, [card.artifact_id, card.status, onStatusChange]);

  // Fetch artifact content on mount / when card changes
  useEffect(() => {
    if (card.status !== "active") return;
    setBody(null);
    setPayload(null);
    setEditing(false);
    setEditingError("");
    setDetailWarnings([]);
    void fetch(`/api/artifacts/${card.artifact_id}`)
      .then((r) => r.json())
      .then((d) => {
        setBody(typeof d.body === "string" ? d.body : null);
        if (d.payload) setPayload(d.payload);
      })
      .catch(() => setBody(null));
  }, [card.artifact_id, card.status]);

  // -- Edit mode helpers --

  const startEdit = async () => {
    // Check database status before allowing edit
    const isActive = await checkAndSyncStatus();
    if (!isActive) {
      setEditingError("该确认卡状态已变更，无法编辑。");
      return;
    }

    if (isPlanAllocation) {
      const cats =
        payload?.target_allocation?.categories as
          | { category: string; allocation_pct: number }[]
          | undefined;
      if (!cats || cats.length === 0) return;
      setEditedCategories(cats.map((c) => ({ ...c })));
      setEditingError("");
      setEditing(true);
    } else if (isPlanDetail) {
      const cats = payload?.detailed_plan?.categories as PlanCategory[] | undefined;
      if (!cats || cats.length === 0) return;
      // Deep copy
      setDetailCategories(cats.map((c) => ({
        ...c,
        items: c.items.map((item) => ({ ...item })),
      })));
      setDetailWarnings([]);
      setEditing(true);
    }
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditingError("");
    setDetailWarnings([]);
  };

  const handleCategoryChange = (idx: number, raw: string) => {
    const val = parseFloat(raw);
    setEditedCategories((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        allocation_pct: isNaN(val) ? 0 : val,
      };
      return next;
    });
    setEditingError("");
  };

  const totalSum = editedCategories.reduce(
    (s, c) => s + (c.allocation_pct ?? 0),
    0,
  );
  const sumValid = Math.abs(totalSum - 100) <= 0.5;

  const saveEdit = async () => {
    if (isPlanAllocation) {
      if (!sumValid) {
        setEditingError(`大类比例之和须为 100%（当前 ${totalSum.toFixed(1)}%）。`);
        return;
      }
      setSaving(true);
      setEditingError("");
      try {
        const res = await fetch(`/api/artifacts/${card.artifact_id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target_allocation: { categories: editedCategories },
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          setEditingError(
            typeof json.error === "string"
              ? json.error
              : "保存失败，请重试。",
          );
          return;
        }
        // Re-fetch to update body display
        const refreshRes = await fetch(
          `/api/artifacts/${card.artifact_id}`,
        );
        const refreshData = await refreshRes.json();
        setBody(
          typeof refreshData.body === "string" ? refreshData.body : null,
        );
        if (refreshData.payload) setPayload(refreshData.payload);
        setEditing(false);
        setEditingError("");
      } catch {
        setEditingError("网络错误，请重试。");
      } finally {
        setSaving(false);
      }
    } else if (isPlanDetail) {
      setDetailSaving(true);
      setDetailWarnings([]);
      try {
        const res = await fetch(`/api/artifacts/${card.artifact_id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            detailed_plan: { categories: detailCategories },
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          setEditingError(
            typeof json.error === "string"
              ? json.error
              : "保存失败，请重试。",
          );
          return;
        }
        if (json.warnings && json.warnings.length > 0) {
          setDetailWarnings(json.warnings);
        }
        // Re-fetch to update body display
        const refreshRes = await fetch(
          `/api/artifacts/${card.artifact_id}`,
        );
        const refreshData = await refreshRes.json();
        setBody(
          typeof refreshData.body === "string" ? refreshData.body : null,
        );
        if (refreshData.payload) setPayload(refreshData.payload);
        setEditing(false);
        setDetailWarnings([]);
      } catch {
        setEditingError("网络错误，请重试。");
      } finally {
        setDetailSaving(false);
      }
    }
  };

  // -- Render helpers --

  const ratioBarColor = (pct: number) => {
    if (pct >= 40) return "bg-[#e65100]";
    if (pct >= 25) return "bg-[#0075de]";
    return "bg-[#a09b96]";
  };

  // -- JSX --

  return (
    <div
      className={`mt-3 rounded-xl border px-4 py-3 text-left ${
        card.status === "active"
          ? "border-[#0075de]/30 bg-white"
          : "border-[rgba(0,0,0,0.08)] bg-[#fafafa] opacity-70"
      }`}
    >
      {!editing && body && (
        <pre className="text-[14px] whitespace-pre-wrap font-sans text-[#615d59] mb-3 m-0">
          {body}
        </pre>
      )}
      {!editing && !body && (
        <p className="text-[14px] text-[#615d59] mb-3">{card.summary_zh}</p>
      )}

      {/* Edit mode - plan_allocation */}
      {editing && isPlanAllocation && (
        <div className="mb-3">
          <p className="text-[14px] font-semibold text-[#1f1a16] mb-3">
            调整大类资产比例
          </p>
          <div className="space-y-2">
            {editedCategories.map((cat, idx) => (
              <div
                key={cat.category}
                className="flex items-center gap-2"
              >
                <span className="text-[14px] text-[#615d59] w-20 shrink-0">
                  {cat.category}
                </span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={cat.allocation_pct}
                  onChange={(e) => handleCategoryChange(idx, e.target.value)}
                  className="w-20 rounded-md border border-[rgba(0,0,0,0.15)] px-2 py-1 text-[14px] text-right focus:outline-none focus:border-[#0075de] focus:ring-1 focus:ring-[#0075de]"
                />
                <span className="text-[14px] text-[#a09b96]">%</span>
                {/* Ratio bar */}
                <div className="flex-1 h-2 bg-[#f0eeec] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${ratioBarColor(cat.allocation_pct)}`}
                    style={{ width: `${Math.min(cat.allocation_pct, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          {/* Sum indicator */}
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[13px] text-[#a09b96]">合计</span>
            <span
              className={`text-[14px] font-semibold ${sumValid ? "text-[#16a34a]" : "text-[#dc2626]"}`}
            >
              {totalSum.toFixed(1)}%
            </span>
            {!sumValid && (
              <span className="text-[13px] text-[#dc2626]">
                需等于 100%
              </span>
            )}
          </div>
          {editingError && (
            <p className="text-[13px] text-[#dc2626] mt-2 mb-0">
              {editingError}
            </p>
          )}
        </div>
      )}

      {/* Edit mode - plan_detail */}
      {editing && isPlanDetail && (
        <div className="mb-3">
          <p className="text-[14px] font-semibold text-[#1f1a16] mb-3">
            编辑基金配置
          </p>
          <FundEditor
            categories={detailCategories}
            onChange={setDetailCategories}
            saving={detailSaving}
            warnings={detailWarnings}
          />
          {editingError && (
            <p className="text-[13px] text-[#dc2626] mt-2 mb-0">
              {editingError}
            </p>
          )}
        </div>
      )}

      {/* Footer buttons */}
      <div className="flex flex-wrap gap-2">
        {!editing && (
          <>
            <button
              type="button"
              disabled={disabled}
              onClick={async () => {
                const isActive = await checkAndSyncStatus();
                if (!isActive) {
                  setEditingError("该确认卡状态已变更，无法确认。");
                  return;
                }
                onConfirm?.();
              }}
              className="rounded-lg bg-[#0075de] text-white px-3 py-1.5 text-[14px] font-semibold border-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-[#d8d5d1] disabled:text-[#a09b96]"
            >
              确认
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={onDismiss}
              className="rounded-lg bg-white text-[#615d59] px-3 py-1.5 text-[14px] font-semibold border border-[rgba(0,0,0,0.12)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-[#f6f5f4] disabled:text-[#a09b96] disabled:border-[#d8d5d1]"
            >
              放弃，暂不保存
            </button>
            {showEdit && (
              <button
                type="button"
                onClick={startEdit}
                className="rounded-lg bg-white text-[#0075de] px-3 py-1.5 text-[14px] font-semibold border border-[#0075de]/30 cursor-pointer hover:bg-[#e8f2fd]"
              >
                修改
              </button>
            )}
          </>
        )}
        {editing && (
          <>
            <button
              type="button"
              disabled={saving || detailSaving}
              onClick={saveEdit}
              className="rounded-lg bg-[#0075de] text-white px-3 py-1.5 text-[14px] font-semibold border-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving || detailSaving ? "保存中…" : "保存修改"}
            </button>
            <button
              type="button"
              disabled={saving || detailSaving}
              onClick={cancelEdit}
              className="rounded-lg bg-white text-[#615d59] px-3 py-1.5 text-[14px] font-semibold border border-[rgba(0,0,0,0.12)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              取消
            </button>
          </>
        )}
      </div>

      {card.status === "confirmed" && (
        <p className="text-sm text-[#16a34a] mt-2 mb-0">已确认并保存</p>
      )}
      {card.status === "dismissed" && (
        <p className="text-sm text-[#615d59] mt-2 mb-0">已放弃</p>
      )}
    </div>
  );
}
