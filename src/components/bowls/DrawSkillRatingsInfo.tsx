import { useState } from "react";
import { Info } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function DrawSkillRatingsInfo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="About Draw Skill Ratings"
        className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-muted-foreground active:scale-95 transition"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogTitle className="font-display text-lg font-extrabold">Draw Skill Ratings</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            These ratings are your Bowls Skill Index (BSI) for each draw discipline.
            They reflect your long-term performance and are influenced by consistency
            and recent improvement. Higher scores indicate stronger performance.
          </DialogDescription>
        </DialogContent>
      </Dialog>
    </>
  );
}
