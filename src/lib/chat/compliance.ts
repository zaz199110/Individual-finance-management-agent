/** PRD §5.3.7 · 输入区合规短句（对客定稿） */
export const COMPLIANCE_NOTICE_SHORT =
  "AI 生成内容，仅供参考，请审慎决策。";

const COMPLIANCE_BODY =
  /AI\s*生成内容[，,]\s*仅供参考[，,]\s*请审慎决策[。.]?/u;

function containsComplianceSnippet(text: string): boolean {
  return COMPLIANCE_BODY.test(text);
}

/** 去掉模型在正文末尾重复输出的合规短句（含 --- / 引用块等） */
export function stripTrailingComplianceNotice(content: string): string {
  let text = content.trimEnd();
  if (!text || !containsComplianceSnippet(text)) return content;

  const hrBlock = text.match(/\n-{3,}\s*\n+[\s\S]*$/u);
  if (hrBlock && containsComplianceSnippet(hrBlock[0])) {
    text = text.slice(0, text.length - hrBlock[0].length).trimEnd();
  }

  const blockquote = text.match(/\n(?:>\s*.+\n?)+$/u);
  if (blockquote && containsComplianceSnippet(blockquote[0])) {
    text = text.slice(0, text.length - blockquote[0].length).trimEnd();
  }

  const plain = text.match(
    /\n+(?:\*{0,2})?(?:温馨提示|合规提示)?(?:\*{0,2})?[：:]?\s*AI 生成内容，仅供参考，请审慎决策。[。.]?\s*$/u,
  );
  if (plain) {
    text = text.slice(0, text.length - plain[0].length).trimEnd();
  }

  return text;
}
