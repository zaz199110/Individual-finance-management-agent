import { describe, expect, it } from "vitest";
import {
  clampSlashHighlightIndex,
  dismissSlashMenuInput,
  filterSlashCommands,
  formatSlashCommandInsert,
  getChatInputPlaceholder,
  isChatInputBlocked,
  isChatSendBlocked,
  shouldShowSlashMenu,
  stepSlashHighlightIndex,
} from "./input-policy";

describe("input-policy Q10/Q12", () => {
  it("Q10 blocks input when models not ready", () => {
    expect(
      isChatInputBlocked(
        {
          models: { reasoning: false, web: false, vision: false, chat_ready: false },
          database: { ready: true, check_status: "passed", local_managed: false },
        },
        "chat",
      ),
    ).toBe(true);
  });

  it("Q10 allows chat when chat_ready", () => {
    expect(
      isChatInputBlocked(
        {
          models: { reasoning: true, web: true, vision: true, chat_ready: true },
          database: { ready: false, check_status: "unchecked", local_managed: false },
        },
        "chat",
      ),
    ).toBe(false);
  });

  it("Q10 blocks non-chat tab when database not ready", () => {
    expect(
      isChatInputBlocked(
        {
          models: { reasoning: true, web: true, vision: true, chat_ready: true },
          database: { ready: false, check_status: "unchecked", local_managed: false },
        },
        "profile",
      ),
    ).toBe(true);
  });

  it("Q10 allows non-chat tab when database ready", () => {
    expect(
      isChatInputBlocked(
        {
          models: { reasoning: true, web: true, vision: true, chat_ready: true },
          database: { ready: true, check_status: "passed", local_managed: false },
        },
        "portfolio",
      ),
    ).toBe(false);
  });

  it("Q10 blocks all tabs when readiness null", () => {
    expect(isChatInputBlocked(null, "chat")).toBe(true);
    expect(isChatInputBlocked(null, "profile")).toBe(true);
  });

  it("Q10 shows checking placeholder while readiness loading", () => {
    const text = getChatInputPlaceholder(null, "chat", {}, { readinessLoading: true });
    expect(text).toMatch(/正在检查/);
  });

  it("Q10 placeholder mentions model settings when not ready", () => {
    const text = getChatInputPlaceholder(
      {
        models: { reasoning: false, web: false, vision: false, chat_ready: false },
        database: { ready: false, check_status: "unchecked", local_managed: false },
      },
      "chat",
      {},
    );
    expect(text).toMatch(/设置.*模型配置/);
  });

  it("Q10 placeholder shows scene-specific text for non-chat tabs when db not ready", () => {
    const tabPlaceholders: Record<string, string> = {
      profile: "请先完成个人数据空间连接",
    };
    const text = getChatInputPlaceholder(
      {
        models: { reasoning: true, web: true, vision: true, chat_ready: true },
        database: { ready: false, check_status: "unchecked", local_managed: false },
      },
      "profile",
      tabPlaceholders,
    );
    expect(text).toBe("请先完成个人数据空间连接");
  });

  it("Q12 filters slash commands by prefix", () => {
    const cmds = [{ id: "web_search" }, { id: "vision_parse" }];
    expect(filterSlashCommands(cmds, "/web").map((c) => c.id)).toEqual([
      "web_search",
    ]);
    expect(filterSlashCommands(cmds, "/").map((c) => c.id)).toEqual([
      "web_search",
      "vision_parse",
    ]);
    expect(filterSlashCommands(cmds, "/foo")).toEqual([]);
  });

  it("Q12 returns empty for non-slash input", () => {
    const cmds = [{ id: "web_search" }];
    expect(filterSlashCommands(cmds, "hello")).toEqual([]);
  });

  it("Q12 slash menu visibility", () => {
    const cmds = [{ id: "web_search" }, { id: "vision_parse" }];
    expect(shouldShowSlashMenu("/web", cmds)).toBe(true);
    expect(shouldShowSlashMenu("/", cmds)).toBe(true);
    expect(shouldShowSlashMenu("hello", cmds)).toBe(false);
    expect(shouldShowSlashMenu("/web_search", cmds)).toBe(false);
    expect(shouldShowSlashMenu("/web_search ", cmds)).toBe(false);
    expect(shouldShowSlashMenu("/web_search 今天股市", cmds)).toBe(false);
    expect(shouldShowSlashMenu("/xyz", cmds)).toBe(false);
    expect(shouldShowSlashMenu("/ foo", cmds)).toBe(false);
  });

  it("Q12 unique exact match hides menu; ambiguous prefix keeps it", () => {
    const cmds = [{ id: "fund_lookup" }, { id: "fund_search" }];
    expect(shouldShowSlashMenu("/fund", cmds)).toBe(true);
    expect(shouldShowSlashMenu("/fund_lookup", cmds)).toBe(false);
  });

  it("Q12 Esc dismiss strips slash prefix only", () => {
    expect(dismissSlashMenuInput("/web")).toBe("web");
    expect(dismissSlashMenuInput("/")).toBe("");
    expect(dismissSlashMenuInput("/web_search")).toBe("web_search");
    expect(dismissSlashMenuInput("/web_search 查询")).toBe("/web_search 查询");
    expect(dismissSlashMenuInput("hello")).toBe("hello");
  });

  it("blocks send when another conversation is streaming", () => {
    expect(isChatSendBlocked("conv-b", "conv-a")).toBe(true);
    expect(isChatSendBlocked("conv-a", "conv-a")).toBe(false);
    expect(isChatSendBlocked("conv-a", null)).toBe(false);
  });

  it("Q12 slash insert and keyboard highlight helpers", () => {
    expect(formatSlashCommandInsert("web_search")).toBe("/web_search ");
    expect(clampSlashHighlightIndex(0, 2)).toBe(0);
    expect(clampSlashHighlightIndex(2, 2)).toBe(0);
    expect(stepSlashHighlightIndex(0, 2, "down")).toBe(1);
    expect(stepSlashHighlightIndex(0, 2, "up")).toBe(1);
  });
});
