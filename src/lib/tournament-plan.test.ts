import { describe, expect, it } from "vitest";
import {
  emphasisFor,
  generateTournamentPlan,
  needsPosition,
  phaseForWeek,
  planToSessionInputs,
  weakDrillSlugs,
  weeksUntil,
} from "./tournament-plan";

const DRILLS = [
  "short-draw",
  "medium-draw",
  "long-draw",
  "lead-drill",
  "weight-control-ladder",
  "jack-delivery-accuracy",
  "drive-accuracy",
  "upshot-drill",
  "running-shot-drill",
  "jack-in-ditch",
];
const CHALLENGES = ["keep-it-up", "traffic-jam", "drive-then-draw", "jack-in-ditch", "slimed", "switch-32"];

const TODAY = new Date(2026, 8, 14); // 14 Sep 2026

function plan(overrides: Partial<Parameters<typeof generateTournamentPlan>[0]> = {}) {
  return generateTournamentPlan({
    tournamentName: "Centre Pairs",
    tournamentDate: "2026-10-05",
    format: "pairs",
    position: "lead",
    trainingDays: 3,
    today: TODAY,
    availableDrillSlugs: DRILLS,
    availableChallengeSlugs: CHALLENGES,
    ...overrides,
  });
}

function slugsOf(p: ReturnType<typeof generateTournamentPlan>) {
  return p.sessions.flatMap((s) => s.activities.map((a) => a.slug));
}

describe("tournament date handling", () => {
  it("counts whole weeks remaining", () => {
    expect(weeksUntil("2026-10-05", TODAY)).toBe(3);
    expect(weeksUntil("2026-09-15", TODAY)).toBe(1);
  });
  it("never returns fewer than one week for a past date", () => {
    expect(weeksUntil("2026-09-01", TODAY)).toBe(1);
  });
});

describe("phases", () => {
  it("builds first, sharpens in the middle and tapers last", () => {
    expect(phaseForWeek(1, 3)).toBe("BUILD");
    expect(phaseForWeek(2, 3)).toBe("SHARPEN");
    expect(phaseForWeek(3, 3)).toBe("TAPER");
  });
  it("tapers the final week even for a short run-in", () => {
    expect(phaseForWeek(1, 1)).toBe("TAPER");
  });
  it("does not overtrain in the final week", () => {
    const p = plan();
    const taper = p.sessions.filter((s) => s.phase === "TAPER");
    const build = p.sessions.filter((s) => s.phase === "BUILD");
    expect(taper.length).toBeLessThan(build.length);
    for (const s of taper) {
      expect(s.activities.filter((a) => a.kind === "drill").length).toBeLessThanOrEqual(2);
    }
  });
});

describe("role mapping — acceptance cases", () => {
  it("LEAD favours jack delivery, draw and length, not driving", () => {
    const slugs = slugsOf(plan({ position: "lead" }));
    expect(slugs).toContain("jack-delivery-accuracy");
    expect(slugs).toContain("lead-drill");
    expect(slugs.some((s) => s.includes("draw"))).toBe(true);
    expect(slugs).not.toContain("drive-accuracy");
    expect(slugs).not.toContain("running-shot-drill");
  });

  it("SKIP gets a broad mix including drive, upshot and running shots", () => {
    const slugs = slugsOf(plan({ format: "fours", position: "skip", trainingDays: 3 }));
    expect(slugs).toContain("medium-draw");
    expect(slugs).toContain("upshot-drill");
    expect(slugs).toContain("running-shot-drill");
    expect(slugs).toContain("drive-accuracy");
  });

  it("THIRD mixes draw with conversion work", () => {
    const slugs = slugsOf(plan({ format: "triples", position: "third" }));
    expect(slugs).toContain("upshot-drill");
    expect(slugs).toContain("medium-draw");
  });

  it("SINGLES needs no position and stays balanced", () => {
    expect(needsPosition("singles")).toBe(false);
    const slugs = slugsOf(plan({ format: "singles", position: null }));
    expect(slugs).toContain("medium-draw");
    expect(slugs).toContain("weight-control-ladder");
    expect(emphasisFor("singles", null).summary).toMatch(/balanced/i);
  });

  it("honours a player's nominated focus first", () => {
    const slugs = slugsOf(plan({ format: "singles", position: null, focusSlugs: ["drive-accuracy"] }));
    expect(slugs[0]).toBe("drive-accuracy");
  });
});

describe("plan structure", () => {
  it("creates trainingDays sessions per week except the taper week", () => {
    const p = plan({ trainingDays: 3 });
    expect(p.weeks).toBe(3);
    expect(p.sessions.filter((s) => s.weekNumber === 1)).toHaveLength(3);
    expect(p.sessions.filter((s) => s.weekNumber === 3)).toHaveLength(2);
  });

  it("adds pressure challenges but never in the first session", () => {
    const p = plan();
    expect(p.sessions[0]!.activities.every((a) => a.kind === "drill")).toBe(true);
    expect(slugsOf(p).some((s) => CHALLENGES.includes(s))).toBe(true);
  });

  it("only emits slugs that exist in the library", () => {
    const p = plan({ position: "skip", format: "fours" });
    for (const a of p.sessions.flatMap((s) => s.activities)) {
      expect(a.kind === "drill" ? DRILLS : CHALLENGES).toContain(a.slug);
    }
  });

  it("skips activities whose slug is missing when mapping to ids", () => {
    const p = plan();
    const inputs = planToSessionInputs(p, new Map([["medium-draw", "d1"]]), new Map());
    const all = inputs.flatMap((s) => s.activities);
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((a) => a.kind === "drill" && a.drillId === "d1")).toBe(true);
  });

  it("is deterministic for identical input", () => {
    expect(JSON.stringify(plan())).toBe(JSON.stringify(plan()));
  });
});

describe("weakness detection", () => {
  const drills = [
    { id: "a", slug: "jack-delivery-accuracy" },
    { id: "b", slug: "medium-draw" },
  ];
  it("surfaces a drill materially below the player's own baseline", () => {
    const weak = weakDrillSlugs(
      [
        { drill_id: "a", bsi: 40 },
        { drill_id: "a", bsi: 42 },
        { drill_id: "b", bsi: 70 },
        { drill_id: "b", bsi: 72 },
      ],
      drills,
    );
    expect(weak).toEqual(["jack-delivery-accuracy"]);
  });
  it("ignores single attempts and even performance", () => {
    expect(weakDrillSlugs([{ drill_id: "a", bsi: 10 }], drills)).toEqual([]);
    expect(
      weakDrillSlugs(
        [
          { drill_id: "a", bsi: 60 },
          { drill_id: "a", bsi: 61 },
          { drill_id: "b", bsi: 62 },
          { drill_id: "b", bsi: 63 },
        ],
        drills,
      ),
    ).toEqual([]);
  });
});
