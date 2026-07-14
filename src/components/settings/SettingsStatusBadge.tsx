type StatusTone = "success" | "warning" | "neutral" | "error";

const TONE_STYLES: Record<StatusTone, string> = {
  success: "bg-[#ecfdf3] text-[#027a48] border-[#abefc6]",
  warning: "bg-[#fffbeb] text-[#b45309] border-[#fde68a]",
  neutral: "bg-[#f6f5f4] text-[#615d59] border-[rgba(0,0,0,0.08)]",
  error: "bg-[#fef2f2] text-[#c0392b] border-[#f0c4c4]",
};

interface SettingsStatusBadgeProps {
  tone: StatusTone;
  label: string;
}

export function SettingsStatusBadge({ tone, label }: SettingsStatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONE_STYLES[tone]}`}
    >
      {label}
    </span>
  );
}
