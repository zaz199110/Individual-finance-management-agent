"use client";

import { useCallback, useEffect, useState } from "react";

/** 操作反馈类提示默认展示时长（秒级 toast / 横幅） */
export const TRANSIENT_NOTICE_MS = 4000;

export function useAutoDismissEffect(
  value: string | null,
  onDismiss: () => void,
  options?: { ms?: number; enabled?: boolean },
) {
  const ms = options?.ms ?? TRANSIENT_NOTICE_MS;
  const enabled = options?.enabled ?? true;

  useEffect(() => {
    if (!value || !enabled) return;
    const timer = window.setTimeout(onDismiss, ms);
    return () => window.clearTimeout(timer);
  }, [value, onDismiss, ms, enabled]);
}

/** 仅用于会自动消失的瞬时提示 */
export function useTransientNotice(ms = TRANSIENT_NOTICE_MS) {
  const [notice, setNotice] = useState<string | null>(null);
  const clearNotice = useCallback(() => setNotice(null), []);
  const showNotice = useCallback((msg: string) => setNotice(msg), []);

  useAutoDismissEffect(notice, clearNotice, { ms });

  return { notice, showNotice, clearNotice };
}

/** 同时支持常驻与自动消失的页面级反馈 */
export function useFeedbackMessage(ms = TRANSIENT_NOTICE_MS) {
  const [message, setMessage] = useState<string | null>(null);
  const [autoDismiss, setAutoDismiss] = useState(false);

  const clearMessage = useCallback(() => {
    setMessage(null);
    setAutoDismiss(false);
  }, []);

  const showFeedback = useCallback(
    (msg: string, options?: { persist?: boolean }) => {
      setMessage(msg);
      setAutoDismiss(!options?.persist);
    },
    [],
  );

  useAutoDismissEffect(message, clearMessage, { ms, enabled: autoDismiss });

  return { message, showFeedback, clearMessage };
}
