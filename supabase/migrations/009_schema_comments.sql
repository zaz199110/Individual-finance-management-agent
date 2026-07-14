-- 表/字段中文说明（Supabase Studio 表编辑器与 Database 页可查看）
-- 权威字段规格仍见 requirement/prd/03-data-architecture.md

-- ---------------------------------------------------------------------------
-- 设置
-- ---------------------------------------------------------------------------
COMMENT ON TABLE model_settings IS '模型槽位配置（推理/深度/视觉/联网/嵌入）· 设置页';
COMMENT ON COLUMN model_settings.slot IS '槽位：reasoning | deep | vision | web | embedding';
COMMENT ON COLUMN model_settings.check_status IS '连通检测：unchecked | checking | passed | failed';

COMMENT ON TABLE app_settings IS '应用级 JSON 配置（含数据库 BYOK、嵌入开关等）';
COMMENT ON COLUMN app_settings.key IS '配置键，如 database、embedding_filter';
COMMENT ON COLUMN app_settings.value IS 'JSON 值；database 键存 Supabase 连接信息';

-- ---------------------------------------------------------------------------
-- 对话
-- ---------------------------------------------------------------------------
COMMENT ON TABLE conversations IS '对话会话 · 侧栏列表 · ?c= 路由';
COMMENT ON COLUMN conversations.title IS '对话标题（可自动生成）';
COMMENT ON COLUMN conversations.conversation_type IS 'Tab 类型：chat | profile | plan | portfolio | fund';
COMMENT ON COLUMN conversations.metadata IS 'type_locked、active_tab、has_unconfirmed 等';
COMMENT ON COLUMN conversations.checkpoint IS '场景 checkpoint（可选）';

COMMENT ON TABLE messages IS '单条消息（用户/助手/系统）';
COMMENT ON COLUMN messages.role IS 'user | assistant | system';
COMMENT ON COLUMN messages.content IS '正文 Markdown/纯文本';
COMMENT ON COLUMN messages.metadata IS 'run_id、workflow_tasks_snapshot、content_blocks 等';
COMMENT ON COLUMN messages.citations IS '联网引用 [{title, url}]';
COMMENT ON COLUMN messages.attachments IS '图片等附件 JSON';

COMMENT ON TABLE workflow_tasks IS '单次 run 的阶段条任务（SSE stage 同步）';
COMMENT ON COLUMN workflow_tasks.run_id IS '本轮 harness run_id';
COMMENT ON COLUMN workflow_tasks.task_key IS '任务键，如 planner、fund.qa.answer';
COMMENT ON COLUMN workflow_tasks.status IS 'pending | running | done | blocked | cancelled';
COMMENT ON COLUMN workflow_tasks.node_depth IS '1=一级步骤 2=二级子步骤';

COMMENT ON TABLE workflow_locks IS '正式流程互斥锁（profile/plan/portfolio 同时仅一条对话）';
COMMENT ON COLUMN workflow_locks.lock_key IS 'profile | plan | portfolio';
COMMENT ON COLUMN workflow_locks.holder_conversation_id IS '当前持有锁的对话 id';

COMMENT ON TABLE background_jobs IS '后台长任务（深度报告/分析）';
COMMENT ON COLUMN background_jobs.job_type IS 'deep_report | deep_analysis | scheduled';

COMMENT ON TABLE propose_artifacts IS '待用户确认的 propose 载荷（确认卡）';
COMMENT ON COLUMN propose_artifacts.kind IS 'profile_basic | goal_constraint | plan_* | holdings';
COMMENT ON COLUMN propose_artifacts.payload_path IS 'run 工作区 JSON 文件路径';

-- ---------------------------------------------------------------------------
-- 基金
-- ---------------------------------------------------------------------------
COMMENT ON TABLE fund_watchlist IS '基金自选列表 · 基金 Tab 自选面板';
COMMENT ON COLUMN fund_watchlist.fund_code IS '6 位基金代码 · UNIQUE';

COMMENT ON TABLE fund_semantic_entries IS 'L2 语义 FAQ 小库 · pgvector · PRD KB-02';
COMMENT ON COLUMN fund_semantic_entries.entry_type IS 'faq（MVP 主用）| expert_opinion';
COMMENT ON COLUMN fund_semantic_entries.embedding IS '向量 1536 维 · 与嵌入模型一致';
COMMENT ON COLUMN fund_semantic_entries.chunk_id IS '可选关联 L1 披露块 FK-CITE';

-- ---------------------------------------------------------------------------
-- 需求梳理 / 资产配置 / 持仓 / 报告（部分表在各自 migration 已有 COMMENT，此处补全列）
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN profile_versions.is_current IS '全局仅一条 true · 当前有效客户信息层';
COMMENT ON COLUMN profile_versions.basic_info IS '客户基本情况 JSON · §6.12.1';

COMMENT ON COLUMN investment_goal_constraints.goal_type IS 'marriage_child | housing | education | retirement | wealth_growth';
COMMENT ON COLUMN investment_goal_constraints.is_active IS '每种 goal_type 至多一条 active';

COMMENT ON COLUMN allocation_plans.plan_step IS '1=大类配置 2=明细与执行';
COMMENT ON COLUMN allocation_plans.is_current IS '每约束 step=2 至多一条 current · PL-02';

COMMENT ON COLUMN report_index.report_type IS 'profile | plan | portfolio | fund';
COMMENT ON COLUMN report_index.file_path IS '本地 md 相对路径 · data/reports/';

-- ---------------------------------------------------------------------------
-- 定时任务
-- ---------------------------------------------------------------------------
COMMENT ON TABLE trading_calendar IS 'A 股交易日历 · 定时持仓分析用';
COMMENT ON TABLE scheduled_jobs IS '定时任务配置（如 portfolio 周报）';
COMMENT ON TABLE scheduled_job_runs IS '定时任务执行记录';
