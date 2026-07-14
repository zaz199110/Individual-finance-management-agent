"use client";

import { useCallback, useEffect, useState } from "react";
import { useTransientNotice } from "@/lib/ui/transient-notice";

interface WatchlistItem {
  id: string;
  fund_code: string;
  fund_name: string;
  added_at: string;
}

interface SearchResult {
  fund_code: string;
  fund_name: string;
  fund_type?: string;
}

interface FundWatchlistPanelProps {
  onAnalyze: (fundCode: string, fundName: string) => void;
  /** 嵌入模式 A 聊天滚动区：不单独滚动、不加外边距 */
  embedded?: boolean;
}

export function FundWatchlistPanel({ onAnalyze, embedded }: FundWatchlistPanelProps) {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const { notice: message, showNotice: showMessage, clearNotice: clearMessage } =
    useTransientNotice();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/fund-watchlist");
      const data = await res.json();
      setItems(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(() => {
      setSearching(true);
      void fetch(`/api/funds/search?q=${encodeURIComponent(query.trim())}`)
        .then((r) => r.json())
        .then((d) => setSearchResults(d.results ?? []))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  async function addFund(code: string) {
    clearMessage();
    const res = await fetch("/api/fund-watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fund_code: code }),
    });
    const data = await res.json();
    if (!res.ok) {
      showMessage(data.error ?? "添加失败");
      return;
    }
    setQuery("");
    setSearchResults([]);
    await load();
  }

  async function confirmDelete(code: string) {
    const res = await fetch(`/api/fund-watchlist/${code}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      showMessage(data.error ?? "删除失败");
      return;
    }
    setPendingDelete(null);
    await load();
  }

  if (loading) {
    return (
      <div
        className={
          embedded
            ? "flex items-center justify-center py-12 text-[#615d59]"
            : "flex-1 flex items-center justify-center text-[#615d59]"
        }
      >
        加载自选列表…
      </div>
    );
  }

  return (
    <div className={embedded ? "" : "flex-1 overflow-y-auto px-4 py-6"}>
      <div className="mb-4 relative">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索基金代码或名称，添加至自选"
          className="w-full rounded-xl border border-[rgba(0,0,0,0.1)] px-4 py-2 text-[15px]"
        />
        {searchResults.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-xl border border-[rgba(0,0,0,0.1)] bg-white shadow-lg max-h-48 overflow-y-auto">
            {searchResults.map((r) => (
              <button
                key={r.fund_code}
                type="button"
                className="w-full text-left px-4 py-2 hover:bg-[#f6f5f4] border-0 bg-transparent cursor-pointer"
                onClick={() => void addFund(r.fund_code)}
              >
                <span className="font-semibold">{r.fund_name}</span>
                <span className="text-[#615d59] ml-2">({r.fund_code})</span>
              </button>
            ))}
          </div>
        )}
        {searching && (
          <div className="text-xs text-[#615d59] mt-1">搜索中…</div>
        )}
      </div>

      {message && (
        <div className="mb-4 rounded-lg border border-[#f59e0b] bg-[#fffbeb] px-4 py-2 text-sm">
          {message}
        </div>
      )}

      {items.length === 0 ? (
        <div className="text-center py-12 text-[#615d59]">
          <p className="text-lg font-semibold mb-2">暂无自选基金</p>
          <p>在上方搜索框添加常看的基金，或从对话中解读后加入自选。</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-[rgba(0,0,0,0.1)] p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            >
              <div>
                <div className="font-semibold">{item.fund_name}</div>
                <div className="text-sm text-[#615d59]">({item.fund_code})</div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  className="rounded-lg bg-[#0075de] text-white px-4 py-1.5 text-[15px] font-semibold border-0 cursor-pointer"
                  onClick={() => onAnalyze(item.fund_code, item.fund_name)}
                >
                  AI 解析
                </button>
                {pendingDelete === item.fund_code ? (
                  <>
                    <button
                      type="button"
                      className="rounded-lg border border-[#e03e3e] text-[#e03e3e] px-3 py-1.5 text-[15px] font-semibold bg-white cursor-pointer"
                      onClick={() => void confirmDelete(item.fund_code)}
                    >
                      确认删除
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-[rgba(0,0,0,0.1)] px-3 py-1.5 text-[15px] bg-white cursor-pointer"
                      onClick={() => setPendingDelete(null)}
                    >
                      取消
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="rounded-lg border border-[rgba(0,0,0,0.1)] px-4 py-1.5 text-[15px] font-semibold bg-white cursor-pointer"
                    onClick={() => setPendingDelete(item.fund_code)}
                  >
                    删除自选
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
