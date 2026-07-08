import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Target, TrendingUp, Trophy } from "lucide-react";
import { BTLogo } from "@/components/bowls/BTLogo";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
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
        <Feature icon={<Target className="h-6 w-6" />} title="Structured drills" desc="Start with the 8 Bowl Draw Test. More drills coming." />
        <Feature icon={<TrendingUp className="h-6 w-6" />} title="Track progress" desc="See your scores trend over time with charts." />
        <Feature icon={<Trophy className="h-6 w-6" />} title="Bowls Skill Index" desc="A single number to measure your level." />
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
