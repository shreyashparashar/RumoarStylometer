// Stylist photos. Order of preference for each stylist:
//   1. your own photo: set photo: 'assets/stylists/<id>.jpg' on the stylist in js/stylists.js
//   2. the lead image of their Wikipedia page (Wikimedia Commons, freely licensed), via the
//      public Wikipedia REST API, which allows browser requests
//   3. the illustrated monogram (nothing to load)
// Results are cached in localStorage for a week so the deck loads instantly next time.
import { STYLISTS } from './stylists.js';

const KEY = 'stylo3:photos:v1', WEEK = 7 * 864e5;
const read = () => { try { const c = JSON.parse(localStorage.getItem(KEY) || '{}'); return Date.now() - (c.t || 0) < WEEK ? c : { t: Date.now(), p: {} }; } catch { return { t: Date.now(), p: {} }; } };
const write = c => { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch {} };

const exists = src => new Promise(res => { const i = new Image(); i.onload = () => res(true); i.onerror = () => res(false); i.src = src; });

async function wikiPhoto(title) {
  const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, { headers: { Accept: 'application/json' } });
  if (!r.ok) return null;
  const j = await r.json();
  const src = j.thumbnail?.source || j.originalimage?.source;
  if (!src) return null;
  // ask for a sharper thumbnail than the default 320px
  const big = src.replace(/\/(\d+)px-/, (m, w) => `/${Math.max(+w, 480)}px-`);
  return { src: big, page: j.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${title}` };
}

// Fills s.photo (and s.photoCredit) on every stylist. Resolves when all lookups finish.
export async function loadPhotos() {
  const c = read();
  await Promise.all(STYLISTS.map(async s => {
    if (s.photo) return;
    const hit = c.p[s.id];
    if (hit && await exists(hit.photo)) { Object.assign(s, hit); return; }
    if (!s.wiki) return;
    try {
      const w = await wikiPhoto(s.wiki);
      if (w && await exists(w.src)) { s.photo = w.src; s.photoCredit = w.page; c.p[s.id] = { photo: w.src, photoCredit: w.page }; }
    } catch {}
  }));
  write(c);
}
