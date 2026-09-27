# Upright

A web app that uses your camera and on-device pose detection to score neck/shoulder
posture out of 10, explain what it's seeing, and recommend exercises matched to your
specific pattern — plus curated articles and background on why posture matters.

Built for the Congressional App Challenge.

## Features
- **Live posture check** — webcam-based pose detection (MediaPipe Pose, runs entirely
  in the browser, no video ever leaves the device) scores posture in real time.
- **Matched exercises** — recommendations keyed to the specific issue detected
  (forward head lean, ears ahead of shoulders, shoulder tilt), not generic advice.
- **Awareness levels, not fake diagnoses** — we deliberately avoid presenting a
  clinical "probability of developing condition X." A webcam snapshot can't support
  that kind of number. Instead we show a plain-language Low/Moderate/Elevated
  awareness level with a clear disclaimer. See `js/exercises-data.js` for the reasoning.
- **Articles & impact page** — curated reading list and project background.

## Tech stack
- Vanilla HTML/CSS/JS (no build step — just open in a browser)
- [MediaPipe Tasks Vision](https://developers.google.com/mediapipe/solutions/vision/pose_landmarker) for pose landmark detection, loaded from CDN
- Runs fully client-side; no backend or data collection

## Running locally
Because the pose detection module uses ES module imports, open this with a local
server rather than a `file://` URL:

```bash
# from the project root
python3 -m http.server 8000
# then open http://localhost:8000
```

Or use the VS Code "Live Server" extension. Camera access requires `localhost` or
HTTPS — it will not work over a plain `file://` path.

## Project structure
```
upright/
├── index.html            # landing page
├── pages/
│   ├── camera.html        # core feature: live posture check
│   ├── exercises.html     # full exercise library
│   ├── news.html          # curated articles
│   └── about.html         # impact / project goal
├── js/
│   ├── pose-detection.js  # webcam + MediaPipe wrapper
│   ├── scoring.js         # landmark angles -> 0-10 score (pure functions)
│   └── exercises-data.js  # exercise content + awareness-level logic
├── css/
│   └── style.css
└── README.md
```

## How the score works
`js/scoring.js` computes three geometric signals from pose landmarks (ear, shoulder,
hip positions): forward lean angle, ear-to-shoulder horizontal offset, and shoulder
height difference. Each is weighted into a single 0–10 score. Thresholds are rough,
literature-informed starting points — tune them in `scoring.js` as you test with
real users.

**This is a heuristic estimate, not a medical measurement.** The app is not a
diagnostic tool and should not be presented as one in submission materials.

## TODO before submission
- [ ] Replace placeholder copy in `pages/about.html` with your team's real story
- [ ] Replace placeholder entries in `pages/news.html` with real articles (linked, summarized in your own words)
- [ ] Test on multiple devices/lighting conditions and retune thresholds in `scoring.js` if needed
- [ ] Record demo video (1–3 min): intro team, purpose, audience, tools used, live demo
- [ ] Write reflection answers (inspiration, challenges, what you learned, future improvements)

## License
MIT — see LICENSE.
