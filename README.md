# Stylo Meter by RUMOAR · v2

**Does this look good on me?** Drop your fit, pick the occasion and your vibe, then pick a stylist with opinions. You get an honest score, their verdict in their own voice, and the RUMOAR piece that finishes the look.

A static website. No server, no API keys, no cost. Everything, including the AI, runs in the visitor's browser, so it hosts on GitHub Pages as-is.

## Deploy on GitHub Pages

1. Put these files at the **top level** of the repository (you should see `index.html` on the repo's main page without clicking into a folder).
2. **Settings → Pages → Deploy from a branch → `main` / `(root)` → Save.**
3. Open `https://<your-username>.github.io/<repo-name>/` after a minute or two.

Test locally with `python3 -m http.server 8000` (ES modules don't load from `file://`).

Link from a store product page with `?product=<slug>`, e.g. `…/?product=innuendo-slouch-shoulder-bag`. That piece gets priority in every stylist's picks.

## The flow

1. **Drop your fit.** Drag a photo anywhere on the page, tap to choose, or try a sample.
2. **Scan.** Faces are detected and blurred on-device (MediaPipe). Then the "stylist's eyes" read the outfit: top, bottom, style, bag, watch, sunglasses, chain (CLIP).
3. **Occasion.** Date night, concert, office, college, festival.
4. **Vibe.** One or two of six archetypes.
5. **Stylist.** Ten collectible stylist cards. Picking one re-themes the whole site in their colours.
6. **Verdict.** Stylo Score (honest, identical for every stylist), vibe match, the stylist's verdict typed out live, their three moves, three RUMOAR picks with the real score gain, the five-pillar breakdown, a share card, and one tap to ask another stylist.

## The stylists

Original characters, each a style lane. They are not real people and do not imitate anyone.

| Stylist | Lane | Spice |
|---|---|---|
| Zari Zinda | The Provocateur: experimental, hardware, the unexpected | 5 |
| Drama Didi | The Showstopper: colour, shine, the entrance | 5 |
| Glitch Kid | The Main Character: Gen-Z, oversized, ironic | 4 |
| Sleek Sona | The Sculpted Minimalist: monochrome, fitted, polished | 2 |
| Nawab Sahab | Old Money, Older Soul: tailoring, texture, leather | 1 |
| Bandra Bhau | The Streetwear Scout: cargos, drops, utility | 3 |
| Seoul Sutra | Soft Boy Energy: layers, soft colours, silver | 2 |
| Desi Drip | The Chain Reaction: chains, oversized, shine | 4 |
| Kurta Kavi | The Handloom Poet: Indo-fusion, natural fabrics | 2 |
| Rockstar Raghu | Leather & Noise: black, leather, hardware | 4 |

Add or edit stylists in `js/stylists.js`: palette, card pattern, bio, moves, voice, preferred bag types and colours, favourite products, opening and closing lines.

## The free, local AI

| Job | Model | Where it runs | Size |
|---|---|---|---|
| Face detection and blur | MediaPipe BlazeFace (Apache 2.0) | Browser, CPU | ~0.2 MB |
| Reading the outfit | CLIP ViT-B/16 via Transformers.js (MIT) | Browser, CPU/WASM | ~150 MB, once, cached |
| Stylist voice (optional) | Qwen2.5 1.5B Instruct via WebLLM (Apache 2.0) | Browser, GPU (WebGPU) | ~1 GB, once, cached |
| Stylist voice (default) | Built-in writer | Browser | 0 MB |

The site files live on GitHub; model weights stream from public CDNs (jsDelivr, Hugging Face, Google) on first use and are cached by the browser. Nothing the user uploads leaves their device.

The **Stylist brain** switch in the header chooses between the instant writer (works everywhere) and on-device AI (needs WebGPU: recent Chrome or Edge on a laptop, or newer phones). If the AI can't load, or its answer breaks the rules, the instant writer takes over automatically.

## What is still demo

- **Scoring** uses palette, contrast and detected accessories (`js/scoring.js`). The production rubric model swaps in behind the same functions.
- **Vision** is zero-shot CLIP: good at big pieces (denim jacket, jeans, bag), less reliable on small details, and a blurred face can confuse "cap" and "sunglasses".
- **Try-on renders** are not generated; the product appears beside the photo on the share card.

## Files

```
index.html          The experience
wireframes.html     Flow, v1 screens, pipeline, rubric
css/app.css         All styles
js/main.js          Steps, UI, theming, verdict
js/stylists.js      The ten stylists
js/vision.js        CLIP outfit reading
js/brain.js         Instant writer + on-device LLM
js/scoring.js       Five-pillar Stylo Score and product maths
js/faceblur.js      On-device face blur
js/catalog.js       RUMOAR products, occasions, vibes, samples
js/share.js         Share card
js/fx.js            Motion: tilt, magnetic buttons, cursor, confetti
docs/ARCHITECTURE.md
```
