// Offline test of worker.js with a fake env.AI
import worker from './worker.js';
const calls = [];
const env = { ALLOWED_ORIGIN: '*', AI: { run: async (model, input) => {
  calls.push({ model, input });
  if (model.includes('flux')) {
    // read back multipart to prove it is well formed
    const fd = await new Response(input.multipart.body, { headers: { 'content-type': input.multipart.contentType } }).formData();
    calls.at(-1).fields = [...fd.keys()];
    return { image: 'AAAA' };
  }
  const sch = input.response_format.json_schema.name;
  if (sch === 'seen') return { response: { is_outfit_photo: true, framing: 'full body', garments: [{ item: 'denim jacket', colour: 'indigo' }, { item: 'jeans', colour: 'indigo' }], accessories: [], palette: ['indigo', 'white'], style_read: 'double denim casual' } };
  return { response: JSON.stringify({ pillars: { fit: { score: 16, why: 'a' }, colour: { score: 15, why: 'b' }, occasion: { score: 14, why: 'c' }, cohesion: { score: 15, why: 'd' }, finishing: { score: 11, why: 'e' } }, verdict: 'Double denim, darling. Your body is great.', moves: ['x', 'y', 'z', 'w'], mission: { title: 't', task: 'u' }, picks: [{ slug: 'fake', why: 'no' }, { slug: 'scuttlebutt-silver-crossbody', why: 'yes' }], vibe_match: 140, restyle_prompt: 'sequins' }) };
} } };
const img = 'data:image/jpeg;base64,' + Buffer.from('fakejpeg').toString('base64');
const post = (p, b) => worker.fetch(new Request('https://x' + p, { method: 'POST', headers: { 'content-type': 'application/json', Origin: 'https://me.github.io' }, body: JSON.stringify(b) }), env);
let r = await post('/api/see', { image: img }); console.log('see', r.status, JSON.stringify(await r.json()).slice(0, 120));
r = await post('/api/verdict', { image: img, seen: { garments: [] }, occasion: 'office', vibes: ['Street'], stylist: { name: 'Drama Didi', role: 'x', voice: 'v', lane: 'l', moves: ['m'], favourites: ['innuendo-slouch-shoulder-bag', 'hearsay-backpack'] }, catalog: [{ slug: 'scuttlebutt-silver-crossbody', name: 'S', type: 'crossbody', tone: 'silver', price: 1999 }, { slug: 'innuendo-slouch-shoulder-bag', name: 'I', type: 'shoulder', tone: 'black', price: 2499 }] });
const v = await r.json(); console.log('verdict', r.status, v.total, v.picks.map(p => p.slug), v.moves.length, v.vibe_match, JSON.stringify(v.verdict));
r = await post('/api/verdict', { image: img, seen: {}, occasion: 'office', stylist: { name: 'A', favourites: [] }, catalog: [], fixedPillars: { fit: 10, colour: 10, occasion: 10, cohesion: 10, finishing: 10 } });
console.log('fixed', (await r.json()).total);
r = await post('/api/render', { image: img, productImage: img, mode: 'tryon' }); console.log('render', r.status, JSON.stringify(await r.json()).slice(0, 80), calls.at(-1).fields);
r = await worker.fetch(new Request('https://x/api/see', { method: 'OPTIONS', headers: { Origin: 'https://a.b' } }), env); console.log('options', r.status, r.headers.get('access-control-allow-origin'));
r = await post('/api/see', { image: 'http://evil' }); console.log('bad', r.status);
env.AI.run = async () => { throw new Error('3036: account has exceeded daily neurons limit'); };
r = await post('/api/see', { image: img }); console.log('quota', r.status, (await r.json()).error);
