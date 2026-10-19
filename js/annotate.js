/**
 * annotate.js
 * Draws a "what we flagged" overlay on top of a captured frame: glowing
 * markers at the landmarks behind each detected issue, color-coded by
 * severity. Used to produce the 3 result thumbnails (front/left/right).
 */
import { LM } from "./scoring.js";

const COLOR_GOOD = "#3DD9C8";   // bright teal, reads well as a glow on dark/video backgrounds
const COLOR_WARN = "#F2B84B";
const COLOR_BAD = "#FF6A4D";

function severityColor(sev) {
  if (sev > 0.6) return COLOR_BAD;
  if (sev > 0.25) return COLOR_WARN;
  return COLOR_GOOD;
}

function glowCircle(ctx, x, y, r, color) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function glowLine(ctx, x1, y1, x2, y2, color) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function label(ctx, text, x, y, color) {
  ctx.save();
  ctx.font = "600 13px 'JetBrains Mono', monospace";
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  ctx.textAlign = "center";
  ctx.fillText(text.toUpperCase(), x, y);
  ctx.restore();
}

/**
 * @param {string} sourceDataUrl - PNG data URL of the raw captured frame
 * @param {Array} landmarks - the MediaPipe landmarks from that same frame
 * @param {Array} issues - result.issues from scorePosture for that frame
 * @param {number} width / height - canvas pixel size the landmarks are normalized against
 * @returns {Promise<string>} annotated PNG data URL
 */
export function annotateFrame(sourceDataUrl, landmarks, issues, width, height) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      const px = (lm) => ({ x: lm.x * width, y: lm.y * height });
      const ear = px(avg(landmarks[LM.LEFT_EAR], landmarks[LM.RIGHT_EAR]));
      const shoulderL = px(landmarks[LM.LEFT_SHOULDER]);
      const shoulderR = px(landmarks[LM.RIGHT_SHOULDER]);
      const shoulderMid = { x: (shoulderL.x + shoulderR.x) / 2, y: (shoulderL.y + shoulderR.y) / 2 };

      const byId = {};
      issues.forEach((i) => (byId[i.id] = i));

      // Forward head / ear-forward -> highlight ear-to-shoulder line
      const neckIssue = byId.forward_head || byId.ear_forward;
      const neckColor = severityColor(neckIssue ? neckIssue.severity : 0);
      glowLine(ctx, ear.x, ear.y, shoulderMid.x, shoulderMid.y, neckColor);
      glowCircle(ctx, ear.x, ear.y, 14, neckColor);
      if (neckIssue) label(ctx, "forward lean", ear.x, ear.y - 24, neckColor);

      // Shoulder tilt -> highlight the shoulder line itself
      const tiltIssue = byId.shoulder_tilt;
      const tiltColor = severityColor(tiltIssue ? tiltIssue.severity : 0);
      glowLine(ctx, shoulderL.x, shoulderL.y, shoulderR.x, shoulderR.y, tiltColor);
      glowCircle(ctx, shoulderL.x, shoulderL.y, 10, tiltColor);
      glowCircle(ctx, shoulderR.x, shoulderR.y, 10, tiltColor);
      if (tiltIssue) label(ctx, "shoulder tilt", shoulderMid.x, shoulderMid.y + 28, tiltColor);

      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = sourceDataUrl;
  });
}

function avg(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
