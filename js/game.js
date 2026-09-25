// Gamification: XP, levels, streaks, badges, stylist collection, daily brief, missions.
// Everything lives in localStorage on the player's device.

import { STYLISTS, byId } from './stylists.js';
import { OCCASIONS } from './catalog.js';

const KEY = 'stylo3:game';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
const fresh = () => ({ xp: 0, streak: { last: null, count: 0 }, badges: {}, met: {}, best: {}, fits: 0, renders: 0, mission: null, missionsDone: 0, daily: null, log: [] });
export const G = Object.assign(fresh(), load() || {});
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(G)); } catch {} };

export const LEVELS = [
  [0, 'Fresh Fit'], [100, 'Mirror Regular'], [250, 'Fit Checker'], [450, 'Street Certified'], [700, 'Trendsetter'],
  [1000, 'Crowd Favourite'], [1400, "Stylist's Pet"], [1900, 'Icon'], [2500, 'Legend'], [3200, 'RUMOAR Royalty'],
];
export function level(xp = G.xp) {
  let i = 0; while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1][0]) i++;
  const cur = LEVELS[i][0], next = LEVELS[i + 1]?.[0] ?? cur;
  return { n: i + 1, name: LEVELS[i][1], cur, next, pct: next > cur ? (xp - cur) / (next - cur) : 1 };
}
export const unlocked = s => level().n >= (s.unlock || 1);

export const BADGES = {
  'first-fit':   ['First Fit', 'Got your first verdict'],
  'hopper':      ['Vibe Hopper', 'Tried 3 vibes on one fit'],
  'try-on':      ['Try-On Taker', 'Rendered yourself with a RUMOAR piece'],
  'restyled':    ['Shape Shifter', 'Got restyled in a vibe'],
  'glow-up':     ['Glow-Up', 'A RUMOAR piece added 8+ points'],
  'perfect':     ['Head Turner', 'Scored 85 or more'],
  'mission':     ['Mission Complete', 'Finished a vibe mission'],
  'daily':       ['Brief Crusher', 'Beat a daily brief'],
  'streak3':     ['On a Roll', 'Played 3 days in a row'],
  'collector':   ['Full Deck', 'Tried every vibe'],
  'sharer':      ['Posted It', 'Made a share card'],
};

const listeners = new Set();
export const onGame = f => (listeners.add(f), () => listeners.delete(f));
const emit = ev => listeners.forEach(f => { try { f(ev); } catch (e) { console.warn(e); } });

export function award(xp, reason) {
  if (!xp) return;
  const before = level().n; G.xp += xp; G.log = [{ xp, reason, t: Date.now() }, ...G.log].slice(0, 40); save();
  const after = level().n;
  emit({ type: 'xp', xp, reason });
  if (after > before) {
    const newly = STYLISTS.filter(s => (s.unlock || 1) === after);
    emit({ type: 'level', level: level(), unlockedStylists: newly });
  }
}
export function badge(id) {
  if (G.badges[id]) return false;
  G.badges[id] = Date.now(); save(); emit({ type: 'badge', id, badge: BADGES[id] }); award(50, `Badge: ${BADGES[id][0]}`); return true;
}

const today = () => new Date().toISOString().slice(0, 10);
export function touchStreak() {
  const t = today(); if (G.streak.last === t) return;
  const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  G.streak.count = G.streak.last === y ? G.streak.count + 1 : 1; G.streak.last = t; save();
  if (G.streak.count > 1) award(Math.min(105, 15 * G.streak.count), `${G.streak.count}-day streak`);
  if (G.streak.count >= 3) badge('streak3');
}

// A new brief every day, the same for everyone on that date.
export function dailyBrief() {
  const t = today(); let h = 0; for (const c of t) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const pool = STYLISTS.filter(s => (s.unlock || 1) <= 2);
  const s = pool[h % pool.length], o = OCCASIONS[(h >> 4) % OCCASIONS.length];
  return { date: t, stylist: s.id, occasion: o.id, target: 76 + (h >> 8) % 9, done: G.daily === t };
}

// Called after each verdict. Returns the list of rewards earned, for the celebration.
export function recordVerdict({ stylistId, occasion, total, photoKey, stylistsOnPhoto }) {
  const got = [];
  const push = (xp, why) => { award(xp, why); got.push([xp, why]); };
  touchStreak();
  G.fits++;
  if (!G.met[stylistId]) { G.met[stylistId] = Date.now(); push(25, `New vibe: ${byId[stylistId].name}`); }
  push(30 + Math.max(0, Math.floor((total - 60) / 2)), 'Verdict');
  if (!G.best[stylistId] || total > G.best[stylistId]) G.best[stylistId] = total;
  save();
  badge('first-fit');
  if (total >= 85) badge('perfect');
  if (stylistsOnPhoto >= 3) badge('hopper');
  if (STYLISTS.every(s => G.met[s.id])) badge('collector');
  const b = dailyBrief();
  if (!b.done && b.stylist === stylistId && b.occasion === occasion && total >= b.target) { G.daily = b.date; save(); push(80, 'Daily brief beaten'); badge('daily'); }
  const m = G.mission;
  if (m && m.stylistId === stylistId && m.photoKey !== photoKey && total >= m.base + 3) {
    G.mission = null; G.missionsDone++; save(); push(120, `Mission: ${m.title}`); badge('mission');
  }
  return got;
}
export function acceptMission(m) { G.mission = m; save(); emit({ type: 'mission', mission: m }); }
export function recordRender(kind, gain) { G.renders++; save(); award(40, kind === 'tryon' ? 'AI try-on' : 'AI restyle'); badge(kind === 'tryon' ? 'try-on' : 'restyled'); if (gain >= 8) badge('glow-up'); }
export function recordShare() { award(20, 'Share card'); badge('sharer'); }
export function reset() { Object.assign(G, fresh()); save(); emit({ type: 'reset' }); }
