# 股票型基金解析报告 — PRD v1.1

## 0. 元信息

- 上游模板: `requirement/prd/股票型基金基金解析模板.txt`
- 章节总数: 11（Ch3 缺失则顺延为 10）
- 独立管线: 不复用 `echarts-skeleton`、`report-blueprint`、`synopsis`、`knowledge-citations`

## 1. 触发条件

```
lookup.fund_type?.includes("股票型")
```

在 `report-draft.ts` 新增 `isStockFund` 分支。

## 2. 章节总览

| 章节 | 名称             | 数据来源                                                                |
| ---- | ---------------- | ----------------------------------------------------------------------- |
| Ch1  | 产品介绍         | Tushare `fund_basic`                                                    |
| Ch2  | 基金经理         | Tushare `fund_manager`                                                  |
| Ch3  | 投资范围         | L1 知识库「基金产品资料概要」→ LLM 总结 ≤60字；缺失则跳过，后续章节顺延 |
| Ch4  | 费率结构         | Tushare `fund_basic`(管理费/托管费) + 10jqka 爬取(认购/申购/赎回)       |
| Ch5  | 前十大重仓       | Tushare `fund_portfolio` + `stock_basic`(查股票名称)                    |
| Ch6  | 持仓资产比例     | 雪球 `fund_individual_detail_hold_xq` → 饼图                            |
| Ch7  | 行业配置         | 最新季报「行业配置变化」章节 → 饼图(hover: 行业/占比/变动/原因)         |
| Ch8  | 持有人结构分析   | 年报「持有人结构分析」章节 → 饼图                                       |
| Ch9  | 基金经理运作思路 | 最新季报「行业配置变化」章节的「逻辑」列 → LLM 格式化                   |
| Ch10 | 相关资讯         | LLM 查询 3 条最新资讯(摘要 + 超链接)                                    |
| Ch11 | 温馨提示         | 静态模板                                                                |
| Ch12 | 引用说明         | 知识库源文件引用(基金产品资料概要/最新季报/年报)                        |

## 3. 章节详细规格

### Ch1: 产品介绍

表格结构，字段与映射：

| 展示字段       | Tushare `fund_basic` 字段                |
| -------------- | ---------------------------------------- |
| 基金代码       | `ts_code`                                |
| 基金简称       | `name`                                   |
| 产品类型       | `type`                                   |
| 风险等级       | `risk_level`                             |
| 基金管理人     | `management` **(新增)**                  |
| 基金托管人     | `custodian` **(新增)**                   |
| 成立日期       | `found_date`                             |
| 基金规模       | `fund_share` → `aum_yi`(亿元) **(已有)** |
| 起投金额(万元) | `min_amount`                             |
| 预期收益率     | `exp_return`                             |
| 近一年涨跌     | L0 `return_1y_pct` **(已有)**            |
| 近一年最大回撤 | L0 `max_drawdown_1y_pct` **(已有)**      |
| 业绩比较基准   | `benchmark` **(已有)**                   |

### Ch2: 基金经理

表格：姓名、任职起始、任职结束

- Tushare `fund_manager` API

### Ch3: 投资范围

- 来源: L1 知识库「基金产品资料概要」原文的"投资范围"或"投资组合范围"段落
- LLM 总结为 ≤60 字中文描述
- **缺失则跳过整章，后续章节顺延编号**

### Ch4: 费率结构

| 费率项     | 来源                                                   |
| ---------- | ------------------------------------------------------ |
| 管理费     | Tushare `fund_basic`(`m_fee`)                          |
| 托管费     | Tushare `fund_basic`(`c_fee`)                          |
| 最高认购费 | 10jqka 爬取 `fund.10jqka.com.cn/{code}/interduce.html` |
| 最高申购费 | 10jqka 爬取                                            |
| 最高赎回费 | 10jqka 爬取                                            |

- 少掉的字段不展示

### Ch5: 前十大重仓

| 展示字段         | 来源                       |
| ---------------- | -------------------------- |
| 股票代码         | Tushare `fund_portfolio`   |
| 股票名称         | Tushare `stock_basic` 查询 |
| 持有股票市值(元) | Tushare `fund_portfolio`   |

### Ch6: 持仓资产比例

- 雪球 `fund_individual_detail_hold_xq`
- 资产类型 + 仓位占比 → 饼图

### Ch7: 行业配置

- 来源: 最新季报「行业配置变化」章节
- 行业 + 占净值比例 → 饼图
- hover 交互: 行业名称、占净值比例、相比上季度增减(「变动」列)、原因(「逻辑」列)
- 标注数据来源 `XXXX年QX季报`

### Ch8: 持有人结构分析

- 来源: 年报「持有人结构分析」章节
- 持有人类型 + 占比 → 饼图
- 标注数据来源 `XXXX年年报`

### Ch9: 相关资讯

- LLM 查询与本基金相关的最近 3 条资讯
- 每条: 摘要(一句话) + 网址(超链接，可点击)

### Ch10: 温馨提示

- 静态固定文案

### Ch11: 引用说明

格式: 序号、文档名称、文档地址(可跳转至知识库源文件)

- 基金产品资料概要
- 最新季报
- 年报
- 复用货币基金同类逻辑

## 2. 禁止事项

- ❌ 复用 `echarts-skeleton`、`report-blueprint`、`synopsis`、`knowledge-citations`
- ❌ Ch1 展示「超额收益」
- ❌ 自行发挥章节(综合评分/风险指标/基金公司等原模板没有的内容)
