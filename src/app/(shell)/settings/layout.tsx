import { SettingsNav } from "@/components/settings/SettingsNav";
import { SettingsDbStatusBadge } from "@/components/settings/SettingsDbStatusBadge";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 min-h-0 bg-[#faf9f8]">
      <aside className="w-[240px] shrink-0 border-r border-[rgba(0,0,0,0.1)] bg-[#f6f5f4] p-5 flex flex-col gap-5 overflow-y-auto">
        <div>
          <div className="text-lg font-semibold tracking-tight">设置</div>
          <p className="text-xs text-[#8a8580] mt-1 m-0 leading-relaxed">
            按需完成配置，即可使用对话与投资分析功能
          </p>
        </div>
        <SettingsDbStatusBadge />
        <SettingsNav />
      </aside>
      <main className="flex-1 min-h-0 overflow-y-auto p-8 md:p-10">
        <div className="mx-auto w-full max-w-2xl space-y-6">{children}</div>
      </main>
    </div>
  );
}
