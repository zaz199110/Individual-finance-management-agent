"use client";

import { useReadiness } from "@/contexts/ReadinessContext";
import { clearReadinessCache } from "@/lib/settings/readiness-cache";

export function SettingsDbStatusBadge() {
  const { readiness, refreshReadiness } = useReadiness();

  if (!readiness?.database) return null;

  const { ready, local_managed } = readiness.database;

  if (!ready) {
    const label = local_managed ? "本地数据空间未就绪" : "云端数据空间未就绪";
    return (
      <div className="rounded-lg px-2.5 py-2 text-xs flex items-center gap-1.5 bg-[#fef3c7] text-[#a16207]">
        <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0 bg-[#e0a500]" />
        <span className="leading-snug">{label}</span>
        <button
          type="button"
          onClick={async () => {
            await fetch("/api/settings/database/test", { method: "POST" });
            clearReadinessCache();
            await refreshReadiness();
          }}
          className="underline cursor-pointer bg-transparent border-0 text-xs leading-snug shrink-0 ml-auto"
        >
          重新检测
        </button>
      </div>
    );
  }

  return null;
}
