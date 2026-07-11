# PitchSide

**Step inside the game.** PitchSide reconstructs sports matches in a beautiful, navigable 3D
world. Pick a match, fly the camera anywhere on the pitch, pause, rewind, watch in slow motion,
and pop open the real broadcast footage at your current moment.

Built with **Next.js + React Three Fiber + three.js**. Runs entirely in the browser with zero
external asset downloads — every environment, character, and material is generated procedurally.

![Football](docs/soccer.png)

## What it does

- **Multi-sport**: football, basketball, and tennis — one engine, three sports.
- **AI-reconstructed motion**: a synthesis engine manufactures a full, continuous match
  (formation shape, pressing, man-marking, ball-carrier decision-making, planned ball
  trajectories, tackles, goals, restarts) and bakes it into per-entity tracks + an event stream.
  This is the same `MatchIR` shape that real tracking data (Metrica / PFF / SportVU) would plug
  into.
- **Living 3D world**: procedural stadium bowls packed with an animated instanced crowd,
  wind-driven GPU grass, mow stripes and line markings drawn as shader SDFs, floodlit night
  lighting, reflective parquet, clay courts, and a cinematic post-processing stack.
- **Full playback control**: play / pause / scrub / variable speed / slow-motion / frame-step,
  with a timeline marked at every key moment.
- **Five camera modes**: broadcast rail, cinematic auto-director (cuts to goals), free orbit,
  first-person fly, and player-follow chase cam.
- **Live HUD**: time-aware scoreboard, event-driven commentary ticker, tactical minimap, and an
  approximate-sync YouTube footage panel.

## Running

```bash
npm install
npm run dev      # http://localhost:3000
# or
npm run build && npm start
```

## Controls (match view)

| Input | Action |
| --- | --- |
| `Space` | play / pause |
| `←` / `→` | seek ∓5s |
| `,` / `.` | step one frame |
| `1` `2` `3` `4` | broadcast / cinematic / orbit / fly camera |
| `F` | cycle player-follow |
| Fly mode | `W A S D` move · click to look · `Q`/`E` down/up · `Esc` release |
| Timeline | drag to scrub · click a marker to jump |

## Architecture

```
ingestion / synthesis  ──►  MatchIR (tracks + events + scoreboard)  ──►  R3F runtime
   (src/synth/*)                    (src/ir/*)                          (src/components/scene/*)
```

- **`src/synth/`** — the synthesis engines (`soccer`, `basketball`, `tennis`). Deterministic,
  seedable, producing a `MatchIR`.
- **`src/ir/`** — the universal Match IR schema + the track sampler (smooth interpolation at any
  clock time; what makes scrub / rewind / slow-mo trivial).
- **`src/catalog/`** — the curated match list shown in the gallery.
- **`src/state/`** — the playback clock (a non-reactive playhead read imperatively in the render
  loop so 60fps never triggers React re-renders) and the match context.
- **`src/components/scene/`** — the R3F scene graph: environment, field/court shaders, stadium,
  crowd, players, ball, cameras, and post-processing.
- **`src/components/hud/`** — scoreboard, timeline, controls, commentary, minimap, video panel.

The runtime is a pure function of `MatchIR × clock`: sampling the same tracks at a different
time is all that scrubbing, rewinding, and slow motion require.

## Notes

- Player figures are animated procedurally (no external rigs): the gait phase advances by
  distance travelled in *match time*, so footfalls track ground speed (no foot-sliding), freeze
  when paused, reverse on rewind, and slow in slow-motion — automatically.
- The synthesis engine stands in for real tracking data at demo scale; real datasets slot in
  behind the same `MatchIR` contract without touching the renderer.
