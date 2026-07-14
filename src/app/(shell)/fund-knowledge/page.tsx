import { Suspense } from "react";
import { FundKnowledgePageClient } from "@/components/fund-knowledge/FundKnowledgePageClient";

export default function FundKnowledgePage() {
  return (
    <Suspense fallback={<div className="p-8">加载中…</div>}>
      <FundKnowledgePageClient />
    </Suspense>
  );
}
