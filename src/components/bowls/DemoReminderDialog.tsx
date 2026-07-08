import { useEffect, useState } from "react";
import { useDemoMode } from "@/lib/demo-mode";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

const SHOWN_KEY = "bowls.demoReminderShown";

export function DemoReminderDialog() {
  const { enabled, setEnabled } = useDemoMode();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    try {
      if (window.sessionStorage.getItem(SHOWN_KEY) === "1") return;
      window.sessionStorage.setItem(SHOWN_KEY, "1");
      setOpen(true);
    } catch {}
  }, [enabled]);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>🎯 Demo Mode is still active</AlertDialogTitle>
          <AlertDialogDescription>
            Results will not be saved while Demo Mode is on.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Continue Demo Mode</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setEnabled(false);
              toast.success("Demo Mode turned off");
            }}
          >
            Turn Off Demo Mode
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
