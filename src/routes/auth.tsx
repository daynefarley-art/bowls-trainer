import { createFileRoute, useNavigate, redirect, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { BTLogo } from "@/components/bowls/BTLogo";
import { z } from "zod";

type InviteInfo = {
  valid: boolean;
  email: string | null;
  role: string | null;
  reason: string | null;
};

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({ invite: z.string().optional() }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { invite } = Route.useSearch();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [club, setClub] = useState("");
  const [betaMode, setBetaMode] = useState<boolean>(true);
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setForgotLoading(true);
    await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setForgotLoading(false);
    setForgotSent(true);
  }

  // Load beta-mode setting
  useEffect(() => {
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", "private_beta_mode")
      .maybeSingle()
      .then(({ data }) => {
        if (data && typeof data.value === "boolean") setBetaMode(data.value);
        else if (data && data.value === true) setBetaMode(true);
        else if (data && data.value === false) setBetaMode(false);
      });
  }, []);

  // Validate invitation if present
  useEffect(() => {
    if (!invite) {
      setInviteInfo(null);
      return;
    }
    setInviteLoading(true);
    supabase
      .rpc("validate_invitation", { _code: invite })
      .then(({ data, error }) => {
        setInviteLoading(false);
        if (error) {
          console.error("[invite] validate_invitation RPC failed:", error);
          setInviteInfo({ valid: false, email: null, role: null, reason: `rpc_error:${error.message}` });
          return;
        }
        if (!data || !data[0]) {
          console.warn("[invite] no row returned for code", invite);
          setInviteInfo({ valid: false, email: null, role: null, reason: "not_found" });
          return;
        }
        const row = data[0] as InviteInfo;
        console.info("[invite] validation result", row);
        setInviteInfo(row);
        if (row.valid && row.email) setEmail(row.email);
      });
  }, [invite]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back!");
    navigate({ to: "/dashboard" });
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();

    // Block sign-up when beta mode is on and there's no valid invitation
    if (betaMode) {
      if (!invite || !inviteInfo?.valid) {
        toast.error("An invitation is required to create an account.");
        return;
      }
      if (inviteInfo.email && email.toLowerCase() !== inviteInfo.email.toLowerCase()) {
        toast.error("This invitation is for a different email address.");
        return;
      }
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { full_name: name },
      },
    });
    if (error) {
      setLoading(false);
      return toast.error(error.message);
    }

    // Consume the invitation (assigns invited role)
    if (invite && inviteInfo?.valid) {
      const { error: consumeErr } = await supabase.rpc("consume_invitation", { _code: invite });
      if (consumeErr) {
        setLoading(false);
        return toast.error(`Invitation could not be redeemed: ${consumeErr.message}`);
      }
    }

    // Save profile club if provided
    if (club.trim()) {
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        await supabase.from("profiles").update({ club: club.trim() }).eq("id", userData.user.id);
      }
    }

    setLoading(false);
    toast.success("Account created! You're in.");
    navigate({ to: "/dashboard" });
  }

  const showSignupBlocked = betaMode && (!invite || !inviteInfo?.valid);
  const inviteErrorMsg = inviteInfo && !inviteInfo.valid
    ? (() => {
        const reason = inviteInfo.reason ?? "";
        if (reason.startsWith("rpc_error:")) return `Could not validate invitation: ${reason.slice("rpc_error:".length)}`;
        switch (reason) {
          case "expired": return "Invitation has expired.";
          case "used": return "Invitation has already been used.";
          case "revoked": return "Invitation has been revoked.";
          case "not_found": return "Invitation token not found.";
          default: return `Invitation link is not valid (${reason || "unknown"}).`;
        }
      })()
    : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="bt-gradient-hero px-6 pt-12 pb-12 text-white">
        <div className="mx-auto max-w-md">
          <div className="flex items-center gap-3">
            <BTLogo size={48} variant="onDark" />
            <span className="text-sm font-bold uppercase tracking-[0.18em] opacity-90">Bowls Trainer</span>
          </div>
          <h1 className="mt-8 font-display text-3xl font-extrabold">Sign in to train</h1>
          <p className="mt-2 text-sm text-white/80">Skills · Training · Measurable improvement.</p>
        </div>
      </div>
      <div className="mx-auto -mt-6 max-w-md px-6 space-y-4">
        {betaMode && (
          <div className="rounded-2xl bg-card p-4 bt-shadow-elevated">
            <p className="text-xs font-bold uppercase tracking-wider text-primary">Private Beta</p>
            <p className="mt-1 text-sm text-foreground">
              Access is currently by invitation only. If you would like access, please contact the Bowls Trainer team.
            </p>
          </div>
        )}

        {invite && inviteLoading && (
          <div className="rounded-2xl bg-card p-4 text-sm bt-shadow-elevated">Validating invitation…</div>
        )}

        {invite && inviteInfo?.valid && (
          <div className="rounded-2xl bg-card p-4 text-sm bt-shadow-elevated">
            <p className="font-bold text-primary">Invitation accepted</p>
            <p className="text-muted-foreground">
              You're creating an account for <span className="font-semibold">{inviteInfo.email}</span> as a <span className="font-semibold capitalize">{inviteInfo.role}</span>.
            </p>
          </div>
        )}

        {invite && inviteInfo && !inviteInfo.valid && (
          <div className="rounded-2xl bg-destructive/10 p-4 text-sm bt-shadow-elevated">
            <p className="font-bold text-destructive">{inviteErrorMsg}</p>
            <p className="text-muted-foreground mt-1">Please contact the administrator for a new invitation.</p>
          </div>
        )}

        <div className="rounded-2xl bg-card p-6 bt-shadow-elevated">
          <Tabs defaultValue={invite ? "signup" : "signin"}>
            <TabsList className="grid w-full grid-cols-2 h-12 rounded-xl">
              <TabsTrigger value="signin" className="h-10 rounded-lg text-base">Sign in</TabsTrigger>
              <TabsTrigger value="signup" className="h-10 rounded-lg text-base">Sign up</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              {forgotOpen ? (
                <div className="space-y-4 pt-4">
                  {forgotSent ? (
                    <>
                      <p className="text-sm text-foreground">
                        If an account exists for this email, a reset link has been sent.
                      </p>
                      <Button
                        type="button"
                        onClick={() => { setForgotOpen(false); setForgotSent(false); setForgotEmail(""); }}
                        className="h-14 w-full rounded-xl text-base font-bold"
                      >
                        Back to sign in
                      </Button>
                    </>
                  ) : (
                    <form onSubmit={handleForgot} className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Enter your email and we'll send you a reset link.
                      </p>
                      <Field id="forgot-email" label="Email" type="email" value={forgotEmail} onChange={setForgotEmail} />
                      <Button type="submit" disabled={forgotLoading} className="h-14 w-full rounded-xl text-base font-bold">
                        {forgotLoading ? "Sending…" : "Send Reset Link"}
                      </Button>
                      <button
                        type="button"
                        onClick={() => setForgotOpen(false)}
                        className="block w-full text-center text-sm font-semibold text-primary"
                      >
                        Back to sign in
                      </button>
                    </form>
                  )}
                </div>
              ) : (
                <form onSubmit={handleSignIn} className="space-y-4 pt-4">
                  <Field id="email" label="Email" type="email" value={email} onChange={setEmail} />
                  <Field id="password" label="Password" type="password" value={password} onChange={setPassword} />
                  <button
                    type="button"
                    onClick={() => { setForgotEmail(email); setForgotOpen(true); }}
                    className="block text-left text-sm font-semibold text-primary"
                  >
                    Forgot Password?
                  </button>
                  <Button type="submit" disabled={loading} className="h-14 w-full rounded-xl text-base font-bold">
                    {loading ? "Signing in…" : "Sign in"}
                  </Button>
                </form>
              )}
            </TabsContent>
            <TabsContent value="signup">
              {showSignupBlocked ? (
                <div className="space-y-4 pt-4">
                  <div className="rounded-xl bg-muted/40 p-4 text-sm">
                    <p className="font-bold">Bowls Trainer is currently in private beta.</p>
                    <p className="mt-2 text-muted-foreground">
                      Please contact the administrator if you would like access.
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    Already have an account? <Link to="/auth" className="font-semibold text-primary">Sign in</Link>
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSignUp} className="space-y-4 pt-4">
                  <Field id="name" label="Your name" type="text" value={name} onChange={setName} />
                  <Field
                    id="email-su"
                    label="Email"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    readOnly={!!(invite && inviteInfo?.valid)}
                  />
                  <Field id="club" label="Club (optional)" type="text" value={club} onChange={setClub} required={false} />
                  <Field id="password-su" label="Password (min 6)" type="password" value={password} onChange={setPassword} />
                  <Button type="submit" disabled={loading} className="h-14 w-full rounded-xl text-base font-bold">
                    {loading ? "Creating…" : "Create account"}
                  </Button>
                </form>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function Field({
  id, label, type, value, onChange, readOnly, required = true,
}: {
  id: string; label: string; type: string; value: string;
  onChange: (v: string) => void; readOnly?: boolean; required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-semibold">{label}</Label>
      <Input
        id={id}
        type={type}
        required={required}
        readOnly={readOnly}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 rounded-xl text-base"
      />
    </div>
  );
}
