/**
 * scoring.js
 * Turns MediaPipe pose landmarks into a 0-10 posture score plus
 * labeled issues, and detects which way the person is facing the
 * camera (front/left/right).
 *
 * FACING DETECTION - v2:
 * The first version used each landmark's `visibility` score (MediaPipe's
 * confidence that a point isn't occluded) to tell front from profile.
 * In testing, the app got stuck reporting "front" no matter which way the
 * person turned - a strong sign that this PoseLandmarker model/config
 * doesn't populate `visibility` meaningfully (it likely defaults to ~1
 * for every point), so the "is one ear hidden?" check never fired.
 *
 * v2 instead uses two signals that come from landmark POSITION, not a
 * confidence score, so they can't silently default to a constant:
 *   1. earRatio - how far apart the two ears appear in the image,
 *      relative to shoulder width. Facing the camera, both ears are
 *      spread out near the sides of the head. Turned to a profile, the
 *      far ear swings behind the near one and they collapse together.
 *   2. shoulderZDiff - which shoulder MediaPipe's depth estimate places
 *      closer to the camera. Used only to decide WHICH way (left/right)
 *      once earRatio says "turned".
 * The exact threshold/sign below are a first guess and may need
 * adjusting from real test numbers - see DEBUG export.
 */

const LM = {
  NOSE: 0,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
};

const DEFAULT_BASELINE = {
  leanAngle: 8,
  earOffset: 0.08,
  tilt: 0.03,
  earRatio: null,
};

export function computeMetrics(landmarks) {
  const ear = averagePoint3D(landmarks[LM.LEFT_EAR], landmarks[LM.RIGHT_EAR]);
  const shoulder = averagePoint3D(landmarks[LM.LEFT_SHOULDER], landmarks[LM.RIGHT_SHOULDER]);
  const hip = averagePoint3D(landmarks[LM.LEFT_HIP], landmarks[LM.RIGHT_HIP]);
  const shoulderWidth3D = distance3D(landmarks[LM.LEFT_SHOULDER], landmarks[LM.RIGHT_SHOULDER]) || 1;

  const leanAngle = angleBetween3D(subtract3D(shoulder, hip), subtract3D(ear, shoulder));

  const dx = ear.x - shoulder.x;
  const dz = ear.z - shoulder.z;
  const earOffset = Math.hypot(dx, dz) / shoulderWidth3D;

  const tilt = Math.abs(landmarks[LM.LEFT_SHOULDER].y - landmarks[LM.RIGHT_SHOULDER].y) / shoulderWidth3D;

  const shoulderWidth2D = distance2D(landmarks[LM.LEFT_SHOULDER], landmarks[LM.RIGHT_SHOULDER]) || 1;
  const earWidth2D = distance2D(landmarks[LM.LEFT_EAR], landmarks[LM.RIGHT_EAR]);
  const earRatio = earWidth2D / shoulderWidth2D;

  return { leanAngle, earOffset, tilt, earRatio };
}

/** Raw numbers behind facing detection, exposed so the UI can show a
 *  live debug readout while we tune thresholds against real test data. */
export function computeFacingSignals(landmarks) {
  const shoulderWidth2D = distance2D(landmarks[LM.LEFT_SHOULDER], landmarks[LM.RIGHT_SHOULDER]) || 1;
  const earWidth2D = distance2D(landmarks[LM.LEFT_EAR], landmarks[LM.RIGHT_EAR]);
  const earRatio = earWidth2D / shoulderWidth2D;
  const shoulderZDiff = (landmarks[LM.LEFT_SHOULDER].z ?? 0) - (landmarks[LM.RIGHT_SHOULDER].z ?? 0);
  const leftVis = landmarks[LM.LEFT_EAR].visibility ?? null;
  const rightVis = landmarks[LM.RIGHT_EAR].visibility ?? null;
  return { earRatio, shoulderZDiff, leftVis, rightVis };
}

/**
 * front/left/right/unclear. See file header - v2, position-based.
 * TURN_THRESHOLD: below this earRatio, we consider the person turned
 * away from front. Starting guess: 0.35 - adjust based on real readings
 * (if front-facing readings often come in under 0.35, raise it; if
 * turned readings stay above it, lower it).
 */
/**
 * Classifies a (possibly smoothed) facing-signal reading against the
 * person'''s OWN three calibration holds, by simple nearest-match -
 * whichever of front/left/right the current reading looks most like.
 * This replaces an earlier fixed-threshold version: a single hardcoded
 * number/sign could not account for per-person, per-camera differences,
 * which is why detection was unreliable (especially for "right").
 * centroids = { front: {earRatio, shoulderZDiff}, left: {...}, right: {...} }
 * built from averaging each calibration hold'''s samples.
 */
export function classifyFacing(signals, centroids) {
  const keys = ["earRatio", "shoulderZDiff"];
  const ranges = {};
  keys.forEach((k) => {
    const vals = [centroids.front[k], centroids.left[k], centroids.right[k]];
    ranges[k] = (Math.max(...vals) - Math.min(...vals)) || 1;
  });
  function dist(c) {
    return keys.reduce((sum, k) => {
      const d = (signals[k] - c[k]) / ranges[k];
      return sum + d * d;
    }, 0);
  }
  const d = { front: dist(centroids.front), left: dist(centroids.left), right: dist(centroids.right) };
  return Object.keys(d).reduce((best, key) => (d[key] < d[best] ? key : best), "front");
}

export function scorePosture(landmarks, baseline = null) {
  const m = computeMetrics(landmarks);
  const base = baseline || DEFAULT_BASELINE;
  const calibrated = Boolean(baseline && baseline.earRatio && baseline.earRatio > 0.05);

  const leanPenalty = clamp((m.leanAngle - base.leanAngle) / 22, 0, 1);
  const offsetPenalty = clamp((m.earOffset - base.earOffset) / 0.35, 0, 1);
  const tiltPenalty = clamp((m.tilt - base.tilt) / 0.15, 0, 1);

  let ratioPenalty = 0;
  if (calibrated) {
    const relativeGrowth = (m.earRatio - base.earRatio) / base.earRatio;
    ratioPenalty = clamp(relativeGrowth / 0.45, 0, 1);
  }

  const weights = calibrated
    ? { lean: 0.25, offset: 0.2, tilt: 0.15, ratio: 0.4 }
    : { lean: 0.5, offset: 0.35, tilt: 0.15, ratio: 0 };

  const totalPenalty =
    leanPenalty * weights.lean +
    offsetPenalty * weights.offset +
    tiltPenalty * weights.tilt +
    ratioPenalty * weights.ratio;

  const score = Math.round((10 - totalPenalty * 10) * 10) / 10;

  const issues = [];
  if (leanPenalty > 0.25 || ratioPenalty > 0.25) {
    issues.push({ id: "forward_head", severity: Math.max(leanPenalty, ratioPenalty), message: "Your head is leaning forward — the most common driver of tech neck." });
  }
  if (offsetPenalty > 0.25) {
    issues.push({ id: "ear_forward", severity: offsetPenalty, message: "Your ears sit noticeably in front of your shoulders." });
  }
  if (tiltPenalty > 0.25) {
    issues.push({ id: "shoulder_tilt", severity: tiltPenalty, message: "One shoulder is sitting higher than the other." });
  }

  let label = "good";
  if (score < 7.5) label = "fair";
  if (score < 5) label = "poor";

  return { score, label, calibrated, metrics: m, issues: issues.sort((a, b) => b.severity - a.severity) };
}

function averagePoint3D(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z || 0) + (b.z || 0)) / 2 }; }
function subtract3D(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) }; }
function distance3D(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0)); }
function distance2D(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function angleBetween3D(v1, v2) {
  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const mag1 = Math.hypot(v1.x, v1.y, v1.z) || 1e-6;
  const mag2 = Math.hypot(v2.x, v2.y, v2.z) || 1e-6;
  return Math.acos(clamp(dot / (mag1 * mag2), -1, 1)) * (180 / Math.PI);
}
function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

export { LM };
