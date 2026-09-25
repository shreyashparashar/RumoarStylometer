// The stylist's voice.
// Two engines, same output (a short verdict, streamed token by token):
//  • instant  – a built-in writer that assembles the stylist's lines from the analysis. Works everywhere, 0 MB.
//  • local-ai – an open LLM (Qwen2.5 1.5B Instruct, Apache 2.0) running on the user's GPU via WebLLM.
//               Free, no server, nothing leaves the device. ~1 GB one-time download, cached by the browser.
// The recommendations themselves are always computed by scoring.js, so both engines
// talk about the same products and the same honest numbers.

const WEBLLM = 'https://esm.run/@mlc-ai/web-llm@0.2.84';
const MODELS = { f16: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', f32: 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC' };

export const ai = { state: 'off', progress: 0, text: '' };
const subs = new Set();
export const onAI = f => (subs.add(f), () => subs.delete(f));
const emit = () => subs.forEach(f => { try { f(ai); } catch (e) { console.warn(e); } });
let engine = null, loading = null;

export async function webgpu() {
  if (!('gpu' in navigator)) return null;
  try { const a = await navigator.gpu.requestAdapter(); return a ? { f16: a.features.has('shader-f16') } : null; } catch { return null; }
}

export function loadAI() {
  if (engine) return Promise.resolve(engine);
  if (loading) return loading;
  loading = (async () => {
    const gpu = await webgpu();
    if (!gpu) { ai.state = 'unsupported'; emit(); loading = null; return null; }
    ai.state = 'loading'; ai.progress = 0; emit();
    try {
      const webllm = await import(WEBLLM);
      engine = await webllm.CreateMLCEngine(gpu.f16 ? MODELS.f16 : MODELS.f32, {
        initProgressCallback: r => { ai.progress = r.progress || 0; ai.text = r.text || ''; emit(); },
      });
      ai.state = 'ready'; ai.progress = 1; emit();
      return engine;
    } catch (e) {
      console.warn('Local AI failed to load', e); ai.state = 'failed'; emit(); loading = null; return null;
    }
  })();
  return loading;
}

// ---------------------------------------------------------------- facts
const an = w => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w;
const pick = (arr, seed) => arr[Math.abs(seed) % arr.length];
function seedOf(s) { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return h; }

export function facts({ stylist, det, measures, result, occasion, vibes, picks }) {
  const plural = new Set(['jeans', 'cargo pants', 'trousers', 'shorts', 'track pants']);
  const pieces = [det.top && an(det.top), det.bottom && (plural.has(det.bottom) ? det.bottom : an(det.bottom))].filter(Boolean);
  const wearing = pieces.length ? pieces.join(' with ') : `a mostly ${measures.tone} look`;
  const extras = Object.entries(det.acc || {}).filter(([, v]) => v).map(([k]) => k === 'chain' ? 'a chain' : k === 'sunglasses' ? 'sunglasses' : an(k));
  return {
    stylist: stylist.name, occasion, vibes, wearing, extras,
    palette: measures.hues <= 1 ? `a tight ${measures.tone} palette` : measures.hues >= 4 ? 'a lot of colours at once' : `a ${measures.tone}-led palette`,
    score: result.total, weakest: result.fix.pillar, fix: result.fix.text,
    pick: picks[0].product.name, pickType: picks[0].product.type, pickGain: picks[0].delta, after: picks[0].total,
    gainWhy: picks[0].pillars.finishing > result.pillars.finishing ? 'it finishes the look' : 'it pulls the palette together',
  };
}

// ---------------------------------------------------------------- instant writer
function band(score) { return score >= 85 ? 'high' : score >= 72 ? 'mid' : score >= 60 ? 'low' : 'rough'; }
const BAND = {
  high: ['Honestly? This already lands.', 'This is strong. I am only here to polish.', 'Very good. Very, very good.'],
  mid: ['Sharp base, unfinished story.', 'Solid, but it stops one step short.', 'The outfit is working. The finish is not.'],
  low: ['There is a look in here, it is just hiding.', 'Good bones, no direction yet.', 'Right idea, wrong volume.'],
  rough: ['Okay, we are starting fresh, and that is fine.', 'Let us rebuild this from the bag up.', 'Plot twist: we restyle.'],
};

export function instantVerdict(f, stylist) {
  const s = seedOf(f.wearing + f.occasion + stylist.id + f.score);
  const lines = [
    pick(stylist.open, s),
    `I see ${f.wearing}${f.extras.length ? ', plus ' + f.extras.join(' and ') : ''}, in ${f.palette}. For ${f.occasion.toLowerCase()}, that is a ${f.score}. ${pick(BAND[band(f.score)], s >> 3)}`,
    `My move: ${stylist.moves[Math.abs(s >> 5) % stylist.moves.length].toLowerCase()}. And carry ${f.pick}. It takes you to ${f.after}, because ${f.gainWhy}.`,
    pick(stylist.close, s >> 7),
  ];
  return lines.join(' ');
}

// ---------------------------------------------------------------- local AI writer
function prompt(f, stylist) {
  return [
    { role: 'system', content:
      `You are ${stylist.name}, "${stylist.role}", a fictional stylist character inside the RUMOAR Stylo Meter. ` +
      `Voice: ${stylist.voice} ` +
      `Rules: talk directly to the user in 4 short sentences, under 75 words total. Comment only on clothes, colours and accessories. ` +
      `Never comment on face, body, weight, skin, height or attractiveness. Be encouraging underneath the attitude. ` +
      `Mention the RUMOAR piece "${f.pick}" by its exact name once. Do not invent other products. No emojis, no hashtags, no lists.` },
    { role: 'user', content:
      `Outfit: ${f.wearing}${f.extras.length ? ', with ' + f.extras.join(', ') : ''}. Palette: ${f.palette}. Occasion: ${f.occasion}. ` +
      `Vibe he chose: ${f.vibes}. Stylo Score: ${f.score}/100. Weakest area: ${f.weakest}. ` +
      `Recommended RUMOAR piece: ${f.pick} (a ${f.pickType}); it raises the score to ${f.after}. ` +
      `Give your verdict in character.` },
  ];
}

// Streams the verdict into onToken(textSoFar). Returns the final text.
export async function verdict(f, stylist, { mode = 'instant', onToken = () => {}, signal } = {}) {
  if (mode === 'local-ai') {
    const eng = await loadAI();
    if (eng) {
      try {
        let out = '';
        const stream = await eng.chat.completions.create({ messages: prompt(f, stylist), stream: true, temperature: .85, top_p: .95, max_tokens: 170 });
        for await (const ch of stream) {
          if (signal?.aborted) { eng.interruptGenerate?.(); break; }
          out += ch.choices[0]?.delta?.content || ''; onToken(out);
        }
        out = out.trim();
        if (out.length > 40 && !/\b(face|body|weight|skin|fat|thin|ugly)\b/i.test(out)) return out;  // guardrail
      } catch (e) { console.warn('AI generation failed, using instant writer', e); }
    }
  }
  // instant: typewriter the built-in verdict so it feels alive
  const text = instantVerdict(f, stylist); const words = text.split(' ');
  let out = '';
  for (let i = 0; i < words.length; i++) {
    if (signal?.aborted) break;
    out += (i ? ' ' : '') + words[i]; onToken(out);
    await new Promise(r => setTimeout(r, 34 + (words[i].endsWith('.') ? 120 : 0)));
  }
  return text;
}
