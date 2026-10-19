/**
 * exercises-data.js
 * Static content: exercises keyed by issue id (matches scoring.js issue ids),
 * screening suggestions, nearby-care links, and "awareness" copy for the
 * risk-indicator feature.
 *
 * NOTE ON THE RISK INDICATOR / SCREENINGS:
 * We deliberately do NOT present clinical probabilities (e.g. "62% chance of
 * developing cervical spondylosis"). A posture snapshot from a webcam cannot
 * support a number like that. Instead we show a plain-language AWARENESS
 * LEVEL and point toward the kind of professional who could give a real
 * assessment - always paired with a disclaimer. This keeps the feature
 * honest while still being genuinely useful.
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

/** Suggested professional screenings per detected issue. These point
 *  toward what a real evaluation could check - never a diagnosis. */
export const SCREENINGS = {
  forward_head:
    "A postural assessment from a physical therapist can measure neck alignment more precisely than a camera, and check for early disc or nerve involvement if you notice numbness or tingling.",
  ear_forward:
    "A physical therapist or chiropractor can check for rounded-shoulder and upper-crossed muscle imbalance patterns that often accompany this.",
  shoulder_tilt:
    "Worth asking a doctor or physical therapist to check for scoliosis or muscle imbalance, especially if one shoulder sitting higher is new or getting more noticeable.",
  general:
    "A general posture screening — many physical therapists offer this as a first visit — is a low-cost way to get a professional baseline reading.",
};

/** Categories of nearby care, used to build "near me" map search links. */
export const CARE_CATEGORIES = [
  { id: "pt", label: "Physical therapists near me", query: "physical therapist" },
  { id: "chiro", label: "Chiropractors near me", query: "chiropractor" },
  { id: "ortho", label: "Orthopedic doctors near me", query: "orthopedic doctor" },
];

/** Which care category to lead with for a given issue id. */
export const ISSUE_TO_CARE = {
  forward_head: "pt",
  ear_forward: "pt",
  shoulder_tilt: "chiro",
};

/** Builds a Google Maps search URL for a query, biased toward the
 *  browser's own location - no API key needed, works for any visitor. */
export function mapsSearchUrl(query) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query + " near me")}`;
}

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
