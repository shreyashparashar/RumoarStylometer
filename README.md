# Stylo Meter by RUMOAR · v6

**Does this look good on me?** Drop your fit → pick the occasion → pick a celebrity vibe icon (or lock one in on the home page and skip straight to the verdict).
A vision AI actually looks at the photo, scores it honestly, and gives a verdict on how well the fit suits that celebrity's vibe (never in their name, never quoting them), with three moves, a mission, three RUMOAR picks, and an **AI render of you wearing the piece**.

Two free pieces:

| Piece | Where it runs | Cost |
|---|---|---|
| The website (`index.html`, `css/`, `js/`, `assets/`) | GitHub Pages | Free |
| The AI brain (`worker/worker.js`) | Cloudflare Worker: Gemini → Groq → OpenRouter → Workers AI for reading + advice (each free, used in turn when one runs out), Workers AI FLUX.2 for renders | Free, no card needed |

Nothing is downloaded to the visitor's device. Faces are blurred in the browser **before** anything is sent to the AI, and the Worker stores nothing.

---

## 1. Deploy the AI brain on Cloudflare (about 5 minutes, no coding)

1. Create a free account at **dash.cloudflare.com**.
2. Go to **Workers & Pages → Create → Create Worker**, name it `stylo-meter-ai`, click **Deploy**.
3. Click **Edit code**, delete everything, paste the whole of `worker/worker.js`, click **Deploy**.
4. Go to the Worker's **Settings → Bindings → Add → Workers AI**. Variable name: `AI`. Save.
5. **Get a free Gemini key (this is the big quality upgrade):** go to **aistudio.google.com/apikey**, sign in with any Google account, **Create API key**. Back in the Worker: **Settings → Variables and Secrets → Add → type Secret**, name `GEMINI_API_KEY`, paste the key. Save and deploy.
   **Add the backup brains (strongly recommended, 5 more minutes).** When Gemini's free limit runs out, these take over automatically:
   - **Groq** (free, no card): sign up at **console.groq.com**, open **API Keys → Create API Key**, copy it. In the Worker: **Settings → Variables and Secrets → Add → type Secret**, name `GROQ_API_KEY`, paste, save.
   - **OpenRouter** (free models, about 50 requests a day): sign up at **openrouter.ai**, open **Keys → Create Key**, copy it, and add it the same way as a Secret named `OPENROUTER_API_KEY`.
   - Deploy. The health check (step 7) now lists which providers are switched on under `"providers"`.
   Without it the Worker still runs, on Llama 4 Scout (the old, weaker brain).
6. **Settings → Variables and Secrets → Add**: name `ALLOWED_ORIGIN`, value `https://<your-username>.github.io`. Save and deploy.
   (This stops other websites from spending your free allowance.)
7. Copy the Worker URL, e.g. `https://stylo-meter-ai.<you>.workers.dev`. Open `https://stylo-meter-ai.<you>.workers.dev/api/health`; you should see `{"ok":true,...,"gemini":true}`. If `gemini` is `false`, the key is not set.

Prefer the command line? `cd worker && npx wrangler secret put GEMINI_API_KEY && npx wrangler deploy` does the same using `wrangler.toml`.

## 2. Connect the website

Open `js/config.js` and paste the Worker URL:
```js
export const API_BASE = 'https://stylo-meter-ai.<you>.workers.dev';
```
(For a quick test you can instead paste the URL into the "Connect the AI brain" box on the site, or open the site with `?api=<worker-url>`.)

## 3. Put the site on GitHub Pages

Upload everything in this folder to the **top level** of your repository (you should see `index.html` on the repo's main page), then **Settings → Pages → Deploy from a branch → main / (root)**. The site appears at `https://<your-username>.github.io/<repo-name>/`.

---

## The AI

| Job | Model | Why |
|---|---|---|
| What is in the photo (garments with colour, fit, fabric, how worn; accessories; footwear; proportions) | **Gemini 3.8 Flash** on the free Gemini API tier, falling back to 3.6 Flash, 3.5 Flash, then Llama 4 Scout on Workers AI | Far sharper eyes than Llama 4 Scout, and it follows long instructions |
| Score + vibe verdict + "already giving / not yet" + moves + mission + picks | Same chain, grounded on its own catalogue of the photo and the icon's vibe dossier | Specific, persona-driven advice instead of generic tips |
| Try-on ("Render me with it") and restyle | **FLUX.2 [klein] 9B** on Workers AI, falling back to 4B | Bigger model, same free allowance; inputs are now sized under FLUX's 512 px limit (the old 768 px uploads were one reason renders looked off) |

**Why not Gemini for the images too?** Google's image models (Nano Banana 2 / Pro) are paid-only on the API right now, so FLUX.2 on Cloudflare stays the best free option. If you ever get billing on the Gemini key, swapping the render step to `gemini-3.1-flash-image` is the next upgrade.

**Free limits and fallbacks:** each verdict is 2 calls. The Worker tries **Gemini → Groq (Qwen 3.8 27B) → OpenRouter (free Qwen 3.8 / Gemma 4) → Workers AI**, moving on whenever one is rate-limited, out of its daily allowance or down, so one provider running out doesn't stop the demo. The verdict shows which model answered. Workers AI comes last on purpose: its 10,000 daily neurons are kept for the FLUX renders, which have no free alternative. Change the order with a `BRAIN_ORDER` variable, e.g. `groq,gemini,openrouter,cloudflare`, and the models with `GROQ_MODELS` / `OPENROUTER_MODELS`.

**When renders run out:** the Worker tries FLUX.2 klein 9B, then the ~13× cheaper klein 4B. If both are out, the site says so plainly ("renders come back after 05:30 IST") while scores and advice keep working through the other providers. Note: on Google's free tier, prompts may be used to improve Google's products, which is one more reason the face is blurred before anything leaves the phone. Cloudflare's image allowance is 10,000 neurons a day, resetting 05:30 IST.

**Change models** without touching code: add a `GEMINI_MODELS` variable, e.g. `gemini-3.8-flash,gemini-3.6-flash`. Pick models marked "Free of charge" on ai.google.dev/gemini-api/docs/pricing.

**How the advice stops being generic:** each icon has a **vibe dossier** in `js/stylists.js` (signature pieces, palette, silhouettes, what the vibe loves, what breaks it, a reference point). The Worker hands the dossier and the photo catalogue to Gemini with hard rules: name every item by colour, mention at least 3 real items, every move = *this item → this change → why it gets you closer to the vibe*, filler words like "elevate" and "statement piece" are banned.

**Honesty rules enforced in the Worker:** the AI never speaks as the celebrity, quotes them or claims their approval; it only says whether the fit suits their vibe. It may only mention items it catalogued; it never comments on face, body, skin or looks (sentences that do are stripped); celebrity names are stripped from image prompts so renders never try to copy a real person; the five pillar scores are fixed after the first verdict so every vibe gives the **same score** for the same photo; product picks are limited to the real RUMOAR catalogue.

Test the Worker offline any time: `node worker/test-worker.mjs`.

---

## Scoring: strict on purpose

A photo of a waiter in a worn uniform should not get 70, so scoring has two layers:

1. **The inspector** (`/api/see`) lists condition problems (wrinkles, stains, fading, scuffed shoes), fit problems (sleeve and trouser length, pulling, billowing), whether it is a work uniform, how much styling effort is visible, and an overall polish rating out of 10.
2. **The judge** (`/api/verdict`) scores five pillars against fixed anchors (11 = average, 15 = good, 19+ = rare), then the Worker applies hard ceilings: poor condition caps finishing and cohesion, uniforms cap occasion, little effort caps cohesion and finishing, no accessories caps finishing, and polish caps the total (polish 5 → 60, 6 → 66, 7 → 72, 8 → 78). The verdict screen lists every cap under "Why it isn't higher".

The scale shown on the home dial: 0–40 Rework, 40–55 Plain, 55–65 Basic, 65–75 Styled, 75–85 Sharp, 85–100 Editorial.

## Look and type

Poppy streetwear-drop style: cobalt background, chunky black outlines, hard offset shadows, sticker labels and colour-blocked cards (sun yellow, fire orange, lime, sky, grape). The upload area is a sticker-covered drop card with a starburst showing your last score. Each vibe icon keeps its own bright colour takeover on the icon and verdict screens. **Krona One** for the RUMOAR logo, **BDO Grotesk** (variable, 300–900) for everything else, both self-hosted in `assets/fonts/`.

## The game

- **XP and 10 levels**, from Fresh Fit to RUMOAR Royalty. XP for verdicts (more for higher scores), meeting new stylists, AI try-ons and restyles, share cards, missions, streaks and the daily brief.
- **Vibe deck:** 5 icons at level 1; the rest unlock at levels 2, 3 and 4 with a level-up celebration.
- **Daily brief:** a new occasion + level-1 icon + target score (66–73) every day, the same for everyone.
- **Missions:** every stylist sets a mission for your own wardrobe. Accept it, re-shoot, and beat your score with that stylist for +120 XP.
- **11 badges:** First Fit, Vibe Hopper, Try-On Taker, Shape Shifter, Glow-Up, Head Turner, Mission Complete, Brief Crusher, On a Roll, Full Deck, Posted It.
- Tap the level ring in the header for your profile, deck, missions and badges. Progress is saved in the browser.

## The vibe icons

13 real-celebrity vibes, each with a colour takeover, card pattern, artifacts, favourite RUMOAR pieces and a vibe dossier the AI studies. The AI talks *about* the vibe ("this is giving Urfi", "the Saif vibe would add texture"), never *as* the person.

| Icon | Lane | Unlock |
|---|---|---|
| Urfi Javed | The Provocateur: DIY, unexpected materials, hardware | Lv 1 |
| Rakhi Sawant | The Showstopper: maximal colour and shine | Lv 1 |
| The Rebel Kid (Apoorva Mukhija) | Unapologetic Gen-Z: loud colour, trend-first | Lv 1 |
| Disha Patani | Sculpted minimalist: sleek, monochrome, gym-to-glam | Lv 1 |
| DIVINE | Mumbai street: oversized, cargos, sneakers | Lv 1 |
| Saif Ali Khan | Old money, actual Nawab: kurta, bandhgala, linen | Lv 2 |
| Ananya Panday | Soft Gen-Z pastel, Y2K | Lv 2 |
| Orry | Camera-first party looks | Lv 2 |
| Badshah | Colourful luxe streetwear, chains, shades | Lv 3 |
| Diljit Dosanjh | Desi fusion: kurta with sneakers, colour-matched | Lv 3 |
| Ranbir Kapoor | The Wanderer: earthy layers, travel-ready | Lv 3 |
| Farhan Akhtar | Rock On: black, leather, hardware | Lv 4 |
| Vicky Kaushal | The Internet Crush: open collars, relaxed tailoring | Lv 4 |

**Photos** load automatically from each person's Wikipedia page (the lead image, which comes from Wikimedia Commons under a free licence; the verdict screen links to the page for credit). To use your own photo, put it in `assets/stylists/` and set `photo: 'assets/stylists/<file>.jpg'` on that icon in `js/stylists.js`.

**Editing an icon:** everything lives in `js/stylists.js`: `name`, `short` (used in "the Urfi vibe"), `role`, `bio`, `persona` (the dossier), `voice` (the writing tone), `lane`, `moves`, `favourites`, colours, pattern, `props`, `unlock`, `wiki` (Wikipedia page title for the photo). The richer the `persona`, the sharper the advice.

The footer says the icons are style inspirations only, with no affiliation or endorsement. Keep that line if you ever show this outside class.

## Files

```
index.html            The experience
css/app.css           All styles
js/config.js          ← your Worker URL goes here
js/main.js            Steps, verdict, AI studio, game UI
js/ai.js              Talks to the Worker
js/game.js            XP, levels, badges, brief, missions
js/stylists.js        The 13 vibe icons + their dossiers
js/photos.js          Loads icon photos (your own or Wikipedia)
js/props.js           The artifact sticker library (SVG)
js/scoring.js         Pillars and product score maths
js/faceblur.js        On-device face blur
js/catalog.js         RUMOAR products, occasions, vibes, samples
js/share.js           Share card
js/fx.js              Motion helpers
worker/worker.js      The AI server (Gemini/Groq/OpenRouter/Workers AI brain + FLUX.2 renders)
worker/wrangler.toml  For command-line deploys
worker/test-worker.mjs  Offline test: node worker/test-worker.mjs
wireframes.html       Flow and early wireframes
```
