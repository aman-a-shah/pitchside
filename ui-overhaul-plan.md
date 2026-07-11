# PitchSide — UI Overhaul Plan

**Direction (locked with you):** *Broadcast Matchday* identity · gallery is a committed
neutral brand, each match view **reskins to that game's kit colors**.

---

## 0. Diagnosis — why it reads as "AI slop" today

The current build is competent but wearing the 2026 AI-generated uniform. Every one of
these is a documented tell, and they stack:

| Symptom | Where | Fix direction |
|---|---|---|
| Cool blue-black + one emerald "telemetry" accent everywhere | `globals.css` tokens | Warm stadium-night ink + team-color reskin |
| Aurora gradient blobs drifting in the bg | `page.module.css` `.aurora/.aurora2` | Delete. Renders carry the color. |
| Glassmorphism (`backdrop-filter: blur`) as the default panel | `hud.module.css .panel`, nav, chips | Matte broadcast panels; blur only for video PiP |
| **Match cards are fake colored gradient rectangles** (`clashGradient`) | `page.tsx` | **Real 3D render poster frames, full-bleed** |
| Gradient pill buttons w/ inset-white "gloss" | CTAs, filters, transport | Flat/solid broadcast controls |
| Film grain overlays, tilt-3D card wobble, sheen sweeps | cards, featured | Remove; replace with intentional motion |
| Pulsing "LIVE" dots as decoration | scoreboard, minimap, chips | Reserve pulse for the real running clock |
| Inter + Space Grotesk (both reflex-reject fonts) | `layout.tsx` | Athletic broadcast type system |

The irony: the engine renders **cinematic floodlit stadiums**, and the UI hides them behind
gradient boxes. The whole overhaul rests on one move — **let the real renders be the imagery,
and rebuild the chrome as restrained broadcast instrumentation.**

---

## 1. The design system (Phase 0 — foundation everything else builds on)

### Typography — athletic broadcast, on a real contrast axis
Replace Inter + Space Grotesk in `layout.tsx` with:
- **Marquee / scoreboard:** `Archivo Expanded` (700–900) — the matchday title-card face; tall,
  confident, tabular numerals for scores/clocks.
- **UI / body:** `Archivo` (400–600) — same superfamily, unifies the app.
- **Data / timecodes / coordinates:** `Martian Mono` (or `Geist Mono`) — an instrument mono for
  clock, drift, tracking coords, speeds. This is the "data becoming motion" voice.

All three are Google-hostable via `next/font/google` (zero network risk). Proposals — easy to
swap if a specific pick doesn't sit right once on screen.

### Color — neutral brand + per-match reskin
New token layer in `globals.css` (OKLCH), replacing the emerald-telemetry ramp:
- **`--ink` base:** deep **stadium-night** near-black, faintly warm (not cool #05070c) so
  renders pop and it doesn't read "dev tool".
- **Surfaces `--panel-1/2`:** matte, opaque steps up from ink — *no default blur*.
- **`--chalk`:** warm off-white primary ink; `--chalk-2/-dim` for the ramp (all contrast-checked
  ≥ 4.5:1 on ink).
- **Neutral brand signal:** one **floodlight** hot accent (sodium-amber / broadcast) for gallery
  CTAs and focus — used sparingly; the renders + type carry the energy.
- **Match reskin vars** (set on the match `.root` from `entry.teams[].color` + kit specs):
  `--home`, `--away`, `--accent-team` → drive scoreboard bars, timeline fill, active transport
  states, commentary ticks. Includes a **luminance contrast guard** so white kits
  (England, Germany) get an outline/chalk fallback instead of blowing out — fixes a real
  legibility bug in today's scoreboard `--kit` bar.

### Materials & motion
- **Matte over glass:** solid dark panels + a single hairline + a whisper of top-edge light.
  Broadcast graphics are opaque and crisp, not frosted.
- **Motion tokens:** ease-out-quart/expo only (no bounce/elastic). Purposeful, not decorative.
  Every animation gets a `prefers-reduced-motion` crossfade/instant fallback.
- **Semantic z-scale** kept (it's already good).

**Deliverables:** rewritten `globals.css`, new `layout.tsx` fonts, a small `theme` helper for
deriving reskin vars + contrast guard from a `CatalogEntry`.

---

## 2. Imagery pipeline (Phase 1 — the single biggest lever)

Generate **real render poster frames** for every catalog match with the existing headless
harness (`scratch/capture.mjs`, documented in project memory) and use them as full-bleed art.

- For each of the ~9 matches, shoot a hero frame at a cinematic camera + a good seek, tuned per
  sport/mood (night/dusk/day/indoor/clay). Reshoot on the known transient-white-first-frame quirk.
- Optimize to `public/thumbs/<id>.jpg` (+ optional 2nd angle for the featured hero).
- Add `poster` (and optional `posterWide`) to `CatalogEntry` in `catalog/index.ts`.
- These replace `clashGradient` on every card and the featured hero.

*Result:* the gallery goes from "9 colored gradients" to "9 cinematic stadium stills" — the
instant credibility jump.

---

## 3. Gallery + Hero — the landing page (Phase 2)

Rebuild `page.tsx` + `page.module.css` in the Broadcast Matchday language:

- **Nav:** flat, confident wordmark + live catalog stats; drop the glass mask + pulse gimmick.
- **Hero:** oversized condensed marquee (e.g. *"STEP INSIDE / THE GAME"* in Archivo Expanded),
  a featured match rendered **full-bleed with its own team-color accents** (a taste of the reskin
  system), broadcast CTA (`ENTER THE MATCH ▸`) + ghost secondary. Kill aurora/grain.
- **Match cards → "matchday fixtures":** real render full-bleed, **kit-color bars** for the two
  teams, big short-codes (`ARG vs FRA`), competition + venue/date in mono, sport tag, a
  "Reconstructed" provenance mark. Remove tilt/sheen/grain; hover = a restrained lift + render
  push-in + kit-color edge.
- **Filters:** broadcast segmented tabs (matte), not gradient pills.
- **Load choreography:** one orchestrated entrance (hero settle + staggered fixture reveal),
  reduced-motion safe. Deliberate, not "fade every section".
- Responsive: mobile hero reflows, fixtures single-column, tap targets ≥ 44px.

---

## 4. Match view chrome + reskin engine (Phase 3)

The shared frame every sport wears.
- **Reskin engine:** on `MatchView`/`.root`, set the `--home/--away/--accent-team` vars from the
  entry (with the contrast guard). One line at the top; the whole HUD themes itself.
- **Shared panel restyle** (`hud.module.css .panel`): matte broadcast surface replacing the glass
  recipe used by TopBar / Scoreboard / Minimap / controls.
- **TopBar:** broadcast slate — back control + match name + provenance, quieter and legible over
  bright day scenes (stronger scrim, not heavier blur).
- **Bottom dock:** cleaner gradient scrim + spacing.

## 5. Broadcast HUD components (Phase 4)

Redesign each overlay to a broadcast-graphics standard (`hud/*` + `hud.module.css`):
- **Scoreboard → matchday bug / lower-third:** team color bars + short codes + score in Archivo
  Expanded tabular numerals + a real running clock in mono. **Make it sport-aware** (verify
  `Scoreboard.tsx`): soccer = goals + clock; basketball = quarter + score + shot-clock feel;
  tennis = sets/games (not a single number). Contrast-guarded team bars.
- **Timeline → broadcast scrubber:** kit-color fill, event markers (goals/shots) as broadcast
  chapter ticks with hover chips, frame-step affordance, slo-mo range styling.
- **ControlBar → broadcast transport:** matte grouping, clearer transport cluster, speed incl.
  slo-mo (¼×), camera modes, follow, footage — flat states, team-color "active".
- **Commentary → caption ticker:** broadcast lower-third caption style, kit-color event ticks.
- **Minimap → tactical radar:** restyle frame + header to matte; keep the canvas.
- **VideoPanel → broadcast PiP:** the one place a subtle blur/elevated treatment is earned.
- **LoadingOverlay → matchday team-vs card:** home-vs-away crest bars, competition, a real
  progress read instead of a bare spinner.
- **HelpHint:** matte, quieter.

## 6. Per-sport art direction (Phase 5)

Make each sport feel distinct *within* the one system, driven by `mood` + kit colors:
- **Soccer:** floodlit night / dusk / day — team bars, chalk lines motif.
- **Basketball:** indoor arena — warmer parquet-tone panel tint, jumbotron-style score treatment,
  quarter/shot-clock scoreboard.
- **Tennis:** day/clay — warm court tones, sets/games scoreboard, serve/rally framing in commentary.
Verify against the 5 representative matches (see §7).

## 7. Motion, polish & verification (Phase 6)

- **Motion pass:** page-load choreography, staggered fixtures, transport micro-interactions,
  smooth reskin transition when entering a match, reduced-motion alternatives throughout.
- **A11y/contrast audit:** WCAG AA on chalk/ink and every team color over its surface; visible
  focus rings; hit areas; placeholder contrast.
- **Responsive audit:** gallery + HUD at mobile/tablet/desktop; heading copy tested at each
  breakpoint for overflow.
- **Screenshot QA** with `scratch/capture.mjs` across the five representative matches +
  a Puppeteer pass on the gallery:
  - `wc-final-arg-fra` (night) · `classic-bra-ger` (dusk) · `euro-final-eng-esp`
    (day + **white-kit contrast edge case**) · `nba-finals-g7` (indoor) · `slam-final-clay` (tennis/clay).
- `npm run typecheck` + `npm run lint` clean.
- Final **slop test:** no aurora, no default glass, no gradient text, no fake-image gradients,
  no reflex fonts — could a stranger still say "an AI made this"? Iterate until no.

---

## Execution order & why
0 → 1 → 2 → 3 → 4 → 5 → 6. Foundation and imagery first because the gallery and every HUD depend
on the tokens, fonts, and real renders. Each phase is independently demoable: after Phase 2 the
landing page alone is transformed; after Phase 4 the match view is broadcast-grade; Phase 5–6 make
it consistent and shippable.

## Files touched (primary)
- `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/page.module.css`
- `src/components/match/match.module.css`, `MatchView.tsx`, `LoadingOverlay.tsx`, `HelpHint.tsx`
- `src/components/hud/*` (`hud.module.css`, `Scoreboard`, `Timeline`, `ControlBar`, `Commentary`,
  `Minimap`, `VideoPanel`, `TopBar`, `Icons`)
- `src/catalog/index.ts` (+`poster` field), new `src/components/theme` reskin helper
- `public/thumbs/*` (generated render posters), capture tweaks in `scratch/`

## Explicitly NOT changing
The 3D scene/engine, synthesis, clock, and data pipeline are out of scope — this is a UI/chrome
overhaul. (The scene already looks great; we're finally letting it be seen.)
