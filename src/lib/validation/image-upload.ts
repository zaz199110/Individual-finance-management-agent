import { ERR_IMAGE_SIZE, ERR_IMAGE_TYPE } from "@/lib/chat/error-codes";

/** 单张图片最大 10MB */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function validateImageUpload(file: {
  size: number;
  type: string;
}): { ok: boolean; code?: string } {
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, code: ERR_IMAGE_SIZE };
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return { ok: false, code: ERR_IMAGE_TYPE };
  }
  return { ok: true };
}
