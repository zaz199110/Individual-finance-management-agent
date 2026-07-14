import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { SettingsRow } from "@/components/settings/SettingsRow";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { SETTINGS_SECTIONS } from "@/lib/settings/copy";

function MarketColorPreview() {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold">
      <span className="inline-flex items-center gap-1 text-[#027a48]">
        <span aria-hidden>▲</span>
        涨
      </span>
      <span className="text-[#c4c0bb]">/</span>
      <span className="inline-flex items-center gap-1 text-[#c0392b]">
        <span aria-hidden>▼</span>
        跌
      </span>
    </div>
  );
}

export default function GeneralSettingsPage() {
  const copy = SETTINGS_SECTIONS.general;

  return (
    <>
      <SettingsPageHeader title={copy.title} />

      <SettingsSection>
        <SettingsRow label="界面语言" value="简体中文" locked />
        <SettingsRow
          label="涨跌颜色"
          value="绿涨红跌"
          locked
          trailing={<MarketColorPreview />}
        />
      </SettingsSection>
    </>
  );
}
