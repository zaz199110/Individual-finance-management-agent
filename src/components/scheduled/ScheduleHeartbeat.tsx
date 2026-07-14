"use client";

import { useEffect } from "react";

const TICK_MS = 60_000;

/** SCH-14: 浏览器打开时辅助触发 tick（与服务端 instrumentation 互补） */
export function ScheduleHeartbeat() {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") return;

    const tick = () => {
      void fetch("/api/scheduled-jobs/tick", { method: "POST" }).catch(() => {});
    };
    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, []);

  return null;
}
