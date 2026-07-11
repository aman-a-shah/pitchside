# Asset credits

## Hero footage — `../video/hero-stadium.mp4`

Rendered in-engine by `scripts/film.mjs`: the PitchSide renderer filming the
reconstruction of Ángel Di María's goal in the 2022 World Cup final
(StatsBomb Open Data). Encoded all-keyframe for scroll scrubbing; the poster
is frame 0 of the same render. No third-party footage.

## Characters & animations — `characters/athlete.glb`

Built by `scripts/build-athlete.py` from two CC0 packs by **Quaternius**
(https://quaternius.com — Creative Commons Zero v1.0 Universal):

- **Universal Base Characters** [Standard] — Superhero_Male body + Hair_Buzzed
  (https://quaternius.itch.io/universal-base-characters)
- **Universal Animation Library** [Standard] — 13 clips retargeted &
  baked onto the character (idle/walk/jog/sprint/jump/celebrate/dive/…)
  (https://quaternius.itch.io/universal-animation-library)

Kit-zone materials (Jersey/Shorts/Socks/Boots/Skin/Hair) are assigned
procedurally so the app can retint per team at runtime.

## Balls — `soccerball.glb`, `basketball.glb`

Authored in Blender for this project (see repo history).

## Standalone textures — `../textures/`

- `grass_albedo.jpg` — "Amazing Nature" (AN_) asset pack from the author's own
  Unity game project (licensed to the author)
- `noise_clouds.jpg` — author's game project
