"use client";

import { useEffect, useState } from "react";

/**
 * 网络离线检测 + Toast 提示
 * PRD §5.3.15 ERR-OFFLINE
 */
export function OfflineToast() {
  const [isOffline, setIsOffline] = useState(false);
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    };

    const handleOffline = () => {
      setIsOffline(true);
      setShowToast(true);
    };

    // 初始化检查
    setIsOffline(!navigator.onLine);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (!showToast) return null;

  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-[200] rounded-lg px-4 py-3 text-sm font-semibold shadow-lg transition-all ${
        isOffline
          ? "bg-[#e03e3e] text-white"
          : "bg-[#16a34a] text-white"
      }`}
    >
      {isOffline ? (
        <span>网络已断开，请检查网络连接</span>
      ) : (
        <span>网络已恢复</span>
      )}
    </div>
  );
}
