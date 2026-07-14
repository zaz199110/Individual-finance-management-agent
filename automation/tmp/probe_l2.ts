import { semanticSearchFromSupabase } from "../../src/harness/infra/fund_knowledge/semantic-supabase";

async function main() {
  const r = await semanticSearchFromSupabase({
    fund_code: "019305",
    query: "管理费 托管费",
    max_hits: 5,
  });

  console.log(
    JSON.stringify(
      {
        ok: r.ok,
        used_pgvector: r.used_pgvector,
        hit_count: r.hits.length,
        top_title: r.hits[0]?.title ?? null,
        top_score: r.hits[0]?.embed_score ?? null,
        low_confidence: r.low_confidence,
        error: r.error ?? null,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
