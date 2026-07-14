import type { ReactNode } from "react";

interface SettingsSectionProps {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function SettingsSection({
  title,
  description,
  children,
  className = "",
}: SettingsSectionProps) {
  return (
    <section
      className={`rounded-xl border border-[rgba(0,0,0,0.1)] bg-white p-5 space-y-4 ${className}`}
    >
      {(title || description) && (
        <div className="space-y-1">
          {title && <h2 className="text-base font-semibold m-0">{title}</h2>}
          {description && (
            <p className="text-sm text-[#615d59] m-0 leading-relaxed">{description}</p>
          )}
        </div>
      )}
      {children}
    </section>
  );
}
