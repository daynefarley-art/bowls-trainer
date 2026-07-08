export function NewBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full bg-destructive px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-destructive-foreground ${className}`}
    >
      NEW
    </span>
  );
}

export function FeaturedBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-primary ${className}`}
    >
      ⭐ Featured
    </span>
  );
}
