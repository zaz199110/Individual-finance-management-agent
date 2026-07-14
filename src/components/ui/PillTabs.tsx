"use client";

interface PillTabItem<T extends string> {
  id: T;
  label: string;
}

interface PillTabsProps<T extends string> {
  items: readonly PillTabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  size?: "sm" | "md";
  className?: string;
}

const SIZE_CLASS = {
  sm: "px-3 py-1 text-[13px]",
  md: "px-4 py-1.5 text-[15px]",
} as const;

/** 分段式 Pill Tab，用于场景切换、基金子 Tab 等 */
export function PillTabs<T extends string>({
  items,
  value,
  onChange,
  size = "md",
  className = "",
}: PillTabsProps<T>) {
  const sizeClass = SIZE_CLASS[size];

  return (
    <div
      className={`inline-flex items-center gap-0.5 rounded-full bg-[#f0eeec] p-1 ${className}`}
      role="tablist"
    >
      {items.map((tab) => {
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`rounded-full font-semibold border-0 cursor-pointer transition-all duration-150 ${sizeClass} ${
              active
                ? "bg-white text-[rgba(0,0,0,0.92)] shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                : "bg-transparent text-[#615d59] hover:text-[rgba(0,0,0,0.75)]"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
