"use client";

import { useEffect, useMemo, useRef } from "react";
import { ReportMarkdownPreview } from "@/components/reports/ReportMarkdownPreview";

interface FundKnowledgeLinePreviewProps {
  markdown: string;
  highlightLine?: number | null;
  /** Highlight a line range (1-based, inclusive) in full-document mode */
  highlightRange?: { start: number; end: number } | null;
  /** Show only lines in this range (chunk view) */
  sliceRange?: { start: number; end: number } | null;
}

function normalizeLines(markdown: string): string[] {
  return markdown.replace(/\r\n/g, "\n").split("\n");
}

/** Slice inclusive 1-based line range [start, end]. */
function sliceMarkdown(markdown: string, start: number, endInclusive: number): string {
  const lines = normalizeLines(markdown);
  return lines.slice(Math.max(0, start - 1), endInclusive).join("\n");
}

/** FK-CITE 深链：按行标注 data-line，支持滚至指定行或块区间 */
export function FundKnowledgeLinePreview({
  markdown,
  highlightLine,
  highlightRange,
  sliceRange,
}: FundKnowledgeLinePreviewProps) {
  const lineRef = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => normalizeLines(markdown), [markdown]);

  const displayMarkdown = sliceRange
    ? sliceMarkdown(markdown, sliceRange.start, sliceRange.end)
    : markdown;

  const scrollTarget = highlightLine ?? highlightRange?.start ?? null;

  useEffect(() => {
    if (!scrollTarget || !lineRef.current) return;
    const el = lineRef.current.querySelector(`[data-line="${scrollTarget}"]`);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [scrollTarget, markdown, sliceRange, highlightRange]);

  if (sliceRange) {
    return (
      <div>
        <ReportMarkdownPreview markdown={displayMarkdown} linkPolicy="published" />
      </div>
    );
  }

  if (!highlightLine && !highlightRange) {
    return <ReportMarkdownPreview markdown={markdown} linkPolicy="published" />;
  }

  const rangeStart = highlightRange?.start ?? null;
  const rangeEnd = highlightRange?.end ?? null;

  return (
    <div ref={lineRef} className="fk-line-preview font-mono text-sm leading-relaxed">
      {lines.map((line, idx) => {
        const n = idx + 1;
        const inRange =
          rangeStart != null && rangeEnd != null && n >= rangeStart && n <= rangeEnd;
        const active = n === highlightLine || inRange;
        return (
          <div
            key={n}
            data-line={n}
            className={`flex gap-3 px-1 ${
              active ? "bg-[#fffbeb] ring-1 ring-[#f59e0b]/60" : ""
            }`}
          >
            <span className="select-none text-[#9ca3af] w-8 shrink-0 text-right">{n}</span>
            <span className="flex-1 whitespace-pre-wrap break-words text-[rgba(0,0,0,0.9)]">
              {line || " "}
            </span>
          </div>
        );
      })}
    </div>
  );
}
