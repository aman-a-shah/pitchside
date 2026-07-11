#!/usr/bin/env bash
# Build the Unity scene to WebGL → public/unity, then write the loader manifest.
# Requires Unity 6000.1.12f1 with WebGL Build Support (override with $UNITY_PATH).
set -euo pipefail

UNITY="${UNITY_PATH:-/Applications/Unity/Hub/Editor/6000.1.12f1/Unity.app/Contents/MacOS/Unity}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$ROOT/unity/build.log"

if [ ! -x "$UNITY" ]; then
  echo "Unity editor not found at $UNITY — set UNITY_PATH." >&2
  exit 1
fi

echo "Building Unity WebGL (log: unity/build.log) — first build takes several minutes…"
"$UNITY" -batchmode -quit \
  -projectPath "$ROOT/unity" \
  -buildTarget WebGL \
  -executeMethod Pitchside.EditorTools.PitchsideBuild.Build \
  -logFile "$LOG" || {
  echo "--- Unity build failed; last 60 log lines: ---" >&2
  tail -60 "$LOG" >&2
  exit 1
}

node "$ROOT/scripts/unity-manifest.mjs"
echo "Done → public/unity (open a match with ?engine=unity)"
