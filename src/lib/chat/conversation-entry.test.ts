import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createConversationEntry,
  resetConversationEntryLocks,
  resolveConversationEntry,
} from "./conversation-entry";

afterEach(() => {
  resetConversationEntryLocks();
});

describe("resolveConversationEntry (CH-FIRST-01)", () => {
  it("returns most recent id without POST when history exists", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("limit=1")) {
        return new Response(
          JSON.stringify({ conversations: [{ id: "recent-1" }] }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const id = await resolveConversationEntry(fetchFn as typeof fetch);
    expect(id).toBe("recent-1");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("POSTs only when conversation list is empty", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("limit=1")) {
        return new Response(JSON.stringify({ conversations: [] }), { status: 200 });
      }
      if (url.endsWith("/api/conversations") && init?.method === "POST") {
        return new Response(JSON.stringify({ id: "new-1" }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const id = await resolveConversationEntry(fetchFn as typeof fetch);
    expect(id).toBe("new-1");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("dedupes concurrent resolve calls (Strict Mode / double effect)", async () => {
    let postCount = 0;
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("limit=1")) {
        await new Promise((r) => setTimeout(r, 10));
        return new Response(JSON.stringify({ conversations: [] }), { status: 200 });
      }
      if (url.endsWith("/api/conversations") && init?.method === "POST") {
        postCount += 1;
        return new Response(JSON.stringify({ id: "new-deduped" }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const [a, b] = await Promise.all([
      resolveConversationEntry(fetchFn as typeof fetch),
      resolveConversationEntry(fetchFn as typeof fetch),
    ]);
    expect(a).toBe("new-deduped");
    expect(b).toBe("new-deduped");
    expect(postCount).toBe(1);
  });

  it("reuses session-resolved id without refetching", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("limit=1")) {
        return new Response(
          JSON.stringify({ conversations: [{ id: "cached-session" }] }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const first = await resolveConversationEntry(fetchFn as typeof fetch);
    const second = await resolveConversationEntry(fetchFn as typeof fetch);
    expect(first).toBe("cached-session");
    expect(second).toBe("cached-session");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe("createConversationEntry (CH-NEW-01)", () => {
  it("always POSTs for explicit new chat", async () => {
    const fetchFn = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return new Response(JSON.stringify({ id: "explicit-new" }), { status: 200 });
      }
      throw new Error("expected POST");
    });

    const id = await createConversationEntry(fetchFn as typeof fetch);
    expect(id).toBe("explicit-new");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
