import { describe, expect, it, vi } from "vitest";
import { unpinOtherConversations } from "./conversation-pin.server";

function mockSupabaseChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const ret = () => chain;
  chain.select = ret;
  chain.eq = ret;
  chain.neq = ret;
  chain.update = ret;
  chain.then = (resolve: (v: unknown) => void) => resolve(result);
  return chain;
}

describe("unpinOtherConversations", () => {
  it("updates all other pinned rows to pinned=false", async () => {
    const updates: string[] = [];
    const supabase = {
      from: (table: string) => {
        if (table !== "conversations") throw new Error("unexpected table");
        let mode: "select" | "update" = "select";
        const chain: Record<string, unknown> = {};
        const ret = () => chain;
        chain.select = () => {
          mode = "select";
          return chain;
        };
        chain.update = () => {
          mode = "update";
          return chain;
        };
        chain.eq = (_col: string, val: string) => {
          if (mode === "update") updates.push(val);
          return chain;
        };
        chain.neq = ret;
        chain.then = (resolve: (v: unknown) => void) => {
          if (mode === "select") {
            resolve({
              data: [
                { id: "a", metadata: { pinned: true, pinned_at: "t1" } },
                { id: "c", metadata: { pinned: true, pinned_at: "t2" } },
              ],
              error: null,
            });
          } else {
            resolve({ data: null, error: null });
          }
          return chain;
        };
        return chain;
      },
    };

    await unpinOtherConversations(supabase as never, "b");
    expect(updates.sort()).toEqual(["a", "c"]);
  });
});
