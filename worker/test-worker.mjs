// Offline test of worker.js with a fake Gemini (global fetch) and a fake env.AI.  node worker/test-worker.mjs
import worker from './worker.js';
const img = 'data:image/jpeg;base64,' + Buffer.from('fakejpeg').toString('base64');
const seenOut = { is_outfit_photo: true, framing: 'full body', garments: [{ item: 'denim jacket', colour: 'indigo', fit: 'regular' }, { item: 'jeans', colour: 'indigo', fit: 'slim' }], accessories: [{ item: 'watch' }], footwear: 'white sneakers', palette: ['indigo', 'white'], style_read: 'double denim casual', condition_issues: [], fit_issues: [], uniform: 'none', effort: 'high', polish: 8 };
const verdictOut = { pillars: { fit: { score: 16, why: 'a' }, colour: { score: 15, why: 'b' }, occasion: { score: 14, why: 'c' }, cohesion: { score: 15, why: 'd' }, finishing: { score: 11, why: 'e' } },
  verdict: 'The indigo denim jacket is very Urfi already. Your body is great. The skinny jeans need a twist.', already: 'The double denim.', missing: 'Hardware.', moves: ['x', 'y', 'z', 'w'], mission: { title: 't', task: 'u' },
  picks: [{ slug: 'fake', why: 'no' }, { slug: 'scuttlebutt-silver-crossbody', why: 'yes' }], vibe_match: 140, restyle_prompt: "Urfi Javed's chain top, silver skirt" };
const log = [];
let geminiMode = 'ok';
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body); const model = url.match(/models\/(.*?):/)[1];
  log.push(model);
  if (geminiMode === 'down') return new Response('{"error":{"status":"RESOURCE_EXHAUSTED"}}', { status: 429 });
  if (geminiMode === 'noschema' && body.generationConfig.responseJsonSchema) return new Response('Unknown field responseJsonSchema', { status: 400 });
  const isSee = body.contents[0].parts[0].text.startsWith('Catalogue');
  return Response.json({ candidates: [{ content: { parts: [{ thought: true, text: 'thinking…' }, { text: JSON.stringify(isSee ? seenOut : verdictOut) }] } }] });
};
const calls = [];
const env = { ALLOWED_ORIGIN: '*', GEMINI_API_KEY: 'k', AI: { run: async (model, input) => {
  calls.push(model);
  if (model.includes('flux')) {
    const fd = await new Response(input.multipart.body, { headers: { 'content-type': input.multipart.contentType } }).formData();
    if (model.includes('9b') && env.fail9b) throw new Error('capacity');
    return { image: 'AAAA', fields: [...fd.keys()] };
  }
  return { response: input.response_format.json_schema.name === 'seen' ? seenOut : JSON.stringify(verdictOut) };
} } };
const post = (p, b) => worker.fetch(new Request('https://x' + p, { method: 'POST', headers: { 'content-type': 'application/json', Origin: 'https://me.github.io' }, body: JSON.stringify(b) }), env);
const stylist = { name: 'Urfi Javed', short: 'Urfi', role: 'The Provocateur', voice: 'v', lane: 'l', moves: ['m'], persona: { signatures: ['chains'] }, favourites: ['innuendo-slouch-shoulder-bag', 'hearsay-backpack'] };
const catalog = [{ slug: 'scuttlebutt-silver-crossbody', name: 'S', type: 'crossbody', tone: 'silver', price: 1999 }, { slug: 'innuendo-slouch-shoulder-bag', name: 'I', type: 'shoulder', tone: 'black', price: 2499 }];
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };

let r = await post('/api/see', { image: img }); let j = await r.json();
ok(r.status === 200 && j.model === 'Gemini 3.8 Flash', 'see via Gemini: ' + j.model);
r = await post('/api/verdict', { image: img, seen: j, occasion: 'office', vibes: ['Street'], stylist, catalog }); let v = await r.json();
ok(v.total === 71 && !v.caps.length, 'clean styled fit keeps its score: ' + v.total);
ok(v.picks.map(p => p.slug).join() === 'scuttlebutt-silver-crossbody,innuendo-slouch-shoulder-bag', 'picks filtered + topped up');
ok(v.moves.length === 3 && v.vibe_match === 100, 'moves capped, vibe clamped');
ok(!/body is great/.test(v.verdict) && /skinny jeans/.test(v.verdict) && /very Urfi/.test(v.verdict), 'body sentence stripped, clothing words kept: ' + v.verdict);
ok(!/Urfi|Javed/i.test(v.restyle_prompt), 'celeb name removed from image prompt: ' + v.restyle_prompt);
const waiter = { is_outfit_photo: true, framing: 'full body', garments: [{ item: 'black waistcoat', colour: 'black', fit: 'regular' }, { item: 'white shirt', colour: 'white', fit: 'relaxed' }], accessories: [], footwear: 'scuffed black shoes', palette: ['black', 'white'], style_read: 'restaurant uniform', condition_issues: ['wrinkled shirt', 'scuffed shoes', 'faded trousers'], fit_issues: ['trousers pooling at the ankle'], uniform: 'waiter uniform', effort: 'low', polish: 3 };
r = await post('/api/verdict', { image: img, seen: waiter, occasion: 'date-night', stylist, catalog }); v = await r.json();
ok(v.total <= 48, 'rugged waiter uniform is held down: ' + v.total + ' caps: ' + v.caps.join(' / '));
r = await post('/api/verdict', { image: img, seen: {}, occasion: 'office', stylist, catalog, fixedPillars: { fit: 10, colour: 10, occasion: 10, cohesion: 10, finishing: 10 } });
ok((await r.json()).total === 50, 'fixed pillars respected');
geminiMode = 'noschema'; log.length = 0; r = await post('/api/see', { image: img });
ok(r.status === 200 && log.length === 2, 'retries without responseJsonSchema on 400');
geminiMode = 'down'; log.length = 0; calls.length = 0; r = await post('/api/see', { image: img }); j = await r.json();
ok(r.status === 200 && log.length === 3 && calls[0].includes('llama') && /Cloudflare/.test(j.model), 'all Gemini models 429 -> Workers AI backup: ' + j.model);
geminiMode = 'ok';
r = await post('/api/render', { image: img, productImage: img, mode: 'tryon' }); j = await r.json();
ok(r.status === 200 && j.model.includes('9b'), 'render with klein 9B');
env.fail9b = true; r = await post('/api/render', { image: img, mode: 'restyle', prompt: 'x' }); j = await r.json();
ok(r.status === 200 && j.model.includes('4b'), 'render falls back to 4B');
r = await worker.fetch(new Request('https://x/api/health'), env); j = await r.json();
ok(j.ok && j.gemini && j.models.image.includes('9b'), 'health ' + JSON.stringify(j.models));
r = await post('/api/see', { image: 'http://evil' }); ok(r.status === 400, 'bad image rejected');
env.AI.run = async () => { throw new Error('3036: account has exceeded daily neurons limit'); }; geminiMode = 'down';
r = await post('/api/see', { image: img }); ok(r.status === 429, 'quota message: ' + (await r.json()).error);

// ------------------------------------------------------------------ v7: Groq + OpenRouter fallbacks
{
  const hits = [];
  let groqMode = 'ok', orMode = 'ok';
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    if (url.includes('generativelanguage')) { hits.push('gemini'); return new Response('{"error":{"status":"RESOURCE_EXHAUSTED"}}', { status: 429 }); }
    const isSee = JSON.stringify(body.messages).includes('Catalogue');
    const payload = JSON.stringify(isSee ? seenOut : verdictOut);
    if (url.includes('groq.com')) {
      hits.push('groq:' + body.model + (body.reasoning_effort ? '+effort' : '') + (body.response_format ? ':' + body.response_format.type : ''));
      if (groqMode === 'down') return new Response('{"error":{"message":"Rate limit reached"}}', { status: 429 });
      if (body.reasoning_effort) return new Response('{"error":{"message":"reasoning_effort not supported"}}', { status: 400 });
      if (body.response_format?.type === 'json_schema') return new Response('{"error":{"message":"json_schema not supported"}}', { status: 400 });
      return Response.json({ choices: [{ message: { content: '<think>let me look</think>' + payload } }] });
    }
    if (url.includes('openrouter.ai')) {
      hits.push('openrouter:' + body.model);
      if (orMode === 'firstdown' && body.model.startsWith('qwen')) return new Response('{"error":{"message":"Rate limit exceeded: free-models-per-day"}}', { status: 429 });
      return Response.json({ choices: [{ message: { content: '```json\n' + payload + '\n```' } }] });
    }
    throw new Error('unexpected url ' + url);
  };
  const aiCalls = [];
  const env2 = { ALLOWED_ORIGIN: '*', GEMINI_API_KEY: 'k', GROQ_API_KEY: 'g', OPENROUTER_API_KEY: 'o', AI: { run: async (model) => { aiCalls.push(model); throw new Error('3036: daily free allocation of neurons used up'); } } };
  const post2 = (p, b) => worker.fetch(new Request('https://x' + p, { method: 'POST', headers: { 'content-type': 'application/json', Origin: 'https://me.github.io' }, body: JSON.stringify(b) }), env2);

  let r = await post2('/api/see', { image: img }); let j = await r.json();
  ok(r.status === 200 && j.model === 'Qwen 3.8 27B (Groq)', 'Gemini 429 -> Groq Qwen: ' + j.model);
  ok(hits.includes('groq:qwen/qwen3.8-27b+effort:json_schema') && hits.includes('groq:qwen/qwen3.8-27b:json_object'), 'Groq steps down unsupported options: ' + hits.filter(h => h.startsWith('groq')).join(' > '));
  ok(j.garments?.length === 2 && aiCalls.length === 0, 'parsed through <think>, Cloudflare allowance untouched');

  groqMode = 'down'; hits.length = 0;
  r = await post2('/api/verdict', { image: img, seen: j, occasion: 'office', vibes: ['Street'], stylist, catalog }); let v = await r.json();
  ok(r.status === 200 && /OpenRouter/.test(v.model) && v.total === 71, 'Gemini + Groq down -> OpenRouter: ' + v.model);

  orMode = 'firstdown'; hits.length = 0;
  r = await post2('/api/see', { image: img }); j = await r.json();
  ok(r.status === 200 && j.model === 'Gemma 4 31B (OpenRouter)', 'OpenRouter free model limit -> next free model: ' + j.model);

  env2.OPENROUTER_API_KEY = ''; hits.length = 0; aiCalls.length = 0;
  r = await post2('/api/see', { image: img }); j = await r.json();
  ok(r.status === 429 && j.code === 'quota' && aiCalls.length > 0, 'everything exhausted -> friendly 429: ' + j.error);

  r = await post2('/api/render', { image: img, productImage: img, mode: 'tryon' }); j = await r.json();
  ok(r.status === 429 && j.code === 'render_quota' && aiCalls.filter(m => m.includes('flux')).length === 2, 'render: 9B out -> tries 4B -> clear render_quota message');

  env2.BRAIN_ORDER = 'groq,gemini'; groqMode = 'ok'; hits.length = 0;
  r = await post2('/api/see', { image: img }); j = await r.json();
  ok(r.status === 200 && hits[0].startsWith('groq') && !hits.includes('gemini'), 'BRAIN_ORDER respected');

  r = await worker.fetch(new Request('https://x/api/health'), env2); j = await r.json();
  ok(j.providers.groq && j.providers.gemini && !j.providers.openrouter && j.brainOrder.join() === 'groq,gemini', 'health shows providers + order');
}
