"use client";

import { useEffect, useRef, useState } from "react";

interface ReportMermaidDiagramProps {
  chartId: string;
  source: string;
}

export function ReportMermaidDiagram({
  chartId,
  source,
}: ReportMermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "neutral",
          securityLevel: "strict",
        });
        if (!containerRef.current || cancelled) return;
        containerRef.current.innerHTML = "";
        const { svg } = await mermaid.render(chartId, source);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Mermaid 渲染失败");
        }
      }
    }

    void render();
    return () => {
      cancelled = true;
    };
  }, [chartId, source]);

  if (error) {
    return (
      <pre className="rounded border border-[#f59e0b] bg-[#fffbeb] p-3 text-xs overflow-x-auto">
        {error}
        {"\n\n"}
        {source}
      </pre>
    );
  }

  return (
    <div
      ref={containerRef}
      className="report-mermaid my-4 overflow-x-auto"
      aria-label="Mermaid 流程图"
    />
  );
}
