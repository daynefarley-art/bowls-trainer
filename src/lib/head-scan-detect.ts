/**
 * Head Scan — LOCAL image analysis layer.
 *
 * ABSOLUTE PRIVACY RULE (unchanged): the photograph never leaves the device.
 * Everything here runs in an in-memory <canvas> in the browser. There is no
 * upload, no external AI call, no persistence and no thumbnail. The pixel
 * buffer is discarded as soon as the function returns.
 *
 * This module is deliberately generic: it finds circular blobs of a given
 * colour family and scores them. Jack detection is the only consumer today,
 * but the same `findCircularBlobs` pass can later back suggested bowl centres
 * and perimeters (see `detectBowlCandidates` stub at the bottom) without any
 * change to measurement, scoring or versioning code.
 *
 * NOTE: this file contains NO measurement, scoring, band or `measure_v` logic.
 * It only proposes pixel coordinates that the player confirms or corrects; the
 * confirmed values then flow through the existing, untouched pipeline.
 */

/** Candidate expressed in normalised IMAGE units (0..1 of image width/height). */
export type CircleCandidate = {
  /** Centre, x normalised by image width, y normalised by image height. */
  cx: number;
  cy: number;
  /** Radius normalised by image WIDTH. */
  r: number;
  /** 0..1 — how jack-like this blob is. */
  confidence: number;
  /** Diagnostic only. */
  debug?: Record<string, number>;
};

/** Longest edge the analysis canvas is downscaled to. Keeps the pass fast. */
const WORK_MAX = 640;

type Hsv = { h: number; s: number; v: number };

function rgbToHsv(r: number, g: number, b: number): Hsv {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

/** A jack is white or yellow, bright, and never green. */
function isJackColour(hsv: Hsv, vRef: number): boolean {
  const bright = hsv.v >= Math.max(0.55, vRef * 1.18);
  if (!bright) return false;
  // Green / blue playing surface is rejected outright.
  if (hsv.h >= 80 && hsv.h <= 200 && hsv.s > 0.22) return false;
  const white = hsv.s <= 0.22;
  const yellow = hsv.h >= 35 && hsv.h <= 75 && hsv.s > 0.22;
  return white || yellow;
}

/**
 * A bowl is anything on the surface that is clearly NOT the green/blue rink:
 * dark (black/brown/navy) or strongly coloured. Deliberately permissive — the
 * player confirms every candidate by tapping it, so a false positive costs
 * nothing while a missed bowl costs a manual tap.
 */
export function isBowlColour(hsv: Hsv, vRef: number): boolean {
  // Playing surface: green through blue-green at any usable saturation.
  if (hsv.h >= 60 && hsv.h <= 200 && hsv.s > 0.16) return false;
  // Bright near-white regions are jack / paint / sky, not a bowl.
  if (hsv.s <= 0.16 && hsv.v >= Math.max(0.6, vRef * 1.15)) return false;
  const dark = hsv.v <= Math.max(0.42, vRef * 0.72);
  const colourful = hsv.s >= 0.34;
  return dark || colourful;
}


type Blob = {
  count: number;
  sx: number;
  sy: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

/**
 * Threshold + 4-connected component labelling, scored for "roundness".
 * Returns candidates sorted best-first, in normalised image units.
 */
export function findCircularBlobs(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  opts: {
    accept: (hsv: Hsv, vRef: number) => boolean;
    minAreaFrac: number;
    maxAreaFrac: number;
    /**
     * Plausible radius window as a fraction of image WIDTH. Blobs inside the
     * window score 1 for size and taper off outside it. Defaults to the jack
     * window, which is deliberately small — an oversized bright region is not
     * a jack.
     */
    sizeRange?: [number, number];
  },

): CircleCandidate[] {
  const total = w * h;

  // Reference brightness of the scene (median-ish via mean) so the same
  // thresholds behave in bright sun and in shade.
  let vSum = 0;
  const hsvs: Hsv[] = new Array(total);
  for (let i = 0; i < total; i++) {
    const hsv = rgbToHsv(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    hsvs[i] = hsv;
    vSum += hsv.v;
  }
  const vRef = vSum / total;

  const mask = new Uint8Array(total);
  for (let i = 0; i < total; i++) mask[i] = opts.accept(hsvs[i], vRef) ? 1 : 0;

  const labels = new Int32Array(total).fill(-1);
  const blobs: Blob[] = [];
  const stack: number[] = [];

  for (let start = 0; start < total; start++) {
    if (mask[start] === 0 || labels[start] !== -1) continue;
    const id = blobs.length;
    const blob: Blob = {
      count: 0,
      sx: 0,
      sy: 0,
      minX: w,
      maxX: 0,
      minY: h,
      maxY: 0,
    };
    labels[start] = id;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop() as number;
      const x = p % w;
      const y = (p - x) / w;
      blob.count++;
      blob.sx += x;
      blob.sy += y;
      if (x < blob.minX) blob.minX = x;
      if (x > blob.maxX) blob.maxX = x;
      if (y < blob.minY) blob.minY = y;
      if (y > blob.maxY) blob.maxY = y;
      if (x > 0 && mask[p - 1] && labels[p - 1] === -1) {
        labels[p - 1] = id;
        stack.push(p - 1);
      }
      if (x < w - 1 && mask[p + 1] && labels[p + 1] === -1) {
        labels[p + 1] = id;
        stack.push(p + 1);
      }
      if (y > 0 && mask[p - w] && labels[p - w] === -1) {
        labels[p - w] = id;
        stack.push(p - w);
      }
      if (y < h - 1 && mask[p + w] && labels[p + w] === -1) {
        labels[p + w] = id;
        stack.push(p + w);
      }
    }
    blobs.push(blob);
  }

  const minArea = opts.minAreaFrac * total;
  const maxArea = opts.maxAreaFrac * total;

  const candidates: CircleCandidate[] = [];
  for (const b of blobs) {
    if (b.count < minArea || b.count > maxArea) continue;
    const bw = b.maxX - b.minX + 1;
    const bh = b.maxY - b.minY + 1;
    if (bw < 3 || bh < 3) continue;

    const aspect = bw / bh;
    // A circle fills pi/4 (~0.785) of its bounding box.
    const fill = b.count / (bw * bh);
    const rPx = Math.sqrt(b.count / Math.PI);
    const cx = b.sx / b.count;
    const cy = b.sy / b.count;

    // Roundness scores. Each is 0..1; multiplied together they punish blobs
    // that are elongated (line markings, shoes, sunlit strips).
    const aspectScore = clamp01(1 - Math.abs(Math.log(aspect)) / Math.log(2.2));
    const fillScore = clamp01(1 - Math.abs(fill - 0.785) / 0.42);
    // Size plausibility: a jack in an overhead head shot is small but visible.
    const rFrac = rPx / w;
    const [rLo, rHi] = opts.sizeRange ?? [0.012, 0.06];
    const sizeScore = bell(rFrac, rLo, rHi);

    // Contrast against a surrounding ring — a jack sits on darker green.
    const ring = ringBrightness(hsvs, w, h, cx, cy, rPx);
    const core = coreBrightness(hsvs, w, h, cx, cy, rPx);
    const contrastScore = clamp01((core - ring) / 0.32);

    const confidence = clamp01(
      aspectScore * 0.28 + fillScore * 0.26 + sizeScore * 0.18 + contrastScore * 0.28,
    );

    candidates.push({
      cx: cx / w,
      cy: cy / h,
      r: rPx / w,
      confidence,
      debug: { aspectScore, fillScore, sizeScore, contrastScore, areaPx: b.count },
    });
  }

  candidates.sort((a, b) => b.confidence - a.confidence);
  return candidates;
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

/** 1 inside [lo,hi], tapering off outside. */
function bell(v: number, lo: number, hi: number) {
  if (v >= lo && v <= hi) return 1;
  const d = v < lo ? (lo - v) / lo : (v - hi) / hi;
  return clamp01(1 - d);
}

function coreBrightness(hsvs: Hsv[], w: number, h: number, cx: number, cy: number, r: number) {
  return sampleBrightness(hsvs, w, h, cx, cy, Math.max(1, r * 0.5), 0);
}

function ringBrightness(hsvs: Hsv[], w: number, h: number, cx: number, cy: number, r: number) {
  return sampleBrightness(hsvs, w, h, cx, cy, r * 2.1, r * 1.4);
}

function sampleBrightness(
  hsvs: Hsv[],
  w: number,
  h: number,
  cx: number,
  cy: number,
  outer: number,
  inner: number,
) {
  let sum = 0;
  let n = 0;
  const r0 = Math.floor(Math.max(0, cy - outer));
  const r1 = Math.ceil(Math.min(h - 1, cy + outer));
  const c0 = Math.floor(Math.max(0, cx - outer));
  const c1 = Math.ceil(Math.min(w - 1, cx + outer));
  for (let y = r0; y <= r1; y++) {
    for (let x = c0; x <= c1; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > outer || d < inner) continue;
      sum += hsvs[y * w + x].v;
      n++;
    }
  }
  return n ? sum / n : 0;
}

export type JackDetection = {
  status: "found" | "low_confidence" | "not_found";
  candidate: CircleCandidate | null;
  /** All scored candidates, best-first (diagnostic / future bowl work). */
  candidates: CircleCandidate[];
};

/** Anything at or above this is auto-accepted and shown as "Jack found". */
export const JACK_CONFIDENCE_ACCEPT = 0.55;

/**
 * Decode → downscale → read pixels, then drop the buffer. The caller never
 * sees a canvas and nothing is retained after the call returns.
 */
function readPixels(
  img: HTMLImageElement,
): { data: Uint8ClampedArray; w: number; h: number } | null {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return null;

  const scale = Math.min(1, WORK_MAX / Math.max(iw, ih));
  const w = Math.max(8, Math.round(iw * scale));
  const h = Math.max(8, Math.round(ih * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  try {
    const { data } = ctx.getImageData(0, 0, w, h);
    return { data, w, h };
  } catch (err) {
    // Tainted canvas or OOM — fall back to manual marking.
    console.log("[HeadScan:detect] analysis failed:", err);
    return null;
  } finally {
    // Drop the pixel buffer immediately.
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * Detect the most likely jack in a decoded image, entirely on-device.
 * The ImageData buffer is created, read and dropped inside this call.
 */
export function detectJackFromImage(img: HTMLImageElement): JackDetection {
  const px = readPixels(img);
  if (!px) return { status: "not_found", candidate: null, candidates: [] };

  const candidates = findCircularBlobs(px.data, px.w, px.h, {
    accept: isJackColour,
    minAreaFrac: 0.0004, // ~0.04% of the frame — a small jack far away
    maxAreaFrac: 0.02, // a jack is SMALL; larger bright regions are not jacks
    sizeRange: [0.012, 0.055],
  });

  const best = candidates[0] ?? null;
  if (!best) return { status: "not_found", candidate: null, candidates };
  return {
    status: best.confidence >= JACK_CONFIDENCE_ACCEPT ? "found" : "low_confidence",
    candidate: best,
    candidates,
  };
}

/** Anything at or above this is offered as a tappable bowl candidate. */
export const BOWL_CONFIDENCE_ACCEPT = 0.34;

/** A bowl is roughly twice the diameter of a jack; allow a generous window. */
const BOWL_R_MIN_X_JACK = 1.15;
const BOWL_R_MAX_X_JACK = 3.8;

export type HeadAnalysis = {
  jack: JackDetection;
  /** Likely bowls, best-first, in normalised IMAGE units. Never definitive. */
  bowls: CircleCandidate[];
};

/**
 * Single on-device pass proposing the jack and every likely bowl.
 * Nothing is uploaded, stored or sent to any AI service: the pixels live in a
 * temporary canvas inside `readPixels` and are discarded before this returns.
 */
export function analyseHeadImage(img: HTMLImageElement): HeadAnalysis {
  const empty: JackDetection = { status: "not_found", candidate: null, candidates: [] };
  const px = readPixels(img);
  if (!px) return { jack: empty, bowls: [] };

  const jackCandidates = findCircularBlobs(px.data, px.w, px.h, {
    accept: isJackColour,
    minAreaFrac: 0.0004,
    maxAreaFrac: 0.02,
    sizeRange: [0.012, 0.055],
  });
  const bestJack = jackCandidates[0] ?? null;
  const jack: JackDetection = bestJack
    ? {
        status: bestJack.confidence >= JACK_CONFIDENCE_ACCEPT ? "found" : "low_confidence",
        candidate: bestJack,
        candidates: jackCandidates,
      }
    : empty;

  // Size window: relative to the jack when we have one, otherwise absolute.
  const jr = bestJack?.r ?? 0;
  const rLo = jr > 0 ? jr * BOWL_R_MIN_X_JACK : 0.03;
  const rHi = jr > 0 ? jr * BOWL_R_MAX_X_JACK : 0.16;

  const raw = findCircularBlobs(px.data, px.w, px.h, {
    accept: isBowlColour,
    minAreaFrac: Math.max(0.0008, Math.PI * rLo * rLo * 0.35),
    maxAreaFrac: 0.14,
    sizeRange: [rLo, rHi],
  });

  const bowls: CircleCandidate[] = [];
  for (const c of raw) {
    if (c.confidence < BOWL_CONFIDENCE_ACCEPT) continue;
    if (c.r < rLo * 0.7 || c.r > rHi * 1.3) continue;
    // Never offer the jack itself as a bowl.
    if (bestJack && Math.hypot(c.cx - bestJack.cx, c.cy - bestJack.cy) < bestJack.r * 1.6) continue;
    // De-duplicate overlapping proposals.
    if (bowls.some((b) => Math.hypot(b.cx - c.cx, b.cy - c.cy) < Math.max(b.r, c.r))) continue;
    bowls.push(c);
    if (bowls.length >= 10) break;
  }

  return { jack, bowls };
}


/* ==========================================================================
 * V1.1 — SEED-BASED LOCAL DETECTION
 *
 * The player taps roughly on an object; we analyse ONLY a small window around
 * that tap and estimate the object's perimeter. There is no whole-image search
 * and no manual circle sizing in the normal flow.
 *
 * Everything below runs on an in-memory pixel buffer created from a temporary
 * canvas. No upload, no storage, no external service.
 * ========================================================================== */

/** Decoded pixels held in memory for the life of one Head Scan photo. */
export type PixelBuffer = { data: Uint8ClampedArray; w: number; h: number };

/** Working resolution for seed detection — finer than the blob pass. */
const SEED_WORK_MAX = 1600;

/** Decode an image into a downscaled RGBA buffer. Caller drops it when done. */
export function loadPixels(img: HTMLImageElement, maxEdge = SEED_WORK_MAX): PixelBuffer | null {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return null;
  const scale = Math.min(1, maxEdge / Math.max(iw, ih));
  const w = Math.max(8, Math.round(iw * scale));
  const h = Math.max(8, Math.round(ih * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  try {
    const { data } = ctx.getImageData(0, 0, w, h);
    return { data, w, h };
  } catch (err) {
    console.log("[HeadScan:detect] seed buffer unavailable:", err);
    return null;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export type SeedDetection = {
  /** Centre in normalised IMAGE units. */
  cx: number;
  cy: number;
  /** Radius normalised by image WIDTH. */
  r: number;
  /** 0..1 — how clean the local perimeter was. */
  confidence: number;
  /** true when the perimeter was unclear and the result is a rough estimate. */
  approx: boolean;
  /**
   * Set when the seed tap landed inside a LOCKED object (the confirmed jack or
   * an already-accepted bowl). The caller must NOT create anything.
   */
  blocked?: "jack" | "bowl";
  /** Index of the already-accepted bowl that was tapped, when blocked==="bowl". */
  blockedIdx?: number;
};

/**
 * A locked object the detector must never return as a new candidate.
 * All values are normalised IMAGE units (cx by width, cy by height, r by width).
 */
export type LockedObject = {
  kind: "jack" | "bowl";
  cx: number;
  cy: number;
  r: number;
  /** Bowl number / index, for the caller's message. */
  idx?: number;
};


function px(buf: PixelBuffer, x: number, y: number) {
  const i = (y * buf.w + x) * 4;
  return [buf.data[i], buf.data[i + 1], buf.data[i + 2]] as const;
}

/** Perceptually-ish colour distance, 0..1. */
function colourDist(a: readonly number[], b: readonly number[]) {
  const dr = (a[0] - b[0]) / 255;
  const dg = (a[1] - b[1]) / 255;
  const db = (a[2] - b[2]) / 255;
  return Math.sqrt((dr * dr * 2 + dg * dg * 3 + db * db) / 6);
}

/** Median colour of a small patch, robust to noise / specular pixels. */
function patchColour(buf: PixelBuffer, cx: number, cy: number, rad: number) {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  for (let y = cy - rad; y <= cy + rad; y++) {
    for (let x = cx - rad; x <= cx + rad; x++) {
      if (x < 0 || y < 0 || x >= buf.w || y >= buf.h) continue;
      const [r, g, b] = px(buf, x, y);
      rs.push(r);
      gs.push(g);
      bs.push(b);
    }
  }
  const med = (v: number[]) => {
    if (!v.length) return 0;
    v.sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  };
  return [med(rs), med(gs), med(bs)] as const;
}

function median(v: number[]) {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Radial edge search: cast rays from the seed and stop each one at the first
 * sustained colour break. The MEDIAN ray length is used, so a couple of rays
 * that run into a touching neighbouring bowl (and therefore never break) can
 * not inflate the result — this is what keeps leaning/touching bowls separate.
 */
function radialFit(
  buf: PixelBuffer,
  sx: number,
  sy: number,
  minR: number,
  maxR: number,
  tol: number,
) {
  const seedColour = patchColour(buf, Math.round(sx), Math.round(sy), 2);
  const RAYS = 48;
  const hits: number[] = [];
  const vecs: Array<[number, number]> = [];

  /** Local gradient magnitude along a ray — high exactly on a visible edge. */
  const gradAt = (dx: number, dy: number, d: number) => {
    const ax = Math.round(sx + dx * (d - 1.5));
    const ay = Math.round(sy + dy * (d - 1.5));
    const bx = Math.round(sx + dx * (d + 1.5));
    const by = Math.round(sy + dy * (d + 1.5));
    if (ax < 0 || ay < 0 || bx < 0 || by < 0) return 0;
    if (ax >= buf.w || ay >= buf.h || bx >= buf.w || by >= buf.h) return 0;
    return colourDist(px(buf, ax, ay), px(buf, bx, by));
  };

  for (let i = 0; i < RAYS; i++) {
    const a = (i / RAYS) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let broke = 0;
    let hit = maxR;
    for (let d = 1; d <= maxR; d += 1) {
      const x = Math.round(sx + dx * d);
      const y = Math.round(sy + dy * d);
      if (x < 0 || y < 0 || x >= buf.w || y >= buf.h) {
        hit = d;
        break;
      }
      if (colourDist(px(buf, x, y), seedColour) > tol) {
        broke++;
        if (broke >= 2) {
          hit = Math.max(minR, d - 1);
          break;
        }
      } else {
        broke = 0;
      }
    }

    // EDGE HUGGING: the colour break tells us roughly where the object stops;
    // the strongest local gradient within a small window around it is the
    // VISIBLE outside edge. Snapping to it makes the outline sit on the rim
    // instead of a pixel or two inside the object.
    if (hit < maxR) {
      let best = hit;
      let bestG = gradAt(dx, dy, hit);
      for (let d = Math.max(minR, hit - 3); d <= Math.min(maxR, hit + 4); d += 1) {
        const g = gradAt(dx, dy, d);
        if (g > bestG) {
          bestG = g;
          best = d;
        }
      }
      hit = best;
    }

    hits.push(hit);
    vecs.push([dx * hit, dy * hit]);
  }

  const r = Math.min(maxR, Math.max(minR, median(hits)));
  // Recentre: the mean ray vector points away from the truncated side.
  let mx = 0;
  let my = 0;
  for (const [x, y] of vecs) {
    mx += x;
    my += y;
  }
  mx /= RAYS;
  my /= RAYS;
  const cx = sx + mx * 0.5;
  const cy = sy + my * 0.5;

  // Spread of ray lengths ⇒ how circular / clean the boundary was.
  const spread = median(hits.map((v) => Math.abs(v - r))) / Math.max(1, r);
  const saturated = hits.filter((v) => v >= maxR - 1).length / RAYS;
  const confidence = clamp01((1 - spread * 1.6) * (1 - saturated * 0.8));
  return { cx, cy, r, confidence, saturated };
}


/**
 * Estimate the perimeter of the object under a tap.
 *
 * Method: median-colour sample at the seed → 48-ray radial edge search inside
 * a local window sized for the object kind → robust median radius + gentle
 * recentre. When the boundary is unclear (rays saturate, e.g. two touching
 * bowls of the same colour) the result is flagged `approx` and the tapped
 * point is kept as the position rather than blocking the player.
 *
 * LOCKED OBJECTS (the confirmed jack, previously accepted bowls) are passed in
 * `locked`. They are enforced twice:
 *   1. a seed tap INSIDE a locked object returns `blocked` and nothing is
 *      created;
 *   2. the search window and the recentre step are both constrained so the fit
 *      can never travel from the player's intended bowl onto a locked object.
 * The player's seed tap is always authoritative.
 *
 * @param seed  tap position in normalised IMAGE units.
 * @param jackR when detecting a bowl, the confirmed jack radius (normalised
 *              image width) — used only to bound the search window.
 */
export function detectAtSeed(
  buf: PixelBuffer,
  seed: { x: number; y: number },
  kind: "jack" | "bowl",
  jackR?: number,
  locked: LockedObject[] = [],
): SeedDetection {
  const sx = Math.min(buf.w - 2, Math.max(1, seed.x * buf.w));
  const sy = Math.min(buf.h - 2, Math.max(1, seed.y * buf.h));

  // Locked geometry in pixels.
  const lockedPx = locked.map((o) => ({
    kind: o.kind,
    idx: o.idx,
    x: o.cx * buf.w,
    y: o.cy * buf.h,
    r: Math.max(2, o.r * buf.w),
  }));

  // 1) Seed inside a locked object ⇒ refuse outright.
  for (const o of lockedPx) {
    const d = Math.hypot(sx - o.x, sy - o.y);
    // The jack is small, so a tap within its perimeter (plus a small margin)
    // is unambiguously "that's the jack". Accepted bowls use their own
    // perimeter only, so a touching neighbour can still be tapped.
    const hit = o.kind === "jack" ? o.r * 1.25 : o.r * 0.92;
    if (d <= hit) {
      return {
        cx: sx / buf.w,
        cy: sy / buf.h,
        r: o.r / buf.w,
        confidence: 0,
        approx: true,
        blocked: o.kind,
        blockedIdx: o.idx,
      };
    }
  }

  const minR =
    kind === "jack" ? Math.max(3, buf.w * 0.008) : Math.max(5, buf.w * (jackR ? jackR * 1.1 : 0.02));
  let maxR =
    kind === "jack"
      ? Math.max(minR + 2, buf.w * 0.07)
      : Math.max(minR + 3, buf.w * (jackR ? jackR * 3.6 : 0.13));

  // 2) Never let the search window swallow a locked object.
  for (const o of lockedPx) {
    const gap = Math.hypot(sx - o.x, sy - o.y) - o.r * 0.75;
    if (gap > 0) maxR = Math.min(maxR, Math.max(minR, gap));
  }

  // Jacks are bright and uniform, so a tighter tolerance finds the true rim.
  const tol = kind === "jack" ? 0.16 : 0.2;
  let fit = radialFit(buf, sx, sy, minR, maxR, tol);

  // SECOND PASS: re-fit from the recentred point. The first pass is biased by
  // wherever the finger landed; refitting from the estimated centre makes the
  // outline hug the visible edge all the way round. Only done when the first
  // pass was clean, and only if the new centre stays clear of locked objects.
  if (fit.confidence >= 0.42 && fit.saturated <= 0.45) {
    const nx = Math.min(buf.w - 2, Math.max(1, fit.cx));
    const ny = Math.min(buf.h - 2, Math.max(1, fit.cy));
    const clearOfLocked = lockedPx.every(
      (o) => Math.hypot(nx - o.x, ny - o.y) > o.r * (o.kind === "jack" ? 1.15 : 0.95),
    );
    if (clearOfLocked) {
      const refit = radialFit(buf, nx, ny, minR, maxR, tol);
      if (refit.confidence >= fit.confidence) fit = refit;
    }
  }

  const approx = fit.confidence < 0.42 || fit.saturated > 0.45;
  // When the boundary is unclear keep the player's own tap as the centre.
  let cx = approx ? sx : fit.cx;
  let cy = approx ? sy : fit.cy;


  // 3) Recentring must not drift onto a locked object — fall back to the seed.
  for (const o of lockedPx) {
    if (Math.hypot(cx - o.x, cy - o.y) <= o.r * 0.9) {
      cx = sx;
      cy = sy;
      break;
    }
  }

  return {
    cx: cx / buf.w,
    cy: cy / buf.h,
    r: fit.r / buf.w,
    confidence: fit.confidence,
    approx,
  };
}

/**
 * SMART NEAR-EDGE SNAP (Bowlometer support).
 *
 * Given the bowl the player tapped and the confirmed jack, walk from the bowl
 * centre TOWARDS the jack and find the strongest local colour boundary — the
 * bowl's outside edge facing the jack. A proximity weighting keeps the result
 * near the radius the blob fit already suggested, so a busy background or a
 * touching neighbour cannot drag the edge somewhere silly.
 *
 * Returns a normalised image point: the measurement's bowl end.
 */
export function snapNearEdge(
  buf: PixelBuffer,
  centre: { x: number; y: number },
  jack: { x: number; y: number },
  approxRadius: number,
): { x: number; y: number; confidence: number } {
  const cx = centre.x * buf.w;
  const cy = centre.y * buf.h;
  const jx = jack.x * buf.w;
  const jy = jack.y * buf.h;
  let dx = jx - cx;
  let dy = jy - cy;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;

  const r0 = Math.max(3, approxRadius * buf.w);
  const lo = Math.max(2, r0 * 0.5);
  const hi = Math.min(len * 0.96, r0 * 1.55);
  // Sample five parallel rays so a single noisy pixel cannot win and a short
  // stretch of genuine rim outvotes a speck of grass.
  const offs = [-4, -2, 0, 2, 4];
  let best = Math.min(r0, len * 0.96);
  let bestScore = -1;
  const scores: number[] = [];

  for (let d = lo; d <= hi; d += 0.5) {
    let g = 0;
    let n = 0;
    for (const o of offs) {
      const ox = -dy * o;
      const oy = dx * o;
      const ax = Math.round(cx + ox + dx * (d - 2));
      const ay = Math.round(cy + oy + dy * (d - 2));
      const bx = Math.round(cx + ox + dx * (d + 2));
      const by = Math.round(cy + oy + dy * (d + 2));
      if (ax < 0 || ay < 0 || bx < 0 || by < 0) continue;
      if (ax >= buf.w || ay >= buf.h || bx >= buf.w || by >= buf.h) continue;
      g += colourDist(px(buf, ax, ay), px(buf, bx, by));
      n++;
    }
    if (!n) continue;
    const prox = 1 - Math.abs(d - r0) / (r0 * 0.9 + 1);
    const score = (g / n) * (0.6 + 0.4 * Math.max(0, prox));
    scores.push(score);
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }

  /**
   * EDGE CONFIDENCE — how much the winning boundary stands out from the rest
   * of the walk. A crisp rim beats the background comfortably; a soft shadow
   * or a touching neighbour does not, and the caller then shows
   * "Check bowl edge" instead of pretending the snap is exact.
   */
  const mean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const contrast = mean > 0 ? bestScore / mean - 1 : 0;
  const absolute = clamp01(bestScore / 0.16);
  const confidence = clamp01(Math.min(clamp01(contrast / 0.9), absolute) * (scores.length > 6 ? 1 : 0.6));

  return { x: (cx + dx * best) / buf.w, y: (cy + dy * best) / buf.h, confidence };
}

/* ==========================================================================
 * CONFIDENCE TIERS
 * Pure classification helpers — no measurement, scoring or versioning logic.
 * ========================================================================== */

export type FitTier = "high" | "medium" | "low";

/**
 * JACK FIT TIER. The jack is the photograph's ruler, so its fit is graded on
 * BOTH how clean the local perimeter was and how many SOURCE pixels it covers
 * (a jack only a few pixels across cannot calibrate anything reliably).
 *
 * Real-world high-resolution tests that measured within ~1% had jack radii of
 * roughly 25–35 source pixels, so that is treated as comfortable rather than
 * as a hard cut-off.
 */
export function jackFitTier(confidence: number, radiusSourcePx: number): FitTier {
  if (radiusSourcePx < JACK_MIN_RADIUS_PX) return "low";
  if (confidence >= 0.62 && radiusSourcePx >= JACK_COMFORTABLE_RADIUS_PX) return "high";
  if (confidence >= 0.4) return "medium";
  return "low";
}

/** Below this the jack is too few pixels across to calibrate confidently. */
export const JACK_MIN_RADIUS_PX = 12;
/** At or above this the jack is comfortably resolved in the source image. */
export const JACK_COMFORTABLE_RADIUS_PX = 22;

/** BOWL NEAR-EDGE TIER — drives the subtle "Check bowl edge" nudge only. */
export function bowlEdgeTier(confidence: number): FitTier {
  if (confidence >= 0.55) return "high";
  if (confidence >= 0.3) return "medium";
  return "low";
}

