// Camera director — C# port of the web camera rig (src/components/scene/CameraRig.tsx).
// Modes match the website HUD: broadcast / player / cinematic / orbit / fly.
// The web lerped position/look by fixed per-frame factors at ~60fps; here the
// equivalent smoothing is frame-rate independent (1 - exp(-rate·dt)).

using UnityEngine;

namespace Pitchside
{
    public class CameraDirector : MonoBehaviour
    {
        public enum Mode { Broadcast, Player, Cinematic, Orbit, Fly }

        public MatchBridge bridge;
        public Mode mode = Mode.Broadcast;
        public int followSlot = -1;

        [Header("Fly-mode bounds (mirrors web FLY_BOUNDS.soccer)")]
        public float flyPad = 5f;
        public float flyMaxY = 18f;

        float fieldLength = 105f;
        float fieldWidth = 68f;
        KeyEventMsg[] keyEvents = new KeyEventMsg[0];

        Vector3 desiredPos;
        Vector3 lookTarget;
        Vector3 smoothLook;
        bool initialized;

        // cinematic director state
        int shotIndex;
        float shotStart;

        // orbit state
        float orbitYaw = 25f;
        float orbitPitch = 28f;
        float orbitDist = 90f;
        Vector3 orbitTarget;

        // fly state
        float flyYaw;
        float flyPitch;

        Camera cam;

        void Awake()
        {
            cam = GetComponent<Camera>();
            if (cam != null)
            {
                cam.fieldOfView = 40f;
                cam.nearClipPlane = 0.5f;
                cam.farClipPlane = 2200f;
            }
        }

        public void OnMatchLoaded(MatchBridge b)
        {
            bridge = b;
            if (b.Setup != null)
            {
                fieldLength = b.Setup.field.length;
                fieldWidth = b.Setup.field.width;
                keyEvents = b.Setup.keyEvents ?? new KeyEventMsg[0];
            }
            initialized = false;
        }

        public void SetMode(string m)
        {
            var next = m switch
            {
                "broadcast" => Mode.Broadcast,
                "player" => Mode.Player,
                "cinematic" => Mode.Cinematic,
                "orbit" => Mode.Orbit,
                "fly" => Mode.Fly,
                _ => Mode.Broadcast,
            };
            if (next != mode) initialized = false;
            mode = next;
            if (mode == Mode.Orbit) SeedOrbitFromCamera();
            if (mode == Mode.Fly) SeedFlyFromCamera();
        }

        void LateUpdate()
        {
            if (bridge == null) return;
            float dt = Time.deltaTime;

            switch (mode)
            {
                case Mode.Orbit: TickOrbit(dt); return;
                case Mode.Fly: TickFly(dt); return;
            }

            float t = bridge.ClockTime;
            Vector3 ball = bridge.BallPosition;

            float lerpPos = 3.6f;  // ≈0.06/frame @60fps
            float lerpLook = 4.8f; // ≈0.08/frame @60fps

            if (mode == Mode.Broadcast)
            {
                float sideZ = -(fieldWidth * 0.5f + fieldLength * 0.28f);
                desiredPos = new Vector3(ball.x * 0.55f, fieldLength * 0.2f, sideZ);
                lookTarget = new Vector3(ball.x * 0.85f, 2f, ball.z * 0.4f);
            }
            else if (mode == Mode.Player && followSlot >= 0 && followSlot < MatchBridge.MaxEntities && bridge.Views[followSlot] != null)
            {
                var view = bridge.Views[followSlot].transform;
                var fwd = view.forward; // entity yaw already encodes heading
                desiredPos = view.position - fwd * 6f + Vector3.up * 3.1f;
                lookTarget = view.position + fwd * 6f;
                lookTarget.y = 1.4f;
                lerpPos = 7.2f;
                lerpLook = 8.4f;
            }
            else
            {
                DirectorShot(t, ball);
            }

            if (!initialized)
            {
                transform.position = desiredPos;
                smoothLook = lookTarget;
                initialized = true;
            }
            else
            {
                float kp = 1f - Mathf.Exp(-lerpPos * dt);
                float kl = 1f - Mathf.Exp(-lerpLook * dt);
                transform.position = Vector3.Lerp(transform.position, desiredPos, kp);
                smoothLook = Vector3.Lerp(smoothLook, lookTarget, kl);
            }
            transform.LookAt(smoothLook);
        }

        // ------------------------------ cinematic ---------------------------------

        void DirectorShot(float t, Vector3 b)
        {
            var upcoming = FindKeyEvent(t);
            bool nearGoal = upcoming != null && upcoming.t - t < 0.4f && upcoming.t - t > -2.5f;
            float elapsed = t - shotStart;

            if (elapsed > 6f || shotStart == 0f || (nearGoal && shotIndex != 99))
            {
                shotIndex = nearGoal ? 99 : (shotIndex + 1) % 4;
                shotStart = t;
                initialized = false; // hard cut
            }

            if (shotIndex == 99 && upcoming != null)
            {
                float ex = upcoming.x != 0 ? upcoming.x : b.x;
                float ez = upcoming.z != 0 ? upcoming.z : b.z;
                desiredPos = new Vector3(ex * 0.7f, 3.4f, ez + (ez >= 0 ? 10f : -10f));
                lookTarget = new Vector3(ex, 1.5f, ez);
            }
            else if (shotIndex == 0)
            {
                desiredPos = new Vector3(b.x * 0.5f, fieldLength * 0.22f, -(fieldWidth * 0.5f + fieldLength * 0.26f));
                lookTarget = new Vector3(b.x * 0.8f, 2f, b.z * 0.4f);
            }
            else if (shotIndex == 1)
            {
                desiredPos = new Vector3(fieldLength * 0.52f, 8f, b.z * 0.6f + 14f);
                lookTarget = new Vector3(b.x, 1.5f, b.z);
            }
            else if (shotIndex == 2)
            {
                desiredPos = new Vector3(b.x + 12f, 2.4f, b.z + 12f);
                lookTarget = new Vector3(b.x, 1.2f, b.z);
            }
            else
            {
                desiredPos = new Vector3(-fieldLength * 0.5f, fieldLength * 0.18f, -(fieldWidth * 0.4f));
                lookTarget = new Vector3(b.x * 0.7f, 2f, b.z);
            }
        }

        KeyEventMsg FindKeyEvent(float t)
        {
            KeyEventMsg best = null;
            foreach (var e in keyEvents)
            {
                if (e.importance < 0.7f) continue;
                if (e.t >= t - 2.5f && e.t <= t + 3f)
                {
                    if (best == null || Mathf.Abs(e.t - t) < Mathf.Abs(best.t - t)) best = e;
                }
            }
            return best;
        }

        // ------------------------------- orbit -------------------------------------

        void SeedOrbitFromCamera()
        {
            orbitTarget = bridge != null ? bridge.BallPosition : Vector3.zero;
            var offset = transform.position - orbitTarget;
            orbitDist = Mathf.Clamp(offset.magnitude, 6f, fieldLength * 2.2f);
            orbitYaw = Mathf.Atan2(offset.x, offset.z) * Mathf.Rad2Deg;
            orbitPitch = Mathf.Clamp(Mathf.Asin(Mathf.Clamp(offset.y / Mathf.Max(orbitDist, 0.01f), -1f, 1f)) * Mathf.Rad2Deg, 5f, 88f);
        }

        void TickOrbit(float dt)
        {
            if (Input.GetMouseButton(0))
            {
                orbitYaw -= Input.GetAxis("Mouse X") * 3.2f;
                orbitPitch = Mathf.Clamp(orbitPitch + Input.GetAxis("Mouse Y") * 2.6f, 3f, 88f);
            }
            float scroll = Input.mouseScrollDelta.y;
            if (Mathf.Abs(scroll) > 0.01f)
                orbitDist = Mathf.Clamp(orbitDist * (1f - scroll * 0.08f), 6f, fieldLength * 2.2f);

            // ease the target toward the ball, like the web orbit mode
            orbitTarget = Vector3.Lerp(orbitTarget, bridge.BallPosition, 1f - Mathf.Exp(-3f * dt));

            var rot = Quaternion.Euler(orbitPitch, orbitYaw, 0f);
            transform.position = orbitTarget + rot * new Vector3(0f, 0f, -orbitDist);
            transform.rotation = rot;
        }

        // -------------------------------- fly --------------------------------------

        void SeedFlyFromCamera()
        {
            var e = transform.rotation.eulerAngles;
            flyYaw = e.y;
            flyPitch = e.x > 180f ? e.x - 360f : e.x;
        }

        void TickFly(float dt)
        {
            // hold right mouse (or click while cursor unlocked) to look
            if (Input.GetMouseButton(1) || Cursor.lockState == CursorLockMode.Locked)
            {
                flyYaw += Input.GetAxis("Mouse X") * 2.4f;
                flyPitch = Mathf.Clamp(flyPitch - Input.GetAxis("Mouse Y") * 2.4f, -87f, 87f);
            }
            transform.rotation = Quaternion.Euler(flyPitch, flyYaw, 0f);

            float boost = Input.GetKey(KeyCode.LeftShift) || Input.GetKey(KeyCode.RightShift) ? 3f : 1f;
            float speed = 14f * boost * Mathf.Min(dt, 0.05f);
            var move = Vector3.zero;
            if (Input.GetKey(KeyCode.W) || Input.GetKey(KeyCode.UpArrow)) move += transform.forward;
            if (Input.GetKey(KeyCode.S) || Input.GetKey(KeyCode.DownArrow)) move -= transform.forward;
            if (Input.GetKey(KeyCode.D) || Input.GetKey(KeyCode.RightArrow)) move += transform.right;
            if (Input.GetKey(KeyCode.A) || Input.GetKey(KeyCode.LeftArrow)) move -= transform.right;
            if (move.sqrMagnitude > 0) transform.position += move.normalized * speed;
            if (Input.GetKey(KeyCode.E) || Input.GetKey(KeyCode.Space)) transform.position += Vector3.up * speed;
            if (Input.GetKey(KeyCode.Q) || Input.GetKey(KeyCode.LeftControl)) transform.position -= Vector3.up * speed;

            // hard-anchor inside the arena bowl (mirrors web FLY_BOUNDS)
            var p = transform.position;
            p.x = Mathf.Clamp(p.x, -(fieldLength / 2f + flyPad), fieldLength / 2f + flyPad);
            p.z = Mathf.Clamp(p.z, -(fieldWidth / 2f + flyPad), fieldWidth / 2f + flyPad);
            p.y = Mathf.Clamp(p.y, 0.6f, flyMaxY);
            transform.position = p;
        }
    }
}
