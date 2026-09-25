# Stylo Meter by RUMOAR

**Rate the look. Never the man.**

The Stylo Meter is an add-on to [rumoar.com](https://shreyashm36240.wixsite.com/rumoarecom). It answers the ASK moment in the shopping journey (SEE → SAVE → SEARCH → **ASK** → BUY): *"Does this look good on me?"*

A man uploads photos of his outfit. The meter blurs his face on-device, scores the look on five honest pillars, and shows how a RUMOAR piece would finish it, with the score recalculated truthfully.

This repository is a standalone, static website. It runs entirely in the browser, needs no server, and deploys to GitHub Pages as-is.

- **App:** `index.html`
- **Wireframes:** `wireframes.html`
- **Architecture notes:** `docs/ARCHITECTURE.md`

---

## Put it on GitHub Pages (5 minutes)

1. Create a new repository on GitHub, e.g. `stylo-meter`. Public repos get Pages on the free plan.
2. Upload every file in this folder to the repository root (drag the folder contents into **Add file → Upload files**, or push with git):
   ```bash
   cd stylo-meter
   git init
   git add .
   git commit -m "Stylo Meter v0.1"
   git branch -M main
   git remote add origin https://github.com/<your-username>/stylo-meter.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
4. After a minute the site is live at `https://<your-username>.github.io/stylo-meter/`.

To test locally, serve the folder (ES modules don't load from `file://`):
```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Link it from the store

Add a button under **Buy Now** on each Wix product page that links to:

```
https://<your-username>.github.io/stylo-meter/?product=<product-slug>
```

The product is shown on the landing screen and pre-selected in *Complete the look*. Slugs match the store URLs without `the-`, e.g. `innuendo-slouch-shoulder-bag`. All 15 are listed in `js/catalog.js`. *Add to cart* opens the matching rumoar.com product page.

---

## The flow

| # | Screen | What happens |
|---|--------|--------------|
| 1 | Landing | What it is, how it works, three promises |
| 2 | Consent | 18+ and rating required; model training and marketing optional, off by default |
| 3 | Vibe | Up to two archetypes, one occasion, who he dresses for |
| 4 | Upload | 3–6 photos, camera guide, **on-device face blur**, tap-to-blur fallback, declare worn accessories |
| 5 | Profile | Name, city, what he carries, while the pipeline runs |
| 6 | Reveal | Meter, five pillars, predicted jury read, what's working, one fix |
| 7 | Complete the look | Three RUMOAR picks ranked by real score gain, before/after, honest recalculation, add to cart, "I already own one" |
| 8 | Occasion | The same look scored for every occasion |
| 9 | Restyle Me | Swipe looks built around a RUMOAR piece; trains a taste profile |
| 10 | Share | 1080×1920 glow-up card made on-device; Web Share or download |
| 11 | Style Jury | Women's side: A vs B votes, store credit every 20 votes |
| 12 | Privacy | Change consents, delete everything |

## What is real and what is demo

| Part | Status |
|------|--------|
| Face detection and blur | **Real.** MediaPipe Face Detector runs in the browser. Unblurred originals are discarded. Manual blur fallback if the model can't load or misses a face. |
| Photos stay on device | **Real.** Nothing is uploaded; blurred copies live in memory and vanish when the tab closes. |
| Scoring | **Demo engine.** Deterministic heuristics from palette, contrast and colour spread (face regions masked out), plus declared accessories. Same photo always gives the same score. Clearly labelled in the UI. |
| Recommendations and recalculation | **Real logic** on the demo scores: bag type vs occasion, colour vs outfit tone, taste profile. |
| Try-on render | **Placeholder.** The product is shown alongside his photo. Live renders (Nano Banana 2) come in the MVP, labelled as AI-generated. |
| Restyle looks | **Placeholder.** Uses RUMOAR campaign images; the MVP renders restyles on his own photo. |
| Style Jury | **Local only.** Votes are saved in the browser; the MVP sends them to a backend for calibration. |
| Share card | **Real.** PNG generated in the browser. |

## Project structure

```
index.html            App shell
wireframes.html       Low-fi wireframes, flow, pipeline, rubric
css/styles.css        All styles (mobile-first; desktop shows a phone frame + story panel)
js/app.js             Routing, state, every screen
js/scoring.js         Scoring engine (swap point for the AI API)
js/faceblur.js        On-device face detection and blur
js/catalog.js         RUMOAR products, archetypes, occasions, sample looks
js/share.js           Share card generator
assets/products/      Product images from rumoar.com
assets/looks/         Sample looks (faces pre-blurred)
docs/ARCHITECTURE.md  How to take this to the MVP
```

## Principles built in

- Scores the look only. Faces are blurred before scoring; the body is never rated.
- A real 20-point Finishing pillar. No artificial caps. An outfit without accessories honestly lands around 75–80.
- "I already own one" returns a styling tip, not a sale.
- Separate consents, 18+ only, delete anytime.
