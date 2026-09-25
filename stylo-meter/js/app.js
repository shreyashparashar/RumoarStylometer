import { PRODUCTS, bySlug, ARCHETYPES, OCCASIONS, AUDIENCES, WORN, LOOKS, STORE } from './catalog.js';
import * as S from './scoring.js';
import * as F from './faceblur.js';
import { shareCard } from './share.js';

// ---------------------------------------------------------------- state
const store = {
  get(k, d) { try { const v = localStorage.getItem('stylo:' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('stylo:' + k, JSON.stringify(v)); } catch { /* private mode */ } },
  clear() { try { Object.keys(localStorage).filter(k => k.startsWith('stylo:')).forEach(k => localStorage.removeItem(k)); } catch {} },
};
const blankProfile = () => ({ archetypes: [], occasion: null, audience: null, name: '', city: '', carries: [] });
const state = {
  consents: store.get('consents', { age: false, rating: false, training: false, marketing: false }),
  profile: store.get('profile', blankProfile()),
  photos: [],          // { id, canvas, faces, worn, status, issues, sample }
  cur: 0,
  results: {},         // photo id -> base result
  pick: {},            // photo id -> product slug
  owned: {},           // photo id -> true if he said "I already own one"
  cart: [],
  taste: store.get('taste', { liked: {}, passed: {} }),
  swiped: 0,
  jury: store.get('jury', { votes: 0, picks: [] }),
  occView: null,
};
const entrySlug = new URLSearchParams(location.search).get('product');
if (entrySlug && bySlug[entrySlug]) state.entry = entrySlug;      // deep link from a rumoar.com product page
const $ = s => document.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = n => '₹' + n.toLocaleString('en-IN');
const occName = id => OCCASIONS.find(o => o.id === id)?.name || '';
const archNames = () => state.profile.archetypes.map(a => ARCHETYPES.find(x => x.id === a).name).join(' + ');
let uid = 0;

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600); }
function saveProfile() { store.set('profile', state.profile); }

// ---------------------------------------------------------------- routing
const FLOW = ['consent', 'vibe', 'upload', 'profile', 'reveal', 'finish', 'occasion', 'restyle', 'share', 'jury'];
const RAIL = [['vibe', 'Vibe'], ['upload', 'Upload'], ['reveal', 'Reveal'], ['finish', 'Finish'], ['occasion', 'Occasion'], ['restyle', 'Restyle'], ['share', 'Share'], ['jury', 'Jury']];
const STORY = {
  home: ['', 'Does this look good on me?', 'The Stylo Meter rates the outfit, never the man, and shows how a RUMOAR piece would finish it. Built into rumoar.com, answering the ASK moment before he buys.'],
  consent: ['Before anything', 'His photos. His call.', 'Separate, plain-language consent for rating, model improvement and marketing. 18+ only. Nothing is bundled.'],
  vibe: ['Step 1 · Vibe', 'Tell it who you are today.', 'Pick a vibe, where you are going and who you dress for. The same outfit scores differently for a date and for the office.'],
  upload: ['Step 2 · Upload', 'Faces are blurred first.', 'Three to six full-body photos. Faces are detected and blurred on this device before a single point is given. Photos never leave the browser in this demo.'],
  profile: ['Step 3 · Set-up', 'The wait disappears.', 'He sets up his profile while the looks are read in the background.'],
  reveal: ['Step 4 · Reveal', 'An honest reveal.', 'Five pillars, 20 points each. What is working, and exactly one fix.'],
  finish: ['Step 5 · Finish', 'Complete the look.', 'A real 20-point Finishing pillar. The score only rises when the right piece genuinely finishes the look. No caps, no rigged numbers.'],
  occasion: ['Step 6 · Occasion', 'Same look. Different room.', 'A concert is not an office. The score, and the advice, shift with where he is going.'],
  restyle: ['Step 7 · Restyle', 'Below 60? Restyle Me.', 'Swipe through looks built around a RUMOAR piece. Every like and pass trains his taste profile, which reorders what he is shown next.'],
  share: ['Step 8 · Share', 'Then he posts the glow-up.', 'Every share card carries the score jump and the RUMOAR name. A positive glow-up, not a looks rating.'],
  jury: ['The Style Jury', 'Women vote. The meter learns.', 'Women pick between two looks, faces blurred, and earn store credit. Every swipe calibrates the meter: data nobody else has.'],
  privacy: ['Privacy', 'Delete anytime.', 'Consents can be changed at any point. Deleting clears every photo, score and preference from this device.'],
};
const route = () => (location.hash.replace(/^#\/?/, '') || 'home').split('?')[0];
const go = r => { location.hash = '/' + r; };

function guard(r) {
  const c = state.consents, p = state.profile;
  const needConsent = ['vibe', 'upload', 'profile', 'reveal', 'finish', 'occasion', 'restyle', 'share'];
  if (needConsent.includes(r) && !(c.age && c.rating)) return 'consent';
  if (['upload', 'profile', 'reveal', 'finish', 'occasion', 'restyle', 'share'].includes(r) && !(p.archetypes.length && p.occasion && p.audience)) return 'vibe';
  if (['profile', 'reveal', 'finish', 'occasion', 'share'].includes(r) && !readyPhotos().length) return 'upload';
  if (['reveal', 'finish', 'occasion', 'share'].includes(r) && !readyPhotos().every(ph => state.results[ph.id])) return 'profile';
  return r;
}
const readyPhotos = () => state.photos.filter(p => p.status === 'ok');

function story(r) {
  const s = STORY[r] || STORY.home;
  $('#storyStep').textContent = s[0]; $('#storyTitle').textContent = s[1]; $('#storyText').textContent = s[2];
  const idx = RAIL.findIndex(x => x[0] === r);
  $('#storyRail').innerHTML = RAIL.map(([k, n], i) => `<span class="${i === idx ? 'on' : i < idx ? 'done' : ''}">${n}</span>`).join('');
}

// ---------------------------------------------------------------- frame
function frame({ title = '', body = '', foot = '', dark = false, back = true, progress = true }) {
  const r = route(); const i = FLOW.indexOf(r);
  app.className = 'app' + (dark ? ' dark' : '');
  app.innerHTML = `
    ${r === 'home' ? '' : `<div class="top">
      ${back ? `<button class="back" data-act="back" aria-label="Back">←</button>` : ''}
      <div class="ttl">${esc(title)}</div>
      <button class="link" data-act="nav" data-to="privacy">Privacy</button></div>
      ${progress && i >= 0 ? `<div class="progress" aria-hidden="true"><i style="width:${((i + 1) / FLOW.length) * 100}%"></i></div>` : ''}`}
    <section class="screen">${body}</section>
    ${foot ? `<div class="foot">${foot}</div>` : ''}`;
}

// ---------------------------------------------------------------- screens
const SCREENS = {};

SCREENS.home = () => {
  frame({
    body: `
    <div class="hero">
      <svg class="arc" width="300" height="170" viewBox="0 0 300 170" aria-hidden="true"><path d="M20 160 A130 130 0 0 1 280 160" fill="none" stroke="#2c2c2c" stroke-width="6" stroke-linecap="round"/><path d="M20 160 A130 130 0 0 1 222 58" fill="none" stroke="#EA4E26" stroke-width="8" stroke-linecap="round"/></svg>
      <div class="by">RUMOAR</div>
      <h1>Stylo<br>Meter</h1>
      <p>Does this look good on me? Get an honest score for the outfit, and see what finishes it.</p>
    </div>
    ${state.entry ? `<div class="note acc" style="display:flex;gap:12px;align-items:center"><img src="${bySlug[state.entry].img}" alt="" style="width:48px;height:60px;object-fit:cover;border-radius:8px"><div><b>From the store</b>We'll show how ${esc(bySlug[state.entry].name)} works with your look.</div></div>` : ''}
    <div class="label">How it works</div>
    <ol class="how">
      <li><i>1</i><div><b>Pick your vibe and occasion</b><span>Old Money on a date scores differently from Street at a concert.</span></div></li>
      <li><i>2</i><div><b>Upload 3–6 full-body photos</b><span>Faces are blurred on your phone before anything is scored.</span></div></li>
      <li><i>3</i><div><b>Get five honest pillar scores</b><span>Fit, colour, occasion, cohesion and finishing. Plus one fix.</span></div></li>
      <li><i>4</i><div><b>Finish the look</b><span>See how a RUMOAR piece changes the score, honestly recalculated.</span></div></li>
    </ol>
    <div class="promise">
      <div><b>Rate the look. Never the man.</b>No face scores. No body scores.</div>
      <div><b>No rigged scores.</b>A great outfit without accessories lands around 75–80. The right piece truthfully raises it.</div>
      <div><b>Your photos stay on your device.</b>Nothing is uploaded in this version.</div>
    </div>
    <p class="small" style="margin-top:18px">Part of <a class="link" href="${STORE}" target="_blank" rel="noopener">rumoar.com</a> · <a class="link" href="wireframes.html">Wireframes</a></p>`,
    foot: `<button class="btn" data-act="nav" data-to="${state.consents.age && state.consents.rating ? 'vibe' : 'consent'}">Rate my look</button>
           <button class="btn ghost" data-act="nav" data-to="jury">Vote in the Style Jury</button>`,
  });
};

const CONSENTS = [
  ['age', 'I am 18 or older', 'The Stylo Meter is for adults only.', true],
  ['rating', 'Rate my looks', 'Photos are processed on this device. Faces are blurred before scoring.', true],
  ['training', 'Use my blurred photos to improve the meter', 'Optional. Helps calibrate scores. Off by default.', false],
  ['marketing', 'Send me RUMOAR drops and styling notes', 'Optional.', false],
];
SCREENS.consent = () => {
  const c = state.consents;
  frame({
    title: 'Before we start',
    body: `<h2>Your photos, your call.</h2><p class="lead">Each permission is separate. Change them anytime in Privacy.</p>
      ${CONSENTS.map(([k, t, d, req]) => `<button class="check" role="checkbox" aria-checked="${!!c[k]}" data-act="consent" data-k="${k}"><span class="box">${c[k] ? '✓' : ''}</span><span><b>${t}${req ? '<em class="req">Required</em>' : ''}</b><span>${d}</span></span></button>`).join('')}
      <p class="small" style="margin-top:12px">Raw photos are never stored. Blurred copies live in this tab and are gone when you close it.</p>`,
    foot: `<button class="btn" data-act="nav" data-to="vibe" ${c.age && c.rating ? '' : 'disabled'}>Continue</button>`,
  });
};

SCREENS.vibe = () => {
  const p = state.profile;
  const ok = p.archetypes.length && p.occasion && p.audience;
  frame({
    title: 'Your vibe',
    body: `<h2>What's your vibe?</h2><p class="lead">Pick up to two. The meter scores against both.</p>
      <div class="vibes">${ARCHETYPES.map(a => `<button class="vibe" aria-pressed="${p.archetypes.includes(a.id)}" data-act="arch" data-id="${a.id}" style="background:linear-gradient(160deg,${a.swatch[0]},${a.swatch[1]})"><b>${a.name}</b><small>${a.hint}</small></button>`).join('')}</div>
      <div class="label">Where to?</div>
      <div class="chips">${OCCASIONS.map(o => `<button class="chip" aria-pressed="${p.occasion === o.id}" data-act="occ" data-id="${o.id}">${o.name}</button>`).join('')}</div>
      <div class="label">Who do you dress for?</div>
      <div class="chips">${AUDIENCES.map(o => `<button class="chip" aria-pressed="${p.audience === o.id}" data-act="aud" data-id="${o.id}">${o.name}</button>`).join('')}</div>`,
    foot: `<button class="btn" data-act="nav" data-to="upload" ${ok ? '' : 'disabled'}>Continue</button>`,
  });
};

// ---------------- upload
function photoPills(ph) {
  if (ph.status === 'detecting') return `<span class="pill">Finding faces…</span>`;
  const out = [];
  if (ph.status === 'ok') out.push(ph.sample ? `<span class="pill ok">Sample · pre-blurred</span>` : ph.faces.length ? `<span class="pill ok">Face blurred ✓</span>` : `<span class="pill ok">No face in shot</span>`);
  if (ph.status === 'needs') out.push(`<span class="pill warn">Tap to blur face</span>`);
  if (ph.worn.length) out.push(`<span class="pill">+${ph.worn.length} worn</span>`);
  if (ph.issues?.length) out.push(`<span class="pill warn">${esc(ph.issues[0].split('.')[0])}</span>`);
  return out.join('');
}
SCREENS.upload = () => {
  const n = state.photos.length, ready = readyPhotos().length, busy = state.photos.some(p => p.status === 'detecting');
  const needs = state.photos.some(p => p.status === 'needs');
  frame({
    title: 'Your looks',
    body: `<h2>Upload your looks.</h2><p class="lead">${n} of 6 added. Three or more gives the fairest read.</p>
      <div class="guide"><svg viewBox="0 0 54 72" aria-hidden="true"><rect x="2" y="2" width="50" height="68" rx="8" fill="none" stroke="#EA4E26" stroke-width="2" stroke-dasharray="4 3"/><circle cx="27" cy="16" r="6" fill="#cfcac2"/><path d="M17 62 L19 32 Q27 26 35 32 L37 62 Z" fill="#cfcac2"/></svg>
        <div class="small"><b style="color:#111;display:block;font-size:14px">Head to shoes, in frame</b>Face a window for light. Stand back about 2 metres. Plain background helps.</div></div>
      <div class="uploads">
        ${state.photos.map(ph => `<button class="slot" data-act="edit" data-id="${ph.id}" aria-label="Edit photo"><span id="cv_${ph.id}"></span><span class="st">${photoPills(ph)}</span><span class="x" data-act="rm" data-id="${ph.id}" aria-label="Remove">×</span></button>`).join('')}
        ${n < 6 ? `<label class="slot" style="cursor:pointer"><input type="file" accept="image/*" multiple class="sr" id="file"><span><b style="font-size:28px;color:#111;display:block">+</b>Add photos</span></label>` : ''}
      </div>
      ${n < 6 ? `<p class="small" style="margin-top:12px">No photo handy? <button class="link" data-act="sample">Try a sample look</button></p>` : ''}
      ${needs ? `<div class="note acc"><b>One more step</b>We couldn't find a face in a photo. Tap it and tap the face to blur it, or mark it as having no face in shot.</div>` : ''}
      <p class="small" style="margin-top:14px">Tap any photo to add what you're wearing: bag, watch, eyewear. It counts toward Finishing.</p>`,
    foot: `<button class="btn" data-act="toProfile" ${ready && !busy && !needs ? '' : 'disabled'}>${busy ? 'Blurring faces…' : 'Score my looks'}</button>`,
  });
  state.photos.forEach(ph => { const h = document.getElementById('cv_' + ph.id); if (h) { const c = cloneCanvas(ph.canvas); h.replaceWith(c); } });
  const f = $('#file'); if (f) f.onchange = e => addFiles([...e.target.files]);
};
function cloneCanvas(src) { const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0); return c; }

async function addFiles(files) {
  const room = 6 - state.photos.length;
  for (const file of files.slice(0, room)) {
    let canvas;
    try { canvas = await F.fileToCanvas(file); } catch { toast('That file could not be read. Try a JPG or PNG.'); continue; }
    const ph = { id: 'p' + (++uid), canvas, faces: [], worn: [], status: 'detecting', issues: S.quality(canvas).issues };
    state.photos.push(ph); if (route() === "upload") render();
    const faces = await F.detectFaces(canvas);
    if (faces && faces.length) { ph.canvas = F.blurFaces(canvas, faces); ph.faces = faces; ph.status = 'ok'; }
    else { ph.status = 'needs'; if (faces === null) toast('Automatic face blur is unavailable. Tap each photo to blur the face.'); }
    canvas = null;                       // the unblurred original is dropped here
    if (route() === "upload") render();
  }
}
async function addSample() {
  const used = new Set(state.photos.filter(p => p.sample).map(p => p.sampleId));
  const look = LOOKS.find(l => !used.has(l.id)); if (!look) return;
  const canvas = await F.urlToCanvas(look.img);
  state.photos.push({ id: 'p' + (++uid), canvas, faces: [], worn: look.id === 'look-6' ? ['bag', 'jewellery'] : look.id === 'look-1' ? ['jewellery'] : [], status: 'ok', issues: [], sample: true, sampleId: look.id });
  render();
}

function openEditor(id) {
  const ph = state.photos.find(p => p.id === id); if (!ph) return;
  const ed = document.createElement('div'); ed.className = 'editor';
  const draw = () => {
    ed.innerHTML = `<canvas id="edc" aria-label="Tap a face to blur it"></canvas>
      <div class="panel">
        <b style="font-size:15px">Tap a face to blur it</b><p class="small">Every face must be blurred before scoring.</p>
        <div class="label" style="margin-top:14px">What are you wearing here?</div>
        <div class="chips">${WORN.map(w => `<button class="chip" aria-pressed="${ph.worn.includes(w.id)}" data-w="${w.id}">${w.name}</button>`).join('')}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:16px">
          <button class="btn ghost" data-e="noface">${ph.status === 'needs' ? 'No face in shot' : 'Undo? Re-upload'}</button>
          <button class="btn dark" data-e="done">Done</button></div></div>`;
    const c = ed.querySelector('#edc'); c.width = ph.canvas.width; c.height = ph.canvas.height; c.getContext('2d').drawImage(ph.canvas, 0, 0);
    c.onclick = e => {
      const r = c.getBoundingClientRect(); const x = (e.clientX - r.left) * c.width / r.width, y = (e.clientY - r.top) * c.height / r.height;
      const f = F.manualFace(ph.canvas, x, y); ph.canvas = F.blurFaces(ph.canvas, [f]); ph.faces.push(f); ph.status = 'ok'; ph.fp = null; draw();
    };
  };
  ed.onclick = e => {
    const w = e.target.closest('[data-w]'); if (w) { const k = w.dataset.w; ph.worn = ph.worn.includes(k) ? ph.worn.filter(x => x !== k) : [...ph.worn, k]; delete state.results[ph.id]; draw(); return; }
    const a = e.target.closest('[data-e]'); if (!a) { if (e.target === ed) close(); return; }
    if (a.dataset.e === 'noface') { if (ph.status === 'needs') ph.status = 'ok'; else { state.photos = state.photos.filter(p => p !== ph); close(); return; } draw(); }
    if (a.dataset.e === 'done') close();
  };
  const close = () => { ed.remove(); render(); };
  document.body.appendChild(ed); draw();
}

// ---------------- profile / processing
const PIPE = ['Photo quality check', 'Person and pose check', 'Face blur confirmed', 'Garments and accessories', 'Five-pillar rubric', 'Style Jury calibration', 'Catalogue match'];
SCREENS.profile = () => {
  const p = state.profile;
  frame({
    title: 'Reading your looks',
    body: `<h2>While we read your looks</h2><p class="lead">Set up your profile. It takes ten seconds.</p>
      <div class="label">First name</div><input class="field" id="pf_name" value="${esc(p.name)}" autocomplete="given-name" placeholder="Aarav">
      <div class="label">City</div><input class="field" id="pf_city" value="${esc(p.city)}" autocomplete="address-level2" placeholder="Mumbai">
      <div class="label">What do you usually carry?</div>
      <div class="chips">${['crossbody', 'tote', 'backpack', 'duffle', 'nothing yet'].map(k => `<button class="chip" aria-pressed="${p.carries.includes(k)}" data-act="carry" data-id="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
      <div class="label">Working in the background</div>
      <ul class="steps" id="pipe">${PIPE.map((s, i) => `<li id="pp${i}"><span>${s}</span><b></b></li>`).join('')}</ul>`,
    foot: `<button class="btn" id="seeScores" data-act="nav" data-to="reveal" disabled>Reading ${readyPhotos().length} look${readyPhotos().length > 1 ? 's' : ''}…</button>`,
  });
  const nm = $('#pf_name'), ct = $('#pf_city');
  nm.oninput = () => { p.name = nm.value.slice(0, 40); saveProfile(); };
  ct.oninput = () => { p.city = ct.value.slice(0, 40); saveProfile(); };
  runPipeline();
};
async function runPipeline() {
  const token = runPipeline.t = Math.random();
  const photos = readyPhotos();
  for (let i = 0; i < PIPE.length; i++) {
    await new Promise(r => setTimeout(r, i === 4 ? 650 : 380));
    if (runPipeline.t !== token || route() !== 'profile') return;
    if (i === 4) for (const ph of photos) state.results[ph.id] = await S.scoreLook(ph, state.profile);
    const li = document.getElementById('pp' + i); if (li) { li.classList.add('done'); li.querySelector('b').textContent = '✓'; }
  }
  for (const ph of photos) if (!state.results[ph.id]) state.results[ph.id] = await S.scoreLook(ph, state.profile);
  const b = $('#seeScores'); if (b) { b.disabled = false; b.textContent = 'See my scores'; }
}

// ---------------- reveal
function band(t) { return t >= 85 ? 'Finished. This works.' : t >= 70 ? 'Sharp base. Unfinished look.' : t >= 60 ? 'Good bones. Needs direction.' : "Let's restyle this."; }
function ring(id, size = 132, stroke = 11) {
  const r = (size - stroke) / 2, C = 2 * Math.PI * r;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-labelledby="${id}_t"><title id="${id}_t">Score</title>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#ECEAE6" stroke-width="${stroke}"/>
    <circle id="${id}" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#EA4E26" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text id="${id}_n" x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="Poppins" font-weight="800" font-size="${size * .3}">0</text></svg>`;
}
function animateRing(id, from, to, ms = 1400) {
  const c = document.getElementById(id), n = document.getElementById(id + '_n'); if (!c) return;
  const C = parseFloat(c.getAttribute('stroke-dasharray')); const t0 = performance.now();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const step = now => {
    const p = reduce ? 1 : Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - p, 3), v = Math.round(from + (to - from) * e);
    c.setAttribute('stroke-dashoffset', C * (1 - v / 100)); n.textContent = v; if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function animateBars() { requestAnimationFrame(() => requestAnimationFrame(() => document.querySelectorAll('[data-w]').forEach(b => b.style.width = b.dataset.w + '%'))); }

SCREENS.reveal = () => {
  const photos = readyPhotos(); state.cur = Math.min(state.cur, photos.length - 1);
  const ph = photos[state.cur], r = state.results[ph.id];
  frame({
    title: `Look ${state.cur + 1} of ${photos.length}`,
    body: `<div class="photo" id="swipeArea"><span id="rv_cv"></span><span class="tl pill">${esc(occName(state.profile.occasion))} · ${esc(archNames())}</span></div>
      ${photos.length > 1 ? `<div class="dots">${photos.map((_, i) => `<button aria-label="Look ${i + 1}" aria-current="${i === state.cur}" data-act="cur" data-i="${i}"></button>`).join('')}</div>` : ''}
      <div class="meter">${ring('rv')}<div><h3>${band(r.total)}</h3><p class="small">Scored on five pillars, 20 points each.</p>
        <div class="tags">${r.jury.map(t => `<span class="tag">${t}</span>`).join('')}</div><p class="small" style="font-size:11px;margin-top:4px">Predicted jury read</p></div></div>
      ${S.PILLARS.map(([k, n, d]) => `<div class="pillar"><div class="row"><span>${n}</span><span>${r.pillars[k]} / 20</span></div><div class="bar ${k === 'finishing' ? 'acc' : ''}"><i data-w="${r.pillars[k] * 5}" style="width:0"></i></div></div>`).join('')}
      <div class="note"><b>What's working</b>${r.working.map(esc).join(' ')}</div>
      <div class="note acc"><b>One fix</b>${esc(r.fix.text)}</div>
      <p class="demo">Demo engine: scores come from palette, contrast and what you told us you're wearing. The production meter uses an AI vision rubric calibrated by the Style Jury. Same photo, same score, every time.</p>`,
    foot: r.total < 60
      ? `<button class="btn" data-act="nav" data-to="restyle">Restyle me</button><button class="btn ghost" data-act="nav" data-to="finish">Finish it anyway</button>`
      : `<button class="btn" data-act="nav" data-to="finish">Complete the look</button><button class="btn ghost" data-act="nav" data-to="occasion">See it across occasions</button>`,
  });
  $('#rv_cv').replaceWith(cloneCanvas(ph.canvas));
  animateRing('rv', 0, r.total); animateBars();
  swipeNav($('#swipeArea'), d => { const n = photos.length; if (n < 2) return; state.cur = (state.cur + d + n) % n; render(); });
};
function swipeNav(el, cb) {
  let x0 = null;
  el.addEventListener('pointerdown', e => { x0 = e.clientX; });
  el.addEventListener('pointerup', e => { if (x0 === null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 50) cb(dx < 0 ? 1 : -1); });
}

// ---------------- finish
function currentPhoto() { const ps = readyPhotos(); return ps[Math.min(state.cur, ps.length - 1)]; }
SCREENS.finish = () => {
  const ph = currentPhoto(), base = state.results[ph.id];
  let recs = S.recommend(base, state.profile, state.taste, 3);
  if (state.entry && !recs.some(r => r.product.slug === state.entry)) recs = [S.withProduct(base, bySlug[state.entry], state.profile), ...recs.slice(0, 2)];
  if (state.entry && !state.pick[ph.id]) state.pick[ph.id] = state.entry;
  if (!state.pick[ph.id] || !recs.some(r => r.product.slug === state.pick[ph.id])) state.pick[ph.id] = recs[0].product.slug;
  const sel = recs.find(r => r.product.slug === state.pick[ph.id]), pr = sel.product;
  const inCart = state.cart.includes(pr.slug);
  frame({
    title: 'Complete the look',
    body: `<div class="ba" id="ba">
        <div class="layer after"><span id="ba_a"></span><div class="prod"><img src="${pr.img}" alt=""></div></div>
        <div class="layer before" id="baBefore"><span id="ba_b"></span></div>
        <div class="handle" id="baH"></div>
        <input type="range" min="2" max="98" value="50" id="baR" aria-label="Before and after">
        <span class="pill" style="position:absolute;left:12px;bottom:12px">Before</span>
        <span class="pill" style="position:absolute;right:12px;top:12px">After · preview</span>
        <span class="score-badge" id="baS" style="position:absolute;left:12px;top:12px">${base.total}</span>
      </div>
      <div class="label">Finish it with RUMOAR</div>
      <div class="picks">${recs.map(r => `<button class="pick" aria-pressed="${r.product.slug === pr.slug}" data-act="pick" data-slug="${r.product.slug}"><img src="${r.product.img}" alt=""><div><b>+${r.delta}</b>${esc(r.product.name.replace('The ', ''))}</div></button>`).join('')}</div>
      <div class="label">Recalculated honestly</div>
      <div class="delta"><span>Finishing</span><span>${base.pillars.finishing} → <em>${sel.pillars.finishing}</em></span></div>
      <div class="delta"><span>Cohesion</span><span>${base.pillars.cohesion} → <em>${sel.pillars.cohesion}</em></span></div>
      <div class="delta"><span><b>${esc(pr.name)}</b><br><span class="small">${pr.type[0].toUpperCase() + pr.type.slice(1)} · ${pr.tone}</span></span><span style="text-align:right"><b>${inr(pr.price)}</b><br><s class="small">${inr(pr.was)}</s></span></div>
      <p class="demo">Preview shows the piece alongside your photo. Live try-on renders on your own photo arrive in the MVP, labelled as AI-generated.</p>`,
    foot: `<button class="btn" data-act="cart" data-slug="${pr.slug}">${inCart ? 'Added ✓ View in store' : 'Add to cart · ' + inr(pr.price)}</button>
           <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn ghost" data-act="own" data-slug="${pr.slug}">I already own one</button><button class="btn ghost" data-act="nav" data-to="share">Share glow-up</button></div>`,
  });
  $('#ba_a').replaceWith(cloneCanvas(ph.canvas)); $('#ba_b').replaceWith(cloneCanvas(ph.canvas));
  const rg = $('#baR'), set = v => { $('#baBefore').style.clipPath = `inset(0 ${100 - v}% 0 0)`; $('#baH').style.left = v + '%'; };
  rg.oninput = () => set(rg.value); set(50);
  const b = $('#baS'); let v = base.total; const to = sel.total, t0 = performance.now();
  const tick = now => { const p = Math.min(1, (now - t0 - 400) / 900); if (p > 0) { v = Math.round(base.total + (to - base.total) * (1 - Math.pow(1 - p, 3))); b.textContent = v; b.classList.toggle('up', v > base.total); } if (p < 1) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
};

function ownSheet(slug) {
  const pr = bySlug[slug], ph = currentPhoto();
  const sh = document.createElement('div'); sh.className = 'sheet';
  sh.innerHTML = `<div class="in" role="dialog" aria-label="Styling tip"><h2 style="font-size:24px">Already own one? Good.</h2>
    <p class="lead">No sale needed. Here's how to wear a ${pr.type} with this look.</p>
    <div class="note acc"><b>Styling tip</b>${esc(S.stylingTip(pr, state.profile))}</div>
    <div style="display:grid;gap:8px;margin-top:18px"><button class="btn dark" data-s="rescore">Rescore with my own bag</button><button class="btn ghost" data-s="close">Close</button></div></div>`;
  sh.onclick = async e => {
    const a = e.target.closest('[data-s]'); if (!a && e.target !== sh) return;
    if (a?.dataset.s === 'rescore' && !ph.worn.includes('bag')) { ph.worn = [...ph.worn, 'bag']; state.results[ph.id] = await S.scoreLook(ph, state.profile); toast(`Finishing updated with your own bag: ${state.results[ph.id].total}`); }
    sh.remove(); render();
  };
  document.body.appendChild(sh);
}

// ---------------- occasion
SCREENS.occasion = () => {
  const ph = currentPhoto(), base = state.results[ph.id];
  const scores = S.occasionScores(base, state.profile);
  const sel = state.occView || state.profile.occasion;
  const low = Object.entries(scores).sort((a, b) => a[1] - b[1])[0];
  frame({
    title: 'Every occasion',
    body: `<h2>Same look, every room.</h2><p class="lead">Tap an occasion to see how this outfit reads there.</p>
      <div style="display:flex;justify-content:center;margin:4px 0 16px">${ring('oc', 170, 13)}</div>
      ${OCCASIONS.map(o => `<button class="occ" aria-pressed="${o.id === sel}" data-act="occv" data-id="${o.id}"><span>${o.name}${o.id === state.profile.occasion ? '<small>Your pick</small>' : ''}</span><span>${scores[o.id]}</span></button>`).join('')}
      <div class="note acc"><b>${occName(low[0])} · ${low[1]}</b>${esc(occTip(low[0], base))}</div>`,
    foot: `<button class="btn" data-act="nav" data-to="finish">Finish the look</button><button class="btn ghost" data-act="nav" data-to="restyle">Restyle me</button>`,
  });
  animateRing('oc', 0, scores[sel], 900);
};
function occTip(occ, r) {
  const t = {
    'office': 'Quieter palette, one structured piece. Swap the loudest item for a knit or overshirt and carry a tote.',
    'date-night': 'Go darker and simpler. One accent, a crossbody or shoulder bag, nothing that shouts.',
    'concert': 'Push contrast: black base, one bold piece, hands free with a crossbody.',
    'college': 'Easy layers and a backpack that sits high. Comfort that still looks chosen.',
    'festival': 'Add colour or texture. A crossbody keeps it light while you move.',
  };
  return t[occ];
}

// ---------------- restyle
function restyleDeck() {
  const ph = currentPhoto(), base = state.results[ph.id];
  return S.recommend(base, state.profile, state.taste, 8).map(r => r.product);
}
SCREENS.restyle = () => {
  const deck = restyleDeck(); const i = state.swiped % deck.length, pr = deck[i], nx = deck[(i + 1) % deck.length];
  const lk = Object.entries(state.taste.liked).sort((a, b) => b[1] - a[1]).slice(0, 2).map(x => x[0]);
  frame({
    title: 'Restyle me',
    body: `<h2>Restyle me.</h2><p class="lead">Looks built around a RUMOAR piece. Swipe right for more like this.</p>
      <div class="deck">
        <div class="swipe" style="transform:scale(.95) translateY(10px);opacity:.6"><img src="${nx.img}" alt=""></div>
        <div class="swipe" id="card"><img src="${pr.img}" alt="${esc(pr.name)}"><span class="stamp yes">MORE</span><span class="stamp no">PASS</span>
          <div class="cap"><b>Built around ${esc(pr.name)}</b><span>${occName(state.profile.occasion)} · ${inr(pr.price)}</span></div></div>
      </div>
      <div class="swipectl"><button data-act="swipe" data-d="-1" aria-label="Pass">✕</button><button class="like" data-act="swipe" data-d="1" aria-label="More like this">♥</button></div>
      <p class="small" style="text-align:center;margin-top:12px">${lk.length ? 'Your taste is leaning: ' + lk.join(', ') : 'Your likes train your taste profile.'}</p>
      <p class="demo">In the MVP each card is an AI restyle of your own photo built around the piece. Here we show the RUMOAR campaign look.</p>`,
    foot: `<button class="btn dark" data-act="nav" data-to="finish">Finish with my taste</button>`,
  });
  dragCard($('#card'), d => swipe(d, pr));
};
function swipe(d, pr) {
  const c = $('#card'); if (!c) return;
  c.style.transform = `translateX(${d * 520}px) rotate(${d * 20}deg)`; c.style.opacity = 0;
  const bucket = d > 0 ? 'liked' : 'passed';
  for (const k of [pr.type, pr.tone]) state.taste[bucket][k] = (state.taste[bucket][k] || 0) + 1;
  store.set('taste', state.taste); state.swiped++;
  setTimeout(() => route() === "restyle" && render(), 280);
}
function dragCard(el, cb) {
  let x0 = null, dx = 0;
  el.addEventListener('pointerdown', e => { x0 = e.clientX; el.setPointerCapture(e.pointerId); el.style.transition = 'none'; });
  el.addEventListener('pointermove', e => { if (x0 === null) return; dx = e.clientX - x0; el.style.transform = `translateX(${dx}px) rotate(${dx / 20}deg)`; el.querySelector('.yes').style.opacity = Math.max(0, dx / 120); el.querySelector('.no').style.opacity = Math.max(0, -dx / 120); });
  el.addEventListener('pointerup', () => { el.style.transition = ''; if (Math.abs(dx) > 90) cb(dx > 0 ? 1 : -1); else { el.style.transform = ''; el.querySelectorAll('.stamp').forEach(s => s.style.opacity = 0); } x0 = null; dx = 0; });
}

// ---------------- share
SCREENS.share = () => {
  const ph = currentPhoto(), base = state.results[ph.id];
  const slug = state.pick[ph.id]; const fin = slug ? S.withProduct(base, bySlug[slug], state.profile) : null;
  frame({
    title: 'Share',
    body: `<h2>Post the glow-up.</h2><p class="lead">A card for your story. The score belongs to the outfit.</p>
      <div class="sharepreview" id="sp"><div style="aspect-ratio:9/16;display:grid;place-items:center" class="small">Building your card…</div></div>`,
    foot: `<button class="btn" id="shareBtn" disabled>Share</button><a class="btn ghost" id="dlBtn" download="stylo-meter.png" aria-disabled="true">Download</a>`,
  });
  (async () => {
    const photo = cloneCanvas(ph.canvas);
    if (fin) { const img = await loadImg(bySlug[slug].img); const x = photo.getContext('2d'); const w = photo.width * .34, h = w * 4 / 3, px = photo.width - w - photo.width * .05, py = photo.height - h - photo.height * .06; x.fillStyle = '#fff'; x.fillRect(px - 6, py - 6, w + 12, h + 12); x.drawImage(img, px, py, w, h); }
    const { blob, url } = await shareCard({ photo, product: fin?.product, before: base.total, after: fin ? fin.total : base.total, occasion: occName(state.profile.occasion), archetype: archNames() });
    if (route() !== 'share') return;
    $('#sp').innerHTML = `<img src="${url}" alt="Share card">`;
    const dl = $('#dlBtn'); dl.href = url; dl.removeAttribute('aria-disabled');
    const sb = $('#shareBtn'); const file = new File([blob], 'stylo-meter.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { sb.disabled = false; sb.onclick = () => navigator.share({ files: [file], title: 'My Stylo Meter glow-up' }).catch(() => {}); }
    else { sb.textContent = 'Download to share'; sb.disabled = false; sb.onclick = () => dl.click(); }
  })();
};
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

// ---------------- jury
const PROMPTS = ['Which works better for a date?', 'Which would you notice at a concert?', 'Which reads more confident at the office?', 'Which feels more like college done right?'];
function juryPair(n) {
  const L = LOOKS; const a = (n * 2) % L.length, b = (n * 2 + 1 + Math.floor(n / L.length)) % L.length;
  return [L[a], L[b === a ? (b + 1) % L.length : b], PROMPTS[n % PROMPTS.length]];
}
SCREENS.jury = () => {
  const c = state.consents;
  if (!c.age) {
    frame({ title: 'The Style Jury', dark: true, progress: false,
      body: `<h2>The Style Jury</h2><p class="lead">Pick between two looks. Faces are always blurred. Every 20 votes earns ₹100 in RUMOAR store credit.</p>
        <button class="check" style="border-color:#333" role="checkbox" aria-checked="false" data-act="consent" data-k="age"><span class="box"></span><span><b>I am 18 or older</b><span>Required to join the Jury.</span></span></button>`,
    });
    return;
  }
  const j = state.jury, [A, B, q] = juryPair(j.votes), credit = Math.floor(j.votes / 20) * 100, toNext = 20 - (j.votes % 20);
  frame({
    title: 'The Style Jury', dark: true, progress: false,
    body: `<p style="font-size:12px;letter-spacing:.3em;color:#EA4E26;font-weight:600;text-align:center">THE STYLE JURY</p>
      <h2 style="text-align:center;margin-top:8px">${q}</h2>
      <div class="pair"><button data-act="vote" data-v="A" aria-label="Look A"><img src="${A.img}" alt="${esc(A.desc)}"><span class="pill">A</span></button>
        <button data-act="vote" data-v="B" aria-label="Look B"><img src="${B.img}" alt="${esc(B.desc)}"><span class="pill">B</span></button></div>
      <p class="small" style="text-align:center">Pick the look, not the man.</p>
      <div style="display:flex;justify-content:space-between;font-size:14px;margin:22px 0 8px"><span class="small">Your votes</span><b>${j.votes}</b></div>
      <div class="bar acc" style="background:#2a2a2a"><i style="width:${((j.votes % 20) / 20) * 100}%"></i></div>
      <p class="small" style="margin-top:8px">${toNext} more for ₹100 credit${credit ? ` · ₹${credit} earned` : ''}</p>
      <p class="demo" style="border-color:#333">Demo: votes are stored on this device only. In production they calibrate the meter's Jury read across all users.</p>`,
    foot: `<button class="btn ghost" style="background:#1E1E1E;color:#fff;border-color:#333" data-act="nav" data-to="home">Done for now</button>`,
  });
};
function vote(v) {
  const j = state.jury, [A, B, q] = juryPair(j.votes);
  document.querySelectorAll('.pair button').forEach(b => { const on = b.dataset.v === v; b.setAttribute('aria-pressed', on); if (!on) b.classList.add('lose'); });
  j.picks.push({ q, a: A.id, b: B.id, pick: v, t: Date.now() }); j.picks = j.picks.slice(-200); j.votes++; store.set('jury', j);
  if (j.votes % 20 === 0) toast('₹100 store credit earned. Thank you, juror.');
  setTimeout(() => route() === "jury" && render(), 650);
}

// ---------------- privacy
SCREENS.privacy = () => {
  const c = state.consents;
  frame({
    title: 'Privacy', progress: false,
    body: `<h2>Privacy</h2><p class="lead">Change any permission. Raw photos are never stored.</p>
      ${CONSENTS.slice(1).map(([k, t, d]) => `<div class="setrow"><div><b>${t}</b><span>${d}</span></div><button class="toggle" role="switch" aria-checked="${!!c[k]}" aria-label="${t}" data-act="consent" data-k="${k}"></button></div>`).join('')}
      <div class="setrow"><div><b>What's on this device</b><span>${state.photos.length} blurred photo(s) in this tab, ${state.jury.votes} jury vote(s), your vibe and taste profile.</span></div></div>
      <div style="margin-top:24px"><button class="btn dark" data-act="wipe">Delete my photos and data</button></div>
      <p class="small" style="margin-top:14px">The Stylo Meter scores the look, never the face or body. Complexion informs colour advice only and never lowers a score.</p>`,
  });
};

// ---------------------------------------------------------------- actions
const ACT = {
  back: () => { const i = FLOW.indexOf(route()); if (history.length > 1) history.back(); else go(i > 0 ? FLOW[i - 1] : 'home'); },
  nav: a => go(a.dataset.to),
  consent: a => {
    const k = a.dataset.k; state.consents[k] = !state.consents[k];
    if (k === 'rating' && !state.consents.rating) { state.photos = []; state.results = {}; }
    store.set('consents', state.consents); render();
  },
  arch: a => { const p = state.profile, id = a.dataset.id; p.archetypes = p.archetypes.includes(id) ? p.archetypes.filter(x => x !== id) : [...p.archetypes, id].slice(-2); state.results = {}; saveProfile(); render(); },
  occ: a => { state.profile.occasion = a.dataset.id; state.results = {}; saveProfile(); render(); },
  aud: a => { state.profile.audience = a.dataset.id; saveProfile(); render(); },
  carry: a => { const p = state.profile, id = a.dataset.id; p.carries = p.carries.includes(id) ? p.carries.filter(x => x !== id) : [...p.carries, id]; saveProfile(); a.setAttribute('aria-pressed', p.carries.includes(id)); },
  sample: () => addSample(),
  edit: (a, e) => { if (e.target.closest('[data-act=rm]')) return; openEditor(a.dataset.id); },
  rm: (a, e) => { e.stopPropagation(); state.photos = state.photos.filter(p => p.id !== a.dataset.id); delete state.results[a.dataset.id]; render(); },
  toProfile: () => { state.results = {}; go('profile'); },   // scores are cached by photo fingerprint, so this is cheap
  cur: a => { state.cur = +a.dataset.i; render(); },
  pick: a => { state.pick[currentPhoto().id] = a.dataset.slug; render(); },
  cart: a => { const pr = bySlug[a.dataset.slug]; if (!state.cart.includes(pr.slug)) { state.cart.push(pr.slug); toast(`${pr.name} added. Opening RUMOAR…`); render(); } window.open(pr.url, '_blank', 'noopener'); },
  own: a => ownSheet(a.dataset.slug),
  occv: a => { state.occView = a.dataset.id; render(); },
  swipe: a => { const deck = restyleDeck(); swipe(+a.dataset.d, deck[state.swiped % deck.length]); },
  vote: a => vote(a.dataset.v),
  wipe: () => {
    store.clear(); state.photos = []; state.results = {}; state.pick = {}; state.cart = []; state.swiped = 0;
    state.consents = { age: false, rating: false, training: false, marketing: false }; state.profile = blankProfile();
    state.taste = { liked: {}, passed: {} }; state.jury = { votes: 0, picks: [] }; toast('Everything deleted from this device.'); go('home');
  },
};
app.addEventListener('click', e => { const a = e.target.closest('[data-act]'); if (a && app.contains(a) && ACT[a.dataset.act]) ACT[a.dataset.act](a, e); });

// ---------------------------------------------------------------- render
function render() {
  const want = route(), r = guard(want);
  if (r !== want) { history.replaceState(null, '', '#/' + r); }
  story(r);
  const keep = render.last === r ? app.querySelector('.screen')?.scrollTop || 0 : 0;
  (SCREENS[r] || SCREENS.home)();
  const sc = app.querySelector('.screen'); if (sc) sc.scrollTop = keep;
  render.last = r;
  document.title = r === 'home' ? 'Stylo Meter by RUMOAR' : `${(STORY[r] || STORY.home)[1]} · Stylo Meter`;
}
window.addEventListener('hashchange', render);
render();
F.loadDetector();   // warm up the face model in the background
window.addEventListener('beforeunload', () => { state.photos = []; });
