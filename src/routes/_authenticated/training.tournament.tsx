import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/bowls/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { MY_PROGRAMS_QK, assignProgram, createProgram } from "@/lib/programs";
import {
  PLAYING_POSITIONS,
  TOURNAMENT_FORMATS,
  emphasisFor,
  generateTournamentPlan,
  needsPosition,
  planToSessionInputs,
  weakDrillSlugs,
  weaknessExplanation,
  type PlayingPosition,
  type TournamentFormat,
} from "@/lib/tournament-plan";

export const Route = createFileRoute("/_authenticated/training/tournament")({
  head: () => ({
    meta: [
      { title: "Plan for a Tournament — Bowls Trainer" },
      {
        name: "description",
        content: "Build a preparation plan for your next bowls tournament, shaped around the position you're playing.",
      },
      { property: "og:title", content: "Plan for a Tournament — Bowls Trainer" },
      { property: "og:description", content: "Role-aware tournament preparation from real drills and challenges." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TournamentSetupPage,
});

type Mode = "auto" | "choose";

function todayIso(offsetDays = 21): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function TournamentSetupPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [date, setDate] = useState(todayIso());
  const [format, setFormat] = useState<TournamentFormat>("pairs");
  const [position, setPosition] = useState<PlayingPosition>("lead");
  const [days, setDays] = useState(3);
  const [mode, setMode] = useState<Mode>("auto");
  const [focus, setFocus] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: library } = useQuery({
    queryKey: ["program-library"],
    queryFn: async () => {
      const [{ data: drills }, { data: challenges }] = await Promise.all([
        supabase.from("drills").select("id, slug, name, category").order("sort_order"),
        (supabase as any).from("challenges").select("id, slug, name, category").order("sort_order"),
      ]);
      return {
        drills: (drills ?? []) as Array<{ id: string; slug: string; name: string; category: string | null }>,
        challenges: (challenges ?? []) as Array<{ id: string; slug: string; name: string; category: string | null }>,
      };
    },
  });

  const emphasis = emphasisFor(format, needsPosition(format) ? position : null);

  async function build() {
    if (!name.trim()) return toast.error("Give your event a name.");
    if (!library) return;
    setSaving(true);
    try {
      const { data: results } = await supabase
        .from("results")
        .select("drill_id, bsi, percentage")
        .eq("user_id", user.id);
      const weak = weakDrillSlugs((results ?? []) as any[], library.drills);

      const plan = generateTournamentPlan({
        tournamentName: name.trim(),
        tournamentDate: date,
        format,
        position: needsPosition(format) ? position : null,
        trainingDays: days,
        focusSlugs: mode === "choose" ? focus : [],
        weakSlugs: mode === "auto" ? weak : [],
        availableDrillSlugs: library.drills.map((d) => d.slug),
        availableChallengeSlugs: library.challenges.map((c) => c.slug),
      });

      const weakName = weak.length ? library.drills.find((d) => d.slug === weak[0])?.name ?? null : null;
      const program = await createProgram({
        ownerId: user.id,
        programType: "TOURNAMENT_PREP",
        name: plan.name,
        description: plan.description,
        status: "active",
        startDate: plan.startDate,
        endDate: plan.endDate,
        notes:
          [notes.trim() || null, mode === "auto" && weakName ? weaknessExplanation(weakName) : null]
            .filter(Boolean)
            .join("\n\n") || null,
        settings: {
          event: name.trim(),
          tournament_date: date,
          format,
          position: needsPosition(format) ? position : null,
          training_days: days,
          mode,
          focus_slugs: mode === "choose" ? focus : [],
          weak_slugs: weak,
          focus_summary: plan.focusSummary,
        },
        sessions: planToSessionInputs(
          plan,
          new Map(library.drills.map((d) => [d.slug, d.id])),
          new Map(library.challenges.map((c) => [c.slug, c.id])),
        ),
      });
      await assignProgram(program.id, user.id, user.id, "tournament_self");
      qc.invalidateQueries({ queryKey: MY_PROGRAMS_QK(user.id) });
      navigate({ to: "/training/$programId", params: { programId: program.id } });
    } catch (e) {
      console.error("[tournament] build failed", e);
      toast.error("Couldn't build that plan. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Plan for a Tournament" subtitle="Preparation shaped around what you'll be playing" />
      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-10">
        <section className="space-y-4 rounded-2xl bg-card p-5 bt-shadow-card">
          <div className="space-y-1.5">
            <Label htmlFor="event">Event name</Label>
            <Input id="event" value={name} onChange={(e) => setName(e.target.value)} placeholder="Centre Pairs" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="date">Tournament date</Label>
            <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Format</Label>
            <div className="grid grid-cols-2 gap-2">
              {TOURNAMENT_FORMATS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  aria-pressed={format === f.value}
                  onClick={() => setFormat(f.value)}
                  className={`h-11 rounded-xl border text-sm font-bold ${
                    format === f.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          {needsPosition(format) ? (
            <div className="space-y-1.5">
              <Label>Position you're playing</Label>
              <div className="grid grid-cols-2 gap-2">
                {PLAYING_POSITIONS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    aria-pressed={position === p.value}
                    onClick={() => setPosition(p.value)}
                    className={`h-11 rounded-xl border text-sm font-bold ${
                      position === p.value
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label>Training days per week</Label>
            <div className="grid grid-cols-4 gap-2">
              {[2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={days === n}
                  onClick={() => setDays(n)}
                  className={`h-11 rounded-xl border text-sm font-bold ${
                    days === n ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Optional — you don't need to set weekly hours. Your weekly practice goal stays as it is.
            </p>
          </div>
        </section>

        <section className="space-y-3 rounded-2xl bg-card p-5 bt-shadow-card">
          <p className="font-display text-base font-bold">How should we build it?</p>
          <div className="grid gap-2">
            <button
              type="button"
              aria-pressed={mode === "auto"}
              onClick={() => setMode("auto")}
              className={`rounded-xl border p-3 text-left ${
                mode === "auto" ? "border-primary bg-secondary/40" : "border-border"
              }`}
            >
              <span className="block text-sm font-bold">Build my program</span>
              <span className="block text-xs text-muted-foreground">
                Bowls Trainer picks the drills for your position and puts extra work where you're weakest.
              </span>
            </button>
            <button
              type="button"
              aria-pressed={mode === "choose"}
              onClick={() => setMode("choose")}
              className={`rounded-xl border p-3 text-left ${
                mode === "choose" ? "border-primary bg-secondary/40" : "border-border"
              }`}
            >
              <span className="block text-sm font-bold">I'll choose my focus</span>
              <span className="block text-xs text-muted-foreground">
                Pick the drills you want emphasised — we'll build the schedule around them.
              </span>
            </button>
          </div>
          {mode === "choose" ? (
            <div className="space-y-2">
              {(library?.drills ?? []).map((d) => {
                const on = focus.includes(d.slug);
                return (
                  <button
                    key={d.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFocus(on ? focus.filter((s) => s !== d.slug) : [...focus, d.slug])}
                    className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm ${
                      on ? "border-primary bg-secondary/40 font-bold" : "border-border"
                    }`}
                  >
                    <span>{d.name}</span>
                    <span className="text-xs text-muted-foreground">{d.category}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="rounded-xl bg-secondary/40 p-3 text-xs">{emphasis.summary}</p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <Button className="h-12 w-full text-base font-bold" onClick={build} disabled={saving}>
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : "Build my plan"}
          </Button>
        </section>
      </main>
    </>
  );
}
