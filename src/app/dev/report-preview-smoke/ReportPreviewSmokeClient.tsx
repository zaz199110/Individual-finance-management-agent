"use client";

import { ReportMarkdownPreview } from "@/components/reports/ReportMarkdownPreview";

/** 与 requirement/docs/samples/echarts-smoke-test.md 对齐 · Playwright 7-2-E2E */
const SMOKE_MARKDOWN = `# ECharts Preview Smoke

\`\`\`echarts
{
  "title": { "text": "ECharts Smoke", "left": "center" },
  "tooltip": { "trigger": "axis" },
  "xAxis": { "type": "category", "data": ["A", "B", "C"] },
  "yAxis": { "type": "value" },
  "series": [{ "type": "bar", "itemStyle": { "color": "#22c55e" }, "data": [1, 2, 3] }]
}
\`\`\`
`;

export function ReportPreviewSmokeClient() {
  return (
    <div
      data-testid="preview-smoke-root"
      className="mx-auto max-w-3xl p-8 bg-white min-h-screen"
    >
      <ReportMarkdownPreview markdown={SMOKE_MARKDOWN} linkPolicy="published" />
    </div>
  );
}
