import { describe, expect, it } from "vitest";
import {
  computeBSI,
  rawBSIScore,
  aggregateOverallBSI,
  difficultyFor,
} from "./bsi";

/** Build a count-shaped breakdown. */
const c = (o: Record<string, number>) => o;
/** Build a per-bowl draw breakdown from point values. */
const bowls = (pts: number[]) => ({ bowls: pts.map((points) => ({ points })) });
/** Percentage of a count drill, given category points and max score. */
const pctOf = (score: number, max: number) => (score / max) * 100;

describe("Drive — deterministic calibration", () => {
  const slug = "drive-accuracy";
  // 8 drives, max_score 40 (full_hit 5 / movement 3 / channel 1 / miss 0)
  const drive = (b: { full_hit?: number; movement?: number; channel?: number; miss?: number }) => {
    const counts = { full_hit: 0, movement: 0, channel: 0, miss: 0, ...b };
    const score = counts.full_hit * 5 + counts.movement * 3 + counts.channel * 1;
    return { counts, bsi: computeBSI(slug, c(counts), pctOf(score, 40)), score };
  };

  it("CASE A — real user result lands in the 55–65 calibration band", () => {
    const r = drive({ full_hit: 2, movement: 1, channel: 2, miss: 3 });
    expect(r.score).toBe(15); // drill score unchanged
    expect(rawBSIScore(slug, c(r.counts), pctOf(15, 40))).toBeCloseTo(48.8, 1);
    expect(r.bsi).toBeGreaterThanOrEqual(55);
    expect(r.bsi).toBeLessThanOrEqual(65);
  });

  it("CASE B — 8 complete misses is a floor of zero", () => {
    expect(drive({ miss: 8 }).bsi).toBe(0);
  });

  it("CASE C — line accuracy without contact is moderate and beats total failure", () => {
    const channelOnly = drive({ channel: 6, miss: 2 });
    expect(channelOnly.bsi).toBeGreaterThan(40);
    expect(channelOnly.bsi).toBeLessThan(60);
    expect(channelOnly.bsi).toBeGreaterThan(drive({ miss: 8 }).bsi);
  });

  it("CASE D — strong performance scores high", () => {
    expect(drive({ full_hit: 5, movement: 2, miss: 1 }).bsi).toBeGreaterThanOrEqual(80);
  });

  it("CASE E — perfect performance hits the cap without exceeding it", () => {
    const perfect = drive({ full_hit: 8 });
    expect(perfect.bsi).toBe(100);
    expect(perfect.bsi).toBeLessThanOrEqual(100);
  });

  it("is monotonic across the outcome hierarchy", () => {
    const series = [
      drive({ miss: 8 }),
      drive({ channel: 4, miss: 4 }),
      drive({ channel: 8 }),
      drive({ movement: 4, channel: 4 }),
      drive({ movement: 8 }),
      drive({ full_hit: 4, movement: 4 }),
      drive({ full_hit: 8 }),
    ].map((r) => r.bsi);
    for (let i = 1; i < series.length; i++) expect(series[i]).toBeGreaterThan(series[i - 1]);
  });
});

describe("Upshot — deterministic calibration", () => {
  const slug = "upshot-drill";
  // 8 bowls, max_score 40 (remove_hold 5 / remove 3 / contact 2 / target_zone 1 / miss 0)
  const up = (b: Partial<Record<"remove_hold" | "remove" | "contact" | "target_zone" | "miss", number>>) => {
    const counts = { remove_hold: 0, remove: 0, contact: 0, target_zone: 0, miss: 0, ...b };
    const score =
      counts.remove_hold * 5 + counts.remove * 3 + counts.contact * 2 + counts.target_zone * 1;
    return { counts, score, bsi: computeBSI(slug, c(counts), pctOf(score, 40)) };
  };

  it("CASE A — complete failure", () => {
    expect(up({ miss: 8 }).bsi).toBe(0);
  });

  it("CASE B — weak performance stays low", () => {
    const weak = up({ contact: 1, target_zone: 2, miss: 5 });
    expect(weak.bsi).toBeGreaterThan(0);
    expect(weak.bsi).toBeLessThan(40);
  });

  it("CASE C — competent session with meaningful partial success is respectable", () => {
    const competent = up({ remove_hold: 1, remove: 2, contact: 2, target_zone: 2, miss: 1 });
    expect(competent.bsi).toBeGreaterThanOrEqual(60);
    expect(competent.bsi).toBeLessThanOrEqual(75);
  });

  it("CASE D — strong performance", () => {
    expect(up({ remove_hold: 4, remove: 3, contact: 1 }).bsi).toBeGreaterThanOrEqual(85);
  });

  it("CASE E — exceptional performance caps at 100", () => {
    expect(up({ remove_hold: 8 }).bsi).toBe(100);
  });

  it("meaningful partial success scores materially better than complete misses", () => {
    const partial = up({ contact: 4, target_zone: 4 }).bsi;
    const misses = up({ miss: 8 }).bsi;
    expect(partial - misses).toBeGreaterThan(25);
  });
});

describe("Other BSI skills — no accidental inflation or deflation", () => {
  it("Draw drills keep their established per-bowl curve", () => {
    expect(computeBSI("medium-draw", bowls([5, 5, 5, 5]), 100)).toBe(95);
    expect(computeBSI("medium-draw", bowls([3, 3, 3, 3]), 60)).toBe(82);
    expect(computeBSI("medium-draw", bowls([1, 1, 1, 1]), 20)).toBe(60);
    expect(computeBSI("medium-draw", bowls([0, 0, 0, 0]), 0)).toBe(0);
    expect(difficultyFor("medium-draw")).toBe(1);
    expect(difficultyFor("short-draw")).toBe(1);
    expect(difficultyFor("long-draw")).toBe(1);
  });

  it("Long Draw is monotonic weak → exceptional", () => {
    const s = [
      computeBSI("long-draw", bowls([0, 0, 0, 1]), 5),
      computeBSI("long-draw", bowls([0, 1, 1, 1]), 15),
      computeBSI("long-draw", bowls([1, 1, 3, 3]), 40),
      computeBSI("long-draw", bowls([3, 3, 5, 5]), 80),
      computeBSI("long-draw", bowls([5, 5, 5, 5]), 100),
    ];
    for (let i = 1; i < s.length; i++) expect(s[i]).toBeGreaterThan(s[i - 1]);
  });

  it("Weight Control shares the draw anchors", () => {
    expect(computeBSI("weight-control-ladder", c({ one_mat: 16 }), 60)).toBe(82);
    expect(computeBSI("weight-control-ladder", c({ outside_two_mats: 16 }), 0)).toBe(0);
  });

  it("Jack Delivery is monotonic and not inflated", () => {
    const perfect = computeBSI("jack-delivery-accuracy", c({ perfect: 8 }), 100);
    const mixed = computeBSI("jack-delivery-accuracy", c({ perfect: 4, acceptable: 4 }), 80);
    const poor = computeBSI("jack-delivery-accuracy", c({ acceptable: 2, miss: 6 }), 15);
    expect(perfect).toBeGreaterThan(mixed);
    expect(mixed).toBeGreaterThan(poor);
    expect(perfect).toBeLessThanOrEqual(100);
  });

  it("Running Shot is monotonic", () => {
    const s = [
      computeBSI("running-shot-drill", c({ miss: 8 }), 0),
      computeBSI("running-shot-drill", c({ disturb: 4, miss: 4 }), 20),
      computeBSI("running-shot-drill", c({ full_contact: 4, disturb: 4 }), 50),
      computeBSI("running-shot-drill", c({ move_remain: 8 }), 100),
    ];
    for (let i = 1; i < s.length; i++) expect(s[i]).toBeGreaterThan(s[i - 1]);
  });

  it("Jack in the Ditch keeps its own scoring, only its BSI reading is normalised", () => {
    // Percentage path — the drill's bonus-point mechanic is untouched.
    const s = [0, 25, 50, 75, 100].map((p) => computeBSI("jack-in-ditch", null, p));
    for (let i = 1; i < s.length; i++) expect(s[i]).toBeGreaterThan(s[i - 1]);
    expect(s[0]).toBe(0);
    expect(s[4]).toBe(100);
  });
});

describe("Overall BSI volatility", () => {
  const draws = [
    { drillId: "short", weight: 0.17, mean: 82, count: 6 },
    { drillId: "medium", weight: 0.17, mean: 84, count: 6 },
    { drillId: "long", weight: 0.16, mean: 80, count: 6 },
  ];

  it("a single first attempt at a hard skill moves but does not dominate the index", () => {
    const before = aggregateOverallBSI(draws);
    const after = aggregateOverallBSI([
      ...draws,
      { drillId: "drive", weight: 0.1, mean: 59.6, count: 1 },
    ]);
    expect(before - after).toBeGreaterThan(0); // it genuinely moves
    expect(before - after).toBeLessThan(3); // but no collapse
  });

  it("repeated evidence of weakness is fully reflected", () => {
    const oneOff = aggregateOverallBSI([...draws, { drillId: "drive", weight: 0.1, mean: 30, count: 1 }]);
    const sustained = aggregateOverallBSI([...draws, { drillId: "drive", weight: 0.1, mean: 30, count: 10 }]);
    expect(sustained).toBeLessThan(oneOff);
  });

  it("does not reward avoiding hard skills — equivalent standards, equivalent index", () => {
    // Competent execution everywhere: club-standard draw (16×2mat = 60)
    // vs the same standard in Drive (59.6) and Upshot (68.0).
    const easyOnly = [
      { drillId: "short", weight: 0.17, mean: 60, count: 6 },
      { drillId: "medium", weight: 0.17, mean: 60, count: 6 },
      { drillId: "long", weight: 0.16, mean: 60, count: 6 },
    ];
    const userA = aggregateOverallBSI(easyOnly);
    const userB = aggregateOverallBSI([
      ...easyOnly,
      { drillId: "drive", weight: 0.1, mean: 59.6, count: 3 },
      { drillId: "upshot", weight: 0.15, mean: 68, count: 3 },
    ]);
    // Attempting the hard skills at the same standard is neutral-to-positive.
    expect(userB).toBeGreaterThanOrEqual(userA);
  });

  it("hard-skill work carries only a proportionate cost when it is a genuinely lower standard", () => {
    // Strong draw (82) plus merely competent Drive/Upshot. There is a real
    // gap in standard, so the index must move — but not collapse.
    const userB = aggregateOverallBSI([
      ...draws,
      { drillId: "drive", weight: 0.1, mean: 59.6, count: 3 },
      { drillId: "upshot", weight: 0.15, mean: 68, count: 3 },
    ]);
    const delta = aggregateOverallBSI(draws) - userB;
    expect(delta).toBeGreaterThan(0);
    expect(delta).toBeLessThan(6);
    // Under the old engine the same sessions read Drive 37.5 / Upshot 42.5.
    const oldEngine = aggregateOverallBSI([
      ...draws,
      { drillId: "drive", weight: 0.1, mean: 37.5, count: 3 },
      { drillId: "upshot", weight: 0.15, mean: 42.5, count: 3 },
    ]);
    expect(aggregateOverallBSI(draws) - oldEngine).toBeGreaterThan(delta * 2);
  });
});


describe("CROSS-DRILL CALIBRATION TABLE", () => {
  it("equivalent standards of execution produce comparable BSI across skills", () => {
    type Row = { skill: string; band: string; raw: string; score: number; rawBsi: number; gamma: number; bsi: number };
    const rows: Row[] = [];
    const add = (
      skill: string,
      slug: string,
      band: string,
      raw: string,
      breakdown: unknown,
      score: number,
      max: number,
    ) => {
      rows.push({
        skill,
        band,
        raw,
        score,
        rawBsi: rawBSIScore(slug, breakdown, pctOf(score, max)),
        gamma: difficultyFor(slug),
        bsi: computeBSI(slug, breakdown, pctOf(score, max)),
      });
    };

    add("Draw (Medium)", "medium-draw", "weak", "0×½ 0×1 2×2mat 14 out", bowls([1, 1, ...Array(14).fill(0)]), 2, 80);
    add("Draw (Medium)", "medium-draw", "developing", "8×2mat 8 out", bowls([...Array(8).fill(1), ...Array(8).fill(0)]), 8, 80);
    add("Draw (Medium)", "medium-draw", "competent", "16×2mat", bowls(Array(16).fill(1)), 16, 80);
    add("Draw (Medium)", "medium-draw", "strong", "16×1mat", bowls(Array(16).fill(3)), 48, 80);
    add("Draw (Medium)", "medium-draw", "exceptional", "16×½mat", bowls(Array(16).fill(5)), 80, 80);

    add("Long Draw", "long-draw", "weak", "2×2mat 14 out", bowls([1, 1, ...Array(14).fill(0)]), 2, 80);
    add("Long Draw", "long-draw", "developing", "8×2mat 8 out", bowls([...Array(8).fill(1), ...Array(8).fill(0)]), 8, 80);
    add("Long Draw", "long-draw", "competent", "16×2mat", bowls(Array(16).fill(1)), 16, 80);
    add("Long Draw", "long-draw", "strong", "16×1mat", bowls(Array(16).fill(3)), 48, 80);
    add("Long Draw", "long-draw", "exceptional", "16×½mat", bowls(Array(16).fill(5)), 80, 80);

    add("Weight Control", "weight-control-ladder", "weak", "2×2mat 14 out", { two_mats: 2, outside_two_mats: 14 }, 2, 80);
    add("Weight Control", "weight-control-ladder", "developing", "8×2mat 8 out", { two_mats: 8, outside_two_mats: 8 }, 8, 80);
    add("Weight Control", "weight-control-ladder", "competent", "16×2mat", { two_mats: 16 }, 16, 80);
    add("Weight Control", "weight-control-ladder", "strong", "16×1mat", { one_mat: 16 }, 48, 80);
    add("Weight Control", "weight-control-ladder", "exceptional", "16×½mat", { half_mat: 16 }, 80, 80);

    add("Jack Delivery", "jack-delivery-accuracy", "weak", "1 acc, 7 miss", { acceptable: 1, miss: 7 }, 3, 40);
    add("Jack Delivery", "jack-delivery-accuracy", "developing", "4 acc, 4 miss", { acceptable: 4, miss: 4 }, 12, 40);
    add("Jack Delivery", "jack-delivery-accuracy", "competent", "2 perf, 5 acc, 1 miss", { perfect: 2, acceptable: 5, miss: 1 }, 25, 40);
    add("Jack Delivery", "jack-delivery-accuracy", "strong", "5 perf, 3 acc", { perfect: 5, acceptable: 3 }, 34, 40);
    add("Jack Delivery", "jack-delivery-accuracy", "exceptional", "8 perfect", { perfect: 8 }, 40, 40);

    add("Drive", "drive-accuracy", "weak", "1 chan, 7 miss", { channel: 1, miss: 7 }, 1, 40);
    add("Drive", "drive-accuracy", "developing", "1 hit, 1 mvmt, 1 chan, 5 miss", { full_hit: 1, movement: 1, channel: 1, miss: 5 }, 9, 40);
    add("Drive", "drive-accuracy", "competent", "2 hit, 1 mvmt, 2 chan, 3 miss (REAL CASE)", { full_hit: 2, movement: 1, channel: 2, miss: 3 }, 15, 40);
    add("Drive", "drive-accuracy", "strong", "5 hit, 2 mvmt, 1 miss", { full_hit: 5, movement: 2, miss: 1 }, 31, 40);
    add("Drive", "drive-accuracy", "exceptional", "8 full hits", { full_hit: 8 }, 40, 40);

    add("Upshot", "upshot-drill", "weak", "1 contact, 2 zone, 5 miss", { contact: 1, target_zone: 2, miss: 5 }, 4, 40);
    add("Upshot", "upshot-drill", "developing", "1 rem, 2 contact, 2 zone, 3 miss", { remove: 1, contact: 2, target_zone: 2, miss: 3 }, 9, 40);
    add("Upshot", "upshot-drill", "competent", "1 rem+hold, 2 rem, 2 contact, 2 zone, 1 miss", { remove_hold: 1, remove: 2, contact: 2, target_zone: 2, miss: 1 }, 17, 40);
    add("Upshot", "upshot-drill", "strong", "4 rem+hold, 3 rem, 1 contact", { remove_hold: 4, remove: 3, contact: 1 }, 31, 40);
    add("Upshot", "upshot-drill", "exceptional", "8 remove & hold", { remove_hold: 8 }, 40, 40);

    add("Running Shot", "running-shot-drill", "weak", "1 disturb, 7 miss", { disturb: 1, miss: 7 }, 2, 40);
    add("Running Shot", "running-shot-drill", "developing", "1 full, 2 disturb, 5 miss", { full_contact: 1, disturb: 2, miss: 5 }, 7, 40);
    add("Running Shot", "running-shot-drill", "competent", "1 mr, 2 full, 3 disturb, 2 miss", { move_remain: 1, full_contact: 2, disturb: 3, miss: 2 }, 17, 40);
    add("Running Shot", "running-shot-drill", "strong", "4 mr, 3 full, 1 disturb", { move_remain: 4, full_contact: 3, disturb: 1 }, 31, 40);
    add("Running Shot", "running-shot-drill", "exceptional", "8 move & remain", { move_remain: 8 }, 40, 40);

    add("Jack in the Ditch", "jack-in-ditch", "weak", "score 4/40", null, 4, 40);
    add("Jack in the Ditch", "jack-in-ditch", "developing", "score 12/40", null, 12, 40);
    add("Jack in the Ditch", "jack-in-ditch", "competent", "score 20/40", null, 20, 40);
    add("Jack in the Ditch", "jack-in-ditch", "strong", "score 32/40", null, 32, 40);
    add("Jack in the Ditch", "jack-in-ditch", "exceptional", "score 40/40", null, 40, 40);

    const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
    const lines = [
      `${pad("SKILL", 18)}${pad("BAND", 13)}${pad("RAW PERFORMANCE", 44)}${pad("SCORE", 7)}${pad("RAW BSI", 9)}${pad("GAMMA", 7)}BSI`,
      "-".repeat(105),
      ...rows.map(
        (r) =>
          `${pad(r.skill, 18)}${pad(r.band, 13)}${pad(r.raw, 44)}${pad(String(r.score), 7)}${pad(r.rawBsi.toFixed(1), 9)}${pad(r.gamma.toFixed(2), 7)}${r.bsi.toFixed(1)}`,
      ),
    ];
    // eslint-disable-next-line no-console
    console.log("\n" + lines.join("\n") + "\n");

    // Monotonic within every skill.
    const bands = ["weak", "developing", "competent", "strong", "exceptional"];
    const skills = [...new Set(rows.map((r) => r.skill))];
    for (const skill of skills) {
      const s = bands.map((b) => rows.find((r) => r.skill === skill && r.band === b)!.bsi);
      for (let i = 1; i < s.length; i++) {
        expect(s[i], `${skill} ${bands[i]} > ${bands[i - 1]}`).toBeGreaterThan(s[i - 1]);
      }
    }

    // Comparable across skills at each band.
    for (const band of bands) {
      const vals = rows.filter((r) => r.band === band).map((r) => r.bsi);
      expect(Math.max(...vals) - Math.min(...vals), `${band} spread`).toBeLessThanOrEqual(30);
    }
  });
});
