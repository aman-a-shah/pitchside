# PitchSide

**A time machine for football.** PitchSide rebuilds real matches — every pass, shot, save and
goal from their actual recorded event streams — as living, navigable 3D worlds. From the 1958
World Cup final (no complete film of it survives; a 17-year-old Pelé scores twice) to the Hand
of God to Messi's 2022 final: pick a match, step inside it, pause it, rewind it, fly through it,
and watch it through the players' eyes.

Built with **Next.js + React Three Fiber + three.js** on **StatsBomb Open Data** (~4,000 real
matches). Runs in the browser; every environment, character and material is procedural.

![Football](docs/soccer.png)

## What it does

- **Real matches, real data**: the catalog is ~4,000 genuine matches. Each one is reconstructed
  from its full StatsBomb event stream (locations, timestamps, freeze-frames) into continuous
  3D motion — every goal happens where and when it really happened.
- **The time machine**: matches render on the film stock of their decade. Pre-1965 plays as
  silver newsreel (near-monochrome, heavy grain), the 60s–70s as faded 16mm, the 80s–90s as
  broadcast tape with scanlines and chroma fringing, modern matches in the full cinematic grade.
- **Ask the match (⌘K)**: natural-language time travel. Type *"the hand of god"*, *"Maradona's
  second goal through his eyes"*, *"minute 80 in director cam at 2×"* — the playback state
  becomes exactly that. Parsed locally (instant, offline); an optional Claude-backed route
  (`/api/ask`, needs `ANTHROPIC_API_KEY`) handles phrasing the local grammar can't.
- **Voiced commentary + procedural sound**: pre-baked play-by-play (hand-scripted for the famous
  moments, era-voiced — historic matches come through a vintage radio chain with crackle), cued
  off the match clock, over a fully procedural crowd: filtered-noise stadium bed, goal roars,
  referee whistles. No audio samples anywhere except the voice clips.
- **Director mode**: an auto-cutting TV production — anticipatory cuts to a net-cam before a
  shot arrives (the future event stream is known), celebration close-ups on the scorer, then an
  automatic slow-motion replay of every goal with depth-of-field before returning to live.
- **POV camera**: through a player's eyes at pitch level — follow a chosen player or let it ride
  possession automatically. The 3D world reads completely differently from inside it.
- **Full playback control**: play / pause / scrub / 0.25×–8× / frame-step, an event-marked
  timeline, live commentary feed, tactical minimap, match stats, and an approximate-sync
  YouTube footage panel for side-by-side reconstruction-vs-reality.

## Running

```bash
npm install
npm run fetch:data        # bake the StatsBomb match index (public/data)
npm run bake:commentary   # (optional, macOS) re-bake the voice tracks (public/audio)
npm run dev               # http://localhost:3000
```

## Controls (match view)

| Input | Action |
| --- | --- |
| `Space` | play / pause |
| `⌘K` / `Ctrl+K` | Ask the match — natural-language navigation |
| `←` / `→` | seek ∓5s |
| `,` / `.` | step one frame |
| `1` `2` `3` `4` `5` | broadcast / director / POV / orbit / fly camera |
| `F` | cycle player-follow |
| `M` | sound on / off |
| Fly mode | `W A S D` move · click to look · `Q`/`E` down/up · `Esc` release |
| Timeline | drag to scrub · click a marker to jump |

## Architecture

```
StatsBomb events ──► reconstruction ──► MatchIR (tracks + events + scoreboard) ──► R3F runtime
 (fetched live)      (src/data/*)             (src/ir/*)                     (src/components/scene/*)
```

- **`src/data/`** — StatsBomb access + the reconstructor: real event locations become ball and
  player tracks; shot freeze-frames pin up to 20 players to their true positions.
- **`src/ir/`** — the Match IR schema + track sampler (smooth interpolation at any clock time;
  what makes scrub / rewind / slow-mo trivial).
- **`src/lib/ask.ts`** — the natural-language grammar behind ⌘K; `src/app/api/ask` is the
  Claude fallback.
- **`src/lib/era.ts`** — date → film-stock era; the grade lives in `scene/PostFX.tsx`.
- **`src/audio/`** — the WebAudio engine (procedural crowd/whistles/radio chain) and the
  clock-cued AudioDirector; `scripts/generate-commentary.mjs` bakes the voice tracks.
- **`src/state/`** — the playback clock: a non-reactive playhead read imperatively in the render
  loop, so 60fps never triggers React re-renders.
- **`src/components/scene/`** — the R3F scene graph: environment, pitch, stadium, crowd,
  skinned athletes, ball, the camera rig (broadcast / director / POV / orbit / fly), PostFX.
- **`src/components/hud/`** — scoreboard, timeline, AskBar, controls, commentary feed, minimap,
  stats, video panel, director-replay badge.

The runtime is a pure function of `MatchIR × clock`: sampling the same tracks at a different
time is all that scrubbing, rewinding, replaying and slow motion require. That is also what
makes the director's time-travel replays and ⌘K seeks trivially safe.

## Demo-safety

Everything on the critical path is static or client-side: the match index, the baked audio and
the ⌘K grammar all work with no keys and no network beyond the (CORS-enabled, cacheable)
StatsBomb event files. The Claude route is a progressive enhancement that degrades silently.

## Data & attribution

Match data: [StatsBomb Open Data](https://github.com/statsbomb/open-data) — free for
non-commercial use with attribution. Kickoff times in the source index are approximate for
historic fixtures; presentation (daylight for the newsreel era) follows the era, not the
listed hour.
