// MatchBridge — the single interface between the website and the Unity scene.
//
// Unity renders; it does not own match logic. The React app keeps doing what it
// does today (StatsBomb reconstruction, master clock, HUD) and every frame
// writes the sampled entity states into a shared float buffer that lives inside
// the WebAssembly heap:
//
//   header  [0]=protocol version  [1]=clock t (s)  [2]=playing flag  [3..7] reserved
//   entity slot i (stride 8, after header): x, y, z, heading(rad), speed(m/s),
//   action(0..4), visible(0/1), reserved
//
// The buffer is a pinned C# float[]; its address is announced to JS once via
// the .jslib plugin. Discrete control (match setup, camera mode, follow target)
// arrives through ordinary SendMessage calls onto the "MatchRunner" object.

using System;
using System.Runtime.InteropServices;
using UnityEngine;

namespace Pitchside
{
    public class MatchBridge : MonoBehaviour
    {
        public const int MaxEntities = 64;
        public const int HeaderFloats = 8;
        public const int EntityStride = 8;
        public const int BufferFloats = HeaderFloats + MaxEntities * EntityStride;

        [Tooltip("Spawned entities are parented here.")]
        public Transform entityRoot;
        public CameraDirector cameraDirector;

        readonly float[] buffer = new float[BufferFloats];
        GCHandle pin;

        public MatchSetupMsg Setup { get; private set; }
        public EntityView[] Views { get; } = new EntityView[MaxEntities];
        public int EntityCount { get; private set; }
        public int BallSlot { get; private set; } = -1;
        public float ClockTime => buffer[1];
        public bool Playing => buffer[2] > 0.5f;

        public Vector3 BallPosition =>
            BallSlot >= 0 && Views[BallSlot] != null ? Views[BallSlot].transform.position : Vector3.zero;

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] static extern void PitchsideAnnounceBuffer(IntPtr ptr, int floatCount);
        [DllImport("__Internal")] static extern void PitchsideNotifyReady();
#endif

        void Awake()
        {
            pin = GCHandle.Alloc(buffer, GCHandleType.Pinned);
            buffer[0] = 1f; // protocol version
#if UNITY_WEBGL && !UNITY_EDITOR
            // Let the page keep its keyboard shortcuts; Unity only gets keys
            // while its canvas is focused (click the scene first for fly mode).
            WebGLInput.captureAllKeyboardInput = false;
            PitchsideAnnounceBuffer(pin.AddrOfPinnedObject(), BufferFloats);
#endif
        }

        void Start()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            PitchsideNotifyReady();
#endif
        }

        void OnDestroy()
        {
            if (pin.IsAllocated) pin.Free();
        }

        // ------------------------- SendMessage receivers -------------------------

        /// One-time match setup: teams, kits, entity slots, key events.
        public void SetMatch(string json)
        {
            var setup = JsonUtility.FromJson<MatchSetupMsg>(json);
            if (setup == null || setup.entities == null)
            {
                Debug.LogError("[Pitchside] SetMatch: could not parse setup JSON");
                return;
            }
            ApplySetup(setup);
        }

        public void SetCameraMode(string mode)
        {
            if (cameraDirector != null) cameraDirector.SetMode(mode);
        }

        /// Buffer slot of the entity to follow in player-cam; -1 clears.
        public void SetFollow(int slot)
        {
            if (cameraDirector != null) cameraDirector.followSlot = slot;
        }

        /// Live match events (goals etc.) — reserved for celebrations/VFX.
        public void OnMatchEvent(string json)
        {
        }

        // ------------------------------ internals --------------------------------

        public void ApplySetup(MatchSetupMsg setup)
        {
            Setup = setup;

            if (entityRoot == null)
            {
                entityRoot = new GameObject("Entities").transform;
                entityRoot.SetParent(transform, false);
            }
            for (int i = entityRoot.childCount - 1; i >= 0; i--)
                Destroy(entityRoot.GetChild(i).gameObject);
            Array.Clear(Views, 0, Views.Length);

            EntityCount = Mathf.Min(setup.entities.Length, MaxEntities);
            BallSlot = -1;
            if (setup.teams.Length >= 2)
                Debug.Log($"[Pitchside] SetMatch: {setup.teams[0].name} ({setup.teams[0].kit.primary}) vs " +
                          $"{setup.teams[1].name} ({setup.teams[1].kit.primary}), {EntityCount} entities");

            for (int i = 0; i < EntityCount; i++)
            {
                var e = setup.entities[i];
                var view = EntityFactory.Create(e, FindTeam(setup, e.team), entityRoot);
                Views[i] = view;
                if (e.role == "ball") BallSlot = i;
            }

            if (cameraDirector != null) cameraDirector.OnMatchLoaded(this);
        }

        static TeamMsg FindTeam(MatchSetupMsg setup, string id)
        {
            foreach (var t in setup.teams)
                if (t.id == id) return t;
            return null;
        }

        /// Editor/standalone driver writes through the same buffer as the web.
        public void WriteClock(float t, bool playing)
        {
            buffer[1] = t;
            buffer[2] = playing ? 1f : 0f;
        }

        public void WriteEntityState(int slot, float x, float y, float z, float heading, float speed, int action, bool visible)
        {
            int o = HeaderFloats + slot * EntityStride;
            buffer[o] = x;
            buffer[o + 1] = y;
            buffer[o + 2] = z;
            buffer[o + 3] = heading;
            buffer[o + 4] = speed;
            buffer[o + 5] = action;
            buffer[o + 6] = visible ? 1f : 0f;
        }

        void Update()
        {
            for (int i = 0; i < EntityCount; i++)
            {
                var view = Views[i];
                if (view == null) continue;
                int o = HeaderFloats + i * EntityStride;
                view.ApplyState(
                    buffer[o], buffer[o + 1], buffer[o + 2],
                    buffer[o + 3], buffer[o + 4], (int)buffer[o + 5],
                    buffer[o + 6] > 0.5f);
            }
        }
    }
}
