// Builds the 1080x1920 share card as a PNG, entirely in the browser.

function cover(ctx, img, x, y, w, h) {
  const s = Math.max(w / img.width, h / img.height), iw = img.width * s, ih = img.height * s;
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

export async function shareCard({ photo, product, before, after, occasion, archetype }) {
  await document.fonts.ready;
  const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#0A0A0A'; x.fillRect(0, 0, W, H);
  // card
  const cx = 90, cy = 170, cw = 900, ch = 1560;
  x.save(); rr(x, cx, cy, cw, ch, 44); x.clip();
  x.fillStyle = '#fff'; x.fillRect(cx, cy, cw, ch);
  cover(x, photo, cx, cy, cw, 1080);
  const g = x.createLinearGradient(0, cy, 0, cy + 220); g.addColorStop(0, 'rgba(0,0,0,.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(cx, cy, cw, 220);
  x.fillStyle = '#fff'; x.font = '600 30px Poppins'; x.letterSpacing = '12px'; x.fillText('RUMOAR', cx + 44, cy + 70); x.letterSpacing = '0px';
  if (product) {
    x.fillStyle = 'rgba(0,0,0,.6)'; rr(x, cx + cw - 230, cy + 36, 190, 50, 25); x.fill();
    x.fillStyle = '#fff'; x.font = '600 24px Poppins'; x.textAlign = 'center'; x.fillText('AI render', cx + cw - 135, cy + 70); x.textAlign = 'left';
  }
  // scores
  const sy = cy + 1080 + 170;
  x.font = '800 150px Poppins'; x.fillStyle = '#B8B3A8'; x.fillText(String(before), cx + 50, sy);
  const bw = x.measureText(String(before)).width;
  x.fillStyle = '#EA4E26'; x.font = '600 80px Poppins'; x.fillText('→', cx + 80 + bw, sy - 30);
  x.fillStyle = '#0A0A0A'; x.font = '800 170px Poppins'; x.fillText(String(after), cx + 200 + bw, sy);
  x.font = '600 34px Poppins'; x.fillStyle = '#222';
  x.fillText([occasion, archetype, product ? 'Finished with RUMOAR' : null].filter(Boolean).join(' · '), cx + 50, sy + 80);
  x.font = '400 26px Poppins'; x.fillStyle = '#888';
  x.fillText('Rated on the Stylo Meter', cx + 50, cy + ch - 50);
  x.textAlign = 'right'; x.fillText(product ? product.name : 'Look score', cx + cw - 50, cy + ch - 50); x.textAlign = 'left';
  x.restore();
  x.fillStyle = '#777'; x.font = '400 28px Poppins'; x.textAlign = 'center';
  x.fillText('Scores the look, never the man.', W / 2, H - 90);
  return new Promise(r => c.toBlob(b => r({ blob: b, url: URL.createObjectURL(b) }), 'image/png'));
}
