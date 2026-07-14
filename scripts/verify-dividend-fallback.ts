import { fetchFundDividendsEm } from "@/lib/l0/eastmoney-client";
import { fetchFundL0FromAkShare } from "@/lib/l0/akshare-client";
import { fetchFundL0FromTushare } from "@/lib/l0/tushare-client";

async function main() {
  const token = process.env.TUSHARE_TOKEN ?? "";
  if (!token) {
    console.warn("警告: 环境变量 TUSHARE_TOKEN 未设置，Tushare 路径将跳过");
  }

  const codes = ["161725", "003547", "110017"];

  console.log("=== EastMoney fetchFundDividendsEm ===");
  for (const code of codes) {
    const dividends = await fetchFundDividendsEm(code);
    console.log(`${code}: ${dividends.length} 条`);
    if (dividends.length) {
      console.log("  样例:", dividends.slice(0, 2));
    }
  }

  console.log("\n=== AkShare fetchFundL0FromAkShare ===");
  for (const code of ["161725", "110017"]) {
    const snapshot = await fetchFundL0FromAkShare(code);
    const dh = snapshot?.dividend_history;
    console.log(`${code}: dividend_history=${dh?.length ?? 0} 条`);
    if (dh?.length) {
      console.log("  样例:", dh.slice(0, 2));
    }
  }

  if (token) {
    console.log("\n=== Tushare fetchFundL0FromTushare ===");
    for (const code of ["003547", "110017"]) {
      const snapshot = await fetchFundL0FromTushare(code, token);
      const dh = snapshot?.dividend_history;
      console.log(`${code}: dividend_history=${dh?.length ?? 0} 条`);
      if (dh?.length) {
        console.log("  样例:", dh.slice(0, 2));
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
