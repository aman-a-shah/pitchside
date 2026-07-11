# Product

## Register

brand

(The homepage/library is a brand surface — the spectacle IS the product. The in-match HUD is product register: chrome that serves the 3D scene and must never compete with it.)

## Users

Sports fans and 3D/web-graphics enthusiasts arriving out of curiosity ("real matches rebuilt as living 3D worlds you can fly through"). They're on a desktop or laptop, likely in a dim room, in an exploratory mood — they want to be impressed within seconds and then dropped into a match. No accounts, no workflow: watch, scrub, fly.

## Product Purpose

PitchSide reconstructs real football matches — from their actual recorded event streams (StatsBomb Open Data; ~4,000 matches from 1958 World Cup finals to today) — as real-time 3D scenes you can pause, rewind, slow down, and fly through. The homepage's single job: convey the cinematic spirit of "stepping inside the game" and route the visitor into a match. The match view's job: broadcast-grade immersion with unobtrusive controls.

## Brand Personality

Cinematic, precise, quietly confident. "Broadcast meets PlayStation 5 system UI": the drama comes from the rendered worlds and motion, not from decorated chrome. Editorial typography (Geist), near-black surfaces, white CTAs.

## Anti-references

- Sports-betting / fantasy-app aesthetics: amber glows, neon gradients, aggressive badges.
- Generic SaaS landing pages: identical card grids, eyebrow-kicker scaffolding, hero-metric blocks.
- Game-launcher clutter: heavy panels, chrome competing with the scene.

## Design Principles

1. **The render is the hero.** Real captures/renders of the engine carry the page; UI frames them, never decorates over them.
2. **Broadcast restraint.** Chrome stays near-black/white, thin, and quiet; one accent at most, taken from the match theme.
3. **Motion with intent.** Scroll and hover reveal depth (scrubbing footage, parallax into the stadium) — no bounce, no ambient shimmer.
4. **Per-match identity.** Each fixture reskins the surface (theme.ts) — the system is the constant, the match is the color.
5. **Fast to the game.** Every scroll position offers a way into a match; nothing gates the CTA.

## Accessibility & Inclusion

- Keyboard-reachable CTAs and filters; visible focus states.
- `prefers-reduced-motion`: scroll-scrub and parallax degrade to static frames/crossfades.
- Text contrast ≥ 4.5:1 on all surfaces (white/near-white on near-black).
