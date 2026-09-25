// Client for the Stylo Meter AI server (worker/worker.js on Cloudflare Workers AI).
import { API_BASE } from './config.js';

const qp = new URLSearchParams(location.search).get('api');
if (qp) { try { localStorage.setItem('stylo3:api', qp); } catch {} }
export const base = () => (qp || (() => { try { return localStorage.getItem('stylo3:api'); } catch { return null; } })() || API_BASE || '').replace(/\/$/, '');
export const connected = () => !!base();

export function toDataURL(canvas, max = 768, q = .86) {
  const s = Math.min(1, max / Math.max(canvas.width, canvas.height));
  const c = document.createElement('canvas'); c.width = Math.round(canvas.width * s); c.height = Math.round(canvas.height * s);
  c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}
export async function urlToDataURL(url, max = 512) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
  return toDataURL(c, max, .9);
}

async function post(path, body, timeout = 90000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(base() + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || `AI server error ${r.status}`), { status: r.status, detail: j.detail });
    return j;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('The AI took too long. Try again.');
    if (e instanceof TypeError) throw new Error('Could not reach the AI server. Check the Worker URL.');
    throw e;
  } finally { clearTimeout(t); }
}
export const health = () => fetch(base() + '/api/health').then(r => r.json()).catch(() => null);
export const see = image => post('/api/see', { image });
export const verdict = body => post('/api/verdict', body);
export const render = body => post('/api/render', body, 120000);
