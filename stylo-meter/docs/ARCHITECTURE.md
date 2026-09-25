# Architecture and the path to the MVP

## Today: static prototype (this repo)

Everything runs in the browser. No backend, no API keys, nothing uploaded.

```
Photo ─► fileToCanvas (≤1280px) ─► MediaPipe face detect ─► blurFaces ─► original discarded
                                                                  │
                                    worn accessories (declared) ──┤
                                                                  ▼
                        scoring.js: measure() ─► pillarsFrom() ─► result (cached by fingerprint)
                                                                  │
                         recommend() / withProduct() ◄────────────┘
                                                                  ▼
                                   Reveal · Finish · Occasion · Restyle · Share
```

State lives in memory (photos, scores) and `localStorage` (consents, vibe profile, taste profile, jury votes). Photos are never written to storage.

## The swap point

The UI only talks to four functions in `js/scoring.js`:

| Function | Today | MVP |
|---|---|---|
| `scoreLook(photo, profile)` | Palette heuristics | POST blurred image to `/api/score`; the server calls a Gemini Flash-class vision model with the rubric, then applies Jury calibration |
| `occasionScores(result, profile)` | Local re-scoring | Returned by `/api/score` for all occasions in one call |
| `withProduct(result, product, profile)` | Rule-based gain | `/api/finish`: rubric re-score of the rendered look |
| `recommend(result, profile, taste, n)` | Rule-based ranking | Marqo-FashionSigLIP catalogue embeddings + taste profile |

Keep the result shape (`pillars`, `total`, `jury`, `working`, `fix`, `measures`) and the screens need no changes.

## MVP backend (from the build plan)

- **Hosting:** Next.js on Vercel (installable PWA), Supabase for auth, database and storage, Cloudflare R2 for images.
- **Scoring:** Gemini 3.x Flash-class vision (2.5 models shut down 16 Oct 2026). Cache by image fingerprint so the same photo always returns the same score.
- **Bag try-on:** Nano Banana 2 image editing, generated only on tap, previewed at 0.5K, full resolution on save or share, login required.
- **Restyles:** FASHN VTON (Apache 2.0; replace its non-commercial human-parser weights) or the FASHN API.
- **Catalogue match:** Marqo-FashionSigLIP (Apache 2.0).
- **Pose and segmentation:** MediaPipe, SAM 2 (Apache 2.0).
- **Fairness:** score-parity audit across the 10-shade Monk Skin Tone scale before launch and quarterly.

## Cost controls to keep

Rating is free. Renders run only on tap, preview at low resolution and sit behind phone login. Cache aggressively. Target: about ₹10–15 AI cost per engaged user, or ₹250–400 per order at 4% conversion, against ₹1,792 contribution per order.

## Compliance checklist (DPDP)

- Separate consent for rating, model training, marketing. Already in the UI.
- Delete raw photos on a short default timer; delete anytime. Already in the UI (and nothing is stored today).
- 18+ gate. Already in the UI.
- Label every AI render. The share card and finish screen already label renders.
- Signed model releases for every Style Jury image.

## Metrics to instrument next

Upload → reveal completion · reveal → finish tap rate · finish → add-to-cart · share rate · "I already own one" rate · same-photo score variance (should be zero) · jury agreement · score parity across skin tones.
