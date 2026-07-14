import { NextRequest, NextResponse } from "next/server";
import { fundLookupAsync } from "@/lib/fund/lookup";

// In-memory cache with 24h TTL
const cache = new Map<string, { data: FundLookupResponse; expiry: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Rate limiting
const rateLimiter = new Map<string, number[]>();
const MAX_REQUESTS_PER_MINUTE = 10;

interface FundLookupResponse {
  ok: boolean;
  fund_code?: string;
  fund_name?: string;
  fund_type?: string;
  risk_level?: string;
  error?: string;
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const requests = rateLimiter.get(ip) ?? [];
  const recent = requests.filter((t) => now - t < 60000);
  if (recent.length >= MAX_REQUESTS_PER_MINUTE) return false;
  rateLimiter.set(ip, [...recent, now]);
  return true;
}

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";

  // Rate limit check
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "请求过于频繁，请稍后再试。" },
      { status: 429 },
    );
  }

  const fundCode = req.nextUrl.searchParams.get("code") ?? "";

  // Validate fund code format
  if (!fundCode || !/^\d{6}$/.test(fundCode)) {
    return NextResponse.json(
      { error: "请提供 6 位数字基金代码。" },
      { status: 400 },
    );
  }

  // Check cache
  const cached = cache.get(fundCode);
  if (cached && cached.expiry > Date.now()) {
    return NextResponse.json(cached.data);
  }

  // Lookup from Tushare
  const result = await fundLookupAsync({ fund_code: fundCode });

  const response: FundLookupResponse = {
    ok: result.ok,
    fund_code: result.fund_code,
    fund_name: result.fund_name,
    fund_type: result.fund_type,
    risk_level: result.risk_level,
    error: result.error,
  };

  // Cache successful results
  if (result.ok) {
    cache.set(fundCode, { data: response, expiry: Date.now() + CACHE_TTL });
  }

  return NextResponse.json(response);
}
