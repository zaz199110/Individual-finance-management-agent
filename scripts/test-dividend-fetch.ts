import { fetchFundDividendsLightweight } from "../src/lib/l0/eastmoney-client";

async function main() {
  console.log("=== Tier 1 (JSONP API) & Tier 2 (HTML) only ===");
  const r1 = await fetchFundDividendsLightweight("161725");
  console.log("Without fundName:", r1.length, "records");

  console.log("\n=== All 3 tiers (JSONP → HTML → web search) ===");
  const r2 = await fetchFundDividendsLightweight("161725", "招商中证白酒指数(LOF)A");
  console.log("With fundName:", r2.length, "records");
  if (r2.length > 0) {
    console.log(r2);
  } else {
    console.log("(empty — fund may not have distributed cash dividends in recent period)");
  }

  // Also test a fund known to have dividends
  console.log("\n=== Test 110017 (易方达增强回报债券A) ===");
  const r3 = await fetchFundDividendsLightweight("110017", "易方达增强回报债券A");
  console.log("110017:", r3.length, "records");
  if (r3.length > 0) console.log(r3.slice(0, 3));
}

main().catch(console.error);
