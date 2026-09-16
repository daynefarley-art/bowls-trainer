/**
 * HEAD SCAN — JACK RADIUS AUTO-REFINEMENT (DIAGNOSTIC ONLY).
 *
 * The jack radius sets the metric scale for every Head Scan measurement, and
 * the sensitivity test showed a ±1 source-pixel radius error moves the final
 * distances by 13–33 mm. This module refines the player's approximate jack
 * circle automatically: it treats the marked circle as an ROI, samples a
 * narrow annulus around the estimated boundary in the ORIGINAL full-resolution
 * image, finds the strongest consistent circular edge on many radial rays and
 * fits a subpixel circle to the surviving samples.
 *
 * PRIVACY: identical to the rest of the detection layer — the photograph is
 * decoded into an in-memory canvas, analysed and discarded. Nothing is
 * uploaded, stored or sent anywhere.
 *
 * PRODUCTION IS UNTOUCHED. Nothing here writes to the real jack, the solver,
 * calibration overrides or any constant. The refined circle is only measured
 * against the manual one so the difference can be inspected.
 */

import { loadPixels, type PixelBuffer } from "@/lib/head-scan-detect";
import {
  CALIBRATION_TARGET_LABELS,
  measureTargetMm,
  type CalibrationGeometry,
} from "@/lib/head-scan-calibration";
import { DEFAULT_FOV_H_DEG, DEFAULT_PRINCIPAL_POINT_X } from "@/lib/head-scan-geometry";

/** Number of radial rays cast around the estimated boundary. */
export const REFINE_RAY_COUNT = 180;
/** Annulus searched, as a fraction of the estimated radius. */
export const REFINE_ANNULUS_MIN = 0.55;
export const REFINE_ANNULUS_MAX = 1.6;
/** Radial sampling step in source pixels (subpixel). */
export const REFINE_RADIAL_STEP_PX = 0.25;
/** Minimum edge strength (0..255 luminance drop) for a ray to count. */
export const REFINE_MIN_EDGE_STRENGTH = 6;

export type RefineRaySample = {
  angleDeg: number;
  /** Edge distance from the SEED centre, in source px (subpixel). */
  edgeRadiusPx: number;
  /** Edge point in source px. */
  x: number;
  y: number;
  /** Signed luminance gradient magnitude at the edge (bright → dark). */
  strength: number;
  accepted: boolean;
  /** Distance from the fitted circle, in source px. */
  residualPx: number | null;
};

export type JackRefineFit = {
  /** Fitted centre / radius in SOURCE pixels (subpixel — never rounded). */
  cxPx: number;
  cyPx: number;
  rPx: number;
  /** Same circle in normalised image units (x/w, y/h, r/w). */
  normX: number;
  normY: number;
  normRadius: number;
  raysCast: number;
  raysAccepted: number;
  acceptedPercent: number;
  /** RMS distance of accepted samples from the fitted circle, source px. */
  residualRmsPx: number;
  /** Largest accepted residual, source px. */
  residualMaxPx: number;
  /** 0..1 heuristic: coverage × edge sharpness × fit tightness. */
  confidence: number;
  samples: RefineRaySample[];
};

/* ------------------------------------------------------------------ */
/* Pixel sampling                                                      */
/* ------------------------------------------------------------------ */

function lumAt(buf: PixelBuffer, x: number, y: number): number {
  // Bilinear luminance; clamped at the border.
  const xc = Math.max(0, Math.min(buf.w - 1.001, x));
  const yc = Math.max(0, Math.min(buf.h - 1.001, y));
  const x0 = Math.floor(xc);
  const y0 = Math.floor(yc);
  const fx = xc - x0;
  const fy = yc - y0;
  const at = (px: number, py: number) => {
    const i = (py * buf.w + px) * 4;
    return 0.299 * buf.data[i] + 0.587 * buf.data[i + 1] + 0.114 * buf.data[i + 2];
  };
  const a = at(x0, y0);
  const b = at(x0 + 1, y0);
  const c = at(x0, y0 + 1);
  const d = at(x0 + 1, y0 + 1);
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}

/* ------------------------------------------------------------------ */
/* Circle fitting                                                      */
/* ------------------------------------------------------------------ */

/** Kåsa algebraic least-squares circle fit. Returns null when degenerate. */
function fitCircle(pts: Array<{ x: number; y: number }>): { cx: number; cy: number; r: number } | null {
  const n = pts.length;
  if (n < 5) return null;
  let mx = 0;
  let my = 0;
  for (const p of pts) {
    mx += p.x;
    my += p.y;
  }
  mx /= n;
  my /= n;
  let suu = 0;
  let suv = 0;
  let svv = 0;
  let suuu = 0;
  let svvv = 0;
  let suvv = 0;
  let svuu = 0;
  for (const p of pts) {
    const u = p.x - mx;
    const v = p.y - my;
    suu += u * u;
    svv += v * v;
    suv += u * v;
    suuu += u * u * u;
    svvv += v * v * v;
    suvv += u * v * v;
    svuu += v * u * u;
  }
  const det = 2 * (suu * svv - suv * suv);
  if (Math.abs(det) < 1e-9) return null;
  const c1 = suuu + suvv;
  const c2 = svvv + svuu;
  const uc = (svv * c1 - suv * c2) / det;
  const vc = (suu * c2 - suv * c1) / det;
  const r = Math.sqrt(uc * uc + vc * vc + (suu + svv) / n);
  if (!Number.isFinite(r) || r <= 0) return null;
  return { cx: uc + mx, cy: vc + my, r };
}

function median(vals: number[]): number {
  if (!vals.length) return 0;
  const s = [...vals].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/* ------------------------------------------------------------------ */
/* Refinement                                                          */
/* ------------------------------------------------------------------ */

/**
 * Refine an approximate jack circle from the full-resolution pixel buffer.
 * `seed` is in normalised image units (x/w, y/h, r/w) — exactly the shape the
 * Head Scan jack uses.
 */
export function refineJackCircle(
  buf: PixelBuffer,
  seed: { x: number; y: number; r: number },
): JackRefineFit | null {
  const cx0 = seed.x * buf.w;
  const cy0 = seed.y * buf.h;
  const r0 = seed.r * buf.w;
  if (!(r0 > 1.5)) return null;

  const rMin = Math.max(1.5, r0 * REFINE_ANNULUS_MIN);
  const rMax = Math.min(Math.max(buf.w, buf.h), r0 * REFINE_ANNULUS_MAX);
  const step = REFINE_RADIAL_STEP_PX;

  const samples: RefineRaySample[] = [];
  for (let i = 0; i < REFINE_RAY_COUNT; i++) {
    const angle = (i / REFINE_RAY_COUNT) * Math.PI * 2;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);

    // Sample the ray, lightly smoothed to suppress sensor noise and speckle.
    const raw: number[] = [];
    for (let t = rMin; t <= rMax; t += step) {
      raw.push(lumAt(buf, cx0 + ux * t, cy0 + uy * t));
    }
    if (raw.length < 5) continue;
    const sm = raw.map((_, k) => {
      const a = raw[Math.max(0, k - 1)];
      const b = raw[k];
      const c = raw[Math.min(raw.length - 1, k + 1)];
      return (a + 2 * b + c) / 4;
    });

    // Strongest bright→dark transition going outwards (jack against surface).
    let bestK = -1;
    let bestG = 0;
    for (let k = 1; k < sm.length - 1; k++) {
      const g = sm[k - 1] - sm[k + 1]; // positive when it gets darker outwards
      if (g > bestG) {
        bestG = g;
        bestK = k;
      }
    }
    if (bestK < 1) continue;

    // Parabolic subpixel peak on the gradient profile.
    const gAt = (k: number) => sm[Math.max(0, k - 1)] - sm[Math.min(sm.length - 1, k + 1)];
    const gm = gAt(bestK - 1);
    const g0 = gAt(bestK);
    const gp = gAt(bestK + 1);
    const denom = gm - 2 * g0 + gp;
    const delta = Math.abs(denom) > 1e-6 ? (0.5 * (gm - gp)) / denom : 0;
    const kSub = bestK + Math.max(-1, Math.min(1, delta));
    const edgeR = rMin + kSub * step;

    samples.push({
      angleDeg: (angle * 180) / Math.PI,
      edgeRadiusPx: edgeR,
      x: cx0 + ux * edgeR,
      y: cy0 + uy * edgeR,
      strength: bestG,
      accepted: bestG >= REFINE_MIN_EDGE_STRENGTH,
      residualPx: null,
    });
  }

  const raysCast = samples.length;
  if (!raysCast) return null;

  // Radius-consistency pre-filter: glare, markings and shadows produce edges
  // far from the ring the majority of rays agree on.
  const strong = samples.filter((s) => s.accepted);
  if (strong.length >= 8) {
    const medR = median(strong.map((s) => s.edgeRadiusPx));
    const mad = median(strong.map((s) => Math.abs(s.edgeRadiusPx - medR)));
    const tol = Math.max(0.08 * r0, 2.5 * (mad * 1.4826), 1);
    for (const s of samples) {
      if (s.accepted && Math.abs(s.edgeRadiusPx - medR) > tol) s.accepted = false;
    }
  }

  // Iterative robust circle fit with outlier rejection.
  let fit = fitCircle(samples.filter((s) => s.accepted));
  if (!fit) return null;
  for (let pass = 0; pass < 3; pass++) {
    const live = samples.filter((s) => s.accepted);
    const res = live.map((s) => Math.hypot(s.x - fit!.cx, s.y - fit!.cy) - fit!.r);
    const absRes = res.map(Math.abs);
    const mad = median(absRes);
    const tol = Math.max(1, 2.5 * mad * 1.4826);
    let dropped = 0;
    live.forEach((s, i) => {
      if (absRes[i] > tol && live.length - dropped > 12) {
        s.accepted = false;
        dropped++;
      }
    });
    const next = fitCircle(samples.filter((s) => s.accepted));
    if (!next) break;
    fit = next;
    if (!dropped) break;
  }

  const accepted = samples.filter((s) => s.accepted);
  if (accepted.length < 8) return null;
  for (const s of samples) {
    s.residualPx = Math.hypot(s.x - fit.cx, s.y - fit.cy) - fit.r;
  }
  const resid = accepted.map((s) => Math.abs(s.residualPx ?? 0));
  const rms = Math.sqrt(resid.reduce((a, b) => a + b * b, 0) / resid.length);
  const maxRes = Math.max(...resid);
  const coverage = accepted.length / REFINE_RAY_COUNT;
  const sharpness = Math.min(1, median(accepted.map((s) => s.strength)) / 40);
  const tightness = Math.max(0, 1 - rms / Math.max(1, fit.r * 0.08));
  const confidence = Math.max(0, Math.min(1, coverage * 0.4 + sharpness * 0.25 + tightness * 0.35));

  return {
    cxPx: fit.cx,
    cyPx: fit.cy,
    rPx: fit.r,
    normX: fit.cx / buf.w,
    normY: fit.cy / buf.h,
    normRadius: fit.r / buf.w,
    raysCast: REFINE_RAY_COUNT,
    raysAccepted: accepted.length,
    acceptedPercent: (accepted.length / REFINE_RAY_COUNT) * 100,
    residualRmsPx: rms,
    residualMaxPx: maxRes,
    confidence,
    samples,
  };
}

/* ------------------------------------------------------------------ */
/* Full diagnostic experiment                                          */
/* ------------------------------------------------------------------ */

export type JackRefineBowlRow = {
  number: number;
  label: string;
  manualMm: number | null;
  refinedMm: number | null;
  deltaMm: number | null;
  deltaPercent: number | null;
};

export type JackRefineReport = {
  schema: "bowlmate.headscan.jackRadiusAutoRefinement/1";
  generatedAt: string;
  /** Pixel size the refinement actually ran on (full-resolution source). */
  analysis: { width: number; height: number; requestedMaxEdge: number };
  manual: {
    normX: number;
    normY: number;
    normRadius: number;
    centrePx: { x: number; y: number };
    radiusPx: number;
  };
  refined: {
    normX: number;
    normY: number;
    normRadius: number;
    centrePx: { x: number; y: number };
    radiusPx: number;
  } | null;
  correction: {
    radiusPx: number | null;
    radiusPercent: number | null;
    centreXPx: number | null;
    centreYPx: number | null;
  };
  fit: {
    raysCast: number;
    raysAccepted: number;
    acceptedPercent: number;
    residualRmsPx: number;
    residualMaxPx: number;
    confidence: number;
  } | null;
  bowls: JackRefineBowlRow[];
  maxAbsDeltaMm: number | null;
  meanAbsDeltaMm: number | null;
  /** Present when the refinement could not find a usable circular edge. */
  error?: string;
};

/** Decode the ORIGINAL photo at full resolution (capped for memory safety). */
export function loadSourcePixels(src: string, maxEdge = 4096): Promise<PixelBuffer | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let buf: PixelBuffer | null = null;
      try {
        buf = loadPixels(img, maxEdge);
      } catch {
        buf = null;
      }
      img.src = "";
      resolve(buf);
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Run the whole experiment: refine the circle, then measure every marked bowl
 * with BOTH the manual jack and the auto-refined jack. `geom` is read-only.
 */
export async function runJackRadiusAutoRefinement(
  photoSrc: string,
  geom: CalibrationGeometry,
  fovHDeg: number = DEFAULT_FOV_H_DEG,
  fovVDeg: number | null = null,
  principalPointX: number = DEFAULT_PRINCIPAL_POINT_X,
  k1: number = 0,
  maxEdge = 4096,
): Promise<JackRefineReport> {
  const buf = await loadSourcePixels(photoSrc, maxEdge);
  const base = {
    schema: "bowlmate.headscan.jackRadiusAutoRefinement/1" as const,
    generatedAt: new Date().toISOString(),
    analysis: { width: buf?.w ?? 0, height: buf?.h ?? 0, requestedMaxEdge: maxEdge },
    manual: {
      normX: geom.jack.point.x,
      normY: geom.jack.point.y,
      normRadius: geom.jack.radius,
      centrePx: { x: geom.jack.point.x * (buf?.w ?? 0), y: geom.jack.point.y * (buf?.h ?? 0) },
      radiusPx: geom.jack.radius * (buf?.w ?? 0),
    },
  };

  if (!buf) {
    return { ...base, refined: null, correction: { radiusPx: null, radiusPercent: null, centreXPx: null, centreYPx: null }, fit: null, bowls: [], maxAbsDeltaMm: null, meanAbsDeltaMm: null, error: "Source image could not be decoded." };
  }

  const fit = refineJackCircle(buf, {
    x: geom.jack.point.x,
    y: geom.jack.point.y,
    r: geom.jack.radius,
  });

  const measure = (jack: CalibrationGeometry["jack"]) =>
    geom.targets.map((t) => ({
      number: t.number,
      label: CALIBRATION_TARGET_LABELS[t.number] ?? `Bowl ${t.number}`,
      mm: measureTargetMm({ ...geom, jack }, t, fovHDeg, fovVDeg, principalPointX, k1),
    }));

  const manualBowls = measure(geom.jack);

  if (!fit) {
    return {
      ...base,
      refined: null,
      correction: { radiusPx: null, radiusPercent: null, centreXPx: null, centreYPx: null },
      fit: null,
      bowls: manualBowls.map((b) => ({
        number: b.number,
        label: b.label,
        manualMm: b.mm,
        refinedMm: null,
        deltaMm: null,
        deltaPercent: null,
      })),
      maxAbsDeltaMm: null,
      meanAbsDeltaMm: null,
      error: "No consistent circular edge found around the marked jack.",
    };
  }

  const refinedJack = {
    ...geom.jack,
    point: { x: fit.normX, y: fit.normY },
    radius: fit.normRadius,
  };
  const refinedBowls = measure(refinedJack);

  const bowls: JackRefineBowlRow[] = manualBowls.map((m, i) => {
    const r = refinedBowls[i]?.mm ?? null;
    const deltaMm = m.mm != null && r != null ? r - m.mm : null;
    return {
      number: m.number,
      label: m.label,
      manualMm: m.mm,
      refinedMm: r,
      deltaMm,
      deltaPercent: deltaMm != null && m.mm ? (deltaMm / m.mm) * 100 : null,
    };
  });
  const abs = bowls.map((b) => b.deltaMm).filter((v): v is number => v != null).map(Math.abs);

  const manualRadiusPx = geom.jack.radius * buf.w;
  return {
    ...base,
    refined: {
      normX: fit.normX,
      normY: fit.normY,
      normRadius: fit.normRadius,
      centrePx: { x: fit.cxPx, y: fit.cyPx },
      radiusPx: fit.rPx,
    },
    correction: {
      radiusPx: fit.rPx - manualRadiusPx,
      radiusPercent: manualRadiusPx ? ((fit.rPx - manualRadiusPx) / manualRadiusPx) * 100 : null,
      centreXPx: fit.cxPx - geom.jack.point.x * buf.w,
      centreYPx: fit.cyPx - geom.jack.point.y * buf.h,
    },
    fit: {
      raysCast: fit.raysCast,
      raysAccepted: fit.raysAccepted,
      acceptedPercent: fit.acceptedPercent,
      residualRmsPx: fit.residualRmsPx,
      residualMaxPx: fit.residualMaxPx,
      confidence: fit.confidence,
    },
    bowls,
    maxAbsDeltaMm: abs.length ? Math.max(...abs) : null,
    meanAbsDeltaMm: abs.length ? abs.reduce((a, b) => a + b, 0) / abs.length : null,
  };
}
