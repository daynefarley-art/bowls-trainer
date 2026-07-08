import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  CURRENT_RELEASE,
  RELEASES,
  hasSeenCurrentRelease,
  markCurrentReleaseSeen,
  sortItems,
  type ReleaseItem,
} from "@/lib/whats-new";

const KIND_LABEL: Record<ReleaseItem["kind"], string> = {
  challenge: "New Challenge",
  drill: "New Drill",
  game: "New Game",
  feature: "New Feature",
  improvement: "Improvement",
  bugfix: "Bug Fix",
};

function itemActionLabel(item: ReleaseItem): string {
  if (!item.link) return "";
  if (item.kind === "challenge") return "Try Challenge";
  if (item.kind === "drill") return "Try Drill";
  if (item.kind === "game") return "Play Game";
  return "View Feature";
}

export function WhatsNewDialog() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = setTimeout(() => {
      if (!hasSeenCurrentRelease()) setOpen(true);
    }, 600);
    return () => clearTimeout(t);
  }, []);

  const release = RELEASES.find((r) => r.version === CURRENT_RELEASE);
  if (!release) return null;

  function close() {
    markCurrentReleaseSeen();
    setOpen(false);
  }

  function openItem(item: ReleaseItem) {
    if (!item.link) return;
    markCurrentReleaseSeen();
    setOpen(false);
    navigate({ to: item.link.to as any, params: item.link.params as any });
  }

  const items = sortItems(release.items);

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">🎉 What's New</DialogTitle>
          <DialogDescription>
            Released{" "}
            {new Date(release.date).toLocaleDateString(undefined, {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-3">
          {items.map((item, i) => (
            <li key={i} className="rounded-xl bg-secondary/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                  {KIND_LABEL[item.kind]}
                </p>
                {item.featured && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                    Featured
                  </span>
                )}
              </div>
              <p className="mt-1 font-display text-base font-bold">
                <span className="mr-1">{item.icon}</span>
                {item.title}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
              {item.link && (
                <Button
                  variant="secondary"
                  onClick={() => openItem(item)}
                  className="mt-2 h-10 w-full rounded-xl font-bold"
                >
                  {itemActionLabel(item)}
                </Button>
              )}
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button onClick={close} className="h-12 w-full rounded-xl font-bold">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
