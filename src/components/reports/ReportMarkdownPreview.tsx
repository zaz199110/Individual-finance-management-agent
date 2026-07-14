"use client";

import Link from "next/link";
import { useId, useMemo } from "react";
import { ReportEchartsChart } from "@/components/reports/ReportEchartsChart";
import { ReportMermaidDiagram } from "@/components/reports/ReportMermaidDiagram";
import {
  isExternalLink,
  parseInlineSegment,
  parseMarkdown,
  type LinkPolicy,
  type RenderInline,
} from "@/lib/reports/markdown-render";

interface ReportMarkdownPreviewProps {
  markdown: string;
  linkPolicy?: LinkPolicy;
  validReportIds?: string[];
  showSourcePane?: boolean;
  className?: string;
}

function externalLinkHostname(href: string): string {
  try {
    return new URL(href).hostname;
  } catch {
    return "";
  }
}

async function openExternalLinkInBrowser(href: string, label: string): Promise<void> {
  const host = externalLinkHostname(href);
  const detail = host || label || href;
  const ok = window.confirm(
    `即将在系统默认浏览器中打开外部链接：\n\n${detail}\n\n是否继续？`,
  );
  if (!ok) return;

  try {
    const res = await fetch("/api/desktop/actions/open-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: href }),
    });
    if (res.ok) return;
  } catch {
    // fall through to window.open when API unavailable
  }
  window.open(href, "_blank", "noopener,noreferrer");
}

function InlineSpan({
  inline,
}: {
  inline: RenderInline;
}) {
  if (inline.kind === "text") return <>{inline.value}</>;
  if (inline.kind === "strong") {
    return <strong>{inline.value}</strong>;
  }
  if (inline.kind === "em") {
    return <em>{inline.value}</em>;
  }
  if (inline.kind === "code") {
    return (
      <code className="rounded bg-[#f6f5f4] px-1 py-0.5 text-sm">{inline.value}</code>
    );
  }
  if (inline.kind === "link") {
    const clickable = inline.clickable;
    if (!clickable) {
      return <span className="text-[rgba(0,0,0,0.95)]">{inline.label}</span>;
    }
    if (inline.href.startsWith("/")) {
      return (
        <Link href={inline.href} className="text-[#0075de] hover:underline">
          {inline.label}
        </Link>
      );
    }
    if (isExternalLink(inline.href)) {
      return (
        <button
          type="button"
          className="text-[#0075de] hover:underline bg-transparent border-0 p-0 cursor-pointer font-inherit text-inherit"
          onClick={() => void openExternalLinkInBrowser(inline.href, inline.label)}
        >
          {inline.label}
        </button>
      );
    }
    return <span className="text-[rgba(0,0,0,0.95)]">{inline.label}</span>;
  }
  return null;
}

function InlineLine({
  inlines,
}: {
  inlines: RenderInline[];
}) {
  return (
    <>
      {inlines.map((inline, idx) => (
        <InlineSpan key={idx} inline={inline} />
      ))}
    </>
  );
}

export function ReportMarkdownPreview({
  markdown,
  linkPolicy = "published",
  validReportIds = [],
  showSourcePane = false,
  className = "",
}: ReportMarkdownPreviewProps) {
  const reactId = useId();
  const validIds = useMemo(() => new Set(validReportIds), [validReportIds]);
  const blocks = useMemo(
    () => parseMarkdown(markdown, linkPolicy, validIds),
    [markdown, linkPolicy, validIds],
  );

  if (showSourcePane) {
    return (
      <pre className={`whitespace-pre-wrap text-sm font-mono ${className}`}>
        {markdown}
      </pre>
    );
  }

  const isChatMarkdown = className?.includes("chat-markdown");

  return (
    <article
      className={`report-preview ${isChatMarkdown ? "" : "report-md-body"} prose-like max-w-none ${className ?? ""}`}
    >
      {blocks.map((block, idx) => {
        if (block.kind === "heading") {
          const inner = block.inlines ? (
            <InlineLine inlines={block.inlines} />
          ) : null;
          const level = Math.min(Math.max(block.level ?? 2, 1), 6);
          const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
          return (
            <Tag key={idx} className="report-heading">
              {inner}
            </Tag>
          );
        }
        if (block.kind === "paragraph") {
          return (
            <p key={idx} className="report-paragraph">
              {block.inlines && <InlineLine inlines={block.inlines} />}
            </p>
          );
        }
        if (block.kind === "blockquote") {
          return (
            <blockquote key={idx} className="report-blockquote">
              {(block.lines ?? []).map((line, li) => (
                <p key={li}>
                  <InlineLine
                    inlines={parseInlineSegment(line, linkPolicy, validIds)}
                  />
                </p>
              ))}
            </blockquote>
          );
        }
        if (block.kind === "hr") {
          return <hr key={idx} className="report-hr" />;
        }
        if (block.kind === "table") {
          return (
            <div key={idx} className="report-table-wrap overflow-x-auto">
              <table className="report-table">
                <thead>
                  <tr>
                    {(block.headers ?? []).map((h, hi) => (
                      <th key={hi}>
                        <InlineLine
                          inlines={parseInlineSegment(h, linkPolicy, validIds)}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(block.rows ?? []).map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci}>
                          <InlineLine
                            inlines={parseInlineSegment(cell, linkPolicy, validIds)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (block.kind === "list") {
          const ListTag = block.ordered ? "ol" : "ul";
          return (
            <ListTag key={idx} className="report-list">
              {(block.items ?? []).map((item, ii) => (
                <li key={ii}>
                  <InlineLine
                    inlines={parseInlineSegment(item, linkPolicy, validIds)}
                  />
                </li>
              ))}
            </ListTag>
          );
        }
        if (block.kind === "echarts" && block.echartsJson) {
          return (
            <ReportEchartsChart
              key={idx}
              chartId={`report-chart-${reactId}-${idx}`}
              optionJson={block.echartsJson}
            />
          );
        }
        if (block.kind === "mermaid" && block.mermaidSource) {
          return (
            <ReportMermaidDiagram
              key={idx}
              chartId={`report-mermaid-${reactId}-${idx}`}
              source={block.mermaidSource}
            />
          );
        }
        return null;
      })}
    </article>
  );
}
