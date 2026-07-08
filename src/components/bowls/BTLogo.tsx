import markWhite from "@/assets/bt-mark-white.png.asset.json";
import markGreen from "@/assets/bt-mark-green.png.asset.json";
import iconTile from "@/assets/icon-512.png.asset.json";

type Props = {
  size?: number;
  variant?: "onLight" | "onDark";
  withWordmark?: boolean;
  className?: string;
};

/** Bowls Trainer — BT monogram (serif ligature with crossed-T). */
export function BTLogo({ size = 48, variant = "onLight", withWordmark = false, className }: Props) {
  const src = variant === "onDark" ? markWhite.url : markGreen.url;
  const word = variant === "onDark" ? "text-white" : "text-charcoal";
  const accent = variant === "onDark" ? "text-white" : "text-primary";
  return (
    <span className={`inline-flex items-center gap-3 ${className ?? ""}`}>
      <img src={src} alt="Bowls Trainer" width={size} height={size} style={{ width: size, height: size }} className="object-contain" />
      {withWordmark && (
        <span className="leading-none">
          <span className={`block font-display text-[1.5em] font-extrabold tracking-tight ${word}`}>Bowls</span>
          <span className={`block font-display text-[1.5em] font-extrabold tracking-tight ${accent}`}>Trainer</span>
        </span>
      )}
    </span>
  );
}

/** Solid app-icon tile (white BT on deep green). */
export function BTAppIcon({ size = 96, className }: { size?: number; className?: string }) {
  return (
    <img
      src={iconTile.url}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={`rounded-[22%] ${className ?? ""}`}
      aria-hidden="true"
    />
  );
}
