# PitchSide — Unity renderer

This Unity project is an **alternative renderer** for the in-game 3D view. The
website keeps doing everything it does today (StatsBomb reconstruction, master
clock, HUD, camera hotkeys); Unity replaces only what's drawn. That means you
can art-direct the match view with Unity's lighting, post-processing and assets
— and none of the match logic ever needs to exist twice.

## Edit → see it on the website

1. **Open** this folder (`unity/`) in Unity Hub with **Unity 6000.1.12f1**
   (the version with WebGL Build Support installed). First open auto-generates
   the URP setup, materials, prefabs and `Assets/Scenes/Match.unity`.
2. **Edit** the scene: lighting, the Post FX Volume profile, stadium geometry,
   the `Assets/Resources/Player.prefab` / `Ball.prefab` visuals — anything.
   Press **Play** to preview with a real match (see sample data below).
3. **Build**: `npm run build:unity` from the repo root (or the
   *Pitchside → Build WebGL* menu inside Unity). Output goes to `public/unity/`.
4. **View**: open any match page with `?engine=unity`, e.g.
   `http://localhost:3000/match/sb-3869685?engine=unity`.
   Without the query param the site uses the original three.js renderer.

## Editor preview data

`npm run unity:sample` (repo root) bakes a real reconstructed match — default:
the 2022 World Cup final — into `SampleData/`. The `EditorMatchSource` component
on **MatchRunner** plays it when you press Play in the editor (tweak
`startAt` / `speed` on the component; `startAt≈4100` is late-game drama).
Pass another id to bake a different match: `npm run unity:sample -- 3943043`.

## How the integration works

- `MatchRunner` hosts `MatchBridge`: a pinned float buffer inside the wasm heap
  holds `[clock, playing]` + per-entity `[x,y,z,heading,speed,action,visible]`.
  The React page writes it every frame (`src/components/unity/UnityView.tsx`);
  Unity reads it every frame. Discrete control (match setup JSON, camera mode,
  follow target) arrives via `SendMessage`.
- Entity visuals spawn from `Assets/Resources/Player.prefab` and `Ball.prefab`.
  Kit colors tint any renderer with a `KitTarget` component — replace the
  primitives with a real character model and either add `KitTarget`s to keep
  team tinting or delete them to use your own materials.
- `CameraDirector` (on the Main Camera) ports the website's camera modes —
  broadcast / player / cinematic / orbit / fly — and stays wired to the HUD's
  camera buttons and hotkeys.
- Keyboard: the page keeps its shortcuts; Unity receives keys only while its
  canvas is focused (click the scene first for fly mode WASD).

## Things to know

- **Bloom is deliberately small** (threshold 1.15, intensity 0.35). Big radii +
  emissive/additive materials flood the frame white. Nudge gently.
- The setup script (`Assets/Editor/PitchsideSetup.cs`) only creates assets that
  are **missing** — your edits are never overwritten. Delete an asset and run
  *Pitchside → Setup Or Repair Project* to regenerate it.
- Build output (`public/unity/`) and `SampleData/` are gitignored; the Unity
  *source* (Assets, Packages, ProjectSettings) is committed.
