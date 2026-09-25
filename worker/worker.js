// Stylo Meter AI server. A free Cloudflare Worker.
//
//   The brain (reading the photo + the verdict): Google Gemini Flash on the free Gemini API tier
//   (set the GEMINI_API_KEY secret). Falls back to Llama 4 Scout on Workers AI if Gemini is
//   missing, rate-limited or down, so the demo never dies.
//   The renders (try-on + restyle): FLUX.2 [klein] 9B on Workers AI (free daily allowance),
//   falling back to FLUX.2 [klein] 4B.
//
//   POST /api/see      { image }                                  -> what is actually in the photo
//   POST /api/verdict  { image, seen, occasion, vibes, stylist,    -> score, vibe verdict, moves,
//                        catalog, fixedPillars? }                     mission, RUMOAR picks
//   POST /api/render   { image, productImage?, prompt, mode }      -> AI image (try-on or restyle), base64 JPEG
//   GET  /api/health                                               -> { ok: true, models }
//
// `image` is a data URL of the face-blurred photo, already resized in the browser.
// Nothing is stored. Set ALLOWED_ORIGIN (Settings → Variables) to your GitHub Pages
// origin to stop other sites spending your free allowance.

// Gemini models to try, best first. Override with a GEMINI_MODELS variable (comma separated).
// Pick ones marked "Free of charge" on https://ai.google.dev/gemini-api/docs/pricing
const GEMINI_DEFAULT = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash'];
const CF_VISION = '@cf/meta/llama-4-scout-17b-16e-instruct';
const CF_VISION_FALLBACK = '@cf/google/gemma-4-26b-a4b-it';
const IMAGE_MODELS = ['@cf/black-forest-labs/flux-2-klein-9b', '@cf/black-forest-labs/flux-2-klein-4b'];
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
      if (url.pathname === '/api/health') return json({ ok: true, models: { vision: env.GEMINI_API_KEY ? geminiModels(env)[0] : CF_VISION, image: IMAGE_MODELS[0] }, gemini: !!env.GEMINI_API_KEY }, 200, h);
      if (req.method !== 'POST') return json({ error: 'not found' }, 404, h);
      const body = await req.json();
      if (body.image && (typeof body.image !== 'string' || !body.image.startsWith('data:image/') || body.image.length > MAX_IMAGE_CHARS)) return json({ error: 'bad image' }, 400, h);
      if (url.pathname === '/api/see') return json(await see(env, body), 200, h);
      if (url.pathname === '/api/verdict') return json(await verdict(env, body), 200, h);
      if (url.pathname === '/api/render') return json(await render(env, body), 200, h);
      return json({ error: 'not found' }, 404, h);
    } catch (e) {
      const msg = String(e?.message || e);
      const quota = /quota|neurons|429|capacity|RESOURCE_EXHAUSTED/i.test(msg);
      return json({ error: quota ? 'The free AI allowance is used up for now. Wait a minute and try again (daily limits reset overnight).' : 'AI error', detail: msg.slice(0, 300) }, quota ? 429 : 500, h);
    }
  },
};

// ------------------------------------------------------------------ the brain: Gemini first, Workers AI as backup
const geminiModels = env => (env.GEMINI_MODELS ? env.GEMINI_MODELS.split(',').map(x => x.trim()).filter(Boolean) : GEMINI_DEFAULT);

// system: string, text: string, image: data URL or null, schema: JSON schema.
// Returns { data, model }.
async function think(env, { system, text, image, schema, name, maxTokens = 1200, temperature = 0.3 }) {
  const errors = [];
  if (env.GEMINI_API_KEY) {
    for (const model of geminiModels(env)) {
      try { return { data: await gemini(env, model, { system, text, image, schema, maxTokens, temperature }), model: prettyModel(model) }; }
      catch (e) { errors.push(String(e.message || e)); }
    }
  }
  if (env.AI) {
    const content = image ? [{ type: 'text', text }, { type: 'image_url', image_url: { url: image } }] : text;
    const payload = { messages: [{ role: 'system', content: system }, { role: 'user', content }], max_tokens: maxTokens, temperature, response_format: { type: 'json_schema', json_schema: { name, schema } } };
    for (const m of [CF_VISION, CF_VISION_FALLBACK]) {
      try { return { data: parse(await env.AI.run(m, payload)), model: m.includes('llama') ? 'Llama 4 Scout (backup)' : 'Gemma (backup)' }; }
      catch (e) { errors.push(String(e.message || e)); }
    }
  }
  throw new Error(errors.join(' | ') || 'No AI configured: add GEMINI_API_KEY or the AI binding');
}
const prettyModel = m => m.replace(/^gemini-/, 'Gemini ').replace(/-flash/, ' Flash').replace(/-lite/, '-Lite');

async function gemini(env, model, { system, text, image, schema, maxTokens, temperature }) {
  const parts = [{ text }];
  if (image) { const [head, data] = image.split(','); parts.push({ inlineData: { mimeType: head.match(/data:(.*?);/)?.[1] || 'image/jpeg', data } }); }
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature, maxOutputTokens: Math.max(maxTokens * 4, 4096), responseMimeType: 'application/json', responseJsonSchema: schema },
  };
  const call = () => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY }, body: JSON.stringify(body),
  });
  let r = await call();
  if (r.status === 400) {
    // Older models may not accept responseJsonSchema: describe the schema in the prompt instead.
    const t = await r.text();
    if (!/schema/i.test(t)) throw new Error(`${model} 400: ${t.slice(0, 200)}`);
    delete body.generationConfig.responseJsonSchema;
    body.systemInstruction.parts[0].text += `\nReturn ONLY JSON matching this JSON Schema:\n${JSON.stringify(schema)}`;
    r = await call();
  }
  if (!r.ok) throw new Error(`${model} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const out = (j.candidates?.[0]?.content?.parts || []).filter(p => !p.thought && p.text).map(p => p.text).join('');
  if (!out) throw new Error(`${model}: empty response (${j.candidates?.[0]?.finishReason || j.promptFeedback?.blockReason || 'unknown'})`);
  return parse(out);
}

function parse(out) {
  let r = out?.response ?? out?.result?.response ?? out?.choices?.[0]?.message?.content ?? out;
  if (typeof r === 'object' && r !== null) return r;
  r = String(r).trim().replace(/^```(json)?/i, '').replace(/```$/, '');
  const a = r.indexOf('{'), b = r.lastIndexOf('}');
  return JSON.parse(r.slice(a, b + 1));
}

// ------------------------------------------------------------------ /api/see
const SEE_SCHEMA = {
  type: 'object',
  properties: {
    is_outfit_photo: { type: 'boolean' },
    framing: { type: 'string', enum: ['full body', 'three quarter', 'upper body', 'unclear'] },
    garments: { type: 'array', items: { type: 'object', properties: {
      item: { type: 'string' }, colour: { type: 'string' },
      fit: { type: 'string', enum: ['oversized', 'relaxed', 'regular', 'slim', 'cropped', 'unclear'] },
      fabric: { type: 'string' }, pattern: { type: 'string' },
      worn: { type: 'string', description: 'how it is worn: tucked, untucked, open, buttoned, sleeves rolled, cuffed, layered under/over X' },
      condition: { type: 'string', description: 'crisp, wrinkled, faded, etc. Only if visible' },
    }, required: ['item', 'colour', 'fit'] } },
    accessories: { type: 'array', items: { type: 'object', properties: { item: { type: 'string' }, colour: { type: 'string' }, detail: { type: 'string' } }, required: ['item'] } },
    footwear: { type: 'string' },
    palette: { type: 'array', items: { type: 'string' } },
    layers: { type: 'integer' },
    proportions: { type: 'string', description: 'garment proportions only, e.g. oversized top with slim bottom; cropped jacket over high-waist trousers' },
    style_read: { type: 'string' },
    setting: { type: 'string' },
    photo_issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['is_outfit_photo', 'framing', 'garments', 'accessories', 'palette', 'style_read'],
};
async function see(env, { image }) {
  if (!image) throw new Error('image required');
  const system = 'You are a precise fashion cataloguer for a styling app. List ONLY what is clearly visible. ' +
    'Never guess items that are cropped out or hidden; if footwear is not visible, say "not visible". ' +
    'The face is intentionally blurred for privacy: never describe the face, body shape, weight, skin, age or attractiveness. ' +
    'Name garments the way a stylist would (e.g. "boxy black crew-neck t-shirt", "olive cargo trousers", "white leather low-top sneakers"). ' +
    'Colours as simple precise words (olive, off-white, charcoal, rust). Record fit, fabric, pattern and how each piece is worn when visible. ' +
    'style_read = one sharp sentence naming the overall style the clothes currently read as.';
  const { data: r, model } = await think(env, { system, text: 'Catalogue this outfit photo as JSON.', image, schema: SEE_SCHEMA, name: 'seen', maxTokens: 900, temperature: 0.1 });
  r.garments = (r.garments || []).slice(0, 8); r.accessories = (r.accessories || []).slice(0, 8);
  r.model = model;
  return r;
}

// ------------------------------------------------------------------ /api/verdict
const P = { type: 'object', properties: { score: { type: 'integer' }, why: { type: 'string' } }, required: ['score', 'why'] };
const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    pillars: { type: 'object', properties: { fit: P, colour: P, occasion: P, cohesion: P, finishing: P }, required: ['fit', 'colour', 'occasion', 'cohesion', 'finishing'] },
    verdict: { type: 'string' },
    already: { type: 'string' },
    missing: { type: 'string' },
    moves: { type: 'array', items: { type: 'string' } },
    mission: { type: 'object', properties: { title: { type: 'string' }, task: { type: 'string' } }, required: ['title', 'task'] },
    picks: { type: 'array', items: { type: 'object', properties: { slug: { type: 'string' }, why: { type: 'string' } }, required: ['slug', 'why'] } },
    vibe_match: { type: 'integer' },
    restyle_prompt: { type: 'string' },
  },
  required: ['pillars', 'verdict', 'already', 'missing', 'moves', 'mission', 'picks', 'vibe_match', 'restyle_prompt'],
};

const BANNED = ['elevate', 'elevated', 'statement piece', 'pop of colour', 'pop of color', 'next level', 'effortlessly chic', 'level up', 'game changer', 'game-changer', 'versatile', 'timeless', 'on point', 'slay'];

function dossier(st) {
  const p = st.persona || {};
  return [
    `Lane: ${st.lane || ''}`,
    p.signatures ? `Signature pieces: ${p.signatures.join('; ')}` : '',
    p.palette ? `Palette: ${p.palette}` : '',
    p.silhouettes ? `Silhouettes: ${p.silhouettes}` : '',
    p.loves ? `The vibe loves: ${p.loves}` : '',
    p.breaks || st.avoid ? `Breaks the vibe: ${p.breaks || st.avoid}` : '',
    p.references ? `Reference point: ${p.references}` : '',
    st.moves ? `Typical moves: ${st.moves.join('; ')}` : '',
  ].filter(Boolean).map(x => '- ' + x).join('\n');
}

async function verdict(env, { image, seen, occasion, vibes = [], stylist, catalog = [], fixedPillars }) {
  if (!seen || !stylist) throw new Error('seen and stylist required');
  const occ = OCCASIONS[occasion] || occasion;
  const who = stylist.name, short = stylist.short || stylist.name;
  const cat = catalog.slice(0, 20).map(p => `${p.slug} | ${p.name} | ${p.type} | ${p.tone} | ₹${p.price}`).join('\n');
  const pillarRule = fixedPillars
    ? `The pillar scores are ALREADY DECIDED and must be returned exactly as: ${JSON.stringify(fixedPillars)}. Only rewrite each "why" (one specific sentence each).`
    : 'PILLARS: score each 0-20 as a neutral judge FIRST, identical for every vibe; the vibe changes the words, never the numbers. ' +
      'fit = how each garment fits and drapes; colour = how the palette works together; occasion = right for ' + occ + '; cohesion = do the pieces tell one story; ' +
      'finishing = visible bag, watch, eyewear, belt, jewellery, footwear care, tuck/cuff details. With no accessories visible, finishing is usually 9-13. ' +
      'A strong outfit without accessories lands around 70-80 total; 90+ is rare. Each "why" = one sentence naming a specific item.';
  const system =
`You are the AI stylist of RUMOAR's Stylo Meter. Right now you judge outfits through the style VIBE of ${who} ("${stylist.role}").
You are NOT ${who}. Never speak as them, never invent quotes, never say they would approve, like or wear something. Talk about the vibe in third person: "the ${short} vibe would...", "this is giving ${short}", "very ${short}", "not ${short} yet".

VIBE DOSSIER, study it and use its concrete details:
${dossier(stylist)}
Writing tone: ${stylist.voice}

SPECIFICITY RULES (the most important part):
1. Every sentence is about THIS photo. Name items as the catalogue does, with colour ("the olive cargo trousers"), never just "your outfit" or "your look".
2. verdict: 3-5 sentences, max 90 words. Mention at least 3 catalogued items by colour and name, say what works, what breaks the ${short} vibe, and how it lands for ${occ}.
3. already: one sentence naming which visible items or choices already match which ${short} signature. If nothing matches, say that honestly.
4. missing: one sentence naming the single biggest gap between this outfit and the ${short} signatures.
5. moves: exactly 3, max 25 words each. Each = a specific visible item (or an empty slot like "bare wrist", "no bag") -> a concrete change (item, colour, fabric, or how to wear it) -> why it moves toward the ${short} vibe or ${occ}. At least 2 moves must change items actually in the photo. Suggest things people can own or buy, and styling tricks (tuck, cuff, roll, layer, swap).
6. Never use these filler words: ${BANNED.join(', ')}. Use concrete nouns instead.
7. Never comment on face, body, weight, skin, height, age, gender or attractiveness. Clothes and styling only. Address the wearer as "you".
8. If something is not visible (e.g. footwear), say you cannot see it instead of guessing.
${pillarRule}
mission = a small challenge doable with their own wardrobe, then re-shoot (title max 5 words, task one sentence naming a specific item).
picks = exactly 3 products from the RUMOAR catalogue by slug; each "why" ties the product to a specific item in the photo AND to the ${short} vibe. Only slugs from the list.
vibe_match = 0-100, how close this outfit already is to the ${short} vibe.
restyle_prompt = one sentence for an image model describing the restyled outfit in this vibe: every garment with colour and fabric, footwear, accessories, how worn. NO person or celebrity names, no face or body words.`;
  const text =
    `Occasion: ${occ}. Vibe the user picked: ${vibes.join(' + ') || 'not set'}.\n` +
    `Verified catalogue of the photo (trust this over guesses): ${JSON.stringify({ ...seen, model: undefined })}\n` +
    `RUMOAR catalogue (slug | name | type | colour | price):\n${cat}\n` +
    `Give the ${short}-vibe verdict as JSON.`;
  const { data: r, model } = await think(env, { system, text, image, schema: VERDICT_SCHEMA, name: 'verdict', maxTokens: 1400, temperature: 0.5 });

  // enforce honesty server-side
  const keys = ['fit', 'colour', 'occasion', 'cohesion', 'finishing'];
  r.pillars = r.pillars || {};
  for (const k of keys) {
    const p = r.pillars[k] || { score: 12, why: '' };
    p.score = fixedPillars ? fixedPillars[k] : Math.max(0, Math.min(20, Math.round(Number(p.score) || 0)));
    r.pillars[k] = p;
  }
  r.total = keys.reduce((s, k) => s + r.pillars[k].score, 0);
  const slugs = new Set(catalog.map(p => p.slug));
  r.picks = (r.picks || []).filter(p => slugs.has(p.slug)).slice(0, 3);
  for (const fav of stylist.favourites || []) { if (r.picks.length >= 3) break; if (!r.picks.some(p => p.slug === fav) && slugs.has(fav)) r.picks.push({ slug: fav, why: '' }); }
  r.moves = (r.moves || []).slice(0, 3);
  r.vibe_match = Math.max(0, Math.min(100, Math.round(Number(r.vibe_match) || 0)));
  const BODY = /\b(your|you're|youre|you have (a|an)?)\s+(face|body|weight|figure|skin|physique|height|build|frame|jawline|smile)\b|\b(fat|ugly|handsome|attractive|curvy|chubby|overweight|underweight)\b/i;
  const clean = t => String(t || '').replace(/[^.!?]*[.!?]?/g, sent => (BODY.test(sent.replace(new RegExp(`\\b${short}\\b`, 'gi'), '')) ? '' : sent)).replace(/\s{2,}/g, ' ').trim();
  r.verdict = clean(r.verdict); r.already = clean(r.already); r.missing = clean(r.missing);
  r.moves = r.moves.map(clean).filter(Boolean);
  // the image model never gets a real person's name
  r.restyle_prompt = String(r.restyle_prompt || '').replace(new RegExp(`\\b(${[who, short, ...who.split(' ')].filter(x => x.length > 2).join('|')})('s)?\\b`, 'gi'), '').replace(/\s{2,}/g, ' ').trim();
  r.model = model;
  return r;
}

// ------------------------------------------------------------------ /api/render
// mode "tryon":   image 0 = the photo, image 1 = RUMOAR product. Adds the bag, keeps everything else.
// mode "restyle": image 0 = the photo. Restyles the outfit.
// Inputs must be under 512x512 for FLUX.2 on Workers AI; the browser sends 496 px.
async function render(env, { image, productImage, prompt, mode = 'tryon' }) {
  if (!image) throw new Error('image required');
  let p;
  if (mode === 'tryon') {
    if (!productImage) throw new Error('productImage required');
    p = `Photo edit of image 0. Keep the person in image 0 exactly the same: same pose, same clothes, same background, same lighting, same framing, face stays blurred. ` +
        `Add the bag from image 1, carried naturally the way that bag is designed to be worn (shoulder strap, crossbody or handheld), at realistic real-world scale for an adult, ` +
        `matching its exact shape, colour, material, stitching and hardware, with correct shadows and strap tension. ${prompt || ''} Photorealistic fashion photo, sharp focus.`;
  } else {
    p = `Photo edit of image 0. Keep the same person, pose, background, lighting and framing; the face stays blurred. Change only the clothes to: ${prompt || 'a sharper version of the same outfit'}. ` +
        `Realistic fabric texture and drape, garments fit naturally, photorealistic editorial fashion photo, sharp focus.`;
  }
  const errors = [];
  for (const model of IMAGE_MODELS) {
    try {
      const form = new FormData();
      form.append('input_image_0', dataUrlToBlob(image));
      if (mode === 'tryon') form.append('input_image_1', dataUrlToBlob(productImage));
      form.append('prompt', p.slice(0, 2000));
      form.append('width', '768'); form.append('height', '960');
      const fr = new Response(form);
      const out = await env.AI.run(model, { multipart: { body: fr.body, contentType: fr.headers.get('content-type') } });
      const b64 = out?.image || out?.result?.image;
      if (!b64) throw new Error('no image returned');
      return { image: `data:image/jpeg;base64,${b64}`, model, label: `AI-generated image · ${model.includes('9b') ? 'FLUX.2 [klein] 9B' : 'FLUX.2 [klein] 4B'}` };
    } catch (e) { errors.push(String(e.message || e)); if (/neurons|quota|429/i.test(String(e))) break; }
  }
  throw new Error(errors.join(' | '));
}

function dataUrlToBlob(d) {
  const [head, b64] = d.split(',');
  const type = head.match(/data:(.*?);/)?.[1] || 'image/jpeg';
  const bin = atob(b64); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type });
}
