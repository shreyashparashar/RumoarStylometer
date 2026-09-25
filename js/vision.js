// "Stylist eyes": zero-shot fashion understanding, fully in the browser.
// Uses CLIP (Xenova/clip-vit-base-patch16, MIT) through Transformers.js.
// The image is embedded once; every label group is compared against it.
// Runs on the FACE-BLURRED image only. Falls back to "unknown" if the model can't load.

const TJS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2';
const MODEL = 'Xenova/clip-vit-base-patch16';

const GROUPS = {
  top: ['t-shirt', 'shirt', 'polo shirt', 'kurta', 'blazer', 'hoodie', 'sweater', 'denim jacket', 'leather jacket', 'tank top', 'overshirt'],
  bottom: ['jeans', 'cargo pants', 'trousers', 'shorts', 'track pants'],
  style: ['streetwear', 'formal wear', 'ethnic Indian wear', 'sportswear', 'smart casual', 'rock style', 'bohemian style', 'K-pop fashion'],
};
const ACC = { bag: 'a bag', sunglasses: 'sunglasses', watch: 'a wrist watch', chain: 'a chain necklace', cap: 'a cap' };

let ready = null, M = null;
export const status = { state: 'idle', progress: 0 };
const listeners = new Set();
export const onStatus = fn => (listeners.add(fn), () => listeners.delete(fn));
const emit = () => listeners.forEach(f => { try { f(status); } catch (e) { console.warn(e); } });

export function load() {
  if (ready) return ready;
  status.state = 'loading'; emit();
  ready = (async () => {
    try {
      const T = await import(TJS);
      T.env.allowLocalModels = false;
      const files = {};
      const progress_callback = p => {
        if (p.status === 'progress' && p.total) { files[p.file] = [p.loaded, p.total]; const v = Object.values(files); status.progress = v.reduce((a, b) => a + b[0], 0) / v.reduce((a, b) => a + b[1], 0); emit(); }
      };
      const opt = { progress_callback, dtype: 'q8' };
      const [processor, vision, tokenizer, text] = await Promise.all([
        T.AutoProcessor.from_pretrained(MODEL, { progress_callback }),
        T.CLIPVisionModelWithProjection.from_pretrained(MODEL, { ...opt, model_file_name: 'vision_model' }),
        T.AutoTokenizer.from_pretrained(MODEL, { progress_callback }),
        T.CLIPTextModelWithProjection.from_pretrained(MODEL, { ...opt, model_file_name: 'text_model' }),
      ]);
      M = { T, processor, vision, tokenizer, text, cache: new Map() };
      status.state = 'ready'; status.progress = 1; emit();
      return M;
    } catch (e) {
      console.warn('Vision model unavailable', e); status.state = 'failed'; emit(); return null;
    }
  })();
  return ready;
}

function norm(v) { let s = 0; for (const x of v) s += x * x; s = Math.sqrt(s); return v.map(x => x / s); }
async function textEmbeds(prompts) {
  const miss = prompts.filter(p => !M.cache.has(p));
  if (miss.length) {
    const inputs = M.tokenizer(miss, { padding: true, truncation: true });
    const { text_embeds } = await M.text(inputs);
    const d = text_embeds.dims[1];
    miss.forEach((p, i) => M.cache.set(p, norm(Array.from(text_embeds.data.slice(i * d, (i + 1) * d)))));
  }
  return prompts.map(p => M.cache.get(p));
}
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
function softmax(xs, scale = 100) { const m = Math.max(...xs); const e = xs.map(x => Math.exp((x - m) * scale)); const s = e.reduce((a, b) => a + b, 0); return e.map(x => x / s); }

// Returns { top, bottom, style: {label: p}, acc: {bag,..: bool}, accP, ok }
export async function see(canvas) {
  const m = await load();
  if (!m) return { ok: false, top: null, bottom: null, style: {}, acc: {}, accP: {} };
  const image = m.T.RawImage.fromCanvas ? m.T.RawImage.fromCanvas(canvas) : await m.T.RawImage.fromURL(canvas.toDataURL('image/jpeg', .9));
  const inputs = await m.processor(image);
  const { image_embeds } = await m.vision(inputs);
  const img = norm(Array.from(image_embeds.data));
  const out = { ok: true, style: {}, acc: {}, accP: {} };
  for (const [g, labels] of Object.entries(GROUPS)) {
    const plural = new Set(['jeans', 'cargo pants', 'trousers', 'shorts', 'track pants']);
    const prompts = labels.map(l => g === 'style' ? `a photo of a man in ${l}` : `a photo of a man wearing ${plural.has(l) ? '' : /^[aeiou]/.test(l) ? 'an ' : 'a '}${l}`);
    const E = await textEmbeds(prompts);
    const p = softmax(E.map(e => dot(img, e)));
    if (g === 'style') labels.forEach((l, i) => out.style[l] = p[i]);
    else { const i = p.indexOf(Math.max(...p)); out[g] = p[i] > .28 ? labels[i] : null; out[g + 'P'] = p[i]; }
  }
  for (const [k, phrase] of Object.entries(ACC)) {
    const [yes, no] = await textEmbeds([`a photo of a man with ${phrase}`, `a photo of a man without ${phrase}`]);
    const p = softmax([dot(img, yes), dot(img, no)])[0];
    out.accP[k] = p; out.acc[k] = p > .62;
  }
  return out;
}

export function describe(d) {
  if (!d?.ok) return [];
  const chips = [];
  if (d.top) chips.push(d.top);
  if (d.bottom) chips.push(d.bottom);
  const st = Object.entries(d.style).sort((a, b) => b[1] - a[1])[0];
  if (st) chips.push(st[0].replace(' style', '').replace(' fashion', '').replace(' wear', ' wear'));
  for (const [k, v] of Object.entries(d.acc)) if (v) chips.push(k === 'chain' ? 'chain' : k);
  return chips;
}
