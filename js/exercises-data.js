/**
 * exercises-data.js
 * Static content: exercises keyed by issue id (matches scoring.js issue ids),
 * and "awareness" copy for the risk-indicator feature.
 *
 * NOTE ON THE RISK INDICATOR:
 * We deliberately do NOT present clinical probabilities (e.g. "62% chance of
 * developing cervical spondylosis"). A posture snapshot from a webcam cannot
 * support a number like that, and presenting one anyway would be misleading -
 * likely to draw exactly the kind of scrutiny you don't want from CAC judges.
 * Instead we show a plain-language AWARENESS LEVEL (Low/Moderate/Elevated)
 * tied to the visible posture pattern, always paired with the disclaimer
 * below. This keeps the feature honest while still being genuinely useful.
 */

export const DISCLAIMER =
  "This is an educational estimate based on visible posture patterns, not a medical diagnosis. " +
  "See a doctor or physical therapist for any persistent neck or back pain.";

export const EXERCISES = {
  forward_head: [
    {
      name: "Chin tucks",
      dose: "3 sets of 10, hold 3 seconds",
      how: "Sitting tall, gently draw your chin straight back (like making a double chin) without tilting your head down. Hold, then release.",
    },
    {
      name: "Wall angels",
      dose: "2 sets of 12",
      how: "Stand with your head, upper back, and heels against a wall. Slide your arms up and down like a snow angel while keeping contact with the wall.",
    },
  ],
  ear_forward: [
    {
      name: "Doorway chest stretch",
      dose: "3 holds of 30 seconds per side",
      how: "Place your forearm on a doorframe at shoulder height and gently lean forward until you feel a stretch across your chest.",
    },
    {
      name: "Chin tucks",
      dose: "3 sets of 10, hold 3 seconds",
      how: "Sitting tall, gently draw your chin straight back without tilting your head down. Hold, then release.",
    },
  ],
  shoulder_tilt: [
    {
      name: "Upper trap stretch",
      dose: "2 holds of 30 seconds per side",
      how: "Sit tall, gently tilt your ear toward one shoulder until you feel a stretch on the opposite side of your neck.",
    },
    {
      name: "Scapular retractions",
      dose: "3 sets of 12",
      how: "Squeeze your shoulder blades together and slightly down, hold 2 seconds, release.",
    },
  ],
  good: [
    {
      name: "Standing posture reset",
      dose: "Every 30-45 minutes",
      how: "Stand, roll your shoulders back, and take 5 slow breaths before sitting back down. Keeps a good baseline from slipping during long sessions.",
    },
  ],
};

/** Maps an issue list (from scoring.js) to a plain-language awareness level.
 *  Never returns a numeric probability - see note above. */
export function awarenessLevel(issues) {
  if (issues.length === 0) return { level: "Low", detail: "Your posture pattern looks close to neutral right now." };
  const topSeverity = issues[0].severity;
  if (topSeverity > 0.6) {
    return {
      level: "Elevated",
      detail: "This pattern, if it's how you sit most of the day, is commonly associated with neck and upper-back strain over time.",
    };
  }
  return {
    level: "Moderate",
    detail: "This pattern shows up sometimes in people who report occasional neck stiffness. Worth keeping an eye on.",
  };
}
