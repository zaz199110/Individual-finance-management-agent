"use client";

import { useEffect } from "react";

export const SETTINGS_STARTUP_PROBE_EVENT = "agent-demo:settings-startup-probe-done";

/** 同一次客户端会话内只探测一次；F5 刷新页面不会重复探测 */
const CLIENT_SESSION_KEY = "agent-demo.settings-startup.v1";

/**
 * 打开客户端时（新标签/新窗口）：后台探测未通过项，不阻塞 UI。
 * 页面刷新不算「打开客户端」，不会再次触发。
 */
export function SettingsStartupProbe() {
  useEffect(() => {
    if (sessionStorage.getItem(CLIENT_SESSION_KEY)) return;

    void (async () => {
      try {
        await fetch("/api/settings/auto-probe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: false }),
        });
      } finally {
        sessionStorage.setItem(CLIENT_SESSION_KEY, String(Date.now()));
        window.dispatchEvent(new CustomEvent(SETTINGS_STARTUP_PROBE_EVENT));
      }
    })();
  }, []);

  return null;
}

export function isClientStartupProbeDone(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(sessionStorage.getItem(CLIENT_SESSION_KEY));
}
