import { BTLogo } from "./BTLogo";
import { useClub } from "./ClubProvider";
import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, action, leading, footer }: { title: string; subtitle?: string; action?: ReactNode; leading?: ReactNode; footer?: ReactNode }) {
  const { activeClub } = useClub();
  const clubBranding = activeClub?.managed_branding_enabled;

  return (
    <header
      className={`${clubBranding ? "bt-club-gradient pb-5" : "bt-gradient-hero pb-8"} px-6 text-white`}
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 3rem)" }}
    >
      <div className="mx-auto max-w-md">
        <div className={`${clubBranding ? "mb-3" : "mb-4"} flex items-center justify-between gap-3`}>
          <div className="flex min-w-0 items-center gap-3">
            {leading}
            {clubBranding && activeClub?.logo_url ? (
              <div className="flex min-w-0 flex-col gap-1">
                <img
                  src={activeClub.logo_url}
                  alt={activeClub.name}
                  className="h-[66px] w-auto max-w-[260px] object-contain object-left sm:h-[78px] sm:max-w-[300px]"
                />
                <span className="bt-club-rule w-24" aria-hidden="true" />
                <span className="truncate text-[9px] uppercase tracking-[0.16em] text-white/70">
                  Powered by Bowls Trainer
                </span>
              </div>
            ) : (
              <>
                <BTLogo size={26} variant="onDark" />
                <div className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-[11px] font-bold uppercase tracking-[0.18em] opacity-95">
                    {clubBranding ? activeClub.short_name || activeClub.name : "Bowls Trainer"}
                  </span>
                  {clubBranding && (
                    <span className="truncate text-[9px] text-white/75">Powered by Bowls Trainer</span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-extrabold">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-white/85">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
        {footer && <div className="mt-4">{footer}</div>}
      </div>
    </header>
  );
}
