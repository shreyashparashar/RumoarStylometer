export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = () => matchMedia('(pointer: fine)').matches;

// Split a headline into words that rise in sequence.
export function words(text) {
  return text.split(' ').map((w, i) => `<span class="w" style="--i:${i}">${w}</span>`).join(' ');
}

// 3D tilt + moving shine for cards.
export function tilt(el, max = 10) {
  if (!fine() || reduced()) return;
  let raf = 0;
  el.addEventListener('pointermove', e => {
    const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      el.style.transform = `rotateY(${(x - .5) * max * 2}deg) rotateX(${(.5 - y) * max * 2}deg) translateZ(0)`;
      el.style.setProperty('--mx', x * 100 + '%'); el.style.setProperty('--my', y * 100 + '%');
    });
  });
  el.addEventListener('pointerleave', () => { cancelAnimationFrame(raf); el.style.transform = ''; });
}

// Buttons that lean toward the cursor.
export function magnetic(el, strength = .25) {
  if (!fine() || reduced()) return;
  el.addEventListener('pointermove', e => {
    const r = el.getBoundingClientRect();
    el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * strength}px, ${(e.clientY - r.top - r.height / 2) * strength}px)`;
  });
  el.addEventListener('pointerleave', () => { el.style.transform = ''; });
}

// A soft cursor that swells over anything clickable.
export function cursor() {
  if (!fine() || reduced()) return;
  const c = document.createElement('div'); c.className = 'cursor'; document.body.appendChild(c);
  let x = innerWidth / 2, y = innerHeight / 2, cx = x, cy = y;
  addEventListener('pointermove', e => { x = e.clientX; y = e.clientY; const t = e.target.closest?.('button, a, label, [role=button], .tap'); c.classList.toggle('big', !!t); }, { passive: true });
  const loop = () => { cx += (x - cx) * .22; cy += (y - cy) * .22; c.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`; requestAnimationFrame(loop); };
  loop();
}

export function countUp(el, to, ms = 1200, from = 0) {
  if (reduced()) { el.textContent = to; return; }
  const t0 = performance.now();
  const step = n => { const p = Math.min(1, (n - t0) / ms), e = 1 - Math.pow(1 - p, 4); el.textContent = Math.round(from + (to - from) * e); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

// Confetti in the stylist's colours.
export function confetti(colors, n = 140) {
  if (reduced()) return;
  const c = document.createElement('canvas'); c.id = 'confetti'; document.body.appendChild(c);
  const dpr = Math.min(2, devicePixelRatio || 1); c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  const x = c.getContext('2d'); x.scale(dpr, dpr);
  const P = Array.from({ length: n }, () => ({
    x: innerWidth / 2 + (Math.random() - .5) * 200, y: innerHeight * .35, vx: (Math.random() - .5) * 16, vy: -Math.random() * 14 - 6,
    r: Math.random() * Math.PI, vr: (Math.random() - .5) * .4, w: 6 + Math.random() * 8, h: 10 + Math.random() * 12, c: colors[Math.floor(Math.random() * colors.length)],
  }));
  let t = 0;
  const loop = () => {
    x.clearRect(0, 0, innerWidth, innerHeight); t++;
    for (const p of P) { p.vy += .35; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; x.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(t * .1 + p.r))); x.restore(); }
    if (t < 170) requestAnimationFrame(loop); else c.remove();
  };
  loop();
}

// Background patterns for stylist cards.
export function pattern(name, a, b) {
  const P = {
    zigzag: `linear-gradient(135deg, ${a} 25%, transparent 25%) -20px 0/40px 40px, linear-gradient(225deg, ${a} 25%, transparent 25%) -20px 0/40px 40px, linear-gradient(315deg, ${a} 25%, transparent 25%) 0 0/40px 40px, linear-gradient(45deg, ${a} 25%, ${b} 25%) 0 0/40px 40px`,
    dots: `radial-gradient(${a} 28%, transparent 30%) 0 0/28px 28px, ${b}`,
    pixels: `conic-gradient(${a} 25%, ${b} 0 50%, ${a} 0 75%, ${b} 0) 0 0/22px 22px`,
    lines: `repeating-linear-gradient(90deg, ${a} 0 2px, ${b} 2px 18px)`,
    check: `repeating-linear-gradient(0deg, ${a}55 0 12px, transparent 12px 24px), repeating-linear-gradient(90deg, ${a}55 0 12px, ${b} 12px 24px)`,
    stripes: `repeating-linear-gradient(-45deg, ${a} 0 16px, ${b} 16px 32px)`,
    waves: `radial-gradient(circle at 50% 0, transparent 14px, ${a} 15px 19px, transparent 20px) 0 0/40px 20px, ${b}`,
    diamonds: `linear-gradient(45deg, ${a} 25%, transparent 25% 75%, ${a} 75%) 0 0/30px 30px, linear-gradient(45deg, ${a} 25%, ${b} 25% 75%, ${a} 75%) 15px 15px/30px 30px`,
    block: `linear-gradient(90deg, ${a} 50%, transparent 50%) 0 0/60px 60px, linear-gradient(${a} 50%, ${b} 50%) 0 0/60px 60px`,
    bolts: `repeating-linear-gradient(115deg, ${b} 0 22px, ${a} 22px 28px, ${b} 28px 50px)`,
  };
  return P[name] || b;
}
