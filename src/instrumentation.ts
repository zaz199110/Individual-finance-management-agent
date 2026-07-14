export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;

  // DEV-01: dev 下 instrumentation 经 webpack 编译，不能 import scheduler→publish→mmdc（node:child_process）。
  // vault：`npm run data:init` 或首次基金 API lazy 初始化。
  // 定时任务：ScheduleHeartbeat + POST /api/scheduled-jobs/tick；生产 scheduler 见 tick route。
}
