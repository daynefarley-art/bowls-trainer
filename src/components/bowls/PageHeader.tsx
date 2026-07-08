import { BTLogo } from "./BTLogo";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <header className="bt-gradient-hero px-6 pt-12 pb-8 text-white">
      <div className="mx-auto max-w-md">
        <div className="mb-3 flex items-center gap-2 opacity-95">
          <BTLogo size={26} variant="onDark" />
          <span className="text-[11px] font-bold uppercase tracking-[0.18em]">Bowls Trainer</span>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-extrabold">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-white/85">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      </div>
    </header>
  );
}
