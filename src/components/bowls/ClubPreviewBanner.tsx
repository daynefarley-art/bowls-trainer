import { Eye } from "lucide-react";
import { useClub } from "./ClubProvider";

/**
 * Persistent indicator shown while a Super Admin previews a club context.
 * Preview is session-scoped and never changes membership or audit identity.
 */
export function ClubPreviewBanner() {
  const { isPreviewing, activeClub, exitPreview } = useClub();
  if (!isPreviewing || !activeClub) return null;

  return (
    <div className="flex items-center justify-between gap-3 bg-foreground px-4 py-2 text-background">
      <p className="flex min-w-0 items-center gap-2 text-xs font-semibold">
        <Eye className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Viewing as: {activeClub.name}</span>
      </p>
      <button
        onClick={exitPreview}
        className="shrink-0 rounded-full bg-background/20 px-3 py-1 text-xs font-bold"
      >
        Exit preview
      </button>
    </div>
  );
}
