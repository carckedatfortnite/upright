/**
 * scoring.js
 * Turns MediaPipe pose landmarks into a 0-10 posture score plus
 * labeled issues.
 *
 * WHY CALIBRATION EXISTS:
 * A single webcam estimates depth (z) indirectly and often can't see your
 * hips at all when you're sitting close to a laptop (they're below the
 * frame/behind the desk). That makes "forward lean" hard to detect
 * reliably from a front-facing camera using fixed, universal angle
 * thresholds alone - slouching toward the screen barely moves your ear
 * sideways (x), only toward the camera (z), and generic thresholds don't
 * account for different body proportions or camera distances anyway.
 *
 * The fix: let the person calibrate once by sitting up straight. We record
 * their own neutral posture as a baseline - including how wide their head
 * appears relative to their shoulders (earRatio below), which grows
 * optically as a head leans closer to the camera than the shoulders,
 * independent of MediaPipe's z estimate. Everything is then scored as a
 * DEVIATION FROM THEIR OWN BASELINE rather than a one-size-fits-all number.
 *
 * Without calibration, we fall back to generic thresholds (less accurate,
 * especially front-on) so the app still works before someone calibrates.
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

// Fallback baseline used until the person calibrates. Rough,
// literature-informed starting points, not clinical cutoffs.
const DEFAULT_BASELINE = {
  leanAngle: 8,
  earOffset: 0.08,
  tilt: 0.03,
  earRatio: null, // no safe universal default - varies by face/camera distance
};

/** Computes the four raw geometric signals from one frame of landmarks.
 *  Exported so camera.html can call this directly during calibration. */
export function computeMetrics(landmarks) {
  const ear = averagePoint3D(landmarks[LM.LEFT_EAR], landmarks[LM.RIGHT_EAR]);
  const shoulder = averagePoint3D(landmarks[LM.LEFT_SHOULDER], landmarks[LM.RIGHT_SHOULDER]);
  const hip = averagePoint3D(landmarks[LM.LEFT_HIP], landmarks[LM.RIGHT_HIP]);
  const shoulderWidth3D = distance3D(landmarks[LM.LEFT_SHOULDER], landmarks[LM.RIGHT_SHOULDER]) || 1;

  // Angle between torso (hip->shoulder) and neck (shoulder->ear) in 3D.
  // Most useful from the side; degrades when hips aren't visible.
  const leanAngle = angleBetween3D(subtract3D(shoulder, hip), subtract3D(ear, shoulder));

  // Ear-to-shoulder offset (horizontal + depth), normalized by shoulder width.
  const dx = ear.x - shoulder.x;
  const dz = ear.z - shoulder.z;
  const earOffset = Math.hypot(dx, dz) / shoulderWidth3D;

  // Shoulder height difference - lateral tilt, stays 2D on purpose.
  const tilt = Math.abs(landmarks[LM.LEFT_SHOULDER].y - landmarks[LM.RIGHT_SHOULDER].y) / shoulderWidth3D;

  // Image-plane (2D only, no estimated depth) ratio of how wide the head
  // is versus the shoulders. This is a real optical perspective cue: lean
  // your head toward the camera while shoulders stay put, and your head
  // visually grows relative to your shoulders. Works from the front.
  const shoulderWidth2D = distance2D(landmarks[LM.LEFT_SHOULDER], landmarks[LM.RIGHT_SHOULDER]) || 1;
  const earWidth2D = distance2D(landmarks[LM.LEFT_EAR], landmarks[LM.RIGHT_EAR]);
  const earRatio = earWidth2D / shoulderWidth2D;

  return { leanAngle, earOffset, tilt, earRatio };
}

/**
 * Main entry point.
 * @param {Array} landmarks - one frame of MediaPipe pose landmarks
 * @param {Object|null} baseline - result of a calibration capture (see
 *   camera.html), or null to use generic fallback thresholds.
 * Returns: { score, label, metrics, issues }
 */
export function scorePosture(landmarks, baseline = null) {
  const m = computeMetrics(landmarks);
  const base = baseline || DEFAULT_BASELINE;
  const calibrated = Boolean(baseline && baseline.earRatio);

  const leanPenalty = clamp((m.leanAngle - base.leanAngle) / 22, 0, 1);
  const offsetPenalty = clamp((m.earOffset - base.earOffset) / 0.35, 0, 1);
  const tiltPenalty = clamp((m.tilt - base.tilt) / 0.15, 0, 1);

  // Relative growth in head-width-vs-shoulders compared to the person's
  // own calibrated baseline. Only active once calibrated - there's no
  // universal "normal" ratio since it depends on face size and camera
  // distance per person.
  let ratioPenalty = 0;
  if (calibrated) {
    const relativeGrowth = (m.earRatio - base.earRatio) / base.earRatio;
    ratioPenalty = clamp(relativeGrowth / 0.45, 0, 1); // ~45% optical growth = full penalty
  }

  // Weight the camera-view-robust ratio signal heavily once available;
  // otherwise lean on the angle/offset signals as before.
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
