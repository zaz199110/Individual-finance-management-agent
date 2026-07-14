import { NextResponse } from "next/server";
import { publishFundReport } from "@/lib/fund/report-publish";
import { publishPlanReport } from "@/lib/plan/report-publish";
import { publishPortfolioReport } from "@/lib/portfolio/report-publish";
import { publishProfileReport } from "@/lib/profile/report-publish";
import { getSupabase } from "@/lib/supabase/server";
import { getDataDir } from "@/lib/paths";
import path from "node:path";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    conversation_id?: string;
    goal_constraint_id?: string;
    holdings_version_id?: string;
    fund_code?: string;
    draft_path?: string;
    report_type?: string;
    scope?: string;
  };

  if (!body.conversation_id) {
    return NextResponse.json({ error: "缺少 conversation_id。" }, { status: 400 });
  }

  const supabase = await getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "数据库未连接。" }, { status: 503 });
  }

  const reportType = body.report_type ?? "profile";

  if (reportType === "portfolio") {
    if (!body.holdings_version_id) {
      return NextResponse.json(
        { error: "缺少 holdings_version_id。" },
        { status: 400 },
      );
    }
    const result = await publishPortfolioReport(supabase, {
      conversationId: body.conversation_id,
      holdingsVersionId: body.holdings_version_id,
      draftPath: body.draft_path,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      report_id: result.report_id,
      file_path: result.file_path,
    });
  }

  if (reportType === "fund") {
    if (!body.fund_code) {
      return NextResponse.json({ error: "缺少 fund_code。" }, { status: 400 });
    }
    const result = await publishFundReport(supabase, {
      conversationId: body.conversation_id,
      fundCode: body.fund_code,
      draftPath: body.draft_path,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      report_id: result.report_id,
      file_path: result.file_path,
    });
  }

  if (body.scope === "combined") {
    if (!body.draft_path) {
      return NextResponse.json(
        { error: "缺少合并报告的 draft_path。" },
        { status: 400 },
      );
    }
    const supabase2 = await getSupabase();
    if (!supabase2) {
      return NextResponse.json({ error: "数据库未连接。" }, { status: 503 });
    }
    const { data: cv } = await supabase2
      .from("profile_versions")
      .select("id")
      .eq("is_current", true)
      .maybeSingle();
    if (!cv) {
      return NextResponse.json(
        { error: "未找到当前画像版本。" },
        { status: 404 },
      );
    }

    let destMermaidCheck = await import("@/lib/reports/publish-guard").then(m => m.validateDraftFileForPublish(body.draft_path!));
    if (!destMermaidCheck.ok) {
      return NextResponse.json({ error: destMermaidCheck.error }, { status: 400 });
    }

    const destSlug = `profile-report-${Date.now()}`;
    const destPath = path.join("reports", "profile", "published", `${destSlug}.md`);
    const { mkdir, copyFile } = await import("node:fs/promises");
    const { mkdirSync } = await import("node:fs");
    const { resolve: resolvePath } = await import("node:path");
    const destFull = resolvePath(getDataDir(), destPath);
    mkdirSync(path.dirname(destFull), { recursive: true });
    await copyFile(body.draft_path!, destFull);

    const { data: report } = await supabase2
      .from("report_index")
      .insert({
        report_type: "profile",
        report_name: `投资需求综合报告-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`,
        report_slug: destSlug,
        file_path: destFull,
        profile_version_id: cv.id,
        generated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (!report) {
      return NextResponse.json({ error: "写入 report_index 失败。" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      report_id: report.id as string,
      file_path: destFull,
    });
  }

  if (!body.goal_constraint_id) {
    return NextResponse.json(
      { error: "缺少 goal_constraint_id。" },
      { status: 400 },
    );
  }

  if (reportType === "plan") {
    const result = await publishPlanReport(supabase, {
      conversationId: body.conversation_id,
      goalConstraintId: body.goal_constraint_id,
      draftPath: body.draft_path,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      report_id: result.report_id,
      file_path: result.file_path,
    });
  }

  const result = await publishProfileReport(supabase, {
    conversationId: body.conversation_id,
    goalConstraintId: body.goal_constraint_id,
    draftPath: body.draft_path,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    report_id: result.report_id,
    file_path: result.file_path,
  });
}
