"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { SETTINGS_STARTUP_PROBE_EVENT } from "@/components/settings/SettingsStartupProbe";
import {
  getCachedReadiness,
  writeReadinessCache,
} from "@/lib/settings/readiness-cache";
import type { ReadinessResult } from "@/lib/settings/readiness";

interface ReadinessContextValue {
  readiness: ReadinessResult | null;
  readinessLoading: boolean;
  refreshReadiness: () => Promise<void>;
}

const ReadinessContext = createContext<ReadinessContextValue | null>(null);

export function ReadinessProvider({ children }: { children: ReactNode }) {
  // Always start null/loading so SSR HTML matches the client hydration pass.
  // Session cache is applied in useLayoutEffect (see getCachedReadiness).
  const [readiness, setReadiness] = useState<ReadinessResult | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(true);

  const refreshReadiness = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/readiness");
      const data = (await res.json()) as ReadinessResult;
      setReadiness(data);
      writeReadinessCache(data);
    } catch {
      /* keep stale cache on network errors */
    } finally {
      setReadinessLoading(false);
    }
  }, []);

  useLayoutEffect(() => {
    const cached = getCachedReadiness();
    if (cached) {
      setReadiness(cached as ReadinessResult);
      setReadinessLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshReadiness();
    const onProbeDone = () => void refreshReadiness();
    window.addEventListener(SETTINGS_STARTUP_PROBE_EVENT, onProbeDone);
    return () =>
      window.removeEventListener(SETTINGS_STARTUP_PROBE_EVENT, onProbeDone);
  }, [refreshReadiness]);

  return (
    <ReadinessContext.Provider
      value={{ readiness, readinessLoading, refreshReadiness }}
    >
      {children}
    </ReadinessContext.Provider>
  );
}

export function useReadiness(): ReadinessContextValue {
  const ctx = useContext(ReadinessContext);
  if (!ctx) {
    throw new Error("useReadiness must be used within ReadinessProvider");
  }
  return ctx;
}
