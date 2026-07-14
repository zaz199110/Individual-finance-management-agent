type JsonRecord = Record<string, unknown>;

const CARTESIAN_TYPES = new Set(["line", "bar", "scatter"]);

function asRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function parsePercent(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function ensureMinNumber(current: unknown, min: number): number {
  const parsed = parsePercent(current);
  if (parsed == null) return min;
  return parsed < min ? min : parsed;
}

function axisList(option: JsonRecord, key: "xAxis" | "yAxis"): JsonRecord[] {
  const raw = option[key];
  if (Array.isArray(raw)) {
    return raw.map((item) => asRecord(item)).filter((item): item is JsonRecord => !!item);
  }
  const single = asRecord(raw);
  return single ? [single] : [];
}

function setAxisList(option: JsonRecord, key: "xAxis" | "yAxis", axes: JsonRecord[]): JsonRecord {
  const raw = option[key];
  if (Array.isArray(raw)) {
    return { ...option, [key]: axes };
  }
  return { ...option, [key]: axes[0] ?? raw };
}

function maxCategoryCount(option: JsonRecord): number {
  let max = 0;
  for (const key of ["xAxis", "yAxis"] as const) {
    for (const axis of axisList(option, key)) {
      if (axis.type !== "category") continue;
      max = Math.max(max, asArray(axis.data).length);
    }
  }
  return max;
}

function seriesTypes(option: JsonRecord): string[] {
  return asArray(option.series)
    .map((item) => asRecord(item)?.type)
    .filter((type): type is string => typeof type === "string");
}

function isCartesian(option: JsonRecord): boolean {
  return seriesTypes(option).some((type) => CARTESIAN_TYPES.has(type));
}

function hasPie(option: JsonRecord): boolean {
  return seriesTypes(option).includes("pie");
}

function hasRadar(option: JsonRecord): boolean {
  return seriesTypes(option).includes("radar");
}

function hasHorizontalBar(option: JsonRecord): boolean {
  return (
    seriesTypes(option).includes("bar") &&
    axisList(option, "yAxis").some((axis) => axis.type === "category")
  );
}

function titleBlockHeight(hasTitle: boolean, hasSubtext: boolean): number {
  if (!hasTitle) return 0;
  return hasSubtext ? 92 : 72;
}

/** 按图表类型给出稳定渲染高度，避免 min-height 下 ECharts 拿到过小可视区 */
export function resolveReportChartHeight(option: JsonRecord): number {
  const categoryCount = maxCategoryCount(option);
  if (hasPie(option)) return 440;
  if (hasRadar(option)) return 420;
  if (hasHorizontalBar(option)) return 480;
  if (categoryCount >= 10) return 460;
  if (isCartesian(option)) return 420;
  return 400;
}

function normalizeAxisList(
  axes: JsonRecord[],
  kind: "x" | "y",
  categoryCount: number,
): JsonRecord[] {
  return axes.map((axis) => {
    const axisLabel = asRecord(axis.axisLabel) ?? {};
    const isCategory = axis.type === "category";
    const isValue = axis.type === "value";

    const next: JsonRecord = {
      ...axis,
      nameGap: axis.nameGap ?? (kind === "y" ? 14 : 10),
      axisLabel: {
        ...axisLabel,
        margin: axisLabel.margin ?? (kind === "x" ? 10 : 8),
        hideOverlap: axisLabel.hideOverlap ?? true,
        ...(isCategory && categoryCount >= 10
          ? { interval: axisLabel.interval ?? 0, fontSize: axisLabel.fontSize ?? 10 }
          : {}),
      },
    };

    if (isValue && typeof axis.min === "number" && typeof axis.max === "number") {
      const span = Math.abs(axis.max - axis.min);
      if (span > 0) {
        next.splitNumber = axis.splitNumber ?? 4;
        if (span <= 30) {
          next.interval = axis.interval ?? Math.max(1, Math.ceil(span / 4));
        }
      }
    }

    return next;
  });
}

function normalizeGrid(
  option: JsonRecord,
  hasTitle: boolean,
  hasSubtext: boolean,
  hasLegend: boolean,
  categoryCount: number,
): JsonRecord {
  const grid = asRecord(option.grid) ?? {};
  const minTop = titleBlockHeight(hasTitle, hasSubtext) + 8;
  const minBottom = categoryCount >= 10 ? 56 : hasLegend ? 48 : 40;
  const minLeft = hasHorizontalBar(option) ? 96 : 56;

  return {
    left: grid.left ?? minLeft,
    right: grid.right ?? 24,
    top: ensureMinNumber(grid.top, minTop),
    bottom: ensureMinNumber(grid.bottom, minBottom),
    containLabel: grid.containLabel ?? true,
  };
}

function ensureCartesianGrid(option: JsonRecord): JsonRecord {
  if (!isCartesian(option)) return option;

  const title = asRecord(option.title);
  const hasTitle = !!title;
  const hasSubtext = typeof title?.subtext === "string" && title.subtext.length > 0;
  const legend = asRecord(option.legend);
  const hasLegend = !!legend;
  const categoryCount = maxCategoryCount(option);

  let out: JsonRecord = {
    ...option,
    grid: normalizeGrid(option, hasTitle, hasSubtext, hasLegend, categoryCount),
  };

  if (axisList(option, "xAxis").length > 0) {
    out = setAxisList(
      out,
      "xAxis",
      normalizeAxisList(axisList(option, "xAxis"), "x", categoryCount),
    );
  }
  if (axisList(option, "yAxis").length > 0) {
    out = setAxisList(
      out,
      "yAxis",
      normalizeAxisList(axisList(option, "yAxis"), "y", categoryCount),
    );
  }

  return out;
}

/** 报告预览中统一 ECharts 间距，避免标题/图例/标签互相遮挡 */
export function normalizeReportEchartsOption(option: JsonRecord): JsonRecord {
  let out: JsonRecord = { ...option };
  const title = asRecord(out.title);
  const hasTitle = !!title;
  const hasSubtext = typeof title?.subtext === "string" && title.subtext.length > 0;

  if (title) {
    out.title = {
      ...title,
      top: title.top ?? 8,
      itemGap: title.itemGap ?? 6,
    };
  }

  const legend = asRecord(out.legend);
  if (legend && legend.bottom == null && legend.top == null) {
    out.legend = { ...legend, bottom: 12 };
  }

  out = ensureCartesianGrid(out);

  const grid = asRecord(out.grid);
  if (grid) {
    const categoryCount = maxCategoryCount(out);
    const hasLegend = !!legend;
    out.grid = normalizeGrid(out, hasTitle, hasSubtext, hasLegend, categoryCount);
  }

  const radar = asRecord(out.radar);
  if (radar && hasTitle) {
    out.radar = {
      ...radar,
      center: radar.center ?? ["50%", hasSubtext ? "58%" : "54%"],
    };
  }

  if (!Array.isArray(out.series)) return out;

  out.series = out.series.map((item) => {
    const series = asRecord(item);
    if (!series || series.type !== "pie") return item;

    const label = asRecord(series.label) ?? {};
    const labelLine = asRecord(series.labelLine) ?? {};
    const center = Array.isArray(series.center) ? [...series.center] : ["50%", "56%"];
    if (center[1] === "48%" || center[1] === "46%") {
      center[1] = hasSubtext ? "58%" : "54%";
    }

    return {
      ...series,
      center,
      avoidLabelOverlap: series.avoidLabelOverlap ?? true,
      labelLayout: series.labelLayout ?? { hideOverlap: true },
      label: {
        ...label,
        alignTo: label.alignTo ?? "edge",
        edgeDistance: label.edgeDistance ?? "8%",
        fontSize: label.fontSize ?? 11,
        lineHeight: label.lineHeight ?? 14,
      },
      labelLine: {
        ...labelLine,
        length: labelLine.length ?? 14,
        length2: labelLine.length2 ?? 12,
        smooth: labelLine.smooth ?? true,
      },
    };
  });

  return out;
}
