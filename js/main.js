import { PRODUCTS, bySlug, ARCHETYPES, OCCASIONS, LOOKS } from './catalog.js';
import { STYLISTS, byId } from './stylists.js';
import * as S from './scoring.js';
import * as F from './faceblur.js';
import * as AI from './ai.js';
import * as GM from './game.js';
import { prop } from './props.js';
import { stylistCard } from './share.js';
import { loadPhotos } from './photos.js';
import { words, tilt, magnetic, cursor, countUp, confetti, pattern, reduced } from './fx.js';

// ------------------------------------------------------------------ state
const st = { step: 'home', photo: null, seen: null, seenErr: null, occasion: null, vibes: [], stylist: null, cache: {}, onPhoto: new Set(), brief: null,
  entry: new URLSearchParams(location.search).get('product'), muted: (() => { try { return localStorage.getItem('stylo3:mute') === '1'; } catch { return false; } })() };
const STEPS = ['home', 'scan', 'occasion', 'vibe', 'stylist', 'verdict'];
const main = document.querySelector('main');
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = n => '₹' + n.toLocaleString('en-IN');
const initials = n => n.split(' ').map(w => w[0]).join('').slice(0, 2);
const first = s => s.short || s.name.split(' ')[0];
const occName = id => OCCASIONS.find(o => o.id === id)?.name || '';
const vibeNames = () => st.vibes.map(v => ARCHETYPES.find(a => a.id === v).name);
const saveApi = v => { try { localStorage.setItem('stylo3:api', v); } catch {} };
function toast(t, ms = 3200) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), ms); }
function clone(src) { const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0); return c; }
const avatar = (s, cls = 'av') => s.photo
  ? `<span class="${cls}" style="background:${s.pal.card}"><img src="${s.photo}" alt="${esc(s.name)}" referrerpolicy="no-referrer" onerror="this.remove()"></span>`
  : `<span class="${cls}" style="background:${pattern(s.pattern, s.pal.acc, s.pal.card)};color:${s.pal.bg}">${initials(s.name)}</span>`;

// ------------------------------------------------------------------ sound (tiny synth, no files)
let actx;
function blip(f = 660, d = .09, type = 'triangle', v = .06) {
  if (st.muted || reduced()) return;
  try { actx = actx || new AudioContext(); const o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.value = f; g.gain.setValueAtTime(v, actx.currentTime); g.gain.exponentialRampToValueAtTime(.0001, actx.currentTime + d); o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + d); } catch {}
}
const chord = (base = 523) => [0, 4, 7, 12].forEach((s, i) => setTimeout(() => blip(base * 2 ** (s / 12), .18, 'triangle', .05), i * 70));

// ------------------------------------------------------------------ theme + stylist world
const BASE = { bg: '#FFFFFF', ink: '#0A0A0A', acc: '#EA4E26', card: '#0A0A0A' };
function theme(p = BASE) { const r = document.documentElement.style; for (const k of ['bg', 'ink', 'acc', 'card']) r.setProperty('--' + k, p[k]); document.querySelector('meta[name=theme-color]').content = p.bg; }
let trail = null, worldId = null;
function world(s) {
  if ((s?.id || null) === worldId) return; worldId = s?.id || null;
  document.querySelectorAll('.float-prop').forEach(n => n.remove());
  if (trail) { removeEventListener('pointermove', trail); trail = null; }
  if (!s) return;
  [[2, 16], [90, 12], [93, 60], [3, 72], [80, 86], [12, 42]].forEach(([x, y], i) => {
    const d = document.createElement('div'); d.className = 'float-prop'; d.title = 'Drag me';
    d.innerHTML = prop(s.props[i % s.props.length], s.pal.acc, s.pal.card);
    Object.assign(d.style, { left: x + 'vw', top: y + 'vh', animationDelay: i * .35 + 's' }); d.style.setProperty('--r', (i % 2 ? 1 : -1) * (8 + i * 3) + 'deg');
    drag(d); document.body.appendChild(d);
  });
  if (matchMedia('(pointer: fine)').matches && !reduced()) {
    let last = 0;
    trail = e => {
      if (performance.now() - last < 110) return; last = performance.now();
      const t = document.createElement('div'); t.className = 'trail'; t.innerHTML = prop(s.props[Math.floor(Math.random() * s.props.length)], s.pal.acc, s.pal.card);
      t.style.left = e.clientX + 'px'; t.style.top = e.clientY + 'px'; document.body.appendChild(t); setTimeout(() => t.remove(), 900);
    };
    addEventListener('pointermove', trail, { passive: true });
  }
}
function drag(el) {
  let sx = null, sy, ox, oy;
  el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); sx = e.clientX; sy = e.clientY; const r = el.getBoundingClientRect(); ox = r.left; oy = r.top; el.classList.add('held'); blip(880, .05); });
  el.addEventListener('pointermove', e => { if (sx == null) return; el.style.left = ox + e.clientX - sx + 'px'; el.style.top = oy + e.clientY - sy + 'px'; });
  el.addEventListener('pointerup', () => { sx = null; el.classList.remove('held'); });
}

// ------------------------------------------------------------------ game UI
function hud() {
  const L = GM.level();
  $('#hud').innerHTML = `<span class="lvl" style="--p:${L.pct}"><b>${L.n}</b></span><span class="t"><b>${esc(L.name)}</b><small>${GM.G.xp} XP${GM.G.streak.count > 1 ? ` · ${GM.G.streak.count}-day streak` : ''}</small></span>`;
}
GM.onGame(ev => {
  hud();
  if (ev.type === 'xp') floatXP(`+${ev.xp} XP`, ev.reason);
  if (ev.type === 'badge') setTimeout(() => { toast(`Badge unlocked: ${ev.badge[0]}`); blip(988, .2); }, 400);
  if (ev.type === 'level') setTimeout(() => levelUp(ev), 1100);
});
function floatXP(t, why) {
  const d = document.createElement('div'); d.className = 'xpfloat'; d.innerHTML = `<b>${esc(t)}</b><span>${esc(why)}</span>`;
  d.style.top = 74 + document.querySelectorAll('.xpfloat').length * 48 + 'px';
  document.body.appendChild(d); blip(740, .08); setTimeout(() => d.remove(), 2600);
}
function levelUp(ev) {
  chord(523); confetti(['#EA4E26', '#FFD84D', '#7B5CFF', '#3AFFB4', '#FF3D7F']);
  modal(`<div class="lvlup"><div class="kick">Level up</div><div class="big">Lv ${ev.level.n}</div><h2>${esc(ev.level.name)}</h2>
    ${ev.unlockedStylists.length ? `<p>New stylist${ev.unlockedStylists.length > 1 ? 's' : ''} unlocked</p><div class="row" style="justify-content:center;margin-top:14px">${ev.unlockedStylists.map(s => `<div class="unl">${avatar(s)}<b>${esc(s.name)}</b><span>${esc(s.role)}</span></div>`).join('')}</div>` : '<p>More stylists unlock as you level up.</p>'}
    <button class="cta" data-close style="margin-top:22px">Let's go</button></div>`);
}
function modal(html) {
  const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div role="dialog">${html}</div>`;
  const esc_ = e => { if (e.key === 'Escape') close(); }; const close = () => { m.remove(); removeEventListener('keydown', esc_); };
  m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) close(); });
  addEventListener('keydown', esc_); document.body.appendChild(m); return m;
}
function profile() {
  const L = GM.level(), G = GM.G, b = GM.dailyBrief();
  const m = modal(`<div class="prof">
    <div class="row" style="gap:18px;flex-wrap:nowrap"><span class="lvl big" style="--p:${L.pct}"><b>${L.n}</b></span><div><h2>${esc(L.name)}</h2><p style="margin:4px 0 0">${G.xp} XP · ${L.next > L.cur ? `${L.next - G.xp} XP to level ${L.n + 1}` : 'Max level'} · ${G.fits} verdicts · ${G.renders} AI renders</p></div></div>
    <h3 class="h3">Daily brief</h3><div class="brief ${b.done ? 'done' : ''}">${avatar(byId[b.stylist])}<div><b>${esc(occName(b.occasion))} with ${esc(byId[b.stylist].name)}</b><span>Score ${b.target}+ · +80 XP</span></div><em>${b.done ? 'Done ✓' : 'Open'}</em></div>
    ${G.mission ? `<h3 class="h3">Active mission</h3><div class="brief">${avatar(byId[G.mission.stylistId])}<div><b>${esc(G.mission.title)}</b><span>${esc(G.mission.task)} Beat ${G.mission.base + 3} with a new photo.</span></div><em>+120</em></div>` : ''}
    <h3 class="h3">Stylist deck · ${Object.keys(G.met).length}/${STYLISTS.length} met</h3>
    <div class="coll">${STYLISTS.map(s => { const u = GM.unlocked(s); return `<div class="ci ${u ? '' : 'locked'} ${G.met[s.id] ? 'met' : ''}">${u ? avatar(s) : `<span class="av lockav">Lv ${s.unlock}</span>`}<b>${u ? esc(s.name) : 'Locked'}</b><span>${G.best[s.id] ? `Best ${G.best[s.id]}` : u ? 'Not met yet' : `Level ${s.unlock}`}</span></div>`; }).join('')}</div>
    <h3 class="h3">Badges · ${Object.keys(G.badges).length}/${Object.keys(GM.BADGES).length}</h3>
    <div class="badges">${Object.entries(GM.BADGES).map(([k, [n, d]]) => `<div class="bd ${G.badges[k] ? 'on' : ''}"><i>${G.badges[k] ? '★' : '?'}</i><b>${n}</b><span>${d}</span></div>`).join('')}</div>
    <div class="row" style="margin-top:22px"><button class="cta" data-close>Close</button><button class="ghost" id="resetG">Reset progress</button></div></div>`);
  m.querySelector('#resetG').onclick = () => { if (confirm('Reset all XP, badges and stylists?')) { GM.reset(); m.remove(); render(); } };
}

// ------------------------------------------------------------------ navigation
function go(step, push = true) {
  st.step = step; if (push) history.pushState({ step }, '', '#' + step);
  const run = () => { render(); scrollTo({ top: 0, behavior: 'instant' }); };
  if (document.startViewTransition && !reduced()) document.startViewTransition(run); else run();
}
addEventListener('popstate', e => go(guard(e.state?.step || 'home'), false));
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
  if (st.photo && !['home', 'scan'].includes(st.step)) { const w = document.createElement('button'); w.className = 'mini'; w.title = 'Change photo'; w.appendChild(clone(st.photo.canvas)); w.onclick = () => go('home'); m.appendChild(w); }
  $('#mute').setAttribute('aria-pressed', !st.muted); $('#mute').title = st.muted ? 'Sound off' : 'Sound on';
  hud();
}
function render() {
  header();
  if (!['stylist', 'verdict'].includes(st.step)) { theme(); world(null); }
  ({ home, scan, occasion, vibe, stylist, verdict })[st.step]();
  main.querySelectorAll('.cta').forEach(el => magnetic(el, .18));
}

// ------------------------------------------------------------------ setup card (AI server)
function setupCard() {
  return `<div class="setup"><div><b>Connect the AI brain</b><span>The Stylo Meter's AI runs on your free Cloudflare Worker. Deploy <code>worker/worker.js</code> (5 minutes, steps in the README) and paste its URL here, or set it in <code>js/config.js</code>.</span></div>
    <div class="row"><input id="setupUrl" placeholder="https://stylo-meter-ai.yourname.workers.dev" aria-label="Worker URL" value="${esc(AI.base())}"><button class="ghost" data-setup>Connect</button></div></div>`;
}
document.addEventListener('click', async e => {
  if (!e.target.closest('[data-setup]')) return;
  const v = $('#setupUrl')?.value.trim().replace(/\/$/, '');
  if (!/^https:\/\//.test(v || '')) return toast('Paste the https:// URL of your Worker');
  saveApi(v); const h = await AI.health();
  toast(h?.ok ? 'AI server connected ✓' : 'Saved, but the server did not answer. Check the URL and ALLOWED_ORIGIN.');
  if (h?.ok) { if (st.step === 'scan' || st.step === 'verdict') { if (st.step === 'verdict') go('scan'); analyse(); } else render(); }
});

// ------------------------------------------------------------------ HOME
function home() {
  const b = GM.dailyBrief(), bs = byId[b.stylist];
  main.innerHTML = `
  ${AI.connected() ? '' : setupCard()}
  <section class="home">
    <div>
      <div class="kick">${st.entry && bySlug[st.entry] ? `From the store: ${esc(bySlug[st.entry].name)}` : 'RUMOAR presents the Stylo Meter'}</div>
      <h1 class="mega rise">${words('Does this')}<br>${words('look')} <em class="o w" style="--i:2">good</em><br>${words('on me?')}</h1>
      <p class="lede">Drop your fit. Pick the occasion, the vibe and a stylist with opinions. A vision AI actually looks at your photo, scores it honestly, and your stylist tells you what to change. Then it renders you wearing the RUMOAR piece.</p>
      <button class="brief ${b.done ? 'done' : ''}" id="brief">${avatar(bs)}<div><b>Today's brief: ${esc(occName(b.occasion))} with ${esc(bs.name)}</b><span>Score ${b.target}+ for +80 XP · resets daily</span></div><em>${b.done ? 'Done ✓' : st.brief ? 'Armed ✓' : 'Play'}</em></button>
    </div>
    <div>
      <label class="drop" id="drop" tabindex="0">
        <input type="file" accept="image/*" class="sr" id="file">
        <div class="dial"></div><div class="needle" id="needle"></div>
        <div><b>Drop your fit</b><small>or tap to choose · head to shoes works best</small></div>
      </label>
      <div class="samples"><span>No photo? Try one:</span>${LOOKS.slice(0, 5).map(l => `<button data-sample="${l.id}" aria-label="Sample: ${esc(l.desc)}"><img src="${l.img}" alt=""></button>`).join('')}</div>
    </div>
  </section>
  <div class="marquee" aria-hidden="true"><div>${[...STYLISTS, ...STYLISTS].map(s => `<span><i>${prop(s.props[0], s.pal.acc, s.pal.card)}</i>${esc(s.name)}</span>`).join('')}</div></div>`;
  const drop = $('#drop'), file = $('#file'), needle = $('#needle');
  file.onchange = () => file.files[0] && takePhoto(file.files[0]);
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } });
  if (home.mv) removeEventListener('pointermove', home.mv);
  home.mv = e => { if (!needle.isConnected) return; const r = drop.getBoundingClientRect(); needle.style.transform = `translateX(-50%) rotate(${Math.max(-70, Math.min(70, ((e.clientX - r.left) / r.width - .5) * 150))}deg)`; };
  addEventListener('pointermove', home.mv, { passive: true }); needle.style.transform = 'translateX(-50%) rotate(-30deg)';
  main.querySelectorAll('[data-sample]').forEach(x => x.onclick = () => takeSample(x.dataset.sample));
  $('#brief').onclick = () => { if (b.done) return toast('Brief already beaten today. New one tomorrow.'); if (!GM.unlocked(bs)) return toast(`${bs.name} unlocks at level ${bs.unlock}.`); st.brief = b; blip(880, .1); toast(`Brief armed: ${occName(b.occasion)} with ${bs.name}. Drop a photo.`); render(); };
}
['dragenter', 'dragover'].forEach(ev => addEventListener(ev, e => { e.preventDefault(); $('#drop')?.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => addEventListener(ev, e => { e.preventDefault(); $('#drop')?.classList.remove('over'); }));
addEventListener('drop', e => { const f = [...(e.dataTransfer?.files || [])].find(f => f.type.startsWith('image/')); if (f) takePhoto(f); });

async function takePhoto(file) {
  let canvas; try { canvas = await F.fileToCanvas(file); } catch { toast('That file could not be opened. Try a JPG or PNG.'); return; }
  newPhoto({ canvas, faces: [], status: 'detecting' });
}
async function takeSample(id) { newPhoto({ canvas: await F.urlToCanvas(LOOKS.find(x => x.id === id).img), faces: [], status: 'ok', sample: true }); }
function newPhoto(p) {
  st.photo = p; st.seen = null; st.seenErr = null; st.onPhoto = new Set();
  if (st.brief) st.occasion = st.brief.occasion;
  go('scan'); processPhoto();
}

// ------------------------------------------------------------------ SCAN
function scan() {
  main.innerHTML = `
  <section class="scan">
    <div class="polaroid"><div class="ph" id="ph"><div class="laser" id="laser"></div></div><div class="cap"><span>Your fit</span><span id="capR"></span></div></div>
    <div>
      <div class="kick"><b>1</b>The scan</div>
      <h2 class="h rise">${words('Let me take a look.')}</h2>
      <ul class="log"><li id="lg_blur"><i></i><span>Blurring faces on your device</span><small id="lgs_blur"></small></li><li id="lg_eyes"><i></i><span>AI reading the outfit</span><small id="lgs_eyes"></small></li></ul>
      <div id="seen"></div><div id="manual"></div>
      <div class="row" style="margin-top:28px"><button class="cta" id="next" disabled>${st.brief ? 'Pick the vibe' : "Where's it going"} <span class="arr">→</span></button><button class="ghost" id="again">Different photo</button></div>
    </div>
  </section>`;
  paintPhoto(); $('#again').onclick = () => go('home');
  $('#next').onclick = () => go(st.brief ? 'vibe' : 'occasion');
  refreshScan();
}
function paintPhoto() {
  const ph = $('#ph'); if (!ph || !st.photo) return;
  ph.querySelectorAll('canvas,.fbox').forEach(n => n.remove()); ph.prepend(clone(st.photo.canvas));
  const W = st.photo.canvas.width, H = st.photo.canvas.height;
  requestAnimationFrame(() => { const r = ph.getBoundingClientRect(), s = Math.max(r.width / W, r.height / H), ox = (r.width - W * s) / 2, oy = (r.height - H * s) / 2;
    st.photo.faces.forEach((f, i) => { const d = document.createElement('div'); d.className = 'fbox'; Object.assign(d.style, { left: ox + (f.x - f.w * .3) * s + 'px', top: oy + (f.y - f.h * .35) * s + 'px', width: f.w * 1.6 * s + 'px', height: f.h * 1.8 * s + 'px', animationDelay: i * 120 + 'ms' }); ph.appendChild(d); }); });
}
function setLog(k, state, sub) { const li = $('#lg_' + k); if (!li) return; li.className = state; li.querySelector('i').textContent = state === 'done' ? '✓' : state === 'err' ? '!' : ''; if (sub !== undefined) $('#lgs_' + k).textContent = sub; }
function refreshScan() {
  if (st.step !== 'scan' || !st.photo || !$('#lg_blur')) return;
  const p = st.photo;
  setLog('blur', p.status === 'ok' ? 'done' : 'on', p.status === 'detecting' ? 'working…' : p.status === 'needs' ? 'tap your face to blur it' : p.sample ? 'sample is pre-blurred' : p.faces.length ? `${p.faces.length} blurred` : 'no face in shot');
  const man = $('#manual');
  if (p.status === 'needs') {
    man.innerHTML = `<p class="lede" style="margin-top:14px">I couldn't find a face automatically. Tap your face on the photo to blur it, or confirm there isn't one. Nothing goes to the AI until this is done.</p><div class="row" style="margin-top:12px"><button class="ghost" id="noface">No face in this photo</button></div>`;
    $('#noface').onclick = () => { p.status = 'ok'; analyse(); };
    const ph = $('#ph'); ph.classList.add('tap');
    ph.onclick = e => { const r = ph.getBoundingClientRect(), W = p.canvas.width, H = p.canvas.height, s = Math.max(r.width / W, r.height / H);
      const f = F.manualFace(p.canvas, (e.clientX - r.left - (r.width - W * s) / 2) / s, (e.clientY - r.top - (r.height - H * s) / 2) / s);
      p.canvas = F.blurFaces(p.canvas, [f]); p.faces.push(f); p.status = 'ok'; ph.classList.remove('tap'); ph.onclick = null; paintPhoto(); analyse(); };
  } else man.innerHTML = '';
  const seenEl = $('#seen');
  if (!AI.connected()) { setLog('eyes', 'err', 'AI server not connected'); seenEl.innerHTML = setupCard(); }
  else if (st.seenErr) { setLog('eyes', 'err', st.seenErr); seenEl.innerHTML = `<div class="row" style="margin-top:14px"><button class="ghost" id="retry">Try again</button></div>`; $('#retry').onclick = () => analyse(); }
  else if (!st.seen) setLog('eyes', p.status === 'ok' ? 'on' : '', p.status === 'ok' ? 'Llama 4 Scout is looking…' : '');
  else {
    const s = st.seen; setLog('eyes', 'done', 'seen by AI');
    const items = [...(s.garments || []).map(g => `${g.colour} ${g.item}`), ...(s.accessories || []).map(a => `${a.colour ? a.colour + ' ' : ''}${a.item}`), s.footwear && !/not visible/i.test(s.footwear) ? s.footwear : null].filter(Boolean);
    seenEl.innerHTML = `<div class="seen"><div class="lbl">What the AI sees</div><div class="chips">${items.map((c, i) => `<span class="chip" style="--i:${i}">${esc(c)}</span>`).join('')}</div>
      ${s.style_read ? `<p class="read">“${esc(s.style_read)}”</p>` : ''}${(s.photo_issues || []).length ? `<p class="small">Photo note: ${esc(s.photo_issues.join('; '))}</p>` : ''}${s.is_outfit_photo === false ? '<p class="small warn">This does not look like an outfit photo. Results may be off.</p>' : ''}</div>`;
    $('#laser')?.remove(); $('#capR').textContent = 'read ✓'; $('#next').disabled = false; blip(880, .08);
  }
}
async function processPhoto() {
  const p = st.photo;
  if (p.sample) { refreshScan(); return analyse(); }
  const faces = await F.detectFaces(p.canvas);
  if (st.photo !== p) return;
  if (faces && faces.length) { p.canvas = F.blurFaces(p.canvas, faces); p.faces = faces; p.status = 'ok'; paintPhoto(); refreshScan(); analyse(); }
  else { p.status = 'needs'; refreshScan(); }
}
async function analyse() {
  const p = st.photo; if (!p || p.status !== 'ok') return;
  p.key = S.fingerprint(p.canvas); p.url = AI.toDataURL(p.canvas, 768); p.small = AI.toDataURL(p.canvas, 496);
  st.seenErr = null; st.seen = null; refreshScan();
  if (!AI.connected()) return;
  try { const s = await AI.see(p.url); if (st.photo === p) st.seen = s; }
  catch (e) { if (st.photo === p) st.seenErr = e.message; }
  refreshScan();
}

// ------------------------------------------------------------------ OCCASION / VIBE
const OCC_COPY = { 'date-night': 'Dinner, drinks, a first impression', concert: 'Crowds, lights, hands free', office: 'Meetings, desk to dinner', college: 'Lectures, canteen, all day', festival: 'Sun, dust, dancing' };
function occasion() {
  main.innerHTML = `<div class="kick"><b>2</b>The occasion</div><h2 class="h rise">${words("Where's the fit going?")}</h2>
    <div class="occs">${OCCASIONS.map(o => `<button class="occ" data-o="${o.id}"><b>${o.name}</b><span>${OCC_COPY[o.id]}</span></button>`).join('')}</div>`;
  main.querySelectorAll('.occ').forEach((b, i) => { b.onmouseenter = () => blip(420 + i * 70, .05); b.onclick = () => { st.occasion = b.dataset.o; go('vibe'); }; });
}
function vibe() {
  main.innerHTML = `<div class="kick"><b>3</b>The vibe</div><h2 class="h rise">${words('Who are you today?')}</h2><p class="lede">Pick one or two.</p>
    <div class="vibes">${ARCHETYPES.map(a => `<button class="vibe" aria-pressed="${st.vibes.includes(a.id)}" data-v="${a.id}" style="background:linear-gradient(150deg, ${a.swatch[0]}, ${a.swatch[1]})"><span class="blob" style="background:${a.swatch[0]}"></span><span class="tick">✓</span><b>${a.name}</b><small>${a.hint}</small></button>`).join('')}</div>
    <div class="bar-foot"><button class="cta" id="next" ${st.vibes.length ? '' : 'disabled'}>Pick my stylist <span class="arr">→</span></button></div>`;
  main.querySelectorAll('.vibe').forEach(b => { tilt(b, 6); b.onclick = () => {
    const id = b.dataset.v; st.vibes = st.vibes.includes(id) ? st.vibes.filter(x => x !== id) : [...st.vibes, id].slice(-2); blip(600, .06);
    main.querySelectorAll('.vibe').forEach(x => x.setAttribute('aria-pressed', st.vibes.includes(x.dataset.v))); $('#next').disabled = !st.vibes.length; }; });
  $('#next').onclick = () => { if (st.brief && st.occasion === st.brief.occasion) st.stylist = st.brief.stylist; go('stylist'); };
}

// ------------------------------------------------------------------ STYLIST
function cardHTML(s) {
  const P = s.pal, u = GM.unlocked(s), best = GM.G.best[s.id];
  return `<button class="scard ${u ? '' : 'locked'}" data-s="${s.id}" aria-pressed="${st.stylist === s.id}" style="--c1:${P.bg};--c2:${P.ink};--c3:${P.acc};--c4:${P.card}" ${u ? '' : `aria-label="${esc(s.name)}, locked until level ${s.unlock}"`}>
    <div class="art" style="background:${pattern(s.pattern, P.acc, P.bg)}">${s.photo ? `<img class="face" src="${s.photo}" alt="${esc(s.name)}" referrerpolicy="no-referrer" onerror="this.remove()">` : `<span class="mono">${initials(s.name)}</span>`}
      <span class="p1">${prop(s.props[0], P.acc, P.card)}</span><span class="p2">${prop(s.props[1], P.bg, P.card)}</span>
      <span class="spice" title="Spice ${s.spice}/5">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= s.spice ? 'on' : ''}"></i>`).join('')}</span>
      ${best ? `<span class="bestb">Best ${best}</span>` : ''}${u ? '' : `<span class="lock"><b>Lv ${s.unlock}</b>to unlock</span>`}</div>
    <div class="body"><h3>${esc(s.name)}</h3><div class="role">${esc(s.role)}</div><p>${esc(s.bio)}</p></div><span class="shine"></span></button>`;
}
function stylist() {
  const sel = st.stylist && GM.unlocked(byId[st.stylist]) ? byId[st.stylist] : null; if (!sel) st.stylist = null;
  theme(sel?.pal); world(sel);
  main.innerHTML = `<div class="kick"><b>4</b>The vibe icon</div><h2 class="h rise">${words('Pick your vibe icon.')}</h2>
    <p class="lede">Each one has a lane, a temper, their own props and favourite RUMOAR pieces. Same honest score, very different advice. Level up to unlock the rest of the deck.</p>
    <div class="deck">${STYLISTS.map(cardHTML).join('')}</div>
    <div class="bar-foot"><button class="cta" id="next" ${sel ? '' : 'disabled'}>${sel ? `Get the ${esc(first(sel))}-vibe verdict` : 'Choose a stylist'} <span class="arr">→</span></button></div>`;
  main.querySelectorAll('.scard').forEach(c => { tilt(c, 9); c.onclick = () => {
    const s = byId[c.dataset.s];
    if (!GM.unlocked(s)) { c.animate?.([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }], { duration: 300 }); blip(180, .15, 'square'); return toast(`${s.name} unlocks at level ${s.unlock}. Earn XP with verdicts, try-ons and missions.`); }
    st.stylist = s.id; theme(s.pal); world(s); chord(392 + s.spice * 40);
    main.querySelectorAll('.scard').forEach(x => x.setAttribute('aria-pressed', x === c));
    const n = $('#next'); n.disabled = false; n.innerHTML = `Get the ${esc(first(s))}-vibe verdict <span class="arr">→</span>`;
    c.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.06) rotate(-2deg)' }, { transform: 'scale(1)' }], { duration: 480, easing: 'cubic-bezier(.34,1.56,.64,1)' });
  }; });
  $('#next').onclick = () => go('verdict');
}

// ------------------------------------------------------------------ VERDICT
const catalog = () => PRODUCTS.map(p => ({ slug: p.slug, name: p.name, type: p.type, tone: p.tone, price: p.price }));
const cacheKey = () => [st.photo.key, st.occasion, st.vibes.join('+')].join('|');

async function verdict() {
  const s = byId[st.stylist]; theme(s.pal); world(s);
  if (!AI.connected() || !st.seen) {
    main.innerHTML = `<div class="kick"><b>5</b>The verdict</div><h2 class="h">${words(AI.connected() ? 'The AI has not read your photo yet.' : 'The AI brain is not connected.')}</h2>
      <p class="lede">The ${esc(first(s))}-vibe verdict only talks about what the AI actually sees in your photo. No guessing, no made-up verdicts.</p>${AI.connected() ? '' : setupCard()}<div class="row" style="margin-top:20px"><button class="ghost" id="back">Back to the scan</button></div>`;
    $('#back').onclick = () => go('scan'); return;
  }
  let li = 0;
  main.innerHTML = `<section class="thinking">${avatar(s, 'av xl')}<h2 class="h" id="thinkT">${esc(s.loading[0])}</h2><div class="dots"><i></i><i></i><i></i></div><p class="lede">The AI is reading your fit through the ${esc(first(s))} lens.</p></section>`;
  const tick = setInterval(() => { const t = $('#thinkT'); if (!t) return clearInterval(tick); li++; t.textContent = s.loading[li % s.loading.length]; }, 2200);
  const k = cacheKey(), cached = st.cache[k];
  let r;
  try {
    r = await AI.verdict({ image: st.photo.url, seen: st.seen, occasion: st.occasion, vibes: vibeNames(), catalog: catalog(),
      stylist: { name: s.name, short: first(s), role: s.role, voice: s.voice, lane: s.lane, moves: s.moves, favourites: s.favourites, persona: s.persona, avoid: s.avoid },
      fixedPillars: cached ? Object.fromEntries(Object.entries(cached).map(([k2, v]) => [k2, v.score])) : undefined });
  } catch (e) {
    clearInterval(tick);
    if (st.step !== 'verdict') return;
    main.innerHTML = `<section class="thinking">${avatar(s, 'av xl')}<h2 class="h">${esc(e.message)}</h2><div class="row" style="justify-content:center;margin-top:20px"><button class="cta" id="retry">Try again</button><button class="ghost" id="back">Pick another stylist</button></div></section>`;
    $('#retry').onclick = () => verdict(); $('#back').onclick = () => go('stylist'); return;
  }
  clearInterval(tick);
  if (st.step !== 'verdict' || st.stylist !== s.id) return;
  if (!cached) st.cache[k] = r.pillars;
  st.onPhoto.add(s.id);
  showVerdict(s, r);
}

function showVerdict(s, r) {
  const base = { pillars: Object.fromEntries(Object.entries(r.pillars).map(([k, v]) => [k, v.score])), total: r.total, measures: S.measure(st.photo.canvas, st.photo.faces) };
  const prof = { occasion: st.occasion, archetypes: st.vibes };
  const picks = r.picks.filter(p => bySlug[p.slug]).map(p => ({ ...S.withProduct(base, bySlug[p.slug], prof), why: p.why }));
  const others = STYLISTS.filter(x => x.id !== s.id), F1 = esc(first(s));
  const accepted = GM.G.mission?.stylistId === s.id && GM.G.mission?.title === r.mission.title;
  main.innerHTML = `
  <section class="verdict">
    <div class="vleft">
      <div class="polaroid"><div class="ph" id="vph"></div><div class="cap"><span>${esc(occName(st.occasion))}</span><span>${esc(vibeNames().join(' + '))}</span></div></div>
      <div class="stick score"><div><span id="sc">0</span><small>Stylo Score</small></div></div>
      <div class="stick match"><div>${r.vibe_match}%<small>${F1} vibe match</small></div></div>
      <div class="rewards" id="rewards"></div>
    </div>
    <div>
      <div class="who">${avatar(s)}<div><b>The ${esc(s.name)} vibe</b><span>${esc(s.role)}${s.photoCredit ? ` · <a href="${s.photoCredit}" target="_blank" rel="noopener">photo</a>` : ''}</span></div><span class="props-row">${s.props.map(p => `<i>${prop(p, s.pal.acc, s.pal.card)}</i>`).join('')}</span></div>
      <p class="speech" id="speech" aria-live="polite"><span class="caret"></span></p>
      ${r.already || r.missing ? `<div class="vread">${r.already ? `<div><span class="lbl">Already giving ${F1}</span><p>${esc(r.already)}</p></div>` : ''}${r.missing ? `<div><span class="lbl">Not ${F1} yet</span><p>${esc(r.missing)}</p></div>` : ''}</div>` : ''}
      <div class="aibadge">Seen and written by ${esc(r.model || 'AI')} · face blurred before upload · a vibe read, not words from ${F1}</div>
      <h3 class="h3">Three moves for the ${F1} vibe</h3>
      <ol class="moves">${r.moves.map((m, i) => `<li style="--i:${i}">${esc(m)}</li>`).join('')}</ol>
      <div class="mission"><div><span class="lbl">${F1}-vibe mission · +120 XP</span><b>${esc(r.mission.title)}</b><p>${esc(r.mission.task)} Re-shoot, pick ${F1} again, and beat ${r.total + 3}.</p></div><button class="ghost" id="accept" ${accepted ? 'disabled' : ''}>${accepted ? 'Accepted ✓' : 'Accept mission'}</button></div>
      <h3 class="h3">RUMOAR picks for the ${F1} vibe</h3>
      <div class="picks">${picks.map((p, i) => `<div class="pk ${i === 0 ? 'top' : ''}" style="--i:${i}"><span class="up">+${p.delta} → ${p.total}</span><img src="${p.product.img}" alt="${esc(p.product.name)}" loading="lazy"><div><b>${esc(p.product.name.replace('The ', ''))}</b>${p.why ? `<p>${esc(p.why)}</p>` : ''}<div class="pr"><span>${inr(p.product.price)}</span><a href="${p.product.url}" target="_blank" rel="noopener">Shop →</a></div><button class="tryon" data-slug="${p.product.slug}" data-gain="${p.delta}">Render me with it</button></div></div>`).join('')}</div>
      <div class="studio" id="studio"></div>
      <h3 class="h3">The honest breakdown</h3>
      <div class="pillars">${S.PILLARS.map(([k, n]) => `<div class="pl"><b>${r.pillars[k].score}</b><span>${n}</span><div class="meterbar"><i data-w="${r.pillars[k].score * 5}"></i></div><p>${esc(r.pillars[k].why)}</p></div>`).join('')}</div>
      <div class="row" style="margin-top:28px"><button class="cta" id="restyle">Restyle me in the ${F1} vibe <span class="arr">→</span></button><button class="ghost" id="share">Share card</button><button class="ghost" id="restart">New fit</button></div>
      <div class="swap"><h3 class="h3">Try another vibe · same score, new advice</h3><div class="row">${others.map(o => { const u = GM.unlocked(o); return `<button data-s="${o.id}" class="${u ? '' : 'locked'}" ${u ? '' : `title="Unlocks at level ${o.unlock}"`}>${u ? avatar(o, 'mav') : `<span class="mav lockav">${o.unlock}</span>`}${u ? esc(o.name) : 'Locked'}</button>`; }).join('')}</div></div>
    </div>
  </section>`;
  $('#vph').appendChild(clone(st.photo.canvas));
  slot($('#sc'), r.total);
  requestAnimationFrame(() => requestAnimationFrame(() => main.querySelectorAll('[data-w]').forEach(i => i.style.width = i.dataset.w + '%')));
  main.querySelectorAll('.pk').forEach(p => tilt(p, 5));
  main.querySelectorAll('.swap [data-s]').forEach(b => b.onclick = () => { const o = byId[b.dataset.s]; if (!GM.unlocked(o)) return toast(`${o.name} unlocks at level ${o.unlock}.`); st.stylist = o.id; go('verdict'); });
  $('#restart').onclick = () => { st.photo = null; st.seen = null; st.brief = null; go('home'); };
  $('#accept').onclick = e => { GM.acceptMission({ stylistId: s.id, title: r.mission.title, task: r.mission.task, base: r.total, photoKey: st.photo.key }); e.currentTarget.textContent = 'Accepted ✓'; e.currentTarget.disabled = true; blip(880, .1); toast(`Mission accepted. Re-shoot, then pick ${first(s)} again.`); };
  main.querySelectorAll('.tryon').forEach(b => b.onclick = () => studio('tryon', s, r, bySlug[b.dataset.slug], +b.dataset.gain));
  $('#restyle').onclick = () => studio('restyle', s, r);
  $('#share').onclick = () => share(s, r, picks[0]);
  typeOut($('#speech'), r.verdict);
  setTimeout(() => {
    const got = GM.recordVerdict({ stylistId: s.id, occasion: st.occasion, total: r.total, photoKey: st.photo.key, stylistsOnPhoto: st.onPhoto.size });
    if (GM.G.daily === GM.dailyBrief().date) st.brief = null;
    const rw = $('#rewards'); if (rw) rw.innerHTML = got.map(([xp, why], i) => `<div style="--i:${i}"><b>+${xp}</b>${esc(why)}</div>`).join('');
    confetti([s.pal.acc, s.pal.bg, s.pal.ink, s.pal.card]); chord(440 + (r.total - 50) * 6);
  }, 1500);
}
function slot(el, to) {
  if (reduced()) { el.textContent = to; return; }
  let n = 0; const iv = setInterval(() => { el.textContent = Math.floor(40 + Math.random() * 59); blip(300 + Math.random() * 400, .02, 'square', .02); if (++n > 16) { clearInterval(iv); countUp(el, to, 500, Math.max(0, to - 12)); } }, 60);
}
async function typeOut(el, text) {
  const w = text.split(' '); let out = '';
  for (let i = 0; i < w.length; i++) { if (!el.isConnected) return; out += (i ? ' ' : '') + w[i]; el.innerHTML = esc(out) + '<span class="caret"></span>'; await new Promise(r => setTimeout(r, 38 + (/[.!?]$/.test(w[i]) ? 160 : 0))); }
  el.textContent = text;
}

// AI image studio: try-on or restyle, revealed with a before/after slider
async function studio(mode, s, r, product, gain = 0) {
  const box = $('#studio'); if (!box) return;
  box.innerHTML = `<div class="stu"><div class="ba" id="ba"><div class="layer"><canvas id="baA" class="fill"></canvas></div><div class="layer before" id="baB"></div><div class="handle" id="baH"></div><input type="range" min="2" max="98" value="98" id="baR" aria-label="Before and after"><span class="pill l">Before</span><span class="pill r">AI render</span>
      <div class="busy" id="busy"><div class="dots"><i></i><i></i><i></i></div><b>${mode === 'tryon' ? `Rendering you with ${esc(product.name.replace('The ', ''))}…` : `Restyling you in the ${esc(first(s))} vibe…`}</b><span>FLUX.2 [klein] 9B on Cloudflare · usually 10–30 s</span></div></div>
    <div class="stuinfo"><span class="lbl">${mode === 'tryon' ? 'AI try-on' : 'AI restyle'}</span><b>${mode === 'tryon' ? esc(product.name) : `You, in the ${esc(first(s))} vibe`}</b><p>${mode === 'tryon' ? 'Your photo plus this RUMOAR piece, rendered by AI. Your face stays blurred.' : esc(r.restyle_prompt)}</p><div id="stuAct"></div></div></div>`;
  box.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' });
  const before = clone(st.photo.canvas); before.className = 'fill'; $('#baB').appendChild(before);
  const a = $('#baA'); a.width = st.photo.canvas.width; a.height = st.photo.canvas.height; a.getContext('2d').drawImage(st.photo.canvas, 0, 0);
  const rg = $('#baR'), set = v => { $('#baB').style.clipPath = `inset(0 ${100 - v}% 0 0)`; $('#baH').style.left = v + '%'; }; rg.oninput = () => set(rg.value); set(98);
  try {
    const body = { image: st.photo.small, mode, prompt: mode === 'restyle' ? r.restyle_prompt : '' };
    if (mode === 'tryon') body.productImage = await AI.urlToDataURL(product.img, 496);
    const out = await AI.render(body);
    const img = new Image(); img.src = out.image; await img.decode();
    a.width = img.width; a.height = img.height; a.getContext('2d').drawImage(img, 0, 0);
    $('#busy')?.remove();
    let v = 98; const anim = () => { v -= 2; set(Math.max(50, v)); rg.value = Math.max(50, v); if (v > 50) requestAnimationFrame(anim); }; anim();
    $('#stuAct').innerHTML = `<div class="row"><a class="ghost" download="stylo-${mode}.jpg" href="${out.image}">Save image</a>${mode === 'tryon' ? `<a class="cta sm" href="${product.url}" target="_blank" rel="noopener">Shop it · ${inr(product.price)}</a>` : ''}</div><p class="small">${esc(out.label || 'AI-generated image')}.</p>`;
    GM.recordRender(mode, gain); chord(660);
  } catch (e) {
    const b = $('#busy'); if (b) b.innerHTML = `<b>${esc(e.message)}</b><button class="ghost" id="stuRetry">Try again</button>`;
    $('#stuRetry')?.addEventListener('click', () => studio(mode, s, r, product, gain));
  }
}

async function share(s, r, top) {
  const m = modal(`<h2>Your card</h2><p>Made on your device. Post it, send it, flex it.</p><div class="shareimg" id="simg"><p style="padding:40px;text-align:center">Printing…</p></div>
    <div class="row" style="margin-top:20px;justify-content:center"><button class="cta" id="sh1">Share</button><a class="ghost" id="sh2" download="stylo-meter-${s.id}.png">Download</a><button class="ghost" data-close>Close</button></div>`);
  const img = top ? await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = top.product.img; }) : null;
  const ss = r.verdict.split(/(?<=[.!?])\s/); let q = ss[0]; if (q.length < 40 && ss[1]) q += ' ' + ss[1];
  const { blob, url } = await stylistCard({ photo: st.photo.canvas, productImg: img, stylist: s, before: r.total, after: top ? top.total : r.total, quote: q, occasion: occName(st.occasion) });
  m.querySelector('#simg').innerHTML = `<img src="${url}" alt="Your Stylo Meter card">`; m.querySelector('#sh2').href = url;
  const file = new File([blob], 'stylo-meter.png', { type: 'image/png' });
  let credited = false; const credit = () => { if (!credited) { credited = true; GM.recordShare(); } };
  m.querySelector('#sh1').onclick = () => { credit(); navigator.canShare?.({ files: [file] }) ? navigator.share({ files: [file], title: 'My Stylo Meter verdict' }).catch(() => {}) : m.querySelector('#sh2').click(); };
  m.querySelector('#sh2').addEventListener('click', credit);
}

// ------------------------------------------------------------------ boot
$('#hud').onclick = profile;
$('#mute').onclick = () => { st.muted = !st.muted; try { localStorage.setItem('stylo3:mute', st.muted ? '1' : '0'); } catch {} header(); if (!st.muted) blip(660, .1); };
$('#logo').onclick = e => { e.preventDefault(); go('home'); };
cursor();
const start = guard(location.hash.slice(1) || 'home');
history.replaceState({ step: start }, '', '#' + start); st.step = start;
// Stylist photos: wait briefly so the first screen has them, then refresh the photo-heavy screens.
const photos = loadPhotos();
let photosDone = false; photos.then(() => { photosDone = true; });
Promise.race([photos, new Promise(r => setTimeout(r, 1800))]).then(() => {
  const late = !photosDone; render();
  if (late) photos.then(() => { if (['home', 'stylist'].includes(st.step)) render(); });
});
