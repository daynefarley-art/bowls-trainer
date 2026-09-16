import { useEffect, type ReactNode } from "react";
import { useClub } from "./ClubProvider";

function hexToOklch(hex: string | null | undefined): string | null {
  if (!hex) return null;
  const clean = hex.replace("#", "");
  if (!/^[0-9A-Fa-f]{6}$/.test(clean)) return null;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  const lr = r <= 0.04045 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
  const lg = g <= 0.04045 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
  const lb = b <= 0.04045 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);

  const xyz = {
    x: lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375,
    y: lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175,
    z: lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041,
  };

  const l = Math.cbrt(0.8189330101 * xyz.x + 0.3619667429 * xyz.y + 0.1284555415 * xyz.z);
  const m = Math.cbrt(0.0329845436 * xyz.x + 0.9192891022 * xyz.y + 0.3900956047 * xyz.z);
  const s = Math.cbrt(0.0482003018 * xyz.x + 0.0886393782 * xyz.y + 0.986488929 * xyz.z);

  const oklab = {
    L: l * 0.2104542553 + m * 0.793617785 + s * -0.0040720468,
    a: l * 1.9779984951 + m * -2.428592205 + s * 0.4505937099,
    b: l * 0.0259040371 + m * 0.7827717662 + s * -0.808675766,
  };

  const chroma = Math.sqrt(oklab.a * oklab.a + oklab.b * oklab.b);
  const hue = (Math.atan2(oklab.b, oklab.a) * 180) / Math.PI;
  const clampedL = Math.max(0, Math.min(1, oklab.L));
  const clampedC = Math.max(0, chroma);

  return `oklch(${clampedL.toFixed(3)} ${clampedC.toFixed(4)} ${hue.toFixed(2)})`;
}

function readableForeground(hex: string | null | undefined): string {
  if (!hex) return "oklch(0.99 0 0)";
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "oklch(0.18 0.01 200)" : "oklch(0.99 0 0)";
}

export function ClubThemeProvider({ children }: { children: ReactNode }) {
  const { activeClub } = useClub();

  useEffect(() => {
    const root = document.documentElement;
    if (!activeClub?.managed_branding_enabled) {
      root.style.removeProperty("--club-primary");
      root.style.removeProperty("--club-primary-foreground");
      root.style.removeProperty("--club-secondary");
      root.style.removeProperty("--club-secondary-foreground");
      root.style.removeProperty("--club-accent");
      root.style.removeProperty("--club-highlight");
      root.style.removeProperty("--club-highlight-foreground");
      root.style.removeProperty("--club-surface");
      root.removeAttribute("data-club-branded");
      root.style.removeProperty("--primary");
      root.style.removeProperty("--primary-foreground");
      root.style.removeProperty("--primary-glow");
      root.style.removeProperty("--ring");
      root.style.removeProperty("--gradient-primary");
      root.style.removeProperty("--gradient-hero");
      return;
    }

    const primary = hexToOklch(activeClub.primary_colour);
    const secondary = hexToOklch(activeClub.secondary_colour);
    const accent = hexToOklch(activeClub.accent_colour);
    const surface = hexToOklch(activeClub.surface_colour);

    if (primary) {
      root.style.setProperty("--club-primary", primary);
      root.style.setProperty("--club-primary-foreground", readableForeground(activeClub.primary_colour));
      root.style.setProperty("--primary", primary);
      root.style.setProperty("--primary-foreground", readableForeground(activeClub.primary_colour));
      root.style.setProperty("--ring", primary);
    }
    if (secondary) {
      root.style.setProperty("--club-secondary", secondary);
      root.style.setProperty("--club-secondary-foreground", readableForeground(activeClub.secondary_colour));
    }
    if (accent) {
      root.style.setProperty("--club-accent", accent);
      // Canonical brand highlight: the configured club accent, with an
      // automatically chosen accessible foreground.
      root.style.setProperty("--club-highlight", accent);
      root.style.setProperty("--club-highlight-foreground", readableForeground(activeClub.accent_colour));
    }
    if (primary && secondary) {
      // Branded action gradients derive from the club palette (no Bowls Trainer green).
      // The far end is mixed back toward the primary so white button text stays legible.
      const glow = `color-mix(in oklab, ${secondary} 55%, ${primary})`;
      root.style.setProperty("--primary-glow", glow);
      root.style.setProperty("--gradient-primary", `linear-gradient(135deg, ${primary}, ${glow})`);
      root.style.setProperty("--gradient-hero", `linear-gradient(160deg, ${primary}, ${glow})`);
    }
    if (surface) root.style.setProperty("--club-surface", surface);
    root.setAttribute("data-club-branded", "true");
  }, [activeClub]);

  return <>{children}</>;
}
