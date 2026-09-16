import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export type LibraryItem = {
  id: string;
  slug: string;
  name: string;
  category: string | null;
  description: string | null;
  kind: "drill" | "challenge";
};

/**
 * Searchable picker over the canonical drill + challenge library.
 * Shared by the program builder and the post-assignment session editor so both
 * always offer exactly the same canonical exercises.
 */
export function ActivityPicker({
  items,
  onPick,
  onClose,
}: {
  items: LibraryItem[];
  onPick: (item: LibraryItem) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "drill" | "challenge">("all");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter(
      (i) =>
        (kind === "all" || i.kind === kind) &&
        (!term || i.name.toLowerCase().includes(term) || (i.category ?? "").toLowerCase().includes(term)),
    );
  }, [items, q, kind]);

  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <div className="flex items-center gap-2">
        <Input autoFocus placeholder="Search drills and challenges" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button variant="ghost" size="icon" aria-label="Close picker" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex gap-2">
        {(["all", "drill", "challenge"] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
            className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-bold ${
              kind === k ? "bg-primary text-primary-foreground" : "bg-secondary/50 text-muted-foreground"
            }`}
          >
            {k === "all" ? "All" : k === "drill" ? "Drills" : "Challenges"}
          </button>
        ))}
      </div>
      <ul className="max-h-64 space-y-1 overflow-y-auto">
        {filtered.map((i) => (
          <li key={`${i.kind}-${i.id}`}>
            <button
              type="button"
              onClick={() => onPick(i)}
              className="w-full rounded-lg px-3 py-2 text-left hover:bg-secondary/40"
            >
              <span className="block text-sm font-semibold">{i.name}</span>
              <span className="block text-xs text-muted-foreground">
                {i.category} · {i.kind === "drill" ? "Drill · affects BSI" : "Challenge · no BSI"}
              </span>
              {i.description ? (
                <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">{i.description}</span>
              ) : null}
            </button>
          </li>
        ))}
        {filtered.length === 0 ? (
          <li className="px-3 py-2 text-sm text-muted-foreground">Nothing matches that search.</li>
        ) : null}
      </ul>
    </div>
  );
}
