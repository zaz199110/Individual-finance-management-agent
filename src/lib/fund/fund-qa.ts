import { gatherFundWaterfall } from "@/harness/infra/fund_knowledge/waterfall";
import { fundLookupAsync } from "./lookup";
import {
  buildKnowledgeCitations,
  formatFkCiteSection,
  formatFootnoteDefinitions,
  formatVaultSourcedExcerpt,
} from "./knowledge-citations";

export interface FundQaAnswer {
  ok: boolean;
  fund_code: string;
  fund_name: string;
  answer: string;
  has_vault: boolean;
  intent: string;
  error?: string;
}

/** KB-03 瀑布 · fund_qa 单轮短答（不出报告草稿） */
export async function answerFundQuestion(input: {
  fundCode: string;
  query: string;
}): Promise<FundQaAnswer> {
  const lookup = await fundLookupAsync({ fund_code: input.fundCode });
  if (!lookup.ok || !lookup.fund_code) {
    return {
      ok: false,
      fund_code: input.fundCode,
      fund_name: input.fundCode,
      answer: "",
      has_vault: false,
      intent: "unknown",
      error: lookup.error ?? "无法识别基金代码。",
    };
  }

  const gathered = await gatherFundWaterfall(lookup.fund_code, {
    query: input.query,
    purpose: "qa",
  });
  if (!gathered.ok) {
    return {
      ok: false,
      fund_code: lookup.fund_code,
      fund_name: lookup.fund_name ?? lookup.fund_code,
      answer: "",
      has_vault: lookup.has_vault ?? false,
      intent: gathered.intent,
      error: gathered.error,
    };
  }

  const citations = buildKnowledgeCitations(gathered.l1_hits.slice(0, 4));
  const citeSection = formatFkCiteSection(
    citations,
    Boolean(lookup.has_vault),
    gathered.l3_citations,
  );
  const footnotes = formatFootnoteDefinitions(citations);

  const hasVault = Boolean(lookup.has_vault);

  const parts: string[] = [];
  parts.push(
    `**${lookup.fund_name}（${lookup.fund_code}）**`,
    "",
  );

  if (/管理费|费率|费用|托管/.test(input.query)) {
    parts.push(
      "### 费率",
      formatVaultSourcedExcerpt(
        gathered.fee_excerpt,
        gathered.fee_source_as_of,
        hasVault,
      ),
      citations[0] ? `（披露原文见脚注 [^${citations[0].ref}]）` : "",
      "",
    );
  } else if (/收益|业绩|涨跌|净值|回撤/.test(input.query)) {
    parts.push("### 业绩与净值", gathered.l0_summary, "", gathered.l2_preview, "");
  } else if (/稳|风险|适合/.test(input.query)) {
    parts.push(
      "### 风险与适配",
      gathered.l2_preview,
      "",
      formatVaultSourcedExcerpt(
        gathered.risk_excerpt,
        gathered.risk_source_as_of,
        hasVault,
      ),
      "",
    );
  } else if (/投资范围|投什么|买什么/.test(input.query)) {
    parts.push(
      "### 投资范围",
      formatVaultSourcedExcerpt(
        gathered.scope_excerpt,
        gathered.scope_source_as_of,
        hasVault,
      ),
      "",
    );
  } else {
    parts.push(gathered.l2_preview || gathered.l0_summary, "");
    if (gathered.fee_excerpt && gathered.fee_excerpt.length > 20) {
      parts.push(
        "",
        "**费率摘要：**",
        formatVaultSourcedExcerpt(
          gathered.fee_excerpt,
          gathered.fee_source_as_of,
          hasVault,
        ),
      );
    }
  }

  if (gathered.l3_valid && gathered.l3_citations.length && !lookup.has_vault) {
    parts.push(
      "",
      `**延伸阅读：** 共 ${gathered.l3_citations.length} 条公开来源，详见文末参考来源说明。`,
    );
  }

  parts.push(
    "",
    "若要 **完整解读报告**（含图表与章节骨架），请说「出具基金解读报告」。",
  );

  if (footnotes) {
    parts.push("", footnotes);
  }
  parts.push("", citeSection);

  return {
    ok: true,
    fund_code: lookup.fund_code,
    fund_name: lookup.fund_name ?? lookup.fund_code,
    answer: parts.filter(Boolean).join("\n"),
    has_vault: Boolean(lookup.has_vault),
    intent: gathered.intent,
  };
}
