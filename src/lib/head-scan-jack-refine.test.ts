import { describe, it, expect } from "vitest";
import { refineJackCircle } from "@/lib/head-scan-jack-refine";

/** Synthetic bright disc on a green surface, with soft antialiased edge. */
function disc(w: number, h: number, cx: number, cy: number, r: number) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const t = Math.max(0, Math.min(1, r + 0.5 - d));
      const i = (y * w + x) * 4;
      data[i] = 40 + t * 205;
      data[i + 1] = 110 + t * 135;
      data[i + 2] = 50 + t * 190;
      data[i + 3] = 255;
    }
  }
  return { data, w, h };
}

describe("jack radius auto-refinement", () => {
  it("recovers a subpixel radius from a rough user circle", () => {
    const buf = disc(400, 300, 200, 150, 24.4);
    const fit = refineJackCircle(buf, { x: 203 / 400, y: 148 / 300, r: 21 / 400 });
    expect(fit).toBeTruthy();
    expect(Math.abs(fit!.rPx - 24.4)).toBeLessThan(1.5);
    expect(Math.abs(fit!.cxPx - 200)).toBeLessThan(1.5);
    expect(Math.abs(fit!.cyPx - 150)).toBeLessThan(1.5);
    expect(fit!.rPx % 1).not.toBe(0);
    expect(fit!.raysAccepted).toBeGreaterThan(100);
  });

  it("rejects outlier rays and still fits the true circle", () => {
    const buf = disc(400, 300, 200, 150, 22);
    // A dark shadow blob outside the jack, which would drag a naive fit out.
    for (let y = 120; y < 140; y++) {
      for (let x = 240; x < 270; x++) {
        const i = (y * 400 + x) * 4;
        buf.data[i] = 5;
        buf.data[i + 1] = 5;
        buf.data[i + 2] = 5;
      }
    }
    const fit = refineJackCircle(buf, { x: 200 / 400, y: 150 / 300, r: 22 / 400 });
    expect(fit).toBeTruthy();
    expect(Math.abs(fit!.rPx - 22)).toBeLessThan(2);
    expect(fit!.residualRmsPx).toBeLessThan(2);
  });
});
