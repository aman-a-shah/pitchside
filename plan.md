# PitchSide — Build Plan

> Reconstruct real sports games in a beautiful, navigable 3D world. Pick a game from any
> sport → we ingest real-world data → render the match as rigged players on a gorgeous,
> living pitch/court → fly a first-person camera anywhere, pause, rewind, slo-mo, and pop
> open the real broadcast video at your current moment.

---

## 0. Context

This is a **greenfield repo** (empty except for `.git`) targeting a highly competitive
hackathon where the bar is a genuine "WOW". The differentiator is twofold and both halves
must land: (1) the 3D world must look like a **AAA game**, not "AI slop" grey-box shapes —
flowing grass, floodlit stadiums, living crowds, reflective parquet; and (2) the games must
be **real**, driven by real-world data, across **multiple sports**, with an AI pipeline that
lets us claim "load almost any game".

Locked decisions (from planning Q&A):
- **All sports get max polish** — soccer, basketball, American football, tennis are all
  demoed and all must look jaw-dropping. No "hero + throwaway".
- **Data = hybrid.** Tier 1: real continuous tracking (renders perfectly). Tier 2: an
  LLM + physics pipeline that **synthesizes plausible motion from abundant event data**, so
  the catalog feels huge ("load almost any match").
- **Video = approximate YouTube sync.** Real-team games embed a YouTube full-match/highlight
  and seek to ~the current game-clock moment. Seconds of drift is acceptable.
- **Runway = 1–2 weeks+.** Full hybrid vision, multi-sport, deep polish.

The hard architectural truth that shapes everything below: **free continuous player-tracking
data exists for only a few dozen games** (Metrica 25fps ×3, SkillCorner ×10, PFF WC2022 ×64,
NBA SportVU 2015-16, NFL Big Data Bowl). Everything else is **discrete event data** (one
location per pass/shot). And **frame-synced broadcast video is not distributed** for any of
these datasets. The design turns both constraints into features: a synthesis engine that
manufactures motion, and an *approximate* clock→YouTube bridge.

---

## 1. Vision & the demo narrative (what the judges see in 3 minutes)

The plan is built backward from this exact on-stage sequence. Every phase in §12 exists to
make one beat of this real.

1. **Cold open — the gallery.** A cinematic grid of games across four sports, each card a
   live-rendered rotating 3D thumbnail. Judge picks *2022 World Cup Final: Argentina vs France*.
2. **The reveal.** Camera swoops from the sky into a **floodlit night stadium** — grass
   rippling in wind, mow-stripes, 40k-strong crowd shimmering, ad boards glowing, real kits.
   A half-second of held breath. This is the WOW.
3. **It's a real game.** Scoreboard reads 2–2, 108'. Messi and Mbappé (real positions from
   PFF tracking) are on the pitch. Press play — the game *moves*, players run with weight,
   feet plant, the ball arcs.
4. **Free navigation.** Judge grabs the camera, drops to **pitch level behind the goal**,
   first-person, as a shot comes in. Then a **cinematic broadcast angle**. Then locks to a
   single player and follows him.
5. **Time control.** Scrub back 20 seconds. Hit **slo-mo (0.15×)** on the goal — depth of
   field racks onto the ball, motion blur trails, the net ripples.
6. **The kicker.** Click **"Watch real footage"** — a panel slides in with the actual YouTube
   clip seeked to ~this moment. Reconstruction and reality, side by side.
7. **Breadth.** Back to gallery → pick an **NBA game** → same engine, now a **reflective
   parquet arena**, indoor lighting, ball bouncing with real height. Then a **tennis point**
   on clay. "One engine. Every sport. Any game."
8. **The flex.** Type a match we have *no tracking for* into search → the **AI synthesis
   pipeline** reconstructs it live from event data. "We didn't have this game's tracking —
   we generated it."

---

## 2. Product scope

### Sports (all first-class)

| Sport | Real tracking source | Fidelity | Visual signature |
|---|---|---|---|
| **Soccer** | Metrica (25fps, 3 games), PFF WC2022 (64 **real** games), SkillCorner (10) | Continuous 2D + synth ball height | Grass + wind, floodlit bowl, 40k crowd, mow stripes, real kits |
| **Basketball** | NBA SportVU 2015-16 (25Hz, full season, **ball z-height**) | Continuous 3D-ish (ball height real) | Reflective parquet, indoor rig, jumbotron glow, tight arena |
| **Am. Football** | NFL Big Data Bowl (10Hz, all 22 + ball) | Continuous 2D | Yard lines, turf, end zones, stadium, chain gang |
| **Tennis** | Sackmann point data (event only) → **synthesis** | Synthesized (tractable: 2 players + 1 ball) | Clay/grass/hard court, low sun, intimate stands, ball trail |

Every sport also supports **Tier-2 synthesis** from event data so the catalog isn't limited
to the tracked games.

### Core features
- Game gallery with live 3D thumbnails, filters by sport/competition/team.
- Full 3D reconstruction with rigged, animated players + physically-moving ball.
- **Camera modes:** free-fly FPS, orbit, broadcast rail, player-lock, cinematic auto-director.
- **Timeline:** play / pause / seek / scrub / variable speed (0.1×–4×) / frame-step / rewind.
- **Slo-mo replay** with DoF + motion blur hero treatment.
- **YouTube approx-sync** panel for real-team games.
- **Live commentary** + event ticker (LLM-generated from the event stream).
- Minimap / tactical top-down overlay; scoreboard HUD.

### Explicitly out of scope (say so, protect the demo)
- Frame-perfect video alignment (approximate only).
- Real-time CV pose extraction from arbitrary video (research-grade; not attempted — we use
  released datasets + synthesis).
- Multiplayer / accounts / persistence beyond a local catalog.

---

## 3. System architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  INGESTION (offline, Python)          "extract data from the internet"         │
│                                                                                │
│  Real tracking ─┐                                                              │
│  (Metrica/PFF/  │   kloppy normalize ──►  ┌───────────────────┐                │
│   SportVU/NFL)  │                          │   MATCH IR (JSON) │                │
│                 │                          │  entities, tracks,│                │
│  Event data ────┤   kloppy + parsers ──►   │  events, meta,    │  ──► /catalog  │
│  (StatsBomb/    │                          │  kits, venue,     │      (static   │
│   nba_api/      │   ┌──────────────────┐   │  clock↔video map  │       glb+json)│
│   Sackmann)     └──►│ TIER-2 SYNTHESIS │──►└───────────────────┘                │
│                     │ event→continuous │                                        │
│                     │ tracks (LLM +    │   LLM: normalize, tag anim intents,    │
│                     │ physics + roles) │        commentary, kit/formation infer │
│                     └──────────────────┘                                        │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │  (static assets: IR json, GLB, KTX2, HDRI)
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  RUNTIME (browser, Next.js + React Three Fiber)                                │
│                                                                                │
│   Match IR ──► PLAYBACK CLOCK (master time) ──► SCENE GRAPH                     │
│                    │                              ├─ Environment (HDRI, CSM sun)│
│                    │  play/pause/seek/speed       ├─ Pitch/Court (grass/parquet)│
│                    ▼                              ├─ Stadium bowl + crowd (inst) │
│   MOTION SYSTEM  ◄─┘                              ├─ 22 players (skinned, IK)    │
│    ├─ track sampler (interp @ clock t)            ├─ Ball (physics-driven)       │
│    ├─ locomotion blend tree (by velocity)        └─ Post FX (N8AO/Bloom/DoF/ACES)│
│    ├─ action layer (event→clip)                                                 │
│    └─ two-bone foot IK                     CAMERA RIG ──► HUD / Timeline / Video │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Key idea:** ingestion is fully offline and produces a **static catalog** (JSON + GLB +
compressed textures). The runtime is a pure, deterministic function of `Match IR × clock`.
This makes the demo bulletproof — no live API dependency on stage — and makes scrubbing/rewind
trivial (just re-sample the tracks at a different `t`).

---

## 4. Monorepo structure & tech stack

```
pitchside/
├─ apps/
│  └─ web/                     # Next.js 15 (App Router) + React 19 + R3F v9
│     ├─ app/                  # routes: / (gallery), /match/[id]
│     ├─ src/
│     │  ├─ scene/             # R3F scene graph
│     │  │  ├─ Stadium/        # bowl, seats (InstancedMesh2), stands
│     │  │  ├─ Field/          # GrassField, PitchLines, Parquet, NFLField, TennisCourt
│     │  │  ├─ Crowd/          # VAT/instanced crowd + billboards
│     │  │  ├─ Players/        # SkinnedPlayer, PlayerManager, kit atlas
│     │  │  ├─ Ball/           # ball mesh + trail + physics binding
│     │  │  ├─ Environment/    # HDRI, CSM sun, floodlights, sky
│     │  │  └─ PostFX.tsx      # EffectComposer stack
│     │  ├─ motion/            # blend tree, foot IK, action FSM, ball solver
│     │  ├─ playback/          # Clock, useClock, timeline store (zustand)
│     │  ├─ camera/            # FlyControls FPS, broadcast rail, player-lock, director
│     │  ├─ ir/                # Match IR TS types + sampler (interp tracks @ t)
│     │  ├─ ui/                # HUD, Timeline scrubber, Gallery, VideoPanel, Commentary
│     │  └─ perf/              # PerformanceMonitor, AdaptiveDpr wiring, LOD helpers
│     └─ public/catalog/       # generated: <matchId>/ir.json, thumbs, kit atlases
├─ packages/
│  ├─ ir-schema/               # shared Match IR schema (TS types + zod + JSON Schema)
│  └─ assets/                  # shared GLB players, animation clips, HDRIs, KTX2 textures
├─ ingestion/                  # Python (uv/poetry)
│  ├─ sources/                 # statsbomb.py, metrica.py, pff.py, sportvu.py, bigdatabowl.py, tennis.py
│  ├─ normalize/               # kloppy adapters → Match IR
│  ├─ synth/                   # tier-2: trajectory synthesizer (physics + roles)
│  ├─ llm/                     # normalize/enrich/commentary/anim-intent tagging
│  ├─ videomap/                # clock ↔ youtube timestamp anchors
│  └─ build_catalog.py         # writes apps/web/public/catalog/*
└─ tools/                      # gltf-transform, mixamo→glb, ktx2 batch, VAT baker
```

**Runtime stack:** Next.js 15 · React 19 · **React Three Fiber v9** · **@react-three/drei** ·
**@react-three/postprocessing** (N8AO, Bloom, DoF, ToneMapping) · **three** (core CSM addon) ·
**@three.ez/instanced-mesh** (InstancedMesh2 — crowd + seats, skinning + LOD) ·
**MeshReflectorMaterial** (drei, court reflections) · **zustand** (clock/UI state) ·
YouTube IFrame API · Draco/meshopt + **KTX2/Basis** compressed assets.

**Ingestion stack:** Python · **kloppy** (normalize event+tracking from StatsBomb/Metrica/
Tracab/SecondSpectrum/SkillCorner/PFF/Sportec into one schema) · statsbombpy · nba_api ·
pandas/polars · numpy/scipy (trajectory solvers) · Anthropic API (Claude, enrichment/commentary).

**Asset tooling:** Mixamo (rig + animation clips) · Blender (FBX→GLB, VAT bake) ·
`gltf-transform` / `gltfjsx` · Poly Haven (HDRIs, textures) · ambientCG (PBR materials) ·
Quaternius/Kenney (CC0 props, crowd bodies).

---

## 5. Data layer

### 5.1 Sources (concrete, verified)

| Source | URL | Type | Rate | z? | Use |
|---|---|---|---|---|---|
| Metrica sample-data | github.com/metrica-sports/sample-data | tracking+events | 25fps | no | Soccer Tier-1 (3 games) |
| PFF FC WC2022 | blog.fc.pff.com (free signup) | tracking+events, **real teams** | ~30fps | no | Soccer Tier-1 + **YouTube sync** (64 real games) |
| SkillCorner opendata | github.com/SkillCorner/opendata | broadcast tracking | 10fps | no | Soccer Tier-1 (sparse, 10) |
| StatsBomb open-data | github.com/statsbomb/open-data | events + **360 freeze-frames** | per-event | no | Soccer Tier-2 synth (huge catalog); 360 = real position anchors |
| NBA SportVU 2015-16 | github.com/linouk23/NBA-Player-Movements, HF: dcayton/nba_tracking_data_15_16 | tracking | 25Hz | **ball z** | Basketball Tier-1 (full season) |
| nba_api | github.com/swar/nba_api | events/shots | per-event | no | Basketball Tier-2 + commentary/metadata |
| NFL Big Data Bowl | kaggle.com/c/nfl-big-data-bowl-2025 | tracking (22+ball) | 10Hz | no | NFL Tier-1 |
| Sackmann tennis | github.com/JeffSackmann/tennis_slam_pointbypoint | point events | per-point | no | Tennis Tier-2 synth |

`kloppy` is the ingestion core — it already ingests StatsBomb/Opta/Wyscout (event) and
Metrica/Tracab/SecondSpectrum/SkillCorner/PFF/Sportec (tracking) into one schema. We adapt
its output into our Match IR (kloppy doesn't cover NBA/NFL/tennis — custom parsers for those).

> **Licensing note (do before shipping beyond hackathon):** StatsBomb (registration +
> attribution + logo), SkillCorner (unclear), NBA SportVU (leaked/grey — fine for a hackathon,
> don't productize), NFL BDB (Kaggle non-commercial). For a hackathon demo all are usable with
> attribution; put a credits panel in the UI.

### 5.2 Match IR — the universal schema

One schema for every sport. Runtime never knows what sport it is beyond a `sport` tag + a
`fieldSpec`. Defined in `packages/ir-schema`.

```jsonc
{
  "id": "wc2022-final",
  "sport": "soccer",                       // soccer | basketball | nfl | tennis
  "fidelity": "tracking" | "synth",        // provenance badge in UI
  "meta": {
    "title": "Argentina 3–3 France (pens) — WC 2022 Final",
    "date": "2022-12-18", "venue": "Lusail Stadium",
    "teams": [{ "id":"ARG","name":"Argentina","kit":{...},"formation":"4-3-3" }, ...],
    "score": {...}, "attribution": "PFF FC / StatsBomb",
    "videos": [{ "provider":"youtube","id":"abcd","clockAnchors":[[t_game,t_video],...] }]
  },
  "fieldSpec": { "type":"soccer","length":105,"width":68 },  // meters; drives geometry+coords
  "duration": 5760.0,                       // seconds of match clock
  "entities": [
    { "id":"p10","role":"player","team":"ARG","name":"Messi","number":10,
      "kit":"home","skin":"male_athletic_02" },
    { "id":"ball","role":"ball" }, ...
  ],
  "tracks": {                               // sparse keyframes; runtime interpolates
    "p10": { "t":[0,0.04,...], "x":[..], "y":[..], "z":[..],
             "speed":[..], "heading":[..], "action":["idle","run",...] },
    "ball": { "t":[..], "x":[..], "y":[..], "z":[..] }
  },
  "events": [                               // discrete; drive commentary + action layer + camera cuts
    { "t":6360.2,"type":"goal","actor":"p10","team":"ARG","location":[..],
      "animIntent":"shot_finish","importance":0.98,"text":"Messi scores!" }, ...
  ]
}
```

Coordinate convention: meters, origin at field center, +x toward one goal, +z up. All source
coordinate systems are converted here so the renderer is sport-agnostic. Tracks are stored
**sparse + interpolated at runtime** so scrubbing to any `t` is O(log n) per entity.

### 5.3 Ingestion pipeline (Tier 1 — real tracking)

`ingestion/build_catalog.py`:
1. Fetch source (git submodule / API / cached download).
2. `kloppy.load_*` → normalized dataframes (positions + events).
3. Map to Match IR: convert coordinates, resample to a common 25fps grid, compute per-frame
   `speed` + `heading` (finite differences, smoothed), classify a coarse `action` per frame
   from speed thresholds (idle/walk/jog/run/sprint) + event overlaps (kick/tackle/jump).
4. **Ball height reconstruction** for 2D sources: soccer/NFL ship no ball z — infer it. For a
   pass/shot event with known start/end/time, fit a projectile arc; between, keep on ground.
   Basketball SportVU already has real z (use directly). This is a small physics solver in
   `synth/ball.py`, reused by both tiers.
5. LLM enrichment pass (§5.5) → commentary text, animIntent tags, kit/formation inference.
6. Write `public/catalog/<id>/ir.json` + generate a rotating **thumbnail** (headless render).

### 5.4 Tier-2 AI trajectory synthesis — *the technical crown jewel*

**Problem:** event data gives one `(x,y,t)` per action and nothing in between. We manufacture
continuous, believable motion for all 22 players + ball. This is what lets us claim "any game".

**Ball:** physics-first. Each event pair (pass A→B, shot→goal, carry) has known endpoints and
elapsed time ⇒ solve a projectile/rolling trajectory (`synth/ball.py`). Ground passes = damped
roll; lofted passes/shots = parabola with gravity; dribble/carry = ball glued ahead of carrier.

**On-ball player:** must be at the event location at the event time. Between its own events,
move along a **minimum-jerk** spline through those anchor points, capped at sport-realistic max
speed (soccer sprint ≈ 9 m/s). Where **StatsBomb 360 freeze-frames** exist (Euro 2020, WC2022),
use them as *real* multi-player position anchors — synthesis then interpolates between genuine
snapshots, dramatically raising quality.

**Off-ball players (the hard 20):** a role-based positioning model.
- Start from the team's **formation template** (LLM-inferred, e.g. 4-3-3) → base slot positions.
- Each player's target = `formation_slot(ball_x)` shifted by the team's collective **line**
  (defensive line tracks ball x; team compresses/expands with possession).
- Add **boids-style** spacing: repulsion from teammates (maintain shape), mild attraction to
  ball for nearby roles, offside-line constraint for defenders.
- Integrate targets over time with velocity/accel caps → smooth, plausible tracks.
- Optional **learned upgrade (stretch):** train a small transformer/VAE on Metrica+PFF real
  tracking to predict off-ball movement given events; swap it in behind the same interface.

**Validation:** run the synthesizer on a Metrica game where we *have* ground truth, measure
positional error, tune. Great for a "how accurate is it" slide.

**Interface:** synthesis emits the exact same `tracks` block as Tier-1, so the runtime is
identical. `fidelity: "synth"` shows a subtle "AI-reconstructed" badge — honesty as a feature.

### 5.5 LLM roles (Claude via Anthropic API — see `claude-api` skill for model/pricing)

- **Normalize:** map heterogeneous/messy source fields into Match IR; infer missing metadata
  (lineups, kit colors, formations, venue) from event context or short web lookups.
- **Tag animation intents:** classify each event → a clip label (`pass`,`shot_finish`,`tackle`,
  `header`,`save`,`celebration`,`dunk`,`jumpshot`,`serve`,`forehand`…).
- **Commentary:** generate a play-by-play line per key event + a color-commentary stream; feeds
  the live ticker and optional TTS.
- **Camera director (stretch):** choose cinematic cuts around high-importance events.
All LLM work is **offline at ingestion** → cached in the catalog → zero latency & zero API
risk during the demo.

---

## 6. Motion & animation system

### 6.1 Character pipeline
- Base characters: Mixamo auto-rigged humanoids (or Quaternius CC0 bodies as fallback given
  Mixamo's uncertain maintenance). **One shared `mixamorig` skeleton** across all players.
- Download the character **with skin** once, then a library of animation clips onto the *same*
  skeleton (so **no retargeting needed** — reuse `AnimationClip` objects across all mixers).
- Spawn 22 players via `SkeletonUtils.clone()` (correct skinned clone: shares geometry/material,
  independent bones). Each gets its own `AnimationMixer`.
- **Team kits** via a texture atlas + per-instance UV/color so kit swaps don't break batching.
- Clip library (per sport): idle, walk, jog, run, sprint, turn L/R, kick/pass, shot, header,
  tackle, slide, jump, fall, celebrate; basketball: dribble, jumpshot, dunk, layup, defense;
  tennis: ready, forehand, backhand, serve, volley; NFL: 3-point stance, run, throw, catch,
  tackle.

### 6.2 Locomotion blend tree (`motion/blendTree.ts`)
Drive by the per-frame `speed` from the track sampler: pick the two neighbouring locomotion
clips (e.g. jog+run), weight by linear interpolation, sync `timeScale` so foot phases align
(kills sliding). Heading change feeds additive turn lean. Built on `AnimationMixer` + additive
blending (`AnimationUtils.makeClipAdditive`).

### 6.3 Foot IK / anti-sliding (`motion/footIK.ts`)
Closed-form **two-bone analytic IK** (hip→knee→ankle, law of cosines, ~40 lines) — no fragile
external IK lib. Raycast the ground under each foot to plant/level it. Cure root sliding with
**root-motion matching**: move the character root at the track's actual speed, use IK only to
pin feet. This single feature is the difference between "believable athletes" and "floating
mannequins" — prioritize it.

### 6.4 Action layer + event→animation FSM (`motion/actionFSM.ts`)
A small per-player state machine layers **one-shot actions** (kick, tackle, shot, celebrate)
on top of the locomotion base via crossfade, triggered when the clock crosses an event whose
`actor` is this player (using the `animIntent` tag). Actions blend out back to locomotion.

### 6.5 Ball (`motion/ball.ts` + `scene/Ball`)
Ball position comes straight from the `ball` track (already solved in ingestion). Runtime adds:
spin/roll visual, a **velocity-scaled trail** (fades in slo-mo for drama), net-ripple on goals,
rim/backboard interaction cosmetics for basketball, bounce squash for tennis.

---

## 7. Rendering & art direction — the beauty (anti-slop)

### 7.1 Renderer setup (`scene/Environment`)
- R3F `<Canvas>` with **ACES Filmic tone mapping**, sRGB output, `dpr={[1,2]}`,
  `frameloop="demand"` (critical — a replay app pauses/scrubs constantly; don't burn frames).
- **HDRI image-based lighting** via drei `<Environment>` (Poly Haven stadium-sky / indoor-arena
  HDRIs), with ground projection so the world feels grounded.
- **Sun/key light with CSM** (three core `csm/CSM.js`, integrated via a small R3F wrapper —
  no reliable drei `<CSM>` exists) for crisp shadows across a huge outdoor bowl. Indoor sports
  use an array of `Lightformer` rects (arena lights) inside the Environment for authored
  reflections + a jumbotron emissive.

### 7.2 Post-processing (`scene/PostFX.tsx`) — single `<EffectComposer>`, order matters
1. **N8AO** (ambient occlusion, temporally stable, run at reduced res)
2. **Bloom** (selective; push floodlights/jumbotron/sun-glints emissive > 1.0 so *only* they glow)
3. **DepthOfField** (enabled only during slo-mo/replay hero moments — racks focus onto ball/player)
4. **Vignette** + subtle **ChromaticAberration**/**Noise** (filmic)
5. **SMAA** (or TAA if we wire velocity/jitter — cleaner grass/crowd edges)
6. **ToneMapping (ACES) — must be last**
Stretch realism: `realism-effects` (SSGI/TRAA/motion-blur) for slo-mo shots.

### 7.3 Environments per sport (`scene/Field/*`)
- **Soccer pitch:** GPU-instanced grass (below) + textured ground for distance; **mow stripes**
  = modulate albedo/roughness by `sin(worldZ·f)` and tint grass tips per band; **line markings**
  as an SDF/decal overlay (crisp at any zoom); worn-turf noise near goalmouths. ambientCG turf
  PBR for the base.
- **Basketball court:** ambientCG/Poly Haven wood-floor PBR + drei **`MeshReflectorMaterial`**
  (planar reflection — cheaper & cleaner than SSR for a flat floor) for the wet-look parquet;
  painted lines as overlay; glass backboard with fresnel; jumbotron.
- **NFL field:** turf shader with yard lines/numbers/hash marks (SDF overlay), end-zone paint,
  team logo at midfield, chain markers.
- **Tennis court:** clay/grass/hard variants (swap PBR + color), painted lines, net with cloth
  normal, low warm sun (long shadows), intimate stands.

### 7.4 Grass, crowd, stadium bowl
- **Grass (`Field/GrassField`):** one `InstancedMesh` of a 3–7-vert blade; per-instance
  offset/rot/scale/tint; **wind entirely in the vertex shader** from `time` + world-position
  noise (stable under camera motion); chunked so off-screen chunks frustum-cull. Reference
  approaches: Codrops "Fluffiest Grass" (2025), al-ro grass. Scales to ~1M blades near the hero
  region; flat textured plane beyond N meters.
- **Crowd (`Crowd/*`):** **InstancedMesh2** (`@three.ez/instanced-mesh`) with per-instance
  culling + **LOD** + **shadow-LOD** + skinning for near rows; **VAT** (vertex-animation-texture
  baked in Blender) or animated **billboards/impostors** for far rows. Mostly subtle idle sway +
  scripted "wave"/goal-celebration triggered by events. 40k+ figures, few draw calls, no shadows.
- **Stadium bowl (`Stadium/*`):** lofted seating-tier profile (rake angle + row depth) around
  the field rectangle with rounded corners; seats scattered as InstancedMesh2 across the raked
  surface; crowd figures placed on the same seat transforms. Roof/floodlight trusses as merged
  static meshes. (No mature open stadium generator exists — we build the loft; optionally author
  one bowl per sport in Blender and export GLB.)

### 7.5 Anti-"AI slop" art-direction rules (a hard checklist — this wins or loses the hackathon)
- **Never** ship default `MeshStandardMaterial` grey. Every surface has an albedo+normal+
  roughness PBR set (Poly Haven / ambientCG, all CC0).
- **One coherent art direction per sport** — commit to a time-of-day and mood (e.g. soccer =
  floodlit night; tennis = golden-hour) and light everything to it.
- **Real reference:** model each stadium's proportions from photos of the actual venue.
- **HDRI lighting always** — never a bare hemisphere light. Shadows on. Contact/AO everywhere.
- **Post-processing is not optional** — the ACES+bloom+AO+vignette stack is 60% of the "AAA"
  feel; wire it in early (Phase 3), not at the end.
- **Motion sells realism** more than polycount — foot IK, weight, ball trails, crowd reactivity.
- **Depth cues:** subtle fog/haze, DoF on replays, god-rays from floodlights through haze.
- Kit/branding fidelity: real team colors, numbers, ad boards — small touches read as "real".

---

## 8. Playback, cameras, timeline

### 8.1 Clock engine (`playback/clock.ts`, zustand store)
Single source of truth: `t` (match seconds), `playing`, `speed` (0.1–4×, negative = rewind),
`bounds`. A rAF loop advances `t += dt·speed` while playing. Everything (track sampler, action
FSM, ball, commentary, video) reads `t`. Because tracks are sparse+interpolated, **seek/scrub/
rewind is just setting `t`** — no rewinding of state needed. When paused/scrubbing,
`frameloop="demand"` still renders on `t` change.

### 8.2 Timeline UI (`ui/Timeline`)
Scrubber with an **event density track** (goals/shots/key moments as markers — click to jump),
speed control, frame-step (±1 frame at 25fps), slo-mo presets, loop-a-segment for replays.

### 8.3 Cameras (`camera/*`)
- **Free-fly FPS:** pointer-lock + WASD/mouse (drei `PointerLockControls`/`FlyControls`),
  smoothed, with collision floor so you can't fall through the pitch.
- **Orbit:** drei `CameraControls` (damped) around a focus point.
- **Broadcast rail:** constrained dolly along the touchline at broadcast height, auto-tracking
  the ball — the "TV" look.
- **Player-lock:** follow a selected entity (chase cam / over-the-shoulder).
- **Cinematic director (stretch):** LLM/event-driven auto-cuts around high-importance events;
  `CameraControls` smooth "fly to" transitions between shots.
Smooth transitions between all modes (no hard cuts) via damped interpolation.

---

## 9. Video sync (approximate, YouTube)

`ui/VideoPanel` + YouTube IFrame API. For real-team games, the IR carries
`meta.videos[].clockAnchors` = a few hand-set `(matchClock, videoSeconds)` pairs (e.g. kickoff,
2nd-half start, a known goal). Runtime linearly interpolates current `t` → video seconds and
`player.seekTo(...)`. "Watch real footage" slides in a picture-in-picture panel seeked to ~now;
optional two-way: scrubbing the 3D timeline re-seeks the video. Drift is seconds — framed as
"reconstruction vs reality", which is compelling, not a bug. Anchors are authored per hero game
(WC2022 finals, famous NBA games) in `ingestion/videomap/`.

---

## 10. Frontend / app

- **Gallery (`/`):** grid of game cards, each a live rotating 3D thumbnail (pre-rendered
  turntable video or a cheap live mini-scene); filters by sport/competition/team; a search box
  that, for untracked games, kicks the **Tier-2 synthesis** ("reconstruct this game").
- **Match view (`/match/[id]`):** the 3D canvas + HUD (scoreboard, clock, event ticker,
  commentary), timeline, camera-mode switcher, minimap/tactical top-down overlay, video toggle,
  fidelity badge + credits.
- **Loading choreography:** a beautiful branded loader while GLB/KTX2 stream in (Draco/meshopt +
  KTX2 keep it fast); `<Preload>` + suspense.

---

## 11. Performance budget & tactics

Target **60fps** with 22 skinned players + ~40k crowd + grass. Draw calls **< ~150**.
- **Crowd/seats:** InstancedMesh2 (culling + LOD + shadow-LOD) or VAT; billboards far; no shadows.
- **Static geometry:** merge / `BatchedMesh`; single kit atlas so players batch.
- **Players (22):** individual skinned clones + mixers is fine at this count (reserve instanced
  skinning/VAT for crowd only).
- **Grass:** chunked instancing, vertex-shader wind (zero per-frame JS), LOD to flat plane.
- **Shadows:** one CSM sun; modest per-cascade resolution; crowd/grass don't cast.
- **Assets:** Draco/meshopt geometry, **KTX2/Basis** textures (small VRAM), `gltf-transform` pipeline.
- **Loop:** `frameloop="demand"`, drei `<PerformanceMonitor>` + `<AdaptiveDpr>` + `<AdaptiveEvents>`;
  cap dpr; run AO/post at reduced res; DoF only during replays.
- **Golden rule:** post-processing at full 4K DPR is the usual silent 60→30 killer — cap it.

---

## 12. Build phases (1–2 weeks, sequenced for demo-safety)

Each phase ends with something **demoable**. Vertical slice first, breadth later.

**Phase 0 — Scaffolding (½ day).** Monorepo, Next.js+R3F+drei shell, empty scene with HDRI +
CSM sun + ACES tone mapping, `frameloop="demand"`, deploy target. *Demo: a lit empty stadium sky.*

**Phase 1 — Data spine (1–1.5 days).** `packages/ir-schema` (types+zod). Ingest **one Metrica
soccer game** via kloppy → `ir.json`. Runtime track sampler + a debug scene of **colored spheres
moving as real players**. *Demo: a real game playing back as dots — proves the whole data→motion
pipeline end to end.* (This is the make-or-break slice; do it before any art.)

**Phase 2 — Players move like athletes (2 days).** Mixamo character + clip library → shared
skeleton, 22 clones, locomotion blend tree, **foot IK**, action FSM wired to events. *Demo:
recognizable soccer with weighty running players + a moving ball.*

**Phase 3 — Beauty pass, soccer (2 days).** Grass + wind, mow stripes, pitch lines, stadium bowl,
instanced crowd, floodlights, **full PostFX stack**. Apply the §7.5 anti-slop checklist. *Demo:
the WOW reveal — floodlit living stadium.*

**Phase 4 — Camera + time control (1 day).** Fly FPS, orbit, broadcast rail, player-lock;
timeline scrubber with event markers; slo-mo with DoF; rewind. *Demo: full navigation + slo-mo
replay of a goal.*

**Phase 5 — Multi-sport (2–3 days).** Basketball (SportVU + parquet/`MeshReflectorMaterial` +
arena + ball height), NFL (Big Data Bowl + yard lines), tennis (synth + clay court). Reuse the
entire engine; only `Field` + assets + clip sets differ. *Demo: "one engine, every sport".*

**Phase 6 — AI synthesis + PFF real games (2 days).** Tier-2 trajectory synthesizer (physics +
roles), validate vs Metrica ground truth. Ingest **PFF WC2022 real games**. LLM commentary +
animIntent tagging offline. *Demo: "load a game we have no tracking for" + real-team WC2022 final.*

**Phase 7 — Video sync + gallery + polish (1–2 days).** YouTube approx-sync with clock anchors,
gallery with live thumbnails, HUD/scoreboard/minimap/commentary, loading choreography, credits.
*Demo: the full §1 narrative, end to end.*

**Phase 8 — Demo hardening (½–1 day).** Pre-bake the exact demo games, scripted camera path as a
fallback, offline catalog (no live APIs on stage), perf pass to lock 60fps on the demo machine,
record a backup video.

**Reordering rule:** if time slips, ship **soccer end-to-end gorgeous (Phases 0–4,7)** before
adding sports. One breathtaking sport beats four mediocre ones. Depth is the fallback, breadth
is the stretch — but the current runway targets all four.

---

## 13. Risk register & demo safety

| Risk | Likelihood | Mitigation |
|---|---|---|
| Synthesis motion looks "off" | Med | Anchor on StatsBomb 360 freeze-frames; validate vs Metrica; ship real-tracking games as the hero demo, synth as the "flex" |
| 60fps not held (crowd+grass+post) | Med | Instancing/LOD/VAT from day one; `frameloop=demand`; cap dpr; pre-tune on the demo machine |
| Foot-sliding / floaty players | Med | Prioritize foot IK + root-motion matching in Phase 2; it's the realism linchpin |
| Mixamo unmaintained/outage | Low-Med | Download all clips early & vendor them; Quaternius CC0 rigged bodies as fallback |
| YouTube sync drift/embargo | Low | Frame as "approximate"; pre-set anchors; PiP is optional, not load-bearing |
| Asset licensing | Low (hackathon) | Prefer CC0 (Poly Haven/ambientCG/Kenney/Quaternius); credits panel; note grey-area sets |
| Live API failure on stage | Low | **Everything offline-baked** into the static catalog; no runtime data/LLM calls |
| Scope blowout (4 sports) | High | Vertical-slice soccer first; strict phase gates; breadth is the stretch tier |

**Demo-safety doctrine:** the on-stage build runs entirely off a pre-baked local catalog with a
scripted fallback camera path and a recorded backup video. No network dependency is on the
critical path.

---

## 14. Stretch goals (if ahead)
- Learned off-ball movement model (transformer/VAE trained on Metrica+PFF) replacing heuristics.
- LLM cinematic camera director with auto-cut replays.
- TTS commentary voice synced to the action.
- "Tactical mode" heatmaps / pass networks / pressure overlays rendered in 3D on the pitch.
- Weather/time-of-day toggle (rain shader, day↔night relight).
- Shareable clips (record a camera path → export video).
- Player-cam VR/first-person "be the player" mode.

---

## 15. Appendix — asset & data sources (real URLs)

**Data:** metrica-sports/sample-data · SkillCorner/opendata · statsbomb/open-data (+ statsbombpy) ·
PFF blog.fc.pff.com · linouk23/NBA-Player-Movements + HF dcayton/nba_tracking_data_15_16 ·
swar/nba_api · kaggle.com/c/nfl-big-data-bowl-2025 · JeffSackmann/tennis_slam_pointbypoint ·
**PySport/kloppy** (kloppy.pysport.org) · databallpy (tracking↔event sync) · mplsoccer (2D ref).

**Rendering libs:** pmndrs/react-three-fiber · pmndrs/drei · pmndrs/react-postprocessing ·
N8python/n8ao · agargaro/instanced-mesh (InstancedMesh2) · three core `csm/CSM.js` +
StrandedKitty/three-csm · 0beqz realism-effects (SSGI/TRAA/motion-blur) · drei
`MeshReflectorMaterial`.

**Grass/crowd refs:** Codrops "Fluffiest Grass with Three.js" (2025) · al-ro.github.io/projects/grass ·
CK42BB/procedural-grass-threejs · NVIDIA GPU Gems 3 Ch.2 (animated crowd / VAT) ·
mikelyndon/r3f-webgl-vertex-animation-textures.

**Assets (CC0 unless noted):** Poly Haven (HDRIs+textures+models) · ambientCG (PBR materials) ·
Quaternius (rigged Ultimate Animated Character Pack) · Kenney (props) · Poly Pizza (CC-BY, check) ·
Sketchfab (per-model license) · Mixamo (rig+anims) · Ready Player Me (avatars — **CC BY-NC-SA,
needs commercial license**).

**Pipeline tools:** Blender (FBX→GLB, VAT bake) · gltf-transform / gltfjsx · Draco/meshopt · KTX2/Basis.

---

## 16. Verification (how we prove each layer works, end-to-end)

- **IR/data:** run `build_catalog.py` on one Metrica game → assert `ir.json` validates against
  the zod/JSON schema; spot-check a known event (a real goal) lands at the right `t` and location.
- **Motion (Phase 1 gate):** the colored-sphere debug scene must trace the real players' paths;
  overlay against mplsoccer's 2D animation of the same game to confirm positions match.
- **Synthesis:** run the synthesizer on a Metrica game (we have ground truth) and report mean
  positional error per player; visually diff synth vs real tracks.
- **Animation:** feet stay planted (no sliding) across walk→sprint; actions fire on the right
  events; verify by frame-stepping through a goal.
- **Rendering/perf:** stats overlay shows draw calls < ~150 and 60fps on the demo machine with
  full crowd+grass+post; toggle each post effect to confirm the AAA look.
- **Playback:** scrub/rewind/slo-mo land on the correct frame; `frameloop="demand"` renders only
  on change (verify GPU idle when paused).
- **Video sync:** for the WC2022 final, "watch footage" seeks within a few seconds of the 3D clock
  at kickoff, half, and a known goal.
- **Full run-through:** rehearse the §1 narrative on the offline catalog start-to-finish, plus the
  scripted-fallback path, and record the backup video.
```
