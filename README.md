# Stylo Meter by RUMOAR · v3

**Does this look good on me?** Drop your fit → pick the occasion → pick the vibe → pick a stylist.
A vision AI actually looks at the photo, scores it honestly, and the stylist gives the verdict in their own voice, with three moves, a mission, three RUMOAR picks, and an **AI render of you wearing the piece**.

Two free pieces:

| Piece | Where it runs | Cost |
|---|---|---|
| The website (`index.html`, `css/`, `js/`, `assets/`) | GitHub Pages | Free |
| The AI brain (`worker/worker.js`) | Cloudflare Workers AI | Free daily allowance, no card needed |

Nothing is downloaded to the visitor's device. Faces are blurred in the browser **before** anything is sent to the AI, and the Worker stores nothing.

---

## 1. Deploy the AI brain on Cloudflare (about 5 minutes, no coding)

1. Create a free account at **dash.cloudflare.com**.
2. Go to **Workers & Pages → Create → Create Worker**, name it `stylo-meter-ai`, click **Deploy**.
3. Click **Edit code**, delete everything, paste the whole of `worker/worker.js`, click **Deploy**.
4. Go to the Worker's **Settings → Bindings → Add → Workers AI**. Variable name: `AI`. Save.
5. **Settings → Variables and Secrets → Add**: name `ALLOWED_ORIGIN`, value `https://<your-username>.github.io`. Save and deploy.
   (This stops other websites from spending your free allowance.)
6. Copy the Worker URL, e.g. `https://stylo-meter-ai.<you>.workers.dev`. Open `https://stylo-meter-ai.<you>.workers.dev/api/health`; you should see `{"ok":true,...}`.

Prefer the command line? `cd worker && npx wrangler deploy` does the same using `wrangler.toml`.

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

| Job | Model on Workers AI |
|---|---|
| What is in the photo (garments, colours, accessories, footwear) | Llama 4 Scout 17B, vision, JSON output. Falls back to Gemma 4 26B automatically |
| Score + stylist verdict + moves + mission + picks | Llama 4 Scout, grounded on its own catalogue of the photo |
| Try-on ("Render me with it") and restyle ("Let X restyle me") | FLUX.2 klein 4B, editing your photo with the RUMOAR product photo as a reference |

**Honesty rules enforced in the Worker:** the stylist may only mention items the AI catalogued; it never comments on face, body, skin or looks (sentences that do are stripped); the five pillar scores are fixed after the first verdict so every stylist gives the **same score** for the same photo; product picks are limited to the real RUMOAR catalogue; "after" scores for RUMOAR pieces are calculated, not invented.

**Free allowance:** Cloudflare gives 10,000 "neurons" a day, shared by every call, resetting at 05:30 IST. That is plenty for a private demo; image renders use the most. When it runs out the site shows a clear message. Usage is in the Cloudflare dashboard under Workers AI.

---

## The game

- **XP and 10 levels**, from Fresh Fit to RUMOAR Royalty. XP for verdicts (more for higher scores), meeting new stylists, AI try-ons and restyles, share cards, missions, streaks and the daily brief.
- **Stylist deck:** 6 stylists at level 1; the rest unlock at levels 2, 3 and 4 with a level-up celebration.
- **Daily brief:** a new occasion + stylist + target score every day, the same for everyone.
- **Missions:** every stylist sets a mission for your own wardrobe. Accept it, re-shoot, and beat your score with that stylist for +120 XP.
- **11 badges:** First Fit, Stylist Hopper, Try-On Taker, Shape Shifter, Glow-Up, Head Turner, Mission Complete, Brief Crusher, On a Roll, Full Deck, Posted It.
- Tap the level ring in the header for your profile, deck, missions and badges. Progress is saved in the browser.

## The stylists and their worlds

13 stylists, each with a colour takeover, card pattern, voice, loading lines, favourite RUMOAR pieces, sound, and four **artifacts** (draggable stickers that float around the page and trail the cursor).

| Stylist | Lane | Artifacts | Unlock |
|---|---|---|---|
| Zari Zinda | The Provocateur | safety pin, chain, scissors, tape | Lv 1 |
| Drama Didi | The Showstopper | mic, sparkle, spotlight, heart | Lv 1 |
| Glitch Kid | The Main Character | cursor, loading bar, comment bubble, sparkle | Lv 1 |
| Sleek Sona | The Sculpted Minimalist | ruler, mirror, drop, dumbbell | Lv 1 |
| Bandra Bhau | The Streetwear Scout | sneaker, local ticket, cap, spray can | Lv 1 |
| Nawab Sahab | Old Money, Older Soul | pocket watch, crest, teacup, diamond | Lv 2 |
| Seoul Sutra | Soft Boy Energy | photocard, heart, star, cloud | Lv 2 |
| Reel Rani | The Reel Queen | ring light, camera, heart, sparkle | Lv 2 |
| Desi Drip | The Chain Reaction | chain, diamond, boombox, crown | Lv 3 |
| Kurta Kavi | The Handloom Poet | chai, diya, quill, flower | Lv 3 |
| Vlog Veer | The Wanderer | passport, camera, globe, mountain | Lv 3 |
| Rockstar Raghu | Leather & Noise | guitar pick, bolt, amp, star | Lv 4 |
| Crush Kabir | The Internet Crush | rose, love letter, heart, shades | Lv 4 |

**Editing a stylist:** everything lives in `js/stylists.js`: `name`, `role`, `bio`, `voice` (how the AI talks), `lane`, `moves`, `favourites`, colours, pattern, `props`, `unlock`. To show a photo instead of the illustrated monogram, put an image in `assets/stylists/` and set `photo: 'assets/stylists/<file>.jpg'`.

## Files

```
index.html            The experience
css/app.css           All styles
js/config.js          ← your Worker URL goes here
js/main.js            Steps, verdict, AI studio, game UI
js/ai.js              Talks to the Worker
js/game.js            XP, levels, badges, brief, missions
js/stylists.js        The 13 stylists
js/props.js           The artifact sticker library (SVG)
js/scoring.js         Pillars and product score maths
js/faceblur.js        On-device face blur
js/catalog.js         RUMOAR products, occasions, vibes, samples
js/share.js           Share card
js/fx.js              Motion helpers
worker/worker.js      The AI server (Cloudflare Worker)
worker/wrangler.toml  For command-line deploys
worker/test-worker.mjs  Offline test: node worker/test-worker.mjs
wireframes.html       Flow and early wireframes
```
