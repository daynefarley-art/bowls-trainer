/**
 * HEAD SCAN GEOMETRY — image pixels → real distances on the green.
 *
 * WHY THIS EXISTS
 * ---------------
 * Head Scan originally converted image distance to millimetres with ONE flat
 * scale factor taken from the jack ("the jack is 63.5 mm wide, so N pixels =
 * 1 mm everywhere in this photo"). That is only true for a photograph taken
 * straight down over the head.
 *
 * The real workflow asks the player to stand BEHIND the jack and aim TOWARDS
 * the bowls, so the camera looks along the ground at a shallow angle. Under
 * that view the green is foreshortened: ground further from the camera
 * occupies far fewer pixels per millimetre than ground at the jack. A single
 * jack-derived scale therefore UNDER-reads every distance beyond the jack —
 * which is exactly why a bowl 1.3 m away was landing inside 2 mats.
 *
 * The fix is to stop measuring in the image and measure on the GROUND.
 * A pinhole camera looking at a flat plane is fully determined by
 *
 *   • the camera pitch (how far the phone is tilted from straight-down), and
 *   • one object of known size to fix the absolute scale (the jack).
 *
 * The pitch comes from the device orientation sensor at the moment the photo
 * is taken. Both image points are back-projected onto the ground plane, the
 * distance is taken THERE, and the jack radius is subtracted to give the
 * edge-to-edge gap.
 *
 * IMPORTANT: with pitch = 90° (straight down) the maths reduces EXACTLY to the
 * previous flat scale, so an overhead scan — and every historical result — is
 * numerically unchanged.
 *
 * Nothing here is user-facing: millimetres never reach the UI.
 */

/** Regulation jack: 63.5 mm diameter. The only known-size object in frame. */
export const JACK_DIAMETER_MM = 63.5;

/**
 * Horizontal field of view assumed for a phone rear camera (~26 mm
 * equivalent). Only affects perspective correction strength; at pitch 90° it
 * cancels out completely.
 */
export const DEFAULT_FOV_H_DEG = 66;

/**
 * Assumed HORIZONTAL optical centre, in normalised image width units.
 * 0.5 = the optical axis passes through the middle of the frame, which is what
 * the production model has always assumed. Only the calibration/diagnostics
 * route can pass anything else.
 */
export const DEFAULT_PRINCIPAL_POINT_X = 0.5;

/** Straight down. The pitch used whenever no sensor reading is available. */
export const OVERHEAD_PITCH_DEG = 90;


export type GroundPoint = {
  /** Lateral offset, +right of the camera, in millimetres. */
  x: number;
  /** Distance away from the camera along the ground, in millimetres. */
  y: number;
};

export type GroundSolution = {
  jack: GroundPoint;
  bowl: GroundPoint;
  /** Centre of jack → bowl edge point, on the ground, in millimetres. */
  centreMm: number;
  /** Edge-to-edge gap: centre distance − jack radius. Never negative. */
  gapMm: number;
  /** Millimetres represented by the jack's own radius (always 31.75). */
  jackRadiusMm: number;
  /** True when the perspective model was used rather than the flat fallback. */
  perspective: boolean;
  /**
   * DIAGNOSTIC ONLY — the solver's own intermediate values, exposed so a real
   * capture can be exported and audited. Nothing here feeds back into the
   * maths; removing this field would not change a single measurement.
   */
  debug: {
    fovHDeg: number;
    tanH: number;
    tanV: number;
    /** Pitch actually used after the 5°–90° clamp, in degrees. */
    pitchUsedDeg: number;
    pitchInputDeg: number;
    aspect: number;
    /** Horizontal optical centre used (0.5 in production). */
    principalPointX: number;
    /** Radial distortion coefficient used (0 in production). */
    k1: number;
    /** Jack image radius after the 0.002 floor, normalised image width. */
    jackRadiusNorm: number;
    jackDepthMm: number;
    /** Back-projected camera-height units for the jack, before scaling. */
    jackUnit: { x: number; y: number; depth: number } | null;
    bowlUnit: { x: number; y: number; depth: number } | null;
    mmPerUnit: number | null;
    /** Ground distance before the jack radius is subtracted. */
    rawCentreMm: number;
    jackRadiusSubtractedMm: number;
  };
};


const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Back-project a normalised image point onto the ground plane.
 *
 * Camera frame: x right, y down, z forward. The camera is pitched `pitch`
 * radians below the horizon, at unit height. Returns ground coordinates in
 * CAMERA-HEIGHT units (scale is fixed later by the jack), plus the depth of
 * that point along the optical axis in the same units.
 */
function backProject(
  nx: number,
  ny: number,
  aspect: number,
  pitch: number,
  tanH: number,
  tanVOverride?: number | null,
  principalPointX: number = DEFAULT_PRINCIPAL_POINT_X,
  k1: number = 0,
): { x: number; y: number; depth: number } | null {
  const tanV = tanVOverride ?? tanH / (aspect > 0 ? aspect : 1);
  // Horizontal ray position is measured from the OPTICAL CENTRE, which is
  // 0.5 (frame centre) in production and only differs under calibration.
  let tx = (nx - principalPointX) * 2 * tanH;
  let ty = (ny - 0.5) * 2 * tanV;

  // CALIBRATION ONLY — single-coefficient Brown radial model applied around
  // the optical centre in normalised camera coordinates. k1 = 0 in production,
  // which makes this a strict no-op.
  if (k1 !== 0) {
    const r2 = tx * tx + ty * ty;
    const f = 1 + k1 * r2;
    tx *= f;
    ty *= f;
  }

  const sp = Math.sin(pitch);
  const cp = Math.cos(pitch);

  // Downward component of the ray. <= 0 means the point is on or above the
  // horizon and can never meet the ground.
  const down = ty * cp + sp;
  if (down <= 0.02) return null;

  const t = 1 / down; // camera height = 1
  return { x: tx * t, y: (cp - ty * sp) * t, depth: t };
}

/** Vertical FOV the production model derives from FOV-H and the aspect. */
export function derivedFovVDeg(fovHDeg: number, aspect: number): number {
  const tanH = Math.tan(rad(fovHDeg) / 2);
  const tanV = tanH / (aspect > 0 ? aspect : 1);
  return (Math.atan(tanV) * 2 * 180) / Math.PI;
}


/**
 * Solve the head geometry for ONE bowl edge point.
 *
 * @param jack     jack centre (normalised image units) + radius in normalised
 *                 image WIDTH units, as measured from the photo.
 * @param bowlEdge the bowl's outside edge nearest the jack (normalised image).
 * @param aspect   image width / height.
 * @param pitchDeg camera pitch below the horizon: 90 = straight down.
 * @param fovVDeg  QA/CALIBRATION ONLY. When omitted (production) the vertical
 *                 FOV is derived from FOV-H and the aspect exactly as before.
 * @param principalPointX CALIBRATION ONLY. Horizontal optical centre in
 *                 normalised image units; production always uses 0.5.
 */
export function solveGround(
  jack: { x: number; y: number; radius: number },
  bowlEdge: { x: number; y: number },
  aspect: number,
  pitchDeg: number = OVERHEAD_PITCH_DEG,
  fovHDeg: number = DEFAULT_FOV_H_DEG,
  fovVDeg?: number | null,
  principalPointX: number = DEFAULT_PRINCIPAL_POINT_X,
  /** CALIBRATION ONLY. Radial distortion coefficient; production uses 0. */
  k1: number = 0,
): GroundSolution {
  const jackRadiusMm = JACK_DIAMETER_MM / 2;
  const r = Math.max(jack.radius, 0.002);
  const tanH = Math.tan(rad(fovHDeg) / 2);
  const tanV = fovVDeg != null ? Math.tan(rad(fovVDeg) / 2) : tanH / (aspect > 0 ? aspect : 1);
  const ppx = Number.isFinite(principalPointX) ? principalPointX : DEFAULT_PRINCIPAL_POINT_X;
  const k1Used = Number.isFinite(k1) ? k1 : 0;

  // Depth of the jack along the optical axis, in millimetres. An object of
  // physical size S at depth z spans S/z in tangent units, and the full image
  // width spans 2·tanH.
  const jackDepthMm = JACK_DIAMETER_MM / (2 * r * 2 * tanH);

  const pitchUsedDeg = Math.min(90, Math.max(5, pitchDeg));
  const pitch = rad(pitchUsedDeg);
  const gj = backProject(jack.x, jack.y, aspect, pitch, tanH, tanV, ppx, k1Used);
  const gb = backProject(bowlEdge.x, bowlEdge.y, aspect, pitch, tanH, tanV, ppx, k1Used);

  const baseDebug = {
    fovHDeg,
    tanH,
    tanV,
    pitchUsedDeg,
    pitchInputDeg: pitchDeg,
    aspect,
    principalPointX: ppx,
    k1: k1Used,
    jackRadiusNorm: r,
    jackDepthMm,
    jackUnit: gj,
    bowlUnit: gb,
  };



  if (gj && gb) {
    // Fix absolute scale: the jack's back-projected depth must equal its
    // physically derived depth.
    const mmPerUnit = jackDepthMm / gj.depth;
    const jp = { x: gj.x * mmPerUnit, y: gj.y * mmPerUnit };
    const bp = { x: gb.x * mmPerUnit, y: gb.y * mmPerUnit };
    const centreMm = Math.hypot(bp.x - jp.x, bp.y - jp.y);
    return {
      jack: jp,
      bowl: bp,
      centreMm,
      gapMm: Math.max(0, centreMm - jackRadiusMm),
      jackRadiusMm,
      perspective: pitchDeg < 88,
      debug: {
        ...baseDebug,
        mmPerUnit,
        rawCentreMm: centreMm,
        jackRadiusSubtractedMm: jackRadiusMm,
      },
    };
  }

  // FLAT FALLBACK — identical to the original overhead-only model. Used when a
  // point lands above the horizon (an impossible ground point), so a bad pitch
  // reading can never produce a wild measurement.
  const perUnit = jackRadiusMm / r;
  const jp = { x: 0, y: 0 };
  const bp = {
    x: (bowlEdge.x - jack.x) * perUnit,
    // tanV/tanH is exactly 1/aspect in production; only a calibration-mode
    // independent vertical FOV can make it differ.
    y: -(bowlEdge.y - jack.y) * (tanV / tanH) * perUnit,
  };

  const centreMm = Math.hypot(bp.x, bp.y);
  return {
    jack: jp,
    bowl: bp,
    centreMm,
    gapMm: Math.max(0, centreMm - jackRadiusMm),
    jackRadiusMm,
    perspective: false,
    debug: {
      ...baseDebug,
      mmPerUnit: null,
      rawCentreMm: centreMm,
      jackRadiusSubtractedMm: jackRadiusMm,
    },
  };
}


/**
 * TEST/QA HELPER — the forward camera model.
 *
 * Projects a ground point (millimetres, camera at the origin looking along
 * +y) back into normalised image coordinates, so the solver can be validated
 * against known real-world edge-to-edge distances.
 */
export function projectGround(
  point: GroundPoint,
  cameraHeightMm: number,
  aspect: number,
  pitchDeg: number,
  fovHDeg: number = DEFAULT_FOV_H_DEG,
): { x: number; y: number; depth: number } | null {
  const pitch = rad(pitchDeg);
  const tanH = Math.tan(rad(fovHDeg) / 2);
  const tanV = tanH / (aspect > 0 ? aspect : 1);

  // World → camera. Camera at (0, 0, H), z up, y forward.
  const wx = point.x;
  const wy = point.y;
  const wz = -cameraHeightMm;

  const sp = Math.sin(pitch);
  const cp = Math.cos(pitch);
  // Camera basis in world terms (see backProject): forward (0, cp, -sp),
  // down (0, -sp, -cp), right (1, 0, 0).
  const depth = wy * cp + wz * -sp;
  const camY = wy * -sp + wz * -cp;
  if (depth <= 0) return null;

  return {
    x: wx / depth / (2 * tanH) + 0.5,
    y: camY / depth / (2 * tanV) + 0.5,
    depth,
  };
}
