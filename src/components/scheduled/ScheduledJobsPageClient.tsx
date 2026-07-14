"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  pageSectionClasses,
} from "@/components/layout/page-layout";
import { navigateToConversation } from "@/lib/chat/navigate-conversation";
import type { ScheduleKind, ScheduledJob, ScheduledJobRun } from "@/lib/scheduled/jobs";

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

function formatTriggeredAt(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return iso;
  }
}

export function ScheduledJobsPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversationId = searchParams.get("c");

  const [job, setJob] = useState<ScheduledJob | null>(null);
  const [scheduleLabel, setScheduleLabel] = useState("未设置");
  const [runs, setRuns] = useState<ScheduledJobRun[]>([]);
  const [hasHoldings, setHasHoldings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [editEnabled, setEditEnabled] = useState(false);
  const [editKind, setEditKind] = useState<ScheduleKind>("weekly");
  const [editDays, setEditDays] = useState<number[]>([3]);
  const [editTime, setEditTime] = useState("09:00");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/scheduled-jobs");
      const data = await res.json();
      setJob(data.job ?? null);
      setScheduleLabel(data.schedule_label ?? "未设置");
      setRuns(data.runs ?? []);
      setHasHoldings(Boolean(data.has_holdings));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openEdit() {
    if (!job) return;
    setEditEnabled(job.enabled);
    setEditKind(job.schedule_kind ?? "weekly");
    setEditDays(job.schedule_days?.length ? [...job.schedule_days] : [3]);
    setEditTime(job.run_at_time || "09:00");
    setModalError(null);
    setModalOpen(true);
  }

  function toggleDay(day: number) {
    setEditDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
    );
  }

  async function saveEdit() {
    setSaving(true);
    setModalError(null);
    try {
      const res = await fetch("/api/scheduled-jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: editEnabled,
          schedule_kind: editKind,
          schedule_days: editDays,
          run_at_time: editTime,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setModalError(data.error ?? "保存失败");
        return;
      }
      setJob(data.job);
      setScheduleLabel(data.schedule_label);
      setModalOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function startPortfolioEntry() {
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active_tab: "portfolio" }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { id?: string };
    if (data.id) navigateToConversation(router, data.id);
  }

  return (
    <main className={`${pageSectionClasses.main} flex-1 min-h-0 overflow-y-auto`}>
        <h1 className="text-2xl font-semibold mb-4">定时持仓分析</h1>

        <div className="rounded-xl border border-[rgba(0,0,0,0.1)] bg-[#f6f5f4] px-4 py-3 text-sm text-[#615d59] mb-6">
          按设定时间自动生成持仓分析报告，保存至「我的报告 · 持仓分析」。触发时间以您电脑的本地时区为准，报告数据截至最近一个沪深交易日。
          <br />
          <strong>请保持本应用持续运行</strong>，定时任务才能按时执行。若关闭应用，错过的任务不会自动补跑，您可在「持仓分析」中手动发起分析。
        </div>

        {loading ? (
          <p className="text-[#615d59]">加载中…</p>
        ) : (
          <>
            <div className="rounded-xl border border-[rgba(0,0,0,0.1)] p-6 mb-8">
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-[15px] mb-6">
                <dt className="text-[#615d59]">状态</dt>
                <dd className="font-semibold">
                  {job?.enabled ? "开启" : "关闭"}
                </dd>
                <dt className="text-[#615d59]">触发频率</dt>
                <dd className="font-semibold">{scheduleLabel}</dd>
              </dl>

              {hasHoldings ? (
                <button
                  type="button"
                  onClick={openEdit}
                  className="rounded-lg bg-[#0075de] text-white px-5 py-2 font-semibold border-0 cursor-pointer"
                >
                  编辑
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void startPortfolioEntry()}
                  className="rounded-lg bg-[#0075de] text-white px-5 py-2 font-semibold border-0 cursor-pointer"
                >
                  录入持仓
                </button>
              )}
            </div>

            <h2 className="text-lg font-semibold mb-3">任务日志</h2>
            {runs.length === 0 ? (
              <p className="text-[#615d59] text-sm">暂无执行记录。</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[rgba(0,0,0,0.1)]">
                <table className="w-full text-sm">
                  <thead className="bg-[#f6f5f4] text-left">
                    <tr>
                      <th className="px-3 py-2 font-semibold">触发时间</th>
                      <th className="px-3 py-2 font-semibold">任务状态</th>
                      <th className="px-3 py-2 font-semibold">相关报告</th>
                      <th className="px-3 py-2 font-semibold">原因</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((run) => (
                      <tr key={run.id} className="border-t border-[rgba(0,0,0,0.06)]">
                        <td className="px-3 py-2 whitespace-nowrap">
                          {formatTriggeredAt(run.triggered_at)}
                        </td>
                        <td className="px-3 py-2">
                          {run.status === "success"
                            ? "成功"
                            : run.status === "failed"
                              ? "失败"
                              : "跳过"}
                        </td>
                        <td className="px-3 py-2">
                          {run.report_index_id ? (
                            <Link
                              href={`/reports?tab=portfolio&id=${run.report_index_id}`}
                              className="text-[#0075de] font-semibold"
                            >
                              {run.report_name ?? "查看报告"}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2 text-[#615d59]">
                          {run.failure_reason ?? run.skip_reason ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {modalOpen && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
              <h3 className="text-lg font-semibold mb-4">编辑定时任务</h3>
              <div className="space-y-4 mb-4">
                <div>
                  <div className="text-sm font-semibold mb-2">触发频率</div>
                  <div className="flex gap-4 mb-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={editKind === "weekly"}
                        onChange={() => setEditKind("weekly")}
                      />
                      每周
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={editKind === "monthly"}
                        onChange={() => setEditKind("monthly")}
                      />
                      每月
                    </label>
                  </div>
                  {editKind === "weekly" ? (
                    <div className="flex flex-wrap gap-2">
                      {WEEKDAY_LABELS.map((label, i) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => toggleDay(i)}
                          className={`rounded-lg px-3 py-1 text-sm border cursor-pointer ${
                            editDays.includes(i)
                              ? "bg-[#0075de] text-white border-[#0075de]"
                              : "bg-white border-[rgba(0,0,0,0.1)]"
                          }`}
                        >
                          周{label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => toggleDay(d)}
                          className={`rounded px-2 py-0.5 text-xs border cursor-pointer ${
                            editDays.includes(d)
                              ? "bg-[#0075de] text-white border-[#0075de]"
                              : "bg-white border-[rgba(0,0,0,0.1)]"
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-sm font-semibold block mb-1">执行时间</label>
                  <input
                    type="time"
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                    className="rounded-lg border border-[rgba(0,0,0,0.1)] px-3 py-2"
                  />
                </div>

                <div>
                  <div className="text-sm font-semibold mb-2">任务状态</div>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={editEnabled}
                        onChange={() => setEditEnabled(true)}
                      />
                      开启
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={!editEnabled}
                        onChange={() => setEditEnabled(false)}
                      />
                      关闭
                    </label>
                  </div>
                </div>
              </div>

              {modalError && (
                <div className="rounded-lg border border-[#e03e3e] bg-[#fef2f2] px-3 py-2 text-sm text-[#e03e3e] mb-4">
                  {modalError}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-[rgba(0,0,0,0.1)] px-4 py-2 bg-white cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveEdit()}
                  className="rounded-lg bg-[#0075de] text-white px-4 py-2 font-semibold border-0 cursor-pointer disabled:opacity-50"
                >
                  {saving ? "保存中…" : "保存"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
  );
}
