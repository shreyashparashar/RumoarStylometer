// Stylo Meter scoring engine.
//
// THIS IS THE DEMO ENGINE. It scores from simple, explainable image measurements
// (palette, contrast, colour spread) plus what the user declares he is wearing.
// It never looks at the face (faces are blurred and masked out before this runs)
// and never scores the body.
//
// The production engine replaces `measure()` + `pillarsFrom()` with a call to the
// vision model (Gemini Flash-class) scoring the same five pillars against the
// RUMOAR rubric, then a Style Jury calibration step. Everything else in the app
// talks to this module only through `scoreLook`, `withProduct`, `recommend`,
// `occasionScores`, so the swap is contained here.

import { PRODUCTS, OCCASIONS, WORN } from './catalog.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const round = Math.round;
const cache = new Map();

// ---------- image measurements ----------
export function fingerprint(canvas) {
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  const x = c.getContext('2d'); x.drawImage(canvas, 0, 0, 16, 16);
  const d = x.getImageData(0, 0, 16, 16).data; let h = 2166136261;
  for (let i = 0; i < d.length; i += 4) { const g = (d[i] + d[i + 1] + d[i + 2]) / 3 >> 3; h ^= g; h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(36);
}

function rgb2hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, mx ? d / mx : 0, mx];
}

// Measures the outfit region: the central 64% of width, below the top 12%,
// with detected face boxes masked out.
export function measure(canvas, faces = []) {
  const W = 72, H = 108, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'); x.drawImage(canvas, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H).data;
  const sx = W / canvas.width, sy = H / canvas.height;
  const fb = faces.map(f => ({ x0: (f.x - f.w * .3) * sx, x1: (f.x + f.w * 1.3) * sx, y0: (f.y - f.h * .4) * sy, y1: (f.y + f.h * 1.4) * sy }));
  let n = 0, sumV = 0, sumV2 = 0, sat = 0, warm = 0; const bins = new Array(12).fill(0);
  let rg = [], yb = [];
  for (let j = Math.floor(H * .12); j < H; j++) for (let i = Math.floor(W * .18); i < Math.ceil(W * .82); i++) {
    if (fb.some(b => i >= b.x0 && i <= b.x1 && j >= b.y0 && j <= b.y1)) continue;
    const k = (j * W + i) * 4, r = d[k], g = d[k + 1], b = d[k + 2];
    const [h, s, v] = rgb2hsv(r, g, b);
    n++; sumV += v; sumV2 += v * v; rg.push(r - g); yb.push(.5 * (r + g) - b);
    if (s > .25 && v > .2) { sat++; bins[Math.floor(h / 30) % 12]++; if (h < 60 || h > 330) warm++; }
  }
  const mean = sumV / n, std = Math.sqrt(Math.max(0, sumV2 / n - mean * mean));
  const m = a => a.reduce((p, q) => p + q, 0) / a.length;
  const sd = (a, mu) => Math.sqrt(m(a.map(v => (v - mu) ** 2)));
  const mrg = m(rg), myb = m(yb);
  const colourfulness = Math.sqrt(sd(rg, mrg) ** 2 + sd(yb, myb) ** 2) + .3 * Math.sqrt(mrg ** 2 + myb ** 2);
  const satShare = sat / n;
  const hues = sat ? bins.filter(v => v / sat > .12).length : 0;
  let tone = 'grey';
  if (satShare < .22) tone = mean < .36 ? 'black' : mean < .62 ? 'grey' : 'cream';
  else { const top = bins.indexOf(Math.max(...bins)); tone = ['red', 'orange', 'yellow', 'olive', 'green', 'green', 'teal', 'blue', 'blue', 'purple', 'pink', 'red'][top]; }
  return { brightness: mean, contrast: std, colourfulness, satShare, hues, warmShare: sat ? warm / sat : 0, tone, dark: mean < .42 };
}

export function quality(canvas) {
  const m = measure(canvas);
  const issues = [];
  if (Math.min(canvas.width, canvas.height) < 480) issues.push('Low resolution. Try a sharper photo.');
  if (m.brightness < .16) issues.push('Too dark. Face a window or step into light.');
  if (m.brightness > .88) issues.push('Overexposed. Move out of direct light.');
  if (canvas.width > canvas.height * 1.1) issues.push('Landscape photo. Full-body portrait works best.');
  return { ok: issues.length === 0, issues };
}

// ---------- rubric ----------
const OCC_PREF = {
  'date-night': m => 12 + (m.dark ? 3 : 0) + (m.hues <= 2 ? 3 : 0) - (m.colourfulness > 60 ? 2 : 0),
  'concert':    m => 12 + (m.dark ? 3 : 0) + (m.contrast > .2 ? 3 : 0),
  'office':     m => 12 + (m.colourfulness < 35 ? 4 : m.colourfulness < 55 ? 2 : -1) + (m.brightness > .3 && m.brightness < .75 ? 2 : 0) - (m.dark && m.contrast > .25 ? 2 : 0),
  'college':    m => 14 + (m.hues <= 3 ? 2 : 0) + (m.colourfulness > 20 ? 1 : 0),
  'festival':   m => 11 + (m.colourfulness > 45 ? 5 : m.colourfulness > 25 ? 2 : 0) + (m.hues >= 2 ? 2 : 0),
};
const ARCH_PREF = {
  'old-money': m => (m.colourfulness < 40 ? 2 : -1) + (['cream', 'grey', 'olive', 'blue'].includes(m.tone) ? 1 : 0),
  'street':    m => (['black', 'grey'].includes(m.tone) ? 2 : 0) + (m.hues <= 2 ? 1 : 0),
  'creative':  m => (m.colourfulness > 35 ? 2 : 0) + (m.hues >= 2 ? 1 : -1),
  'night-out': m => (m.dark ? 2 : -1) + (m.contrast > .2 ? 1 : 0),
  'rock':      m => (m.tone === 'black' ? 3 : 0) - (m.colourfulness > 50 ? 1 : 0),
  'bohemian':  m => (m.warmShare > .5 ? 2 : 0) + (m.colourfulness > 25 ? 1 : 0),
};

function jitter(fp, salt) { let h = 0; const s = fp + salt; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 2654435761) >>> 0; return (h % 1000) / 1000; }

function occasionPillar(m, occ, archetypes, fp) {
  let v = OCC_PREF[occ](m);
  if (archetypes.length) v += archetypes.map(a => ARCH_PREF[a](m)).reduce((p, q) => p + q, 0) / archetypes.length;
  return clamp(round(v + jitter(fp, occ) * 1.6 - .8), 8, 19);
}

function pillarsFrom(m, worn, profile, fp) {
  const fit = clamp(round(13 + clamp((m.contrast - .1) * 18, 0, 3) + jitter(fp, 'fit') * 3), 11, 18);
  const colour = clamp(round((m.hues <= 1 ? 17 : m.hues === 2 ? 16 : m.hues === 3 ? 14 : 12) + (m.colourfulness > 15 && m.colourfulness < 55 ? 1 : 0) + jitter(fp, 'col') * 1.5 - .5), 10, 19);
  const occasion = occasionPillar(m, profile.occasion, profile.archetypes, fp);
  const cohesion = clamp(round(12 + (colour >= 16 ? 2 : 0) + (occasion >= 15 ? 1 : 0) + jitter(fp, 'coh') * 2), 10, 18);
  const finishing = clamp(11 + worn.reduce((s, id) => s + (WORN.find(w => w.id === id)?.pts || 0), 0), 0, 20);
  return { fit, colour, occasion, cohesion, finishing };
}

export const PILLARS = [
  ['fit', 'Fit & Proportion', 'Shoulder, length, taper, silhouette balance. Never body size.'],
  ['colour', 'Colour Harmony', 'Palette within the outfit. Complexion shapes advice only, never lowers the score.'],
  ['occasion', 'Occasion & Vibe', 'Match to where he is going and who he wants to be.'],
  ['cohesion', 'Cohesion', 'Does it read as one clear identity?'],
  ['finishing', 'Finishing', 'Bag, watch, eyewear, belt, details.'],
];

const total = p => p.fit + p.colour + p.occasion + p.cohesion + p.finishing;

function narrative(p, m, profile) {
  const working = [];
  if (p.colour >= 16) working.push(m.hues <= 1 ? `A tight ${m.tone} palette. It reads deliberate.` : 'Colours sit well together.');
  if (p.fit >= 16) working.push('Clean silhouette with clear structure.');
  if (p.occasion >= 16) working.push(`Right energy for ${OCCASIONS.find(o => o.id === profile.occasion).name.toLowerCase()}.`);
  if (p.cohesion >= 15) working.push('The pieces agree with each other.');
  if (!working.length) working.push('A solid base to build on.');
  const weakest = [...PILLARS].filter(x => x[0] !== 'finishing').sort((a, b) => p[a[0]] - p[b[0]])[0];
  let fix;
  if (p.finishing <= 15) fix = { pillar: 'finishing', text: `Finishing is ${p.finishing}/20. One considered bag would finish this look.` };
  else if (weakest[0] === 'colour') fix = { pillar: 'colour', text: 'Too many colours compete. Pull it back to two, plus one accent.' };
  else if (weakest[0] === 'occasion') fix = { pillar: 'occasion', text: 'Strong look, wrong room. Try it against a different occasion.' };
  else if (weakest[0] === 'fit') fix = { pillar: 'fit', text: 'Balance the proportions: a slimmer bottom under a relaxed top, or the reverse.' };
  else fix = { pillar: 'cohesion', text: 'Two ideas are fighting. Commit to one vibe from top to bottom.' };
  return { working: working.slice(0, 2), fix };
}

function juryRead(p, m) {
  const t = [];
  if (p.fit >= 16) t.push('Confident');
  if (p.cohesion >= 15) t.push('Tasteful');
  if (!m.dark || m.colourfulness > 25) t.push('Approachable');
  if (m.dark && p.colour >= 15) t.push('Attractive');
  return t.slice(0, 3);
}

// photo: { canvas, faces, worn: [] }   profile: { archetypes, occasion, audience }
export async function scoreLook(photo, profile) {
  const fp = photo.fp || (photo.fp = fingerprint(photo.canvas));
  const key = [fp, profile.occasion, profile.archetypes.join('+'), photo.worn.slice().sort().join('+')].join('|');
  if (cache.has(key)) return cache.get(key);            // same photo, same score. Always.
  const m = measure(photo.canvas, photo.faces);
  const p = pillarsFrom(m, photo.worn, profile, fp);
  const res = { key, fp, measures: m, pillars: p, total: total(p), jury: juryRead(p, m), ...narrative(p, m, profile) };
  cache.set(key, res);
  return res;
}

export function occasionScores(result, profile) {
  const out = {};
  for (const o of OCCASIONS) {
    const occ = occasionPillar(result.measures, o.id, profile.archetypes, result.fp);
    const p = { ...result.pillars, occasion: occ };
    out[o.id] = total(p);
  }
  return out;
}

// ---------- RUMOAR pieces ----------
const BAG_FIT = {
  'date-night': { crossbody: .9, shoulder: 1, tote: .6, duffle: .25, backpack: .35 },
  'concert':    { crossbody: 1, shoulder: .55, tote: .3, duffle: .15, backpack: .55 },
  'office':     { crossbody: .5, shoulder: .6, tote: 1, duffle: .35, backpack: .7 },
  'college':    { crossbody: .8, shoulder: .5, tote: .7, duffle: .4, backpack: 1 },
  'festival':   { crossbody: 1, shoulder: .5, tote: .5, duffle: .2, backpack: .6 },
};
function toneMatch(bagTone, m) {
  if (bagTone === 'black') return m.dark || m.tone === 'black' ? 4 : m.tone === 'grey' ? 3 : 2;
  if (bagTone === 'silver') return ['black', 'grey', 'blue'].includes(m.tone) ? 3 : 1;
  if (bagTone === 'olive') return ['cream', 'olive', 'orange', 'yellow', 'green'].includes(m.tone) || m.warmShare > .5 ? 3 : 1;
  if (bagTone === 'cream') return ['cream', 'blue', 'olive', 'grey'].includes(m.tone) ? 3 : 1;
  return 2;
}
export function withProduct(result, product, profile) {
  const m = result.measures, p = { ...result.pillars };
  let fit = BAG_FIT[profile.occasion][product.type];
  if (profile.occasion === 'office') fit = fit * (.7 + .3 * product.structure);
  const hadBag = result.pillars.finishing >= 16;               // he declared a bag already
  const gain = round(fit * (hadBag ? 4 : 8));
  p.finishing = clamp(p.finishing + gain, 0, 20);
  p.cohesion = clamp(p.cohesion + round(toneMatch(product.tone, m) * fit), 0, 20);
  return { ...result, pillars: p, total: total(p), product, delta: total(p) - result.total };
}

// taste: { liked: {type:n, tone:n}, passed: {...} } from Restyle Me
export function recommend(result, profile, taste = {}, n = 3) {
  const score = pr => {
    const r = withProduct(result, pr, profile);
    const t = (taste.liked?.[pr.type] || 0) + (taste.liked?.[pr.tone] || 0) - (taste.passed?.[pr.type] || 0) - (taste.passed?.[pr.tone] || 0);
    return r.delta + t * .8;
  };
  const ranked = PRODUCTS.map(pr => ({ pr, s: score(pr) })).sort((a, b) => b.s - a.s);
  const out = [], types = new Set();
  for (const { pr } of ranked) { if (out.length >= n) break; if (types.has(pr.type) && out.length < n - 1) continue; out.push(pr); types.add(pr.type); }
  return out.map(pr => withProduct(result, pr, profile));
}

export function stylingTip(product, profile) {
  const t = {
    crossbody: 'Wear it high and tight across the chest, strap shortened. It reads intentional, not touristy.',
    shoulder: 'Let it sit under the arm on the side you do not wear your watch. Keep the rest of the look quiet.',
    tote: 'Carry it by the handles, not on the shoulder, when the outfit is tailored. Shoulder it for college.',
    duffle: 'Save it for travel days and gym-to-dinner. Match its colour to your shoes.',
    backpack: 'Tighten both straps so it sits high. One-strap slouch undoes a clean outfit.',
  };
  return t[product.type];
}
