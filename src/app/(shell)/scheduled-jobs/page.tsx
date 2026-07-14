import { Suspense } from "react";
import { ScheduledJobsPageClient } from "@/components/scheduled/ScheduledJobsPageClient";

export default function ScheduledJobsPage() {
  return (
    <Suspense fallback={<div className="p-8">加载中…</div>}>
      <ScheduledJobsPageClient />
    </Suspense>
  );
}
