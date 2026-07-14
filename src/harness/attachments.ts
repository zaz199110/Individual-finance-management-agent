import type { ChatAttachment } from "@/harness/types";

/** 将聊天附件转为 Vision API 可用的 data URL / http URL 列表 */
export function attachmentsToImageUrls(attachments?: ChatAttachment[]): string[] {
  return (
    attachments
      ?.filter((a) => a.type === "image")
      .map((a) => {
        if (a.url) return a.url;
        if (a.data && a.mime) return `data:${a.mime};base64,${a.data}`;
        return "";
      })
      .filter(Boolean) ?? []
  );
}
