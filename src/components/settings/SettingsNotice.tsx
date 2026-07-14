type NoticeTone = "info" | "success" | "error";

const TONE_STYLES: Record<NoticeTone, string> = {
  info: "border-[rgba(0,0,0,0.1)] bg-[#f6f5f4] text-[rgba(0,0,0,0.85)]",
  success: "border-[#abefc6] bg-[#ecfdf3] text-[#027a48]",
  error: "border-[#f0c4c4] bg-[#fff5f5] text-[#c0392b]",
};

interface SettingsNoticeProps {
  tone?: NoticeTone;
  children: React.ReactNode;
}

export function SettingsNotice({ tone = "info", children }: SettingsNoticeProps) {
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm leading-relaxed ${TONE_STYLES[tone]}`}>
      {children}
    </div>
  );
}
