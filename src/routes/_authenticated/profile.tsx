import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/bowls/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { LogOut, Clock, Flame, TrendingUp, Trophy, BookOpen, Shield, KeyRound, Trash2, AlertTriangle, Sparkles, Users } from "lucide-react";
import { formatHM, bestTrainingWeek, weeklyAverage, trainingStreak, trainingStats, type Result } from "@/lib/bowls";
import { GettingStartedGuide } from "@/components/bowls/GettingStartedGuide";
import { Switch } from "@/components/ui/switch";
import { getShowGettingStartedCard, setShowGettingStartedCard } from "@/lib/dashboard-prefs";
import { useIncomingInvites } from "@/lib/squad-invites";
import { MyCoachSection } from "@/components/bowls/MyCoachSection";
import { MySquadStatsCard } from "@/components/bowls/MySquadStatsCard";
import { useUserRoles } from "@/hooks/use-role";
import { Link } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ChallengeAchievementsSection } from "@/components/bowls/ChallengeAchievements";
import { useDemoMode } from "@/lib/demo-mode";
import { hasUnseenRelease } from "@/lib/whats-new";
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
import { Target } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: profile } = useQuery({
    queryKey: ["profile", user.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      return data;
    },
  });

  const { data: results } = useQuery({
    queryKey: ["results", user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select("*")
        .eq("user_id", user.id)
        .order("played_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Result[];
    },
  });

  const allResults = results ?? [];
  const tStats = trainingStats(allResults);
  const best = bestTrainingWeek(allResults);
  const wAvg = weeklyAverage(allResults);
  const streak = trainingStreak(allResults);


  const [fullName, setFullName] = useState("");
  const [club, setClub] = useState("");
  const [defaultClub, setDefaultClub] = useState("");
  const [defaultGreen, setDefaultGreen] = useState("");
  const [defaultGreenType, setDefaultGreenType] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  const [showGSCard, setShowGSCardState] = useState(true);

  useEffect(() => {
    setShowGSCardState(getShowGettingStartedCard());
  }, []);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
      setClub(profile.club ?? "");
      setDefaultClub((profile as any).default_club ?? "");
      setDefaultGreen((profile as any).default_green ?? "");
      setDefaultGreenType((profile as any).default_green_type ?? "");
    }
  }, [profile]);

  async function handleSave() {
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .upsert({
        id: user.id,
        full_name: fullName,
        club,
        default_club: defaultClub || null,
        default_green: defaultGreen || null,
        default_green_type: defaultGreenType || null,
        updated_at: new Date().toISOString(),
      } as any);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Profile updated");
    qc.invalidateQueries({ queryKey: ["profile", user.id] });
  }


  async function handleSignOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <>
      <PageHeader title="Profile" subtitle={user.email ?? ""} />
      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5">
        <section className="space-y-4 rounded-2xl bg-card p-5 bt-shadow-card">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Full name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-12 rounded-xl text-base" />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Club</Label>
            <Input value={club} onChange={(e) => setClub(e.target.value)} placeholder="Your bowls club" className="h-12 rounded-xl text-base" />
          </div>
          <Button onClick={handleSave} disabled={saving} className="h-14 w-full rounded-xl text-base font-bold">
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </section>

        <section className="space-y-4 rounded-2xl bg-card p-5 bt-shadow-card">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <h2 className="font-display text-lg font-bold">Default Training Location</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Pre-fills new training sessions. You can still override any field when starting a session.
          </p>
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Default Club / Location</Label>
            <Input value={defaultClub} onChange={(e) => setDefaultClub(e.target.value)} placeholder="e.g. Bowls Tauranga South" className="h-12 rounded-xl text-base" />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Default Green</Label>
            <Input value={defaultGreen} onChange={(e) => setDefaultGreen(e.target.value)} placeholder="e.g. Indoor Green, Rink A" className="h-12 rounded-xl text-base" />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Default Green Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["Grass", "Artificial"] as const).map((opt) => {
                const active = defaultGreenType === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setDefaultGreenType(active ? "" : opt)}
                    className={`rounded-xl px-3 py-2 text-sm font-bold transition ${
                      active ? "bt-gradient-primary text-white" : "bg-secondary text-charcoal"
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving} variant="outline" className="h-12 w-full rounded-xl font-bold">
            {saving ? "Saving…" : "Save Defaults"}
          </Button>
        </section>

        <section className="space-y-3 rounded-2xl bg-card p-5 bt-shadow-card">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <h2 className="font-display text-lg font-bold">Training summary</h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SummaryStat
              icon={<Clock className="h-4 w-4 text-primary" />}
              label="Total trained"
              value={formatHM(tStats.allTime)}
            />
            <SummaryStat
              icon={<TrendingUp className="h-4 w-4 text-primary" />}
              label="Weekly average"
              value={wAvg ? formatHM(wAvg) : "—"}
            />
            <SummaryStat
              icon={<Trophy className="h-4 w-4 text-primary" />}
              label="Best week"
              value={best ? formatHM(best.minutes) : "—"}
              sub={
                best
                  ? `w/ ${best.weekStart.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`
                  : undefined
              }
            />
            <SummaryStat
              icon={<Flame className="h-4 w-4 text-primary" />}
              label="Current streak"
              value={`${streak} day${streak === 1 ? "" : "s"}`}
            />
          </div>
        </section>

        <section className="space-y-3 rounded-2xl bg-card p-5 bt-shadow-card">
          <h2 className="font-display text-lg font-bold">Dashboard Preferences</h2>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Show Getting Started Card</p>
              <p className="text-xs text-muted-foreground">Display the card on the Dashboard.</p>
            </div>
            <Switch
              checked={showGSCard}
              onCheckedChange={(v) => {
                setShowGSCardState(v);
                setShowGettingStartedCard(v);
              }}
            />
          </div>
        </section>


        <DemoModeSection />

        <ChallengeAchievementsSection userId={user.id} />

        <MyCoachSection userId={user.id} />

        <CoachShortcut userId={user.id} />


        <SquadLink />

        <MySquadStatsCard />

        <AccountSecuritySection email={user.email ?? ""} />

        <AdminToolsSection userId={user.id} />

        <WhatsNewLink />


        <button
          onClick={() => setGuideOpen(true)}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-card text-base font-bold text-foreground bt-shadow-card"
        >
          <BookOpen className="h-5 w-5 text-primary" /> Getting Started Guide
        </button>


        <button
          onClick={handleSignOut}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-card text-base font-bold text-destructive bt-shadow-card"
        >
          <LogOut className="h-5 w-5" /> Sign out
        </button>
      </main>
      <GettingStartedGuide open={guideOpen} onOpenChange={setGuideOpen} />
    </>
  );
}

function CoachShortcut({ userId }: { userId: string }) {
  const { isCoach, isAdmin } = useUserRoles(userId);
  if (!isCoach && !isAdmin) return null;
  return (
    <Link
      to="/coach"
      className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-card text-base font-bold text-foreground bt-shadow-card"
    >
      <GraduationCap className="h-5 w-5 text-primary" /> Coach's Corner
    </Link>
  );
}

function SquadLink() {
  const inviteCount = useIncomingInvites().length;
  return (
    <Link
      to="/squad"
      className="relative flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-card text-base font-bold text-foreground bt-shadow-card"
    >
      <Users className="h-5 w-5 text-primary" /> My Squad
      {inviteCount > 0 && (
        <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
          {inviteCount}
        </span>
      )}
    </Link>
  );
}

function WhatsNewLink() {
  const [unseen, setUnseen] = useState(false);
  useEffect(() => {
    setUnseen(hasUnseenRelease());
  }, []);
  return (
    <Link
      to="/whats-new"
      className="relative flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-card text-base font-bold text-foreground bt-shadow-card"
    >
      <Sparkles className="h-5 w-5 text-primary" /> What's New
      {unseen && (
        <span
          aria-label="New updates available"
          className="ml-1 inline-block h-2.5 w-2.5 rounded-full bg-primary"
        />
      )}
    </Link>
  );
}

function AdminToolsSection({ userId }: { userId: string }) {
  const { isAdmin } = useUserRoles(userId);
  if (!isAdmin) return null;
  return (
    <section className="space-y-3 rounded-2xl bg-card p-5 bt-shadow-card">
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-primary" />
        <h2 className="font-display text-lg font-bold">Admin Tools</h2>
      </div>
      <div className="grid gap-2">
        <Link to="/admin" className="flex h-12 items-center justify-between rounded-xl bg-secondary/40 px-4 text-sm font-semibold">
          System Statistics <span className="text-muted-foreground">›</span>
        </Link>
        <Link to="/admin/user-management" className="flex h-12 items-center justify-between rounded-xl bg-secondary/40 px-4 text-sm font-semibold">
          User Management <span className="text-muted-foreground">›</span>
        </Link>
        <Link to="/admin/invitations" className="flex h-12 items-center justify-between rounded-xl bg-secondary/40 px-4 text-sm font-semibold">
          Invitations <span className="text-muted-foreground">›</span>
        </Link>
        <Link to="/admin/analytics" className="flex h-12 items-center justify-between rounded-xl bg-secondary/40 px-4 text-sm font-semibold">
          App Analytics <span className="text-muted-foreground">›</span>
        </Link>
      </div>
    </section>
  );
}

function SummaryStat({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="rounded-xl bg-secondary/40 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-1 font-display text-xl font-extrabold">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function AccountSecuritySection({ email }: { email: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [changeOpen, setChangeOpen] = useState(false);
  const [eraseOpen, setEraseOpen] = useState(false);

  // Change password state
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [cpLoading, setCpLoading] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 6) return toast.error("New password must be at least 6 characters.");
    if (next !== confirm) return toast.error("New passwords do not match.");
    setCpLoading(true);
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: current });
    if (signInErr) {
      setCpLoading(false);
      return toast.error("Current password is incorrect.");
    }
    const { error: updErr } = await supabase.auth.updateUser({ password: next });
    setCpLoading(false);
    if (updErr) return toast.error(updErr.message);
    toast.success("Password updated.");
    setCurrent(""); setNext(""); setConfirm("");
    setChangeOpen(false);
  }

  // Erase history state
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [erasePw, setErasePw] = useState("");
  const [pwVerified, setPwVerified] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [eraseLoading, setEraseLoading] = useState(false);

  function resetErase() {
    setStep(1); setErasePw(""); setPwVerified(false); setConfirmText("");
  }

  async function verifyPassword() {
    if (!erasePw) return;
    setEraseLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: erasePw });
    setEraseLoading(false);
    if (error) return toast.error("Password is incorrect.");
    setPwVerified(true);
    setStep(3);
  }

  async function performErase() {
    if (!pwVerified || confirmText !== "ERASE") return;
    setEraseLoading(true);
    const { error } = await supabase.rpc("erase_my_history");
    setEraseLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Your training history has been erased.");
    setEraseOpen(false);
    resetErase();
    await qc.invalidateQueries();
    navigate({ to: "/dashboard" });
  }

  return (
    <>
      <section className="space-y-3 rounded-2xl bg-card p-5 bt-shadow-card">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          <h2 className="font-display text-lg font-bold">Account Security</h2>
        </div>
        <div className="grid gap-2">
          <button
            onClick={() => setChangeOpen(true)}
            className="flex h-12 items-center justify-between rounded-xl bg-secondary/40 px-4 text-sm font-semibold"
          >
            <span className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-primary" /> Change Password</span>
            <span className="text-muted-foreground">›</span>
          </button>
          <button
            onClick={() => { resetErase(); setEraseOpen(true); }}
            className="flex h-12 items-center justify-between rounded-xl bg-destructive/10 px-4 text-sm font-semibold text-destructive"
          >
            <span className="flex items-center gap-2"><Trash2 className="h-4 w-4" /> Erase My History</span>
            <span>›</span>
          </button>
        </div>
      </section>

      <Dialog open={changeOpen} onOpenChange={setChangeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>Enter your current password and choose a new one.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleChangePassword} className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Current Password</Label>
              <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required className="h-12 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">New Password</Label>
              <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} required className="h-12 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Confirm New Password</Label>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required className="h-12 rounded-xl" />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={cpLoading} className="h-12 w-full rounded-xl font-bold">
                {cpLoading ? "Updating…" : "Update Password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={eraseOpen} onOpenChange={(o) => { setEraseOpen(o); if (!o) resetErase(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Erase My History
            </DialogTitle>
          </DialogHeader>
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-foreground">
                This will permanently delete your training history, including drill results, challenge results, games, sessions, BSI history and progress data.
              </p>
              <p className="text-sm text-foreground">Your account will remain active.</p>
              <p className="text-sm font-semibold text-destructive">This action cannot be undone.</p>
              <DialogFooter>
                <Button onClick={() => setStep(2)} variant="destructive" className="h-12 w-full rounded-xl font-bold">
                  Continue
                </Button>
              </DialogFooter>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Please confirm your current password to continue.</p>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Current Password</Label>
                <Input type="password" value={erasePw} onChange={(e) => setErasePw(e.target.value)} className="h-12 rounded-xl" />
              </div>
              <DialogFooter>
                <Button onClick={verifyPassword} disabled={eraseLoading || !erasePw} className="h-12 w-full rounded-xl font-bold">
                  {eraseLoading ? "Verifying…" : "Confirm Password"}
                </Button>
              </DialogFooter>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-3">
              <p className="text-sm text-foreground">
                Type <span className="font-mono font-bold">ERASE</span> to confirm.
              </p>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="ERASE"
                className="h-12 rounded-xl font-mono"
              />
              <DialogFooter>
                <Button
                  onClick={performErase}
                  variant="destructive"
                  disabled={eraseLoading || !pwVerified || confirmText !== "ERASE"}
                  className="h-12 w-full rounded-xl font-bold"
                >
                  {eraseLoading ? "Erasing…" : "Erase My History"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function DemoModeSection() {
  const { enabled, setEnabled } = useDemoMode();
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <section className="space-y-3 rounded-2xl bg-card p-5 bt-shadow-card">
      <div className="flex items-center gap-2">
        <Target className="h-4 w-4 text-primary" />
        <h2 className="font-display text-lg font-bold">Demo Mode</h2>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Demo Mode</p>
          <p className="text-xs text-muted-foreground">
            Demonstrate or coach with the app without affecting your stats, history or BSI.
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(v) => {
            if (v) setConfirmOpen(true);
            else {
              setEnabled(false);
              toast.success("Demo Mode turned off");
            }
          }}
        />
      </div>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enable Demo Mode?</AlertDialogTitle>
            <AlertDialogDescription>
              Results, sessions, challenges and BSI updates will not be saved while Demo Mode is active.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setEnabled(true);
                toast.success("Demo Mode enabled");
              }}
            >
              Enable Demo Mode
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}


