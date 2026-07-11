// Message types shared between the website and Unity.
//
// The web app (src/components/unity/UnityView.tsx) serializes the reconstructed
// match into exactly these shapes, so every field here must stay JsonUtility-
// compatible: no dictionaries, no nullables — arrays of [Serializable] classes.
// The same shapes are used by the editor-only sample match (SampleData/) so the
// scene plays inside the Unity Editor without the website running.

using System;

namespace Pitchside
{
    [Serializable]
    public class FieldSpecMsg
    {
        public float length = 105f;
        public float width = 68f;
        /// goal half-width along z, meters (matches the web IR convention)
        public float goalWidth = 3.66f;
        public float goalHeight = 2.44f;
    }

    [Serializable]
    public class KitMsg
    {
        public string primary = "#ffffff";
        public string secondary = "#222222";
        public string shorts = "#ffffff";
        public string socks = "#ffffff";
        public string numberColor = "#000000";
        public string skin = "#c68642";
    }

    [Serializable]
    public class TeamMsg
    {
        public string id = "H";
        public string name = "";
        public string shortName = "";
        public KitMsg kit = new KitMsg();
        public int attackDir = 1;
    }

    [Serializable]
    public class EntityMsg
    {
        public string id = "";
        /// "player" | "ball" | "referee"
        public string role = "player";
        public string team = "";
        public string name = "";
        public int number;
        /// "GK" | "DEF" | "MID" | "FWD"
        public string position = "MID";
    }

    /// High-importance moments the cinematic camera director cuts to.
    [Serializable]
    public class KeyEventMsg
    {
        public float t;
        public float x;
        public float z;
        public float importance;
    }

    /// Dead stretches the playback clock jumps over (VAR, injuries, set-up).
    [Serializable]
    public class DeadSpanMsg
    {
        public float t0;
        public float t1;
    }

    /// One-time match setup. Entity order defines the frame-buffer slot order.
    [Serializable]
    public class MatchSetupMsg
    {
        public FieldSpecMsg field = new FieldSpecMsg();
        public string mood = "night";
        public float duration;
        public TeamMsg[] teams = Array.Empty<TeamMsg>();
        public EntityMsg[] entities = Array.Empty<EntityMsg>();
        public KeyEventMsg[] keyEvents = Array.Empty<KeyEventMsg>();
        public DeadSpanMsg[] deadSpans = Array.Empty<DeadSpanMsg>();
    }

}
