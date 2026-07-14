import type { Metadata } from "next";
import "./globals.css";
import { ScheduleHeartbeat } from "@/components/scheduled/ScheduleHeartbeat";

export const metadata: Metadata = {
  title: "理财助手",
  description: "投资规划、持仓分析与基金解读",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <ScheduleHeartbeat />
        {children}
      </body>
    </html>
  );
}
