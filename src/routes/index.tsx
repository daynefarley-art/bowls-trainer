import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Target, TrendingUp, Trophy } from "lucide-react";
import { BTLogo } from "@/components/bowls/BTLogo";
import { markStartup, withStartupTimeout } from "@/lib/startup-diagnostics";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    // Bounded so a stalled session read can never hold the first screen blank;
    // on timeout the public landing page renders as normal.
    markStartup("auth_check_start", "landing");
    const result = await withStartupTimeout(supabase.auth.getSession(), 5000, "auth.getSession");
    markStartup("auth_check_done", "landing");
    if (result?.data.session) throw redirect({ to: "/dashboard" });
  },
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="bt-gradient-hero text-white">
        <div className="mx-auto max-w-md px-6 pt-12 pb-16">
          <div className="flex items-center gap-3">
            <BTLogo size={56} variant="onDark" />
            <span className="text-xs font-bold uppercase tracking-[0.2em] opacity-90">Bowls Trainer</span>
          </div>
          <h1 className="mt-10 font-display text-4xl font-extrabold leading-tight">
            Train smarter.<br />Bowl better.
          </h1>
          <p className="mt-4 text-base text-white/85">
            Record drill scores, track your improvement and discover your Bowls Skill Index.
          </p>
          <Link
            to="/auth"
            className="mt-8 inline-flex h-14 w-full items-center justify-center rounded-2xl bg-white px-6 text-base font-bold text-primary bt-shadow-elevated"
          >
            Get started
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-md px-6 py-10 space-y-4">
        <Feature icon={<Target className="h-6 w-6" />} title="Structured Drills" desc="Complete guided lawn bowls drills designed to improve consistency, accuracy and confidence." />
        <Feature icon={<TrendingUp className="h-6 w-6" />} title="Track Progress" desc="Analyse your performance with detailed insights, trends and coaching feedback." />
        <Feature icon={<Trophy className="h-6 w-6" />} title="Bowls Skill Index" desc="Your overall performance rating, calculated from every recorded session." />

      </main>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex gap-4 rounded-2xl bg-card p-5 bt-shadow-card">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">{icon}</div>
      <div className="min-w-0">
        <h3 className="font-display text-lg font-bold">{title}</h3>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}
