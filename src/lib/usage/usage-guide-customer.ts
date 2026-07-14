import type { SceneId } from "@/harness/registry/load";

/** 对客使用说明 · 单条说明 */
export interface UsageGuideItem {
  title?: string;
  body: string;
}

/** 对客使用说明 · 分组 */
export interface UsageGuideSection {
  title: string;
  items: UsageGuideItem[];
}

/** 对客使用说明 · 场景页 */
export interface UsageGuideScenePage {
  scene: SceneId;
  title: string;
  intro: string;
  sections: UsageGuideSection[];
  tips?: string[];
}

export interface UsageGuideOverview {
  title: string;
  intro: string;
  capabilities: UsageGuideItem[];
  scope_note: string;
  path_note: string;
  sections: UsageGuideSection[];
}

export interface UsageGuidePayload {
  overview: UsageGuideOverview;
  scenes: UsageGuideScenePage[];
}

const COMPLIANCE_SHORT =
  "AI 生成内容，仅供参考，请审慎决策。基金有风险，投资需谨慎。";

/** C 端投资者视角 · 使用说明文案（PRD §5.3.9 · §5.7.2） */
export function buildCustomerUsageGuide(): UsageGuidePayload {
  return {
    overview: {
      title: "理财助手 · 使用说明",
      intro:
        "我是你的理财助手，可以帮你完成三件「有报告留痕」的事，也可以随时聊聊。",
      capabilities: [
        {
          title: "投资规划",
          body: "先完善投资需求与目标约束，再生成可解释的资产配置方案，并输出《投资规划书》。",
        },
        {
          title: "持仓分析",
          body: "通过对话录入或修改持仓，助手自动整理并输出持仓分析报告。",
        },
        {
          title: "基金解读",
          body: "单只公募基金深度分析，并输出《单只基金分析报告》。",
        },
        {
          title: "自由交流",
          body: "基金、市场、理财相关问题均可在此交流。任意场景在已配置图片理解时均可发截图提问。复杂需求会引导你到上面三步。",
        },
      ],
      scope_note:
        "规划、持仓与基金解读中的基金产品仅覆盖中国公募基金。自由问答可结合公开网络信息交流更广泛的话题。",
      path_note:
        "建议路径：需求梳理 → 资产配置 → 持仓分析 → 基金解析。你也可以只研究某一只基金，或先随便聊聊。",
      sections: [
        {
          title: "行情颜色",
          items: [
            {
              body: "行情与图表采用 A 股习惯：绿涨红跌。报告中的收益率、回撤等数字来自公开行情或基金披露，请以基金公司最新公告为准。",
            },
          ],
        },
        {
          title: "聊天记忆",
          items: [
            {
              body: "在「设置 → 聊天记忆」中可调整沟通偏好（例如回答风格）。保存后，助手会在后续对话中参考这些偏好。",
            },
          ],
        },
        {
          title: "合规提示",
          items: [
            {
              body: COMPLIANCE_SHORT,
            },
          ],
        },
      ],
    },
    scenes: [
      {
        scene: "chat",
        title: "自由问答",
        intro: "随时提问，聊基金、市场与理财相关话题。简单问题当轮回答，不会自动生成正式报告。",
        sections: [
          {
            title: "你可以这样用",
            items: [
              {
                body: "直接输入问题，例如：「什么是最大回撤？」「沪深300 和标普500 有什么区别？」",
              },
              {
                body: "若已配置图片理解，可点击输入框左侧「+」上传截图（如持仓截图、基金详情页），助手会识别图中文字后回答。",
              },
              {
                body: "需要完整报告（规划书、持仓报告、基金解读报告）时，助手会引导你切换到对应场景 Tab。",
              },
            ],
          },
          {
            title: "完成标志",
            items: [
              {
                body: "自由问答以当轮对话为主，不产出「我的报告」中的正式报告。若识别到持仓截图，可选择「去持仓分析更新」或「暂不，先聊聊」。",
              },
            ],
          },
        ],
        tips: [
          "输入框支持多行。",
          "发送后可在最后一条用户消息旁点「编辑」修改并重新生成。",
          "对话较长时，中间消息区可上下滚动，侧栏与底部输入区保持固定。",
        ],
      },
      {
        scene: "profile",
        title: "需求梳理",
        intro: "整理您的基本情况与投资需求，生成并确认《投资需求报告》，作为后续资产配置的输入。",
        sections: [
          {
            title: "推荐流程",
            items: [
              {
                body: "确认客户信息：复制「当前画像」模板 → 修改 → 发送助手 → 确认卡确认。",
              },
              {
                body: "补充投资需求：选择投资场景 → 复制对应模板 → 修改 → 发送助手 → 确认卡确认。",
              },
              {
                body: "两步完成后可触发生成报告草稿，核对后点「确认发布」输出报告。",
              },
            ],
          },
          {
            title: "完成标志",
            items: [
              {
                body: "《投资需求报告》确认发布后，可在「我的报告」中查看。后续「资产配置」会引用已发布的需求。",
              },
            ],
          },
        ],
      },
      {
        scene: "plan",
        title: "资产配置",
        intro: "在已有投资需求的基础上，生成大类资产配置方案与《投资规划书》。",
        sections: [
          {
            title: "推荐流程",
            items: [
              {
                body: "选择您要配置的投资场景（如稳健增值、养老规划等），助手会根据场景定制配置方向。",
              },
              {
                body: "围绕所选场景补充具体信息，助手将生成大类资产配置方案。请核对各类资产比例，确认后进入下一步。",
              },
              {
                body: "基于已确认的资产比例，助手推荐匹配的基金产品。确认基金选择后，输出完整的《投资规划书》。",
              },
            ],
          },
          {
            title: "完成标志",
            items: [
              {
                body: "《投资规划书》确认发布即完成。可在报告预览 Tab 查看完整方案。",
              },
            ],
          },
        ],
        tips: [
          "有未确认的方案草稿时，侧栏对话标题旁可能出现提示点，表示还有待您确认的内容。",
        ],
      },
      {
        scene: "portfolio",
        title: "持仓分析",
        intro: "通过对话录入或修改持仓，助手自动整理并输出持仓分析报告。",
        sections: [
          {
            title: "推荐流程",
            items: [
              {
                body: "描述持仓或要求分析，助手展示当前持仓表格。",
              },
              {
                body: "复制上方持仓示例，在输入框中修改后直接回复，助手会全量更新持仓。",
              },
              {
                body: "持仓确认后，可要求输出持仓分析报告。",
              },
            ],
          },
          {
            title: "示例话术",
            items: [
              { body: "「帮我分析一下当前持仓。」" },
              { body: "「修改持仓：」（然后粘贴表格并修改）" },
            ],
          },
          {
            title: "完成标志",
            items: [
              {
                body: "分析报告生成后即可查看，当前持仓可在「当前持仓」Tab 核对。",
              },
            ],
          },
        ],
        tips: [
          "持仓可反复调整，无需资产配置方案即可独立使用。",
        ],
      },
      {
        scene: "fund",
        title: "基金解析",
        intro: "查询单只中国公募基金的费率、业绩与持仓结构。需要时可生成《单只基金分析报告》。",
        sections: [
          {
            title: "两种用法",
            items: [
              {
                title: "快速问答",
                body: "直接问「019305 的费率是多少？」等问题，助手当轮简答，不生成长报告。",
              },
              {
                title: "完整解读报告",
                body: "说明「请就 019305 出具完整基金解读报告」，或切换到「自选基金」Tab，对列表中的基金点「AI 解析」。",
              },
            ],
          },
          {
            title: "我的自选",
            items: [
              {
                body: "在「自选基金」Tab 可搜索添加常看的基金，一键发起 AI 解析。不需要的可「删除自选」。",
              },
            ],
          },
          {
            title: "完成标志",
            items: [
              {
                body: "《单只基金分析报告》确认发布后，保存到「我的报告 · 基金解读」。简答不产生报告。",
              },
            ],
          },
        ],
        tips: [
          "基金知识库用于维护您上传的披露材料，与「我的自选」相互独立。删自选不会删除已发布报告。",
        ],
      },
    ],
  };
}
