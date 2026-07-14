export interface LlmStreamChunk {
  type: "text_delta" | "done";
  text?: string;
}
