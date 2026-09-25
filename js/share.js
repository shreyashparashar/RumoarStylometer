// 1080x1920 story card in the stylist's colours. Made in the browser.

function cover(ctx, img, x, y, w, h) {
  const s = Math.max(w / img.width, h / img.height), iw = img.width * s, ih = img.height * s;
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}
function wrap(ctx, text, x, y, maxW, lh, maxLines) {
  const words = text.split(' '); let line = '', n = 0;
  for (let i = 0; i < words.length; i++) {
    const t = line ? line + ' ' + words[i] : words[i];
    if (ctx.measureText(t).width > maxW && line) {
      if (n === maxLines - 1) { ctx.fillText(line + '…', x, y + n * lh); return; }
      ctx.fillText(line, x, y + n * lh); n++; line = words[i];
    } else line = t;
  }
  ctx.fillText(line, x, y + n * lh);
}

export async function stylistCard({ photo, productImg, stylist, before, after, quote, occasion }) {
  await document.fonts.ready;
  const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), P = stylist.pal, F = "'Bricolage Grotesque', sans-serif";
  x.fillStyle = P.bg; x.fillRect(0, 0, W, H);
  // header
  x.fillStyle = P.ink; x.font = `700 34px ${F}`; x.letterSpacing = '14px'; x.fillText('RUMOAR', 80, 120); x.letterSpacing = '0px';
  x.textAlign = 'right'; x.font = `600 30px ${F}`; x.fillText('Stylo Meter', W - 80, 120); x.textAlign = 'left';
  // polaroid
  x.save(); x.translate(W / 2, 700); x.rotate(-0.04);
  x.fillStyle = '#fff'; x.shadowColor = 'rgba(0,0,0,.35)'; x.shadowBlur = 50; x.shadowOffsetY = 20; x.fillRect(-380, -470, 760, 1000); x.shadowColor = 'transparent';
  x.save(); x.beginPath(); x.rect(-350, -440, 700, 860); x.clip(); cover(x, photo, -350, -440, 700, 860);
  if (productImg) { x.fillStyle = '#fff'; x.fillRect(95, 110, 250, 310); cover(x, productImg, 103, 118, 234, 294); }
  x.restore();
  x.fillStyle = '#111'; x.font = `800 44px ${F}`; x.fillText(occasion, -350, 495);
  x.restore();
  // score sticker
  x.save(); x.translate(880, 250); x.rotate(0.18);
  x.fillStyle = P.acc; x.beginPath(); x.arc(0, 0, 150, 0, Math.PI * 2); x.fill();
  x.fillStyle = P.bg === P.acc ? P.ink : (P.ink === P.acc ? '#fff' : P.ink); x.textAlign = 'center';
  x.font = `800 110px ${F}`; x.fillText(String(after), 0, 30); x.font = `600 28px ${F}`; x.fillText(before !== after ? `was ${before}` : 'Stylo Score', 0, 80);
  x.restore(); x.textAlign = 'left';
  // quote
  x.fillStyle = P.ink; x.font = `800 58px ${F}`;
  wrap(x, `“${quote}”`, 80, 1370, W - 160, 70, 4);
  x.font = `700 36px ${F}`; x.fillText(`— Stylo Meter AI, ${stylist.name} vibe`, 80, 1700);
  x.font = `500 26px ${F}`; x.globalAlpha = .7; x.fillText('Scores the look, never the man. Rated on the Stylo Meter by RUMOAR.', 80, 1820); x.globalAlpha = 1;
  return new Promise(r => c.toBlob(b => r({ blob: b, url: URL.createObjectURL(b) }), 'image/png'));
}
