import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { BTLogo } from "@/components/bowls/BTLogo";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset Password | Bowls Trainer" },
      { name: "description", content: "Securely set a new password for your Bowls Trainer account." },
      { property: "og:title", content: "Reset Password | Bowls Trainer" },
      { property: "og:description", content: "Securely set a new password for your Bowls Trainer account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [tokenHash, setTokenHash] = useState<string | null>(null);
  const [confirmingLink, setConfirmingLink] = useState(false);
  const exchangeStarted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const sub = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });

    (async () => {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));

      // Let the auth client finish any automatic PKCE/implicit callback work
      // before attempting a fallback. This prevents a second exchange racing
      // the client's built-in URL detection on Safari and route remounts.
      const { data: existing } = await supabase.auth.getSession();
      if (existing.session) {
        if (!cancelled) setReady(true);
        return;
      }

      // 1) Implicit flow: tokens arrive in the URL hash.
      const access_token = hash.get("access_token");
      const refresh_token = hash.get("refresh_token");
      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (!cancelled) {
          if (error) setLinkError(error.message);
          else setReady(true);
        }
        return;
      }

      // 2) Error returned by Supabase on the redirect (expired/used link).
      const errDesc = hash.get("error_description") ?? url.searchParams.get("error_description");
      if (errDesc) {
        if (!cancelled) setLinkError(errDesc);
        return;
      }

      // 3) Token-hash flow: works even when the link is opened on another device.
      const token_hash = url.searchParams.get("token_hash") ?? url.searchParams.get("token");
      if (token_hash && url.searchParams.get("type") === "recovery") {
        // Do not consume one-time tokens during page load. Outlook Safe Links
        // and similar scanners issue GET requests before the user taps a link.
        // Verification happens only after a deliberate button press below.
        if (!cancelled) setTokenHash(token_hash);
        return;
      }

      // 4) PKCE flow: the auth client consumes ?code=… exactly once during
      // initialization. Never call exchangeCodeForSession here as well.
      const code = url.searchParams.get("code");
      if (code) {
        await new Promise((resolve) => window.setTimeout(resolve, 300));
        const { data, error } = await supabase.auth.getSession();
        if (!cancelled && data.session) {
          setReady(true);
        } else if (!cancelled) {
          setLinkError(error?.message ?? "The recovery session could not be established.");
        }
        return;
      }

      // 5) Session already established (detectSessionInUrl may have consumed it).
      const { data } = await supabase.auth.getSession();
      if (!cancelled && data.session) setReady(true);
    })();

    return () => {
      cancelled = true;
      sub.data.subscription.unsubscribe();
    };
  }, []);

  async function confirmRecoveryLink() {
    if (!tokenHash || exchangeStarted.current) return;
    exchangeStarted.current = true;
    setConfirmingLink(true);
    const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
    setConfirmingLink(false);
    if (error) {
      setLinkError(error.message);
      exchangeStarted.current = false;
      return;
    }
    window.history.replaceState({}, document.title, "/reset-password");
    setReady(true);
  }


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
            <div className="space-y-2">
              {tokenHash && !linkError && (
                <div className="space-y-4">
                  <p className="text-sm text-foreground">Your secure reset link is ready.</p>
                  <Button
                    type="button"
                    disabled={confirmingLink}
                    onClick={confirmRecoveryLink}
                    className="h-14 w-full rounded-xl text-base font-bold"
                  >
                    {confirmingLink ? "Opening…" : "Continue to reset password"}
                  </Button>
                </div>
              )}
              {linkError && (
                <p className="text-sm font-semibold text-destructive">
                  This reset link didn't work: {linkError}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Open this page from the reset link in your email (links expire after a short
                time — request a new one if needed). You can return to{" "}
                <Link to="/auth" className="font-semibold text-primary">sign in</Link>.
              </p>
            </div>
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
