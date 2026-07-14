"use client";

import { useEffect, useState } from "react";
import type { SceneId } from "@/harness/registry/load";
import type { UsageGuidePayload } from "@/lib/usage/build-usage-guide";

const SCENE_TABS: Array<{ id: SceneId | "overview"; label: string }> = [
  { id: "overview", label: "总览" },
  { id: "chat", label: "自由问答" },
  { id: "profile", label: "需求梳理" },
  { id: "plan", label: "资产配置" },
  { id: "portfolio", label: "持仓分析" },
  { id: "fund", label: "基金解析" },
];

function UsageItemBody({ title, body }: { title?: string; body: string }) {
  if (title) {
    return (
      <>
        <strong>{title}</strong>
        {" — "}
        {body}
      </>
    );
  }
  return <>{body}</>;
}

function UsageSectionList({
  sections,
}: {
  sections: UsageGuidePayload["overview"]["sections"];
}) {
  return (
    <>
      {sections.map((section) => (
        <section key={section.title}>
          <h3>{section.title}</h3>
          <ul className="m-0 pl-5 space-y-2">
            {section.items.map((item, i) => (
              <li key={i}>
                <UsageItemBody title={item.title} body={item.body} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function UsageGuideDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<SceneId | "overview">("overview");
  const [data, setData] = useState<UsageGuidePayload | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void fetch("/api/usage")
      .then((r) => r.json())
      .then((d: UsageGuidePayload) => setData(d))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const scenePage = data?.scenes.find((s) => s.scene === tab);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-stretch justify-end bg-black/30"
      role="dialog"
      aria-modal="true"
      aria-label="使用说明"
    >
      <button
        type="button"
        className="flex-1 border-0 bg-transparent cursor-default"
        aria-label="关闭"
        onClick={onClose}
      />
      <div className="w-full max-w-[560px] bg-white shadow-xl flex flex-col max-h-screen">
        <header className="border-b border-[rgba(0,0,0,0.1)] px-5 py-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold m-0">使用说明</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[rgba(0,0,0,0.1)] px-3 py-1.5 text-sm font-semibold bg-white cursor-pointer"
          >
            关闭
          </button>
        </header>

        <div className="px-5 pt-3 flex flex-wrap gap-2 border-b border-[rgba(0,0,0,0.1)] pb-3">
          {SCENE_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-full px-3 py-1 text-sm font-semibold border cursor-pointer ${
                tab === t.id
                  ? "bg-[#0075de] text-white border-[#0075de]"
                  : "bg-white text-[#615d59] border-[rgba(0,0,0,0.1)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 reading-prose text-[rgba(0,0,0,0.9)]">
          {loading && <p className="text-[#615d59]">加载中…</p>}

          {!loading && data && tab === "overview" && (
            <div>
              <p>{data.overview.intro}</p>
              <section>
                <h3>我能帮你做什么</h3>
                <ul className="m-0 pl-5 space-y-2">
                  {data.overview.capabilities.map((cap) => (
                    <li key={cap.title}>
                      <UsageItemBody title={cap.title} body={cap.body} />
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <h3>范围说明</h3>
                <p>{data.overview.scope_note}</p>
              </section>
              <section>
                <h3>建议使用路径</h3>
                <p>{data.overview.path_note}</p>
              </section>
              <UsageSectionList sections={data.overview.sections} />
            </div>
          )}

          {!loading && scenePage && tab !== "overview" && (
            <div>
              <section>
                <h3>{scenePage.title}</h3>
                <p>{scenePage.intro}</p>
              </section>
              <UsageSectionList sections={scenePage.sections} />
              {scenePage.tips && scenePage.tips.length > 0 && (
                <section>
                  <h3>小提示</h3>
                  <ul className="m-0 pl-5 space-y-2">
                    {scenePage.tips.map((tip) => (
                      <li key={tip}>{tip}</li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function UsageGuideTrigger({
  className = "",
}: {
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ||
          "block w-full text-left text-[15px] font-semibold rounded-lg px-3 py-2 hover:bg-[#f6f5f4] border-0 bg-transparent cursor-pointer text-[rgba(0,0,0,0.95)]"
        }
      >
        使用说明
      </button>
      <UsageGuideDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
