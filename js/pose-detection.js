/**
 * pose-detection.js
 * Wraps MediaPipe Tasks Vision PoseLandmarker: starts the webcam,
 * runs detection on every frame, draws a skeleton overlay, and
 * hands raw landmarks to an onResult callback (camera.html wires
 * this to scoring.js).
 */
import { PoseLandmarker, FilesetResolver, DrawingUtils } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

let poseLandmarker;
let running = false;
let paused = false;
let lastVideoEl = null;
let lastCanvasEl = null;

export async function initPoseDetection({ videoEl, canvasEl, onResult, onStatus }) {
  onStatus?.("Loading model…");

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );

  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numPoses: 1,
  });

  onStatus?.("Requesting camera…");

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480 },
    audio: false,
  });
  videoEl.srcObject = stream;
  await new Promise((resolve) => (videoEl.onloadedmetadata = resolve));
  videoEl.play();

  canvasEl.width = videoEl.videoWidth;
  canvasEl.height = videoEl.videoHeight;
  const ctx = canvasEl.getContext("2d");
  const drawer = new DrawingUtils(ctx);
  lastVideoEl = videoEl;
  lastCanvasEl = canvasEl;

  running = true;
  paused = false;
  onStatus?.("Live");

  const loop = () => {
    if (!running) return;
    if (paused) {
      requestAnimationFrame(loop);
      return;
    }
    const nowMs = performance.now();
    const result = poseLandmarker.detectForVideo(videoEl, nowMs);

    ctx.save();
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);

    if (result.landmarks && result.landmarks.length > 0) {
      const landmarks = result.landmarks[0];
      // Coral dots on joints, teal connecting lines - matches the app palette
      // and makes the skeleton easy to read at a glance instead of the
      // library's flat default gray.
      drawer.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, {
        color: "#1F5A52",
        lineWidth: 3,
      });
      drawer.drawLandmarks(landmarks, {
        color: "#E67A5B",
        fillColor: "#E67A5B",
        radius: 4,
      });
      onResult?.(landmarks);
    }
    ctx.restore();

    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

/** Freezes the current frame (stops feeding new frames to the model
 *  and drawing loop) so the person can look at one specific score/frame.
 *  The last-drawn canvas frame stays on screen since we simply stop
 *  overwriting it. */
export function pausePoseDetection() {
  paused = true;
}

export function resumePoseDetection() {
  paused = false;
}

/** Returns a PNG data URL of the current canvas (video + skeleton
 *  overlay), for a "save snapshot" button. Call while paused for a
 *  stable image. */
export function captureSnapshot() {
  if (!lastCanvasEl) return null;
  return lastCanvasEl.toDataURL("image/png");
}

export function stopPoseDetection() {
  running = false;
}
