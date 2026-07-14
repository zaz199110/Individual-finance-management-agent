"use client";

import { ReportMarkdownPreview } from "@/components/reports/ReportMarkdownPreview";

interface ChatMarkdownContentProps {
  content: string;
  /** 流式输出期间跳过 Markdown 解析，避免每 token 全量重渲染 */
  streaming?: boolean;
}

/** 助手气泡内 Markdown 渲染（复用报告解析器，样式见 globals.css `.chat-markdown`） */
export function ChatMarkdownContent({ content, streaming }: ChatMarkdownContentProps) {
  if (!content.trim()) return null;

  if (streaming) {
    return (
      <div className="chat-markdown whitespace-pre-wrap break-words">{content}</div>
    );
  }

  return (
    <ReportMarkdownPreview
      markdown={content}
      linkPolicy="published"
      className="chat-markdown"
    />
  );
}
