import { describe, expect, it } from "vitest";
import { parseChoiceFormat, profileParseBasicInfo } from "./profile-parse";
import type { BasicInfo } from "./types";

const previous: BasicInfo = {
  name: "张美丽",
  age: 30,
  gender: "",
  marital_status: "单身，没有孩子",
  has_children: "",
  occupation: "国企职员，收入较稳定",
  investment_experience: "",
  annual_income_after_tax: 240000,
  monthly_income_after_tax: 20000,
  financial_assets: 0,
  loan_balance_total: 0,
  monthly_loan_payment: 0,
  monthly_fixed_expense: 8000,
  monthly_investable: 7000,
};

describe("profileParseBasicInfo", () => {
  it("parses full basic info from free text without previous", async () => {
    const text =
      "我的姓名是张美丽，今年30岁，单身没有孩子，国企职员，税后年收入240000元，每月税后到手20000元，可投资金融资产0元，没有贷款，月固定支出8000元，每月可投资7000元";
    const r = await profileParseBasicInfo({ text });
    expect(r.ok).toBe(true);
    expect(r.basic_info?.name).toBe("张美丽");
    expect(r.basic_info?.age).toBe(30);
    expect(r.basic_info?.marital_status).toBe("单身，没有孩子");
    expect(r.basic_info?.occupation).toBe("国企职员");
    expect(r.basic_info?.annual_income_after_tax).toBe(240000);
    expect(r.basic_info?.monthly_income_after_tax).toBe(20000);
    expect(r.basic_info?.monthly_fixed_expense).toBe(8000);
    expect(r.basic_info?.monthly_investable).toBe(7000);
  });

  it("does not treat '单身没有孩子' as name or occupation", async () => {
    const text = "我是单身没有孩子";
    const r = await profileParseBasicInfo({ text, previous_basic_info: previous });
    expect(r.ok).toBe(true);
    expect(r.basic_info?.name).toBe("张美丽");
    expect(r.basic_info?.occupation).toBe("国企职员，收入较稳定");
    expect(r.basic_info?.marital_status).toBe("单身，没有孩子");
  });

  it("merges delta loan fields with previous info", async () => {
    const text = "每个月还贷还要用掉4000元，总还贷300000元";
    const r = await profileParseBasicInfo({
      text,
      previous_basic_info: previous,
    });
    expect(r.ok).toBe(true);
    expect(r.basic_info?.monthly_loan_payment).toBe(4000);
    expect(r.basic_info?.loan_balance_total).toBe(300000);
    // 未变更字段保持上一版
    expect(r.basic_info?.name).toBe("张美丽");
    expect(r.basic_info?.monthly_income_after_tax).toBe(20000);
    expect(r.basic_info?.monthly_fixed_expense).toBe(8000);
    // 月可投资按公式联动：20000 - 8000 - 4000 = 8000
    expect(r.basic_info?.monthly_investable).toBe(8000);
  });

  it("preserves monthly_investable when explicitly provided in delta", async () => {
    const text = "每月可投资5000元";
    const r = await profileParseBasicInfo({
      text,
      previous_basic_info: previous,
    });
    expect(r.ok).toBe(true);
    expect(r.basic_info?.monthly_investable).toBe(5000);
    expect(r.basic_info?.monthly_income_after_tax).toBe(20000);
  });

  it("recomputes annual income when monthly income changes", async () => {
    const text = "月收入涨到25000元";
    const r = await profileParseBasicInfo({
      text,
      previous_basic_info: previous,
    });
    expect(r.ok).toBe(true);
    expect(r.basic_info?.monthly_income_after_tax).toBe(25000);
    expect(r.basic_info?.annual_income_after_tax).toBe(300000);
  });

  it("extracts explicit annual income from delta", async () => {
    const text = "税后年收入变成300000元";
    const r = await profileParseBasicInfo({
      text,
      previous_basic_info: previous,
    });
    expect(r.ok).toBe(true);
    expect(r.basic_info?.annual_income_after_tax).toBe(300000);
    expect(r.basic_info?.monthly_income_after_tax).toBe(20000);
  });

  it("extracts marital status with children details", async () => {
    const text = "已婚，一个8岁的儿子";
    const r = await profileParseBasicInfo({
      text,
      previous_basic_info: previous,
    });
    expect(r.ok).toBe(true);
    expect(r.basic_info?.marital_status).toBe("已婚，一个8岁的儿子");
  });

  it("extracts name from '姓名是' pattern", async () => {
    const text = "姓名是李四";
    const r = await profileParseBasicInfo({
      text,
      previous_basic_info: previous,
    });
    expect(r.ok).toBe(true);
    expect(r.basic_info?.name).toBe("李四");
    expect(r.basic_info?.age).toBe(30);
  });

  it("warns on monthly investable mismatch", async () => {
    const text = "每月可投资10000元";
    const r = await profileParseBasicInfo({
      text,
      previous_basic_info: previous,
    });
    expect(r.ok).toBe(true);
    expect(r.warnings?.some((w) => w.includes("月可投资核对"))).toBe(true);
  });

  it("parses key-value format copied from example card (exact UI format)", async () => {
    const text = `姓名：徐美丽
年龄：35 岁
性别：女
婚姻状况：已婚
子女情况：一孩
职业：软件工程师
投资经验：3年
税后年收入：300,000 元
每月税后到手：25,000 元
可投资金融资产：500,000 元
贷款待还总额：1,200,000 元
每月还贷：8,000 元
每月固定生活开支：10,000 元
每月可投资：7,000 元`;
    const r = await profileParseBasicInfo({ text });
    expect(r.ok).toBe(true);
    expect(r.basic_info?.name).toBe("徐美丽");
    expect(r.basic_info?.age).toBe(35);
    expect(r.basic_info?.gender).toBe("女");
    expect(r.basic_info?.marital_status).toBe("已婚");
    expect(r.basic_info?.has_children).toBe("一孩");
    expect(r.basic_info?.occupation).toBe("软件工程师");
    expect(r.basic_info?.investment_experience).toBe("3年");
    expect(r.basic_info?.annual_income_after_tax).toBe(300000);
    expect(r.basic_info?.monthly_income_after_tax).toBe(25000);
    expect(r.basic_info?.financial_assets).toBe(500000);
    expect(r.basic_info?.loan_balance_total).toBe(1200000);
    expect(r.basic_info?.monthly_loan_payment).toBe(8000);
    expect(r.basic_info?.monthly_fixed_expense).toBe(10000);
    expect(r.basic_info?.monthly_investable).toBe(7000);
  });
});

// ── parseChoiceFormat tests ──

describe("parseChoiceFormat", () => {
  it("parses all 14 fields from a full choice-format response", () => {
    const input =
      "1 王大明 2 35 3 C 4 A 5 400000 6 20000 7 300000 8 0 9 0 10 15000 11 20000 12 男 13 有1个孩子 14 3年";
    const r = parseChoiceFormat(input);
    expect(r.ok).toBe(true);
    expect(r.extracted?.name).toBe("王大明");
    expect(r.extracted?.age).toBe(35);
    expect(r.extracted?.gender).toBe("男");
    expect(r.extracted?.marital_status).toBe("已婚，有1个孩子");
    expect(r.extracted?.has_children).toBe("有1个孩子");
    expect(r.extracted?.occupation).toBe("企业员工");
    expect(r.extracted?.investment_experience).toBe("3年");
    expect(r.extracted?.annual_income_after_tax).toBe(400000);
    expect(r.extracted?.monthly_income_after_tax).toBe(20000);
    expect(r.extracted?.financial_assets).toBe(300000);
    expect(r.extracted?.loan_balance_total).toBe(0);
    expect(r.extracted?.monthly_loan_payment).toBe(0);
    expect(r.extracted?.monthly_fixed_expense).toBe(15000);
    expect(r.extracted?.monthly_investable).toBe(20000);
    expect(r.missingFields).toEqual([]);
  });

  it("parses partial input and lists missing fields", () => {
    const input = "1 张三 2 28";
    const r = parseChoiceFormat(input);
    expect(r.ok).toBe(true);
    expect(r.extracted?.name).toBe("张三");
    expect(r.extracted?.age).toBe(28);
    expect(r.missingFields).toEqual([
      "gender",
      "marital_status",
      "has_children",
      "occupation",
      "investment_experience",
      "annual_income_after_tax",
      "monthly_income_after_tax",
      "financial_assets",
      "loan_balance_total",
      "monthly_loan_payment",
      "monthly_fixed_expense",
      "monthly_investable",
    ]);
  });

  it("handles 万 suffix on amounts (50万 → 500000)", () => {
    const input = "5 50万";
    const r = parseChoiceFormat(input);
    expect(r.ok).toBe(true);
    expect(r.extracted?.annual_income_after_tax).toBe(500000);
  });

  it("returns ok: false for random free text", () => {
    const input = "随便聊聊";
    const r = parseChoiceFormat(input);
    expect(r.ok).toBe(false);
  });

  it("returns ok: false for empty input", () => {
    const input = "";
    const r = parseChoiceFormat(input);
    expect(r.ok).toBe(false);
    expect(r.error).toBeDefined();
  });

  it("handles newline-separated input", () => {
    const input = "1 王大明\n2 35\n3 C";
    const r = parseChoiceFormat(input);
    expect(r.ok).toBe(true);
    expect(r.extracted?.name).toBe("王大明");
    expect(r.extracted?.age).toBe(35);
    expect(r.extracted?.marital_status).toBe("已婚，有1个孩子");
  });

  it("handles Chinese colon as separator", () => {
    const input = "2：35 3：C";
    const r = parseChoiceFormat(input);
    expect(r.ok).toBe(true);
    expect(r.extracted?.age).toBe(35);
    expect(r.extracted?.marital_status).toBe("已婚，有1个孩子");
  });

  it("handles commas in numbers", () => {
    const input = "5 1,500,000";
    const r = parseChoiceFormat(input);
    expect(r.ok).toBe(true);
    expect(r.extracted?.annual_income_after_tax).toBe(1500000);
  });

  it("last value wins when question number is repeated", () => {
    const input = "3 A 3 C";
    const r = parseChoiceFormat(input);
    expect(r.ok).toBe(true);
    expect(r.extracted?.marital_status).toBe("已婚，有1个孩子");
  });

  it("tolerates unknown question numbers", () => {
    const input = "1 张三 99 X 2 28";
    const r = parseChoiceFormat(input);
    expect(r.ok).toBe(true);
    expect(r.extracted?.name).toBe("张三");
    expect(r.extracted?.age).toBe(28);
    expect(r.missingFields?.length).toBe(12);
  });

  it("uses free text for categorical field when letter not in map", () => {
    const input = "3 已婚有2个孩子";
    const r = parseChoiceFormat(input);
    expect(r.ok).toBe(true);
    expect(r.extracted?.marital_status).toBe("已婚有2个孩子");
  });
});
