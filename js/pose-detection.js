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

  running = true;
  onStatus?.("Live");

  const loop = () => {
    if (!running) return;
    const nowMs = performance.now();
    const result = poseLandmarker.detectForVideo(videoEl, nowMs);

    ctx.save();
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);

    if (result.landmarks && result.landmarks.length > 0) {
      const landmarks = result.landmarks[0];
      drawer.drawLandmarks(landmarks, { radius: 3 });
      drawer.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS);
      onResult?.(landmarks);
    }
    ctx.restore();

    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

export function stopPoseDetection() {
  running = false;
}
