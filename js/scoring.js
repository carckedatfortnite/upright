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

/**
 * Angle (degrees) between the torso vector (hip -> shoulder) and the
 * neck vector (shoulder -> ear), computed in full 3D.
 *
 * Using the angle between two BODY-relative vectors (rather than
 * comparing the ear to a camera-relative "vertical") is what makes this
 * work regardless of whether the camera sees you from the front or the
 * side: slouching from the front mostly moves the head in z (depth,
 * toward the camera), while slouching viewed from the side mostly moves
 * the head in x. A 2D-only, x/y measurement (the original version of
 * this function) misses the front-view case entirely. 0 = ear directly
 * in line with the torso. Larger = more forward head lean.
 */
function forwardLeanAngle(landmarks) {
  const ear = averagePoint3D(landmarks[LM.LEFT_EAR], landmarks[LM.RIGHT_EAR]);
  const shoulder = averagePoint3D(landmarks[LM.LEFT_SHOULDER], landmarks[LM.RIGHT_SHOULDER]);
  const hip = averagePoint3D(landmarks[LM.LEFT_HIP], landmarks[LM.RIGHT_HIP]);

  const torso = subtract3D(shoulder, hip);
  const neck = subtract3D(ear, shoulder);
  return angleBetween3D(torso, neck);
}

/** 3D distance from the ear to the shoulder, normalized by shoulder
 *  width, as a secondary "how far forward" signal (distance rather
 *  than angle) — catches proportion differences an angle alone can miss. */
function earShoulderOffset(landmarks) {
  const ear = averagePoint3D(landmarks[LM.LEFT_EAR], landmarks[LM.RIGHT_EAR]);
  const shoulder = averagePoint3D(landmarks[LM.LEFT_SHOULDER], landmarks[LM.RIGHT_SHOULDER]);
  const shoulderWidth = distance3D(landmarks[LM.LEFT_SHOULDER], landmarks[LM.RIGHT_SHOULDER]) || 1;
  // horizontal + depth offset only (ignore vertical, which is expected to differ)
  const dx = ear.x - shoulder.x;
  const dz = ear.z - shoulder.z;
  return Math.hypot(dx, dz) / shoulderWidth;
}

/** Difference in shoulder height, as a fraction of shoulder width.
 *  Flags lateral (side-to-side) imbalance. Stays 2D on purpose - this
 *  is about left/right tilt, which the image plane already captures. */
function shoulderTilt(landmarks) {
  const shoulderWidth = distance3D(landmarks[LM.LEFT_SHOULDER], landmarks[LM.RIGHT_SHOULDER]) || 1;
  return Math.abs(landmarks[LM.LEFT_SHOULDER].y - landmarks[LM.RIGHT_SHOULDER].y) / shoulderWidth;
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
function angleBetween3D(v1, v2) {
  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const mag1 = Math.hypot(v1.x, v1.y, v1.z) || 1e-6;
  const mag2 = Math.hypot(v2.x, v2.y, v2.z) || 1e-6;
  const cos = clamp(dot / (mag1 * mag2), -1, 1);
  return Math.acos(cos) * (180 / Math.PI);
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
