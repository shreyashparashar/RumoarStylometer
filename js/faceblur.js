// On-device face detection and blur. Photos never leave the browser.
// Uses MediaPipe Face Detector (Apache 2.0). If the model can't load (offline,
// blocked CDN) the app falls back to manual tap-to-blur, so no face is ever
// scored unblurred.

const VISION = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
let detector = null, loading = null;

export async function loadDetector() {
  if (detector) return detector;
  if (loading) return loading;
  loading = (async () => {
    try {
      const { FaceDetector, FilesetResolver } = await import(`${VISION}/vision_bundle.mjs`);
      const files = await FilesetResolver.forVisionTasks(`${VISION}/wasm`);
      detector = await FaceDetector.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODEL }, runningMode: 'IMAGE', minDetectionConfidence: 0.45,
      });
      return detector;
    } catch (e) { console.warn('Face detector unavailable, manual blur only', e); return null; }
  })();
  return loading;
}

export function fileToCanvas(file, maxSide = 1280) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const s = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c);
    };
    img.onerror = rej; img.src = url;
  });
}

export function urlToCanvas(url, maxSide = 1280) {
  return new Promise((res, rej) => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      const s = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c);
    };
    img.onerror = rej; img.src = url;
  });
}

// Full-body photos have small faces, so detect on the whole frame and on an
// upscaled top half, then merge.
export async function detectFaces(canvas) {
  const d = await loadDetector();
  if (!d) return null;
  const boxes = [];
  const push = (r, ox = 0, oy = 0, s = 1) => r.detections.forEach(det => {
    const b = det.boundingBox; boxes.push({ x: ox + b.originX / s, y: oy + b.originY / s, w: b.width / s, h: b.height / s, score: det.categories[0].score });
  });
  push(d.detect(canvas));
  const top = document.createElement('canvas'); const s = 2;
  top.width = canvas.width * s; top.height = Math.round(canvas.height * .5) * s;
  top.getContext('2d').drawImage(canvas, 0, 0, canvas.width, canvas.height * .5, 0, 0, top.width, top.height);
  push(d.detect(top), 0, 0, s);
  // merge overlapping boxes
  const out = [];
  for (const b of boxes.sort((a, c) => c.score - a.score)) {
    if (!out.some(o => Math.abs(o.x + o.w / 2 - (b.x + b.w / 2)) < Math.max(o.w, b.w) * .6 && Math.abs(o.y + o.h / 2 - (b.y + b.h / 2)) < Math.max(o.h, b.h) * .6)) out.push(b);
  }
  return out;
}

// Returns a new canvas with every face region heavily blurred.
export function blurFaces(src, faces) {
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const x = c.getContext('2d'); x.drawImage(src, 0, 0);
  for (const f of faces) {
    const cx = f.x + f.w / 2, cy = f.y + f.h * .5, rx = f.w * .95, ry = f.h * 1.15;
    const bx = Math.max(0, Math.floor(cx - rx * 1.3)), by = Math.max(0, Math.floor(cy - ry * 1.3));
    const bw = Math.min(c.width - bx, Math.ceil(rx * 2.6)), bh = Math.min(c.height - by, Math.ceil(ry * 2.6));
    if (bw < 4 || bh < 4) continue;
    // Downscale-upscale twice: a heavy, smooth blur that works in every browser
    // (Safari has no canvas filter support).
    const tiny = document.createElement('canvas'); tiny.width = Math.max(2, Math.round(bw / 24)); tiny.height = Math.max(2, Math.round(bh / 24));
    const mid = document.createElement('canvas'); mid.width = Math.max(4, Math.round(bw / 7)); mid.height = Math.max(4, Math.round(bh / 7));
    const t = tiny.getContext('2d'), m = mid.getContext('2d');
    t.imageSmoothingQuality = m.imageSmoothingQuality = 'high';
    t.drawImage(c, bx, by, bw, bh, 0, 0, tiny.width, tiny.height);
    m.drawImage(tiny, 0, 0, mid.width, mid.height);
    x.save(); x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); x.clip();
    x.imageSmoothingQuality = 'high';
    x.drawImage(mid, 0, 0, mid.width, mid.height, bx, by, bw, bh);
    x.restore();
  }
  return c;
}

// Manual fallback: a tap at (px,py) in canvas coords blurs a face-sized region.
export function manualFace(canvas, px, py) {
  const w = canvas.width * .16;
  return { x: px - w / 2, y: py - w * .55, w, h: w * 1.15, score: 1, manual: true };
}
