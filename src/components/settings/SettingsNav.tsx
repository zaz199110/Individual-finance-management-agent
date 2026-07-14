"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SETTINGS_NAV_ORDER,
  SETTINGS_SECTIONS,
  type SettingsSectionKey,
} from "@/lib/settings/copy";


interface SettingsNavProps {
  hiddenKeys?: SettingsSectionKey[];
}

export function SettingsNav({ hiddenKeys = [] }: SettingsNavProps) {
  const pathname = usePathname();
  const hidden = new Set(hiddenKeys);
  return (
    <nav className="flex flex-col gap-1">
      {SETTINGS_NAV_ORDER.filter((key) => !hidden.has(key)).map((key) => {
        const item = SETTINGS_SECTIONS[key];
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-xl px-3 py-2.5 text-[15px] font-semibold no-underline hover:no-underline transition-colors ${
              active
                ? "bg-white border border-[rgba(0,0,0,0.1)] text-[rgba(0,0,0,0.95)] shadow-sm"
                : "border border-transparent text-[#615d59] hover:bg-[rgba(255,255,255,0.6)]"
            }`}
          >
            {item.navLabel}
          </Link>
        );
      })}
    </nav>
  );
}
