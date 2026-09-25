// Stylo Meter AI server. A free Cloudflare Worker using Workers AI.
//
//   POST /api/see      { image }                                  -> what is actually in the photo
//   POST /api/verdict  { image, seen, occasion, vibes, stylist,    -> score, verdict in the stylist's voice,
//                        catalog, fixedPillars? }                     moves, mission, RUMOAR picks
//   POST /api/render   { image, productImage?, prompt, mode }      -> AI image (try-on or restyle), base64 JPEG
//   GET  /api/health                                               -> { ok: true, models }
//
// `image` is a data URL of the face-blurred photo, already resized in the browser.
// Nothing is stored. Set ALLOWED_ORIGIN (Settings → Variables) to your GitHub Pages
// origin to stop other sites spending your free daily allowance.

const VISION = '@cf/meta/llama-4-scout-17b-16e-instruct';
const VISION_FALLBACK = '@cf/google/gemma-4-26b-a4b-it';
const IMAGE = '@cf/black-forest-labs/flux-2-klein-4b';
const MAX_IMAGE_CHARS = 1_600_000; // ~1.2 MB data URL

const OCCASIONS = { 'date-night': 'a date night dinner', concert: 'a concert', office: 'the office', college: 'college', festival: 'a festival' };

// ------------------------------------------------------------------ http
function cors(req, env) {
  const origin = req.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGIN || '*').split(',').map(s => s.trim());
  const ok = allowed.includes('*') || allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? (allowed.includes('*') ? '*' : origin) : 'null',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
const json = (data, status, h) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...h } });

export default {
  async fetch(req, env) {
    const h = cors(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const url = new URL(req.url);
    if (h['Access-Control-Allow-Origin'] === 'null') return json({ error: 'origin not allowed' }, 403, h);
    try {
      if (url.pathname === '/api/health') return json({ ok: true, models: { vision: VISION, image: IMAGE } }, 200, h);
      if (req.method !== 'POST') return json({ error: 'not found' }, 404, h);
      const body = await req.json();
      if (body.image && (typeof body.image !== 'string' || !body.image.startsWith('data:image/') || body.image.length > MAX_IMAGE_CHARS)) return json({ error: 'bad image' }, 400, h);
      if (url.pathname === '/api/see') return json(await see(env, body), 200, h);
      if (url.pathname === '/api/verdict') return json(await verdict(env, body), 200, h);
      if (url.pathname === '/api/render') return json(await render(env, body), 200, h);
      return json({ error: 'not found' }, 404, h);
    } catch (e) {
      const msg = String(e?.message || e);
      const quota = /quota|limit|neurons|429|capacity/i.test(msg);
      return json({ error: quota ? 'The free AI allowance for today is used up. It resets at 05:30 IST.' : 'AI error', detail: msg.slice(0, 300) }, quota ? 429 : 500, h);
    }
  },
};

// ------------------------------------------------------------------ vision helpers
async function runVision(env, messages, schema, maxTokens = 900) {
  const payload = { messages, max_tokens: maxTokens, temperature: 0.2, response_format: { type: 'json_schema', json_schema: schema } };
  let out;
  try { out = await env.AI.run(VISION, payload); }
  catch (e) { out = await env.AI.run(VISION_FALLBACK, payload); }
  return parse(out);
}
function parse(out) {
  let r = out?.response ?? out?.result?.response ?? out?.choices?.[0]?.message?.content ?? out;
  if (typeof r === 'object' && r !== null) return r;
  r = String(r).trim().replace(/^```(json)?/i, '').replace(/```$/, '');
  const a = r.indexOf('{'), b = r.lastIndexOf('}');
  return JSON.parse(r.slice(a, b + 1));
}
const imgMsg = (text, image) => ({ role: 'user', content: [{ type: 'text', text }, { type: 'image_url', image_url: { url: image } }] });

// ------------------------------------------------------------------ /api/see
const SEE_SCHEMA = {
  type: 'object',
  properties: {
    is_outfit_photo: { type: 'boolean' },
    framing: { type: 'string', enum: ['full body', 'three quarter', 'upper body', 'unclear'] },
    garments: { type: 'array', items: { type: 'object', properties: { item: { type: 'string' }, colour: { type: 'string' }, detail: { type: 'string' } }, required: ['item', 'colour'] } },
    accessories: { type: 'array', items: { type: 'object', properties: { item: { type: 'string' }, colour: { type: 'string' } }, required: ['item'] } },
    footwear: { type: 'string' },
    palette: { type: 'array', items: { type: 'string' } },
    style_read: { type: 'string' },
    setting: { type: 'string' },
    photo_issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['is_outfit_photo', 'framing', 'garments', 'accessories', 'palette', 'style_read'],
};
async function see(env, { image }) {
  if (!image) throw new Error('image required');
  const system = 'You are a precise fashion cataloguer. List ONLY what is clearly visible in the photo. ' +
    'Never guess items that are cropped out or hidden; if footwear is not visible, say "not visible". ' +
    'The face is intentionally blurred for privacy: do not describe the face, body shape, weight, skin or attractiveness. ' +
    'Use plain garment names (e.g. "denim jacket", "black crew-neck t-shirt", "cargo trousers"). Colours as simple words.';
  const r = await runVision(env, [{ role: 'system', content: system }, imgMsg('Catalogue this outfit photo as JSON.', image)], { name: 'seen', schema: SEE_SCHEMA }, 700);
  r.garments = (r.garments || []).slice(0, 8); r.accessories = (r.accessories || []).slice(0, 8);
  return r;
}

// ------------------------------------------------------------------ /api/verdict
const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    pillars: { type: 'object', properties: {
      fit: { type: 'object', properties: { score: { type: 'integer' }, why: { type: 'string' } }, required: ['score', 'why'] },
      colour: { type: 'object', properties: { score: { type: 'integer' }, why: { type: 'string' } }, required: ['score', 'why'] },
      occasion: { type: 'object', properties: { score: { type: 'integer' }, why: { type: 'string' } }, required: ['score', 'why'] },
      cohesion: { type: 'object', properties: { score: { type: 'integer' }, why: { type: 'string' } }, required: ['score', 'why'] },
      finishing: { type: 'object', properties: { score: { type: 'integer' }, why: { type: 'string' } }, required: ['score', 'why'] },
    }, required: ['fit', 'colour', 'occasion', 'cohesion', 'finishing'] },
    verdict: { type: 'string' },
    moves: { type: 'array', items: { type: 'string' } },
    mission: { type: 'object', properties: { title: { type: 'string' }, task: { type: 'string' } }, required: ['title', 'task'] },
    picks: { type: 'array', items: { type: 'object', properties: { slug: { type: 'string' }, why: { type: 'string' } }, required: ['slug', 'why'] } },
    vibe_match: { type: 'integer' },
    restyle_prompt: { type: 'string' },
  },
  required: ['pillars', 'verdict', 'moves', 'mission', 'picks', 'vibe_match', 'restyle_prompt'],
};

async function verdict(env, { image, seen, occasion, vibes = [], stylist, catalog = [], fixedPillars }) {
  if (!seen || !stylist) throw new Error('seen and stylist required');
  const occ = OCCASIONS[occasion] || occasion;
  const cat = catalog.slice(0, 20).map(p => `${p.slug} | ${p.name} | ${p.type} | ${p.tone} | ₹${p.price}`).join('\n');
  const pillarRule = fixedPillars
    ? `The pillar scores are ALREADY DECIDED and must be returned exactly as: ${JSON.stringify(fixedPillars)}. Only rewrite each "why" in your own voice.`
    : 'Score each pillar 0-20 as a neutral judge first, BEFORE applying your personality. Your character changes how you talk, never the numbers. ' +
      'Finishing is about bag, watch, eyewear, belt, jewellery and details actually visible: with none visible it is usually 9-13. A strong outfit without accessories lands around 70-80 total. Do not inflate.';
  const system =
    `You are ${stylist.name}, "${stylist.role}", a stylist on RUMOAR's Stylo Meter. Personality and voice: ${stylist.voice} ` +
    `Your style lane: ${stylist.lane}. Your signature moves: ${(stylist.moves || []).join('; ')}.\n` +
    `HARD RULES: Base every observation ONLY on the verified catalogue of the photo below and on what you can see; never invent garments or accessories. ` +
    `Talk about clothes, colours, fit of garments and accessories only. Never comment on face, body, weight, skin, height or attractiveness. ` +
    `Be entertaining and in character, but useful and kind underneath. ${pillarRule}\n` +
    `Output fields: verdict = 3-5 punchy sentences in your voice, max 90 words, reference at least two specific visible items. ` +
    `moves = exactly 3 short actionable styling moves in your voice. mission = a small challenge he can do with his own wardrobe and re-shoot (title max 5 words). ` +
    `picks = exactly 3 products from the RUMOAR catalogue by slug, each with a one-line reason in your voice tied to this outfit. Only use slugs from the list. ` +
    `vibe_match = 0-100, how close this outfit already is to your lane. ` +
    `restyle_prompt = one sentence describing how you would restyle HIS outfit in your lane (garments, colours, accessories only), for an image model.`;
  const user =
    `Occasion: ${occ}. Vibe he picked: ${vibes.join(' + ') || 'not set'}.\n` +
    `Verified catalogue of the photo: ${JSON.stringify(seen)}\n` +
    `RUMOAR catalogue (slug | name | type | colour | price):\n${cat}\n` +
    `Give your verdict as JSON.`;
  const messages = [{ role: 'system', content: system }, image ? imgMsg(user, image) : { role: 'user', content: user }];
  const r = await runVision(env, messages, { name: 'verdict', schema: VERDICT_SCHEMA }, 1100);

  // enforce honesty server-side
  const keys = ['fit', 'colour', 'occasion', 'cohesion', 'finishing'];
  for (const k of keys) {
    const p = r.pillars?.[k] || { score: 12, why: '' };
    p.score = fixedPillars ? fixedPillars[k] : Math.max(0, Math.min(20, Math.round(Number(p.score) || 0)));
    r.pillars[k] = p;
  }
  r.total = keys.reduce((s, k) => s + r.pillars[k].score, 0);
  const slugs = new Set(catalog.map(p => p.slug));
  r.picks = (r.picks || []).filter(p => slugs.has(p.slug)).slice(0, 3);
  for (const fav of stylist.favourites || []) { if (r.picks.length >= 3) break; if (!r.picks.some(p => p.slug === fav) && slugs.has(fav)) r.picks.push({ slug: fav, why: '' }); }
  r.moves = (r.moves || []).slice(0, 3);
  r.vibe_match = Math.max(0, Math.min(100, Math.round(Number(r.vibe_match) || 0)));
  if (/\b(face|body|weight|fat|thin|skinny|skin|ugly|handsome|attractive|height|short|tall)\b/i.test(r.verdict || '')) {
    r.verdict = r.verdict.replace(/[^.!?]*\b(face|body|weight|fat|thin|skinny|skin|ugly|handsome|attractive|height|short|tall)\b[^.!?]*[.!?]/gi, '').trim();
  }
  return r;
}

// ------------------------------------------------------------------ /api/render
// mode "tryon":   image 0 = his photo, image 1 = RUMOAR product. Adds the bag, keeps everything else.
// mode "restyle": image 0 = his photo. Restyles the outfit in the stylist's lane.
async function render(env, { image, productImage, prompt, mode = 'tryon' }) {
  if (!image) throw new Error('image required');
  const form = new FormData();
  form.append('input_image_0', dataUrlToBlob(image));
  let p;
  if (mode === 'tryon') {
    if (!productImage) throw new Error('productImage required');
    form.append('input_image_1', dataUrlToBlob(productImage));
    p = `Photo edit. Keep the person in image 0 exactly as he is: same pose, same clothes, same background, same lighting, same framing, and keep his face blurred. ` +
        `Make him naturally carry the bag shown in image 1, worn the way that bag is designed to be worn, at realistic size, matching its exact shape, colour and hardware. ${prompt || ''} Photorealistic fashion photo.`;
  } else {
    p = `Photo edit. Keep the person in image 0 in the same pose, background, lighting and framing, and keep his face blurred. Restyle only his outfit: ${prompt || 'a sharper version of the same look'}. Photorealistic editorial fashion photo.`;
  }
  form.append('prompt', p.slice(0, 2000));
  form.append('width', '768'); form.append('height', '960');
  const fr = new Response(form);
  const out = await env.AI.run(IMAGE, { multipart: { body: fr.body, contentType: fr.headers.get('content-type') } });
  const b64 = out?.image || out?.result?.image;
  if (!b64) throw new Error('no image returned');
  return { image: `data:image/jpeg;base64,${b64}`, model: IMAGE, label: 'AI-generated image' };
}

function dataUrlToBlob(d) {
  const [head, b64] = d.split(',');
  const type = head.match(/data:(.*?);/)?.[1] || 'image/jpeg';
  const bin = atob(b64); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type });
}
