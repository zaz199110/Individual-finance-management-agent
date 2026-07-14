import { describe, expect, it } from "vitest";

import {

  CHAT_MODE_A_COLUMN,

  CHAT_MODE_A_CONTENT,

  CHAT_ASSISTANT_MESSAGE_WIDTH,

  CHAT_USER_MESSAGE_WIDTH,

  CHAT_MODE_A_MAIN,

  CHAT_MODE_A_SCROLL,

  CHAT_MODE_B_CHAT_INNER,

  CHAT_MODE_B_CHAT_PANE,

  CHAT_MODE_B_MAIN,

  chatColumnInnerClass,

  chatColumnOuterClass,

  chatFooterWrapClass,

  chatMainClass,

  chatScrollAreaClass,

  chatScrollBodyClass,

} from "@/components/chat/chat-layout";



describe("chat layout modes", () => {

  it("mode A main spans full width after sidebar (no third column shell)", () => {

    expect(chatMainClass(false)).toBe(CHAT_MODE_A_MAIN);

    expect(chatMainClass(false)).not.toContain("max-w");

    expect(chatMainClass(false)).not.toContain("mx-auto");

  });



  it("mode A column is full width; 768px constraint lives in content wrapper", () => {

    expect(chatColumnInnerClass(false)).toBe(CHAT_MODE_A_COLUMN);

    expect(CHAT_MODE_A_COLUMN).not.toContain("max-w");

    expect(CHAT_MODE_A_CONTENT).toContain("max-w-[768px]");

    expect(CHAT_MODE_A_CONTENT).toContain("mx-auto");

  });



  it("mode A scroll area is full width with overflow on the outer pane", () => {

    expect(chatScrollAreaClass(false)).toBe(CHAT_MODE_A_SCROLL);

    expect(CHAT_MODE_A_SCROLL).toContain("overflow-y-auto");

    expect(chatScrollBodyClass(false)).toContain("max-w-[768px]");

  });



  it("assistant and user message widths are centralized", () => {

    expect(CHAT_ASSISTANT_MESSAGE_WIDTH).toContain("max-w-[640px]");

    expect(CHAT_USER_MESSAGE_WIDTH).toBe("max-w-[85%]");

  });



  it("mode A footer reuses centered content width", () => {

    expect(chatFooterWrapClass(false)).toContain("max-w-[768px]");

    expect(chatFooterWrapClass(false)).not.toMatch(/\bpx-4\b.*\bpx-4\b/);

  });



  it("mode B uses row layout with resizable right chat pane shell", () => {

    expect(chatMainClass(true)).toBe(CHAT_MODE_B_MAIN);

    expect(chatColumnOuterClass(true)).toBe(CHAT_MODE_B_CHAT_PANE);

    expect(CHAT_MODE_B_CHAT_PANE).not.toContain("w-[");

    expect(chatColumnInnerClass(true)).toBe(CHAT_MODE_B_CHAT_INNER);

    expect(CHAT_MODE_B_CHAT_INNER).not.toContain("max-w");

    expect(chatScrollBodyClass(true)).not.toContain("max-w");

  });

});


