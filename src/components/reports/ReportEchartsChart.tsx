"use client";

import { useEffect, useMemo, useRef } from "react";
import type { EChartsOption, EChartsType } from "echarts";
import {
  normalizeReportEchartsOption,
  resolveReportChartHeight,
} from "@/lib/reports/echarts-normalize";

interface ReportEchartsChartProps {
  optionJson: string;
  chartId: string;
}

export function ReportEchartsChart({ optionJson, chartId }: ReportEchartsChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const { option, height } = useMemo(() => {
    try {
      const raw = JSON.parse(optionJson) as Record<string, unknown>;
      const normalized = normalizeReportEchartsOption(raw);
      return {
        option: normalized as EChartsOption,
        height: resolveReportChartHeight(normalized),
      };
    } catch {
      return { option: null, height: 400 };
    }
  }, [optionJson]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !option) return;

    let chart: EChartsType | undefined;
    let disposed = false;
    let resizeObserver: ResizeObserver | undefined;

    void import("echarts").then((echarts) => {
      if (disposed || !containerRef.current) return;
      chart = echarts.init(containerRef.current);
      chart.setOption(option);
      requestAnimationFrame(() => chart?.resize());

      resizeObserver = new ResizeObserver(() => chart?.resize());
      resizeObserver.observe(containerRef.current);
    });

    const onResize = () => chart?.resize();
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      resizeObserver?.disconnect();
      chart?.dispose();
    };
  }, [option, chartId, height]);

  if (!option) {
    return (
      <div className="report-echarts my-4 w-full min-h-[400px] rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-4">
        <p className="text-[#e03e3e] text-sm m-0">图表 JSON 无法解析</p>
      </div>
    );
  }

  return (
    <div
      id={chartId}
      ref={containerRef}
      style={{ height }}
      className="report-echarts my-4 w-full rounded-lg border border-[rgba(0,0,0,0.08)] bg-white"
      role="img"
      aria-label="报告图表"
    />
  );
}
