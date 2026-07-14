interface SettingsPageHeaderProps {
  title: string;
}

export function SettingsPageHeader({ title }: SettingsPageHeaderProps) {
  return (
    <header className="pb-2 border-b border-[rgba(0,0,0,0.08)]">
      <h1 className="text-2xl font-semibold m-0 tracking-tight">{title}</h1>
    </header>
  );
}
