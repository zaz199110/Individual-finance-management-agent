# ECharts 预览冒烟

> 对齐 App 内共用组件 **`ReportMarkdownPreview`**（PRD §1.3.4 · PREVIEW-01）的 ECharts 渲染管线。  
> **Cursor 侧边 MPE 预览**：iframe 内脚本常被 webview 拦截，**白框是正常现象**。  
> **请看图请用下面任一方式**（任选其一即可）。

## 方式 1 · 浏览器预览页（推荐）

1. 打开 [`preview-report.html`](./preview-report.html)
2. 点绿色 **「选择 .md 文件」** → 选本文件或 `fund-analysis-report-sample.md`

若双击 html 打开（地址栏 `file://`），**不能**自动 fetch sample，必须用手动选文件。

或双击 **`open-preview.cmd`** → 自动打开 <http://localhost:8765/preview-report.html>

## 方式 2 · MPE 在系统浏览器打开

1. `Ctrl+Shift+P` → **Markdown Preview Enhanced: Open Preview to the Side**
2. 预览区 **右键 → Open in Browser**
3. 在 Chrome/Edge 里应能看到柱图（比侧边 webview 可靠）

---

侧边预览若仍白框，**可忽略**；以浏览器结果为准。

```echarts
{
  "title": { "text": "ECharts Smoke", "left": "center" },
  "tooltip": { "trigger": "axis" },
  "xAxis": { "type": "category", "data": ["A", "B", "C"] },
  "yAxis": { "type": "value" },
  "series": [{ "type": "bar", "itemStyle": { "color": "#22c55e" }, "data": [1, 2, 3] }]
}
```

完整样例见 [`fund-analysis-report-sample.md`](./fund-analysis-report-sample.md)。
