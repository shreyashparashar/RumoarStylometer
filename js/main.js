import { PRODUCTS, bySlug, ARCHETYPES, OCCASIONS, LOOKS, STORE } from './catalog.js';
import { STYLISTS, byId } from './stylists.js';
import * as S from './scoring.js';
import * as F from './faceblur.js';
import * as V from './vision.js';
import * as B from './brain.js';
import { stylistCard } from './share.js';
import { words, tilt, magnetic, cursor, countUp, confetti, pattern, reduced } from './fx.js';

// ------------------------------------------------------------------ state
const LS = { get: (k, d) => { try { return JSON.parse(localStorage.getItem('stylo2:' + k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem('stylo2:' + k, JSON.stringify(v)); } catch {} } };
const st = {
  step: 'home', photo: null, det: null, occasion: null, vibes: [], stylist: null,
  mode: LS.get('mode', 'instant'), verdictAbort: null,
  entry: new URLSearchParams(location.search).get('product'),
};
const STEPS = ['home', 'scan', 'occasion', 'vibe', 'stylist', 'verdict'];
const main = document.querySelector('main');
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = n => '₹' + n.toLocaleString('en-IN');
const initials = n => n.split(' ').map(w => w[0]).join('').slice(0, 2);
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2800); }
function clone(src) { const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0); return c; }

// ------------------------------------------------------------------ theme
const BASE = { bg: '#FFFFFF', ink: '#0A0A0A', acc: '#EA4E26', card: '#0A0A0A' };
function theme(p = BASE) { const r = document.documentElement.style; r.setProperty('--bg', p.bg); r.setProperty('--ink', p.ink); r.setProperty('--acc', p.acc); r.setProperty('--card', p.card); document.querySelector('meta[name=theme-color]').content = p.bg; }

// ------------------------------------------------------------------ navigation
function go(step, push = true) {
  if (st.verdictAbort && step !== 'verdict') st.verdictAbort.abort();
  st.step = step;
  if (push) history.pushState({ step }, '', '#' + step);
  const run = () => { render(); scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'instant' }); };
  if (document.startViewTransition && !reduced()) document.startViewTransition(run); else run();
}
addEventListener('popstate', e => { const s = e.state?.step || 'home'; go(guard(s), false); });
function guard(s) {
  if (s !== 'home' && !st.photo) return 'home';
  if (['vibe', 'stylist', 'verdict'].includes(s) && !st.occasion) return 'occasion';
  if (['stylist', 'verdict'].includes(s) && !st.vibes.length) return 'vibe';
  if (s === 'verdict' && !st.stylist) return 'stylist';
  return s;
}

function header() {
  const i = STEPS.indexOf(st.step);
  $('#steps').innerHTML = STEPS.slice(1).map((s, k) => `<i class="${k + 1 === i ? 'on' : k + 1 < i ? 'done' : ''}"></i>`).join('');
  const m = $('#mini'); m.innerHTML = '';
  if (st.photo && st.step !== 'home' && st.step !== 'scan') { const w = document.createElement('button'); w.className = 'mini'; w.title = 'Change photo'; w.appendChild(clone(st.photo.canvas)); w.onclick = () => go('home'); m.appendChild(w); }
  const b = $('#brain'); b.setAttribute('aria-checked', st.mode === 'local-ai');
  b.querySelector('.t').textContent = st.mode === 'local-ai' ? 'On-device AI' : 'Instant stylist';
}

function render() {
  header();
  if (st.step !== 'stylist' && st.step !== 'verdict') theme();
  ({ home, scan, occasion, vibe, stylist, verdict })[st.step]();
  main.querySelectorAll('.cta').forEach(el => magnetic(el, .18));
}

// ------------------------------------------------------------------ HOME
function home() {
  const entry = st.entry && bySlug[st.entry];
  main.innerHTML = `
  <section class="home">
    <div>
      <div class="kick">${entry ? `From the store: ${esc(entry.name)}` : 'RUMOAR presents'}</div>
      <h1 class="mega rise">${words('Does this')}<br>${words('look')} <em class="o w" style="--i:2">good</em><br>${words('on me?')}</h1>
      <p class="lede">Drop a full-body photo. Pick where you're going and the vibe. Then pick a stylist with opinions. You get an honest score, their verdict, and the RUMOAR piece that finishes the look.</p>
      <div class="promises"><span>Rates the look, never the man</span><span>Faces blurred on your device</span><span>Free AI, runs in your browser</span></div>
    </div>
    <div>
      <label class="drop" id="drop" tabindex="0">
        <input type="file" accept="image/*" class="sr" id="file">
        <div class="dial"></div><div class="needle" id="needle"></div>
        <div><b>Drop your fit</b><small>or tap to choose a photo · head to shoes works best</small></div>
      </label>
      <div class="samples"><span>No photo? Try one:</span>${LOOKS.slice(0, 5).map(l => `<button data-sample="${l.id}" aria-label="Sample: ${esc(l.desc)}"><img src="${l.img}" alt=""></button>`).join('')}</div>
    </div>
  </section>
  <div class="marquee" aria-hidden="true"><div>${[...STYLISTS, ...STYLISTS].map(s => `<span style="color:${s.pal.bg === '#FFFFFF' || s.pal.bg === '#F2EFEA' || s.pal.bg === '#CDE8FF' || s.pal.bg === '#E9C46A' || s.pal.bg === '#D7FF3A' ? s.pal.card : s.pal.bg}">${s.name}</span>`).join('')}</div></div>`;
  const drop = $('#drop'), file = $('#file'), needle = $('#needle');
  file.onchange = () => file.files[0] && takePhoto(file.files[0]);
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } });
  const mv = e => { const r = drop.getBoundingClientRect(); const a = Math.max(-70, Math.min(70, ((e.clientX - r.left) / r.width - .5) * 150)); needle.style.transform = `translateX(-50%) rotate(${a}deg)`; };
  if (home.mv) removeEventListener('pointermove', home.mv); home.mv = mv;
  addEventListener('pointermove', mv, { passive: true }); needle.style.transform = 'translateX(-50%) rotate(-30deg)';
  main.querySelectorAll('[data-sample]').forEach(b => b.onclick = () => takeSample(b.dataset.sample));
  V.load(); // warm the stylist's eyes while they decide
}
// global drag and drop
['dragenter', 'dragover'].forEach(ev => addEventListener(ev, e => { e.preventDefault(); $('#drop')?.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => addEventListener(ev, e => { e.preventDefault(); $('#drop')?.classList.remove('over'); }));
addEventListener('drop', e => { const f = [...(e.dataTransfer?.files || [])].find(f => f.type.startsWith('image/')); if (f) takePhoto(f); });

async function takePhoto(file) {
  let canvas; try { canvas = await F.fileToCanvas(file); } catch { toast('That file could not be opened. Try a JPG or PNG.'); return; }
  st.photo = { canvas, faces: [], status: 'detecting', raw: canvas }; st.det = null; go('scan'); processPhoto();
}
async function takeSample(id) {
  const l = LOOKS.find(x => x.id === id); const canvas = await F.urlToCanvas(l.img);
  st.photo = { canvas, faces: [], status: 'detecting', sample: true }; st.det = null; go('scan'); processPhoto();
}

// ------------------------------------------------------------------ SCAN
const LOG = [['blur', 'Finding and blurring faces', 'on your device'], ['eyes', 'Reading the fit', ''], ['ready', 'Ready for your stylist', '']];
function scan() {
  main.innerHTML = `
  <section class="scan">
    <div class="polaroid"><div class="ph" id="ph"><div class="laser" id="laser"></div></div><div class="cap"><span>Your fit</span><span id="capR"></span></div></div>
    <div>
      <div class="kick"><b>1</b>The scan</div>
      <h2 class="h rise">${words('Let me take a look.')}</h2>
      <ul class="log">${LOG.map(([k, t, s]) => `<li id="lg_${k}"><i></i><span>${t}</span><small id="lgs_${k}">${s}</small></li>`).join('')}</ul>
      <div class="meterbar" id="dl" style="display:none"><i></i></div>
      <div class="chips" id="chips"></div>
      <div id="manual"></div>
      <div class="row" style="margin-top:28px"><button class="cta" id="next" disabled>Where's it going <span class="arr">→</span></button><button class="ghost" id="again">Different photo</button></div>
    </div>
  </section>`;
  paintPhoto();
  $('#again').onclick = () => go('home');
  $('#next').onclick = () => go('occasion');
  refreshScan();
}
function paintPhoto() {
  const ph = $('#ph'); if (!ph || !st.photo) return;
  ph.querySelectorAll('canvas,.fbox').forEach(n => n.remove());
  const c = clone(st.photo.canvas); ph.prepend(c);
  const W = st.photo.canvas.width, H = st.photo.canvas.height;
  // object-fit: cover mapping for face boxes
  requestAnimationFrame(() => {
    const r = ph.getBoundingClientRect(), s = Math.max(r.width / W, r.height / H), ox = (r.width - W * s) / 2, oy = (r.height - H * s) / 2;
    st.photo.faces.forEach((f, i) => { const d = document.createElement('div'); d.className = 'fbox'; Object.assign(d.style, { left: ox + (f.x - f.w * .3) * s + 'px', top: oy + (f.y - f.h * .35) * s + 'px', width: f.w * 1.6 * s + 'px', height: f.h * 1.8 * s + 'px', animationDelay: i * 120 + 'ms' }); ph.appendChild(d); });
  });
}
function setLog(k, state, sub) { const li = $('#lg_' + k); if (!li) return; li.className = state; li.querySelector('i').textContent = state === 'done' ? '✓' : ''; if (sub !== undefined) $('#lgs_' + k).textContent = sub; }
function refreshScan() {
  if (st.step !== 'scan' || !st.photo || !$('#lg_blur')) return;   // DOM may still be mid view-transition
  const p = st.photo;
  setLog('blur', p.status === 'detecting' ? 'on' : p.status === 'needs' ? 'on' : 'done',
    p.status === 'detecting' ? 'on your device' : p.status === 'needs' ? 'tap your face to blur it' : p.sample ? 'sample is pre-blurred' : p.faces.length ? `${p.faces.length} blurred` : 'no face in shot');
  const man = $('#manual');
  if (p.status === 'needs') {
    man.innerHTML = `<p class="lede" style="margin-top:14px">I couldn't find a face automatically. Tap your face on the photo to blur it, or tell me there isn't one.</p><div class="row" style="margin-top:12px"><button class="ghost" id="noface">No face in this photo</button></div>`;
    $('#noface').onclick = () => { p.status = 'ok'; analyse(); };
    const ph = $('#ph'); ph.classList.add('tap');
    ph.onclick = e => {
      const r = ph.getBoundingClientRect(), W = p.canvas.width, H = p.canvas.height, s = Math.max(r.width / W, r.height / H);
      const x = (e.clientX - r.left - (r.width - W * s) / 2) / s, y = (e.clientY - r.top - (r.height - H * s) / 2) / s;
      const f = F.manualFace(p.canvas, x, y); p.canvas = F.blurFaces(p.canvas, [f]); p.faces.push(f); p.status = 'ok'; ph.classList.remove('tap'); ph.onclick = null; paintPhoto(); analyse();
    };
  } else man.innerHTML = '';
  if (!st.det) setLog('eyes', p.status === 'ok' ? 'on' : '', V.status.state === 'loading' ? `downloading my eyes · ${Math.round(V.status.progress * 100)}%` : '');
  else {
    setLog('eyes', 'done', st.det.ok ? 'on-device vision' : 'basic read');
    setLog('ready', 'done', '');
    const chips = chipsFor();
    $('#chips').innerHTML = chips.map((c, i) => `<span class="chip" style="--i:${i}">${esc(c)}</span>`).join('');
    $('#laser')?.remove(); $('#capR').textContent = st.det.ok ? 'read ✓' : '';
    $('#next').disabled = false;
  }
  const dl = $('#dl'); if (dl) { dl.style.display = V.status.state === 'loading' && p.status === 'ok' && !st.det ? 'block' : 'none'; dl.firstChild.style.width = V.status.progress * 100 + '%'; }
}
V.onStatus(() => refreshScan());
function chipsFor() {
  const m = S.measure(st.photo.canvas, st.photo.faces);
  const c = V.describe(st.det);
  c.push(m.hues <= 1 ? `${m.tone} palette` : m.hues >= 4 ? 'lots of colour' : `${m.tone}-led`);
  if (m.dark) c.push('dark mood');
  return [...new Set(c)].slice(0, 8);
}
async function processPhoto() {
  const p = st.photo;
  if (p.sample) { p.status = 'ok'; refreshScan(); return analyse(); }
  const faces = await F.detectFaces(p.canvas);
  if (st.photo !== p) return;
  if (faces && faces.length) { p.canvas = F.blurFaces(p.canvas, faces); p.faces = faces; p.status = 'ok'; delete p.raw; paintPhoto(); refreshScan(); analyse(); }
  else { p.status = 'needs'; delete p.raw; refreshScan(); }
}
async function analyse() {
  const p = st.photo; refreshScan();
  let det = await V.see(p.canvas).catch(() => null);
  if (st.photo !== p) return;
  det = det || { ok: false, style: {}, acc: {}, accP: {} };
  // stricter thresholds for small, often-blurred details
  const TH = { bag: .6, sunglasses: .75, watch: .72, chain: .66, cap: .82 };
  for (const k in det.accP || {}) det.acc[k] = det.accP[k] > TH[k];
  st.det = det; p.worn = [det.acc.bag && 'bag', det.acc.watch && 'watch', det.acc.sunglasses && 'eyewear', det.acc.chain && 'jewellery'].filter(Boolean);
  refreshScan();
}

// ------------------------------------------------------------------ OCCASION
const OCC_COPY = { 'date-night': 'Dinner, drinks, a first impression', concert: 'Crowds, lights, hands free', office: 'Meetings, desk to dinner', college: 'Lectures, canteen, all day', festival: 'Sun, dust, dancing' };
function occasion() {
  main.innerHTML = `<div class="kick"><b>2</b>The occasion</div>
    <h2 class="h rise">${words("Where's the fit going?")}</h2>
    <div class="occs">${OCCASIONS.map(o => `<button class="occ" data-o="${o.id}"><b>${o.name}</b><span>${OCC_COPY[o.id]}</span></button>`).join('')}</div>`;
  main.querySelectorAll('.occ').forEach(b => b.onclick = () => { st.occasion = b.dataset.o; go('vibe'); });
}

// ------------------------------------------------------------------ VIBE
function vibe() {
  main.innerHTML = `<div class="kick"><b>3</b>The vibe</div>
    <h2 class="h rise">${words('Who are you today?')}</h2><p class="lede">Pick one or two. Your stylist scores against them.</p>
    <div class="vibes">${ARCHETYPES.map(a => `<button class="vibe" aria-pressed="${st.vibes.includes(a.id)}" data-v="${a.id}" style="background:linear-gradient(150deg, ${a.swatch[0]}, ${a.swatch[1]})"><span class="blob" style="background:${a.swatch[0]}"></span><span class="tick">✓</span><b>${a.name}</b><small>${a.hint}</small></button>`).join('')}</div>
    <div class="bar-foot"><button class="cta" id="next" ${st.vibes.length ? '' : 'disabled'}>Pick my stylist <span class="arr">→</span></button></div>`;
  main.querySelectorAll('.vibe').forEach(b => { tilt(b, 6); b.onclick = () => {
    const id = b.dataset.v; st.vibes = st.vibes.includes(id) ? st.vibes.filter(x => x !== id) : [...st.vibes, id].slice(-2);
    main.querySelectorAll('.vibe').forEach(x => x.setAttribute('aria-pressed', st.vibes.includes(x.dataset.v)));
    $('#next').disabled = !st.vibes.length;
  }; });
  $('#next').onclick = () => go('stylist');
}

// ------------------------------------------------------------------ STYLIST
function cardHTML(s) {
  const P = s.pal;
  return `<button class="scard" data-s="${s.id}" aria-pressed="${st.stylist === s.id}" style="--c1:${P.bg};--c2:${P.ink};--c3:${P.acc};--c4:${P.card}">
    <div class="art" style="background:${pattern(s.pattern, P.acc, P.bg)}"><span class="mono">${initials(s.name)}</span>
      <span class="spice" title="Spice level ${s.spice} of 5">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= s.spice ? 'on' : ''}"></i>`).join('')}</span></div>
    <div class="body"><h3>${s.name}</h3><div class="role">${s.role}</div><p>${s.bio}</p></div><span class="shine"></span></button>`;
}
function stylist() {
  if (st.stylist) theme(byId[st.stylist].pal); else theme();
  main.innerHTML = `<div class="kick"><b>4</b>The stylist</div>
    <h2 class="h rise">${words('Pick your stylist.')}</h2><p class="lede">Each one has a lane, a temper and favourite RUMOAR pieces. Same honest score, very different advice.</p>
    <div class="deck">${STYLISTS.map(cardHTML).join('')}</div>
    <p class="fine">All stylists are original, fictional characters created for RUMOAR. The Stylo Score is the same whoever you pick; only the advice and picks change.</p>
    <div class="bar-foot"><button class="cta" id="next" ${st.stylist ? '' : 'disabled'}>${st.stylist ? `Get ${esc(byId[st.stylist].name)}'s verdict` : 'Choose a stylist'} <span class="arr">→</span></button></div>`;
  main.querySelectorAll('.scard').forEach(c => { tilt(c, 9); c.onclick = () => {
    st.stylist = c.dataset.s; const s = byId[st.stylist]; theme(s.pal);
    main.querySelectorAll('.scard').forEach(x => x.setAttribute('aria-pressed', x === c));
    const n = $('#next'); n.disabled = false; n.innerHTML = `Get ${esc(s.name)}'s verdict <span class="arr">→</span>`;
    c.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.06) rotate(-2deg)' }, { transform: 'scale(1)' }], { duration: 480, easing: 'cubic-bezier(.34,1.56,.64,1)' });
  }; });
  $('#next').onclick = () => go('verdict');
}

// ------------------------------------------------------------------ VERDICT
function profile() { return { archetypes: st.vibes, occasion: st.occasion, audience: 'everyone' }; }
function stylistPicks(base, s, prof) {
  const ranked = PRODUCTS.map(p => { const r = S.withProduct(base, p, prof); return { r, k: r.delta * .6 + (s.types[p.type] ?? .3) * 6 + (s.tones[p.tone] ?? .3) * 4 + (s.boost.includes(p.slug) ? 5 : 0) + (st.entry === p.slug ? 6 : 0) }; }).sort((a, b) => b.k - a.k);
  const out = [], types = new Set();
  for (const { r } of ranked) { if (out.length === 3) break; if (types.has(r.product.type) && ranked.length - out.length > 3) continue; out.push(r); types.add(r.product.type); }
  return out;
}
const VIBE_LANE = { zari: ['creative', 'rock'], didi: ['night-out', 'creative'], glitch: ['street'], sona: ['old-money', 'street'], nawab: ['old-money'], bhau: ['street'], seoul: ['street', 'creative'], drip: ['night-out', 'street'], kavi: ['bohemian'], raghu: ['rock', 'night-out'] };

async function verdict() {
  const s = byId[st.stylist]; theme(s.pal);
  const prof = profile();
  const photo = { canvas: st.photo.canvas, faces: st.photo.faces, worn: st.photo.worn || [], fp: st.photo.fp };
  const base = await S.scoreLook(photo, prof); st.photo.fp = photo.fp;
  const picks = stylistPicks(base, s, prof);
  const det = st.det || { style: {}, acc: {} };
  const match = Math.round(Math.min(.94, s.lane(det, base.measures) + (st.vibes.some(v => VIBE_LANE[s.id].includes(v)) ? .12 : 0)) * 100);
  const f = B.facts({ stylist: s, det, measures: base.measures, result: base, occasion: OCCASIONS.find(o => o.id === st.occasion).name, vibes: st.vibes.map(v => ARCHETYPES.find(a => a.id === v).name).join(' + '), picks });
  const others = STYLISTS.filter(x => x.id !== s.id);
  main.innerHTML = `
  <section class="verdict">
    <div style="position:relative">
      <div class="polaroid"><div class="ph" id="vph"></div><div class="cap"><span>${esc(f.occasion)}</span><span>${esc(f.vibes)}</span></div></div>
      <div class="stick score"><div><span id="sc">0</span><small>Stylo Score</small></div></div>
      <div class="stick match"><div>${match}%<small>vibe match</small></div></div>
    </div>
    <div>
      <div class="who"><div class="av" style="background:${pattern(s.pattern, s.pal.acc, s.pal.card)};color:${s.pal.bg}">${initials(s.name)}</div><div><b>${s.name}</b><span>${s.role}</span></div></div>
      <p class="speech" id="speech" aria-live="polite"><span class="caret"></span></p>
      <div class="aibadge" id="aib">${st.mode === 'local-ai' ? 'On-device AI · waking up' : 'Instant stylist'}</div>
      <ol class="moves">${s.moves.map((m, i) => `<li style="--i:${i}">${m}</li>`).join('')}</ol>
      <h3 class="h3">${s.name.split(' ')[0]}'s RUMOAR picks</h3>
      <div class="picks">${picks.map((p, i) => `<a class="pk ${i === 0 ? 'top' : ''}" style="--i:${i}" href="${p.product.url}" target="_blank" rel="noopener"><span class="up">+${p.delta} → ${p.total}</span><img src="${p.product.img}" alt="${esc(p.product.name)}" loading="lazy"><div><b>${esc(p.product.name.replace('The ', ''))}</b><div class="pr"><span>${inr(p.product.price)}</span><span>Shop →</span></div></div></a>`).join('')}</div>
      <h3 class="h3">The honest breakdown</h3>
      <div class="pillars">${S.PILLARS.map(([k, n]) => `<div class="pl"><b>${base.pillars[k]}</b><span>${n}</span><div class="meterbar"><i data-w="${base.pillars[k] * 5}"></i></div></div>`).join('')}</div>
      <p class="fine">${esc(base.fix.text)} Demo scoring: palette, contrast and detected accessories, never the face or body. Same photo, same score, whichever stylist you pick.</p>
      <div class="row" style="margin-top:28px"><button class="cta" id="share">Make my share card <span class="arr">→</span></button><button class="ghost" id="restart">New fit</button></div>
      <div class="swap"><h3 class="h3">Ask someone else</h3><div class="row">${others.map(o => `<button data-s="${o.id}"><i style="background:${o.pal.bg};color:${o.pal.card === o.pal.bg ? o.pal.ink : o.pal.card}">${initials(o.name)}</i>${o.name}</button>`).join('')}</div></div>
    </div>
  </section>`;
  $('#vph').appendChild(clone(st.photo.canvas));
  countUp($('#sc'), base.total, 1400);
  requestAnimationFrame(() => requestAnimationFrame(() => main.querySelectorAll('[data-w]').forEach(i => i.style.width = i.dataset.w + '%')));
  main.querySelectorAll('.pk').forEach(p => tilt(p, 6));
  main.querySelectorAll('.swap [data-s]').forEach(b => b.onclick = () => { st.stylist = b.dataset.s; go('verdict'); });
  $('#restart').onclick = () => { st.photo = null; st.det = null; st.stylist = null; go('home'); };
  $('#share').onclick = () => share(s, base, picks[0], $('#speech').dataset.full || B.instantVerdict(f, s));
  setTimeout(() => confetti([s.pal.acc, s.pal.bg, s.pal.ink, s.pal.card]), 500);

  // speak
  const ctrl = new AbortController(); st.verdictAbort = ctrl;
  const sp = $('#speech'), aib = $('#aib');
  const off = B.onAI(a => { if (!aib.isConnected) return off(); if (a.state === 'loading') aib.textContent = `On-device AI · downloading ${Math.round(a.progress * 100)}% (one time)`; if (a.state === 'ready') aib.textContent = 'On-device AI · Qwen2.5 1.5B in your browser'; if (a.state === 'unsupported') aib.textContent = 'Instant stylist (this browser has no WebGPU)'; if (a.state === 'failed') aib.textContent = 'Instant stylist (AI could not load)'; });
  const text = await B.verdict(f, s, { mode: st.mode, signal: ctrl.signal, onToken: t => { if (sp.isConnected) sp.innerHTML = esc(t) + '<span class="caret"></span>'; } });
  if (sp.isConnected) { sp.textContent = text; sp.dataset.full = text; }
  off();
}

async function share(s, base, top, quote) {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div role="dialog" aria-label="Share card"><h2>Your card</h2><p>Made on your device. Post it, send it, flex it.</p><div class="shareimg" id="simg"><p style="padding:40px;text-align:center">Printing…</p></div>
    <div class="row" style="margin-top:20px;justify-content:center"><button class="cta" id="sh1">Share</button><a class="ghost" id="sh2" download="stylo-meter-${s.id}.png">Download</a><button class="ghost" id="sh3">Close</button></div></div>`;
  document.body.appendChild(m);
  m.onclick = e => { if (e.target === m || e.target.id === 'sh3') m.remove(); };
  const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = top.product.img; });
  const ss = quote.split(/(?<=[.!?])\s/); let short = ss[0]; if (short.length < 40 && ss[1]) short += ' ' + ss[1]; if (ss.length > 2) short += ' ' + ss[ss.length - 1];
  const { blob, url } = await stylistCard({ photo: st.photo.canvas, productImg: img, stylist: s, before: base.total, after: top.total, quote: short, occasion: OCCASIONS.find(o => o.id === st.occasion).name });
  $('#simg').innerHTML = `<img src="${url}" alt="Your Stylo Meter card">`; $('#sh2').href = url;
  const file = new File([blob], 'stylo-meter.png', { type: 'image/png' });
  $('#sh1').onclick = () => navigator.canShare?.({ files: [file] }) ? navigator.share({ files: [file], title: 'My Stylo Meter verdict' }).catch(() => {}) : $('#sh2').click();
}

// ------------------------------------------------------------------ brain switch
function brainModal() {
  const m = document.createElement('div'); m.className = 'modal';
  const draw = async () => {
    const gpu = await B.webgpu();
    m.innerHTML = `<div role="dialog" aria-label="Stylist brain"><h2>Stylist brain</h2><p>Both are free and private. Nothing leaves your device. Scores and picks are identical; only how the stylist talks changes.</p>
      <button class="opt" aria-checked="${st.mode === 'instant'}" data-m="instant"><div><b>Instant stylist</b><span>Built-in writer. Works on every phone, zero download.</span></div><em>0 MB</em></button>
      <button class="opt" aria-checked="${st.mode === 'local-ai'}" data-m="local-ai" ${gpu ? '' : 'disabled style="opacity:.45"'}><div><b>On-device AI</b><span>${gpu ? 'An open LLM (Qwen2.5 1.5B) runs on your GPU and improvises in character. Best on a laptop or recent phone.' : 'Needs WebGPU. Try recent Chrome or Edge on a laptop.'}</span></div><em>~1 GB once</em></button>
      <div class="row" style="margin-top:22px"><button class="cta" data-close>Done</button></div></div>`;
  };
  m.onclick = e => {
    const o = e.target.closest('[data-m]');
    if (o && !o.disabled) { st.mode = o.dataset.m; LS.set('mode', st.mode); if (st.mode === 'local-ai') { B.loadAI(); toast('Downloading the stylist brain in the background. Cached after the first time.'); } header(); draw(); }
    if (e.target === m || e.target.closest('[data-close]')) m.remove();
  };
  document.body.appendChild(m); draw();
}

// ------------------------------------------------------------------ boot
$('#brain').onclick = brainModal;
$('#logo').onclick = e => { e.preventDefault(); go('home'); };
cursor();
const start = guard(location.hash.slice(1) || 'home');
history.replaceState({ step: start }, '', '#' + start);
st.step = start; render();
if (st.mode === 'local-ai') B.webgpu().then(g => g ? B.loadAI() : (st.mode = 'instant', header()));
