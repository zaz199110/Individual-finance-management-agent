import { Suspense } from "react";
import { ReportViewPageClient } from "@/components/reports/ReportViewPageClient";

export default function ReportViewPage() {
  return (
    <Suspense fallback={<div className="p-8">加载中…</div>}>
      <ReportViewPageClient />
    </Suspense>
  );
}
