import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { BTLogo } from "@/components/bowls/BTLogo";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Supabase places a recovery session via the URL hash; wait briefly for it.
    const sub = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.data.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) return toast.error("Password must be at least 6 characters.");
    if (password !== confirm) return toast.error("Passwords do not match.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated. Please sign in.");
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="bt-gradient-hero px-6 pt-12 pb-12 text-white">
        <div className="mx-auto max-w-md">
          <div className="flex items-center gap-3">
            <BTLogo size={48} variant="onDark" />
            <span className="text-sm font-bold uppercase tracking-[0.18em] opacity-90">Bowls Trainer</span>
          </div>
          <h1 className="mt-8 font-display text-3xl font-extrabold">Set a new password</h1>
        </div>
      </div>
      <div className="mx-auto -mt-6 max-w-md px-6">
        <div className="rounded-2xl bg-card p-6 bt-shadow-elevated">
          {!ready ? (
            <p className="text-sm text-muted-foreground">
              Open this page from the reset link in your email. If you didn't request a reset, you can return to{" "}
              <Link to="/auth" className="font-semibold text-primary">sign in</Link>.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">New password</Label>
                <Input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 rounded-xl text-base"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Confirm new password</Label>
                <Input
                  type="password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="h-12 rounded-xl text-base"
                />
              </div>
              <Button type="submit" disabled={loading} className="h-14 w-full rounded-xl text-base font-bold">
                {loading ? "Updating…" : "Update password"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                <Link to="/auth" className="font-semibold text-primary">Back to sign in</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
