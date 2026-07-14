import { ReportPreviewSmokeClient } from "./ReportPreviewSmokeClient";

export const metadata = {
  title: "Report Preview Smoke",
  robots: "noindex",
};

/** Dev / E2E：ReportMarkdownPreview + ECharts 冒烟页 */
export default function ReportPreviewSmokePage() {
  return <ReportPreviewSmokeClient />;
}
