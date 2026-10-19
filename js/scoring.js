/**
 * scoring.js
 * Turns MediaPipe pose landmarks into a 0-10 posture score plus
 * labeled issues, and detects which way the person is facing the
 * camera (front/left/right) so the UI can auto-capture only when
 * they're actually in the right position for the current step.
 *
 * WHY CALIBRATION EXISTS:
 * A single webcam estimates depth (z) indirectly and often can't see your
 * hips at all when you're sitting close to a laptop. Fixed, universal
 * thresholds also don't account for different body proportions or camera
 * distances. The fix: record the person's own neutral posture as a
 * baseline - including how wide their head appears relative to their
 * shoulders (earRatio), an optical cue that doesn't depend on MediaPipe's
 * z estimate - and score everything as a DEVIATION FROM THEIR OWN BASELINE.
 * The "spin calibration" flow in camera.html captures a separate baseline
 * for front, left, and right so each view is judged against what GOOD
 * posture looks like from that same angle, not a single frontal reference.
 *
 * This is a heuristic, geometry-based score. It is NOT a medical
 * measurement and should never be presented as a diagnosis.
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

/**
 * Classifies which way the person is facing the camera using how
 * CONFIDENT MediaPipe is that it can actually see each ear (its
 * "visibility" score drops when a landmark is turned away / occluded,
 * separate from where it thinks the landmark is).
 *   - Both ears clearly visible, similarly confident -> "front"
 *   - Left ear much more visible than right -> person has turned to
 *     show their LEFT side to the camera -> "left"
 *   - Right ear much more visible than left -> "right"
 *   - Ambiguous (mid-turn, bad lighting, etc.) -> "unclear"
 *
 * These thresholds (0.6 / 0.25 / 0.3) are starting points, not tuned
 * against real users yet - adjust them based on testing.
 */
export function detectFacing(landmarks) {
  const leftEar = landmarks[LM.LEFT_EAR];
  const rightEar = landmarks[LM.RIGHT_EAR];
  const leftVis = leftEar.visibility ?? 1;
  const rightVis = rightEar.visibility ?? 1;
  const diff = leftVis - rightVis;

  if (leftVis > 0.6 && rightVis > 0.6 && Math.abs(diff) < 0.25) return "front";
  if (diff > 0.3) return "left";
  if (diff < -0.3) return "right";
  return "unclear";
}

export function scorePosture(landmarks, baseline = null) {
  const m = computeMetrics(landmarks);
  const base = baseline || DEFAULT_BASELINE;
  // Guard against dividing by a near-zero earRatio baseline (can happen
  // for a side-view baseline where one ear is barely visible) - treat
  // that as "not calibrated for this signal" rather than letting the
  // division blow up into a nonsense penalty.
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
    issues.push({
      id: "forward_head",
      severity: Math.max(leanPenalty, ratioPenalty),
      message: "Your head is leaning forward — the most common driver of tech neck.",
    });
  }
  if (offsetPenalty > 0.25) {
    issues.push({
      id: "ear_forward",
      severity: offsetPenalty,
      message: "Your ears sit noticeably in front of your shoulders.",
    });
  }
  if (tiltPenalty > 0.25) {
    issues.push({
      id: "shoulder_tilt",
      severity: tiltPenalty,
      message: "One shoulder is sitting higher than the other.",
    });
  }

  let label = "good";
  if (score < 7.5) label = "fair";
  if (score < 5) label = "poor";

  return {
    score,
    label,
    calibrated,
    metrics: m,
    issues: issues.sort((a, b) => b.severity - a.severity),
  };
}

function averagePoint3D(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z || 0) + (b.z || 0)) / 2 };
}
function subtract3D(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) };
}
function distance3D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
}
function distance2D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function angleBetween3D(v1, v2) {
  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const mag1 = Math.hypot(v1.x, v1.y, v1.z) || 1e-6;
  const mag2 = Math.hypot(v2.x, v2.y, v2.z) || 1e-6;
  const cos = clamp(dot / (mag1 * mag2), -1, 1);
  return Math.acos(cos) * (180 / Math.PI);
}
function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

export { LM };
