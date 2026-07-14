interface SettingsFieldViewProps {
  label: string;
  value: string;
}

export function SettingsFieldView({ label, value }: SettingsFieldViewProps) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 border-b border-[rgba(0,0,0,0.06)] last:border-b-0">
      <span className="text-sm text-[#615d59]">{label}</span>
      <span className="text-sm font-medium text-[rgba(0,0,0,0.9)] break-all text-right">
        {value}
      </span>
    </div>
  );
}
