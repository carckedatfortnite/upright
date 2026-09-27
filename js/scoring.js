/**
 * scoring.js
 * Turns MediaPipe pose landmarks into a 0-10 posture score plus
 * labeled issues, so the UI and the exercise-recommendation engine
 * can both consume a single, well-defined shape.
 *
 * IMPORTANT: This is a heuristic, geometry-based score (angles between
 * ear/shoulder/hip landmarks). It is NOT a medical measurement and
 * should never be presented as a diagnosis - see README for the
 * disclaimer language used throughout the app.
 */

// MediaPipe Pose landmark indices we care about
const LM = {
  NOSE: 0,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
};

/** Angle (degrees) of the line from hip to ear, measured from vertical.
 *  0 = perfectly upright. Larger = more forward head lean. */
function forwardLeanAngle(landmarks) {
  const ear = averagePoint(landmarks[LM.LEFT_EAR], landmarks[LM.RIGHT_EAR]);
  const hip = averagePoint(landmarks[LM.LEFT_HIP], landmarks[LM.RIGHT_HIP]);
  const dx = ear.x - hip.x;
  const dy = hip.y - ear.y; // y grows downward in image coords
  const radians = Math.atan2(Math.abs(dx), Math.abs(dy));
  return radians * (180 / Math.PI);
}

/** How far forward the ear sits relative to the shoulder, as a
 *  fraction of shoulder width. Classic "tech neck" signal. */
function earShoulderOffset(landmarks) {
  const ear = averagePoint(landmarks[LM.LEFT_EAR], landmarks[LM.RIGHT_EAR]);
  const shoulder = averagePoint(landmarks[LM.LEFT_SHOULDER], landmarks[LM.RIGHT_SHOULDER]);
  const shoulderWidth = distance(landmarks[LM.LEFT_SHOULDER], landmarks[LM.RIGHT_SHOULDER]) || 1;
  return Math.abs(ear.x - shoulder.x) / shoulderWidth;
}

/** Difference in shoulder height, as a fraction of shoulder width.
 *  Flags lateral (side-to-side) imbalance. */
function shoulderTilt(landmarks) {
  const shoulderWidth = distance(landmarks[LM.LEFT_SHOULDER], landmarks[LM.RIGHT_SHOULDER]) || 1;
  return Math.abs(landmarks[LM.LEFT_SHOULDER].y - landmarks[LM.RIGHT_SHOULDER].y) / shoulderWidth;
}

function averagePoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Main entry point. Returns:
 * {
 *   score: 0-10 (higher is better),
 *   label: "good" | "fair" | "poor",
 *   metrics: { leanAngle, earOffset, tilt },
 *   issues: [{ id, severity, message }]
 * }
 */
export function scorePosture(landmarks) {
  const leanAngle = forwardLeanAngle(landmarks);   // degrees, 0 = ideal
  const earOffset = earShoulderOffset(landmarks);  // 0 = ideal
  const tilt = shoulderTilt(landmarks);            // 0 = ideal

  // Each metric is penalized past a comfortable threshold.
  // Thresholds are rough, literature-informed starting points, not
  // clinical cutoffs - tune these as you test with real users.
  const leanPenalty = clamp((leanAngle - 8) / 22, 0, 1);     // 8°-30° range
  const offsetPenalty = clamp((earOffset - 0.08) / 0.35, 0, 1);
  const tiltPenalty = clamp((tilt - 0.03) / 0.15, 0, 1);

  const totalPenalty = (leanPenalty * 0.5) + (offsetPenalty * 0.35) + (tiltPenalty * 0.15);
  const score = Math.round((10 - totalPenalty * 10) * 10) / 10;

  const issues = [];
  if (leanPenalty > 0.25) {
    issues.push({
      id: "forward_head",
      severity: leanPenalty,
      message: "Your head is leaning forward of your hips — the most common driver of tech neck.",
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
    metrics: { leanAngle, earOffset, tilt },
    issues: issues.sort((a, b) => b.severity - a.severity),
  };
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

export { LM };
