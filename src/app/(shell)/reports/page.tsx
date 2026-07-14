import { Suspense } from "react";
import { ReportsPageClient } from "@/components/reports/ReportsPageClient";

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="p-8">加载中…</div>}>
      <ReportsPageClient />
    </Suspense>
  );
}
