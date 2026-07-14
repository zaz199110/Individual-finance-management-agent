import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let mockDataDir = "";

vi.mock("@/lib/paths", () => ({
  getDataDir: () => mockDataDir,
}));

vi.mock("@/lib/l0/fetch-fund-l0", () => ({
  fetchLiveFundL0: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabase: vi.fn(),
}));

describe("l0-sync", () => {
  let tmpData: string;

  beforeEach(() => {
    tmpData = fs.mkdtempSync(path.join(os.tmpdir(), "l0-sync-test-"));
    mockDataDir = tmpData;
  });

  afterEach(() => {
    mockDataDir = "";
    vi.clearAllMocks();
    if (fs.existsSync(tmpData)) {
      fs.rmSync(tmpData, { recursive: true, force: true });
    }
  });

  it("writes jsonl + Supabase on successful sync", async () => {
    const { fetchLiveFundL0 } = await import("@/lib/l0/fetch-fund-l0");
    const { getSupabase } = await import("@/lib/supabase/server");
    const insert = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(getSupabase).mockResolvedValue({
      from: () => ({ insert }),
    } as never);
    vi.mocked(fetchLiveFundL0).mockResolvedValue({
      fund_code: "206007",
      lookup_source: "tushare",
    } as never);

    const { syncFundL0Local } = await import("@/lib/l0/l0-sync");
    const result = await syncFundL0Local("206007");

    expect(result.ok).toBe(true);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        fund_code: "206007",
        ok: true,
        lookup_source: "tushare",
      }),
    );
    const jsonl = fs.readFileSync(
      path.join(tmpData, "l0-sync-log.jsonl"),
      "utf8",
    );
    expect(jsonl).toContain('"fund_code":"206007"');
    expect(fs.existsSync(path.join(tmpData, "l0-cache", "206007.json"))).toBe(
      true,
    );
  });

  it("still writes jsonl when Supabase unavailable", async () => {
    const { fetchLiveFundL0 } = await import("@/lib/l0/fetch-fund-l0");
    const { getSupabase } = await import("@/lib/supabase/server");
    vi.mocked(getSupabase).mockResolvedValue(null);
    vi.mocked(fetchLiveFundL0).mockResolvedValue(null);

    const { syncFundL0Local } = await import("@/lib/l0/l0-sync");
    const result = await syncFundL0Local("019305");

    expect(result.ok).toBe(false);
    const jsonl = fs.readFileSync(
      path.join(tmpData, "l0-sync-log.jsonl"),
      "utf8",
    );
    expect(jsonl).toContain('"ok":false');
  });

  it("force: true passes skipCache to fetchLiveFundL0", async () => {
    const { fetchLiveFundL0 } = await import("@/lib/l0/fetch-fund-l0");
    const { getSupabase } = await import("@/lib/supabase/server");
    vi.mocked(getSupabase).mockResolvedValue(null);
    vi.mocked(fetchLiveFundL0).mockResolvedValue({
      fund_code: "110020",
      fund_name: "易方达沪深300ETF联接A",
      fund_type: "指数型",
      lookup_source: "tushare",
      metrics: { as_of_trade_date: "2026-06-13", nav: 1.45 },
    } as never);

    const { syncFundL0Local } = await import("@/lib/l0/l0-sync");
    const result = await syncFundL0Local("110020", { force: true });

    expect(fetchLiveFundL0).toHaveBeenCalledWith("110020", { skipCache: true });
    expect(result.ok).toBe(true);
    expect(result.snapshot?.metrics?.nav).toBe(1.45);
  });
});
