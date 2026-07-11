// Entity visuals. Players and the ball are instantiated from prefabs in
// Assets/Resources (Player.prefab / Ball.prefab, generated once by the setup
// script) so you can restyle or replace them entirely in the Unity Editor —
// swap in your own character model, add cloth, whatever. Kit colors are applied
// at runtime to any renderer carrying a KitTarget marker; a replacement model
// without markers simply keeps its own materials.

using UnityEngine;

namespace Pitchside
{
    public class EntityView : MonoBehaviour
    {
        public string entityId;
        public string role;
        public bool isBall;

        [Header("Life (per-player desync so synthesized motion doesn't read robotic)")]
        [Tooltip("Extra lean into the movement direction, degrees at sprint speed.")]
        public float runLean = 10f;
        [Tooltip("Max positional response lag, seconds. Each player gets a different lag so team-shape shifts don't start and stop in lockstep.")]
        public float maxResponseLag = 0.45f;
        [Tooltip("Idle wander radius, meters. Stationary players slowly shift around instead of freezing solid.")]
        public float idleWander = 0.9f;
        [Tooltip("Idle facing drift, degrees. Stationary players look around a little.")]
        public float idleYawDrift = 14f;

        Transform visualRoot;
        float smoothedSpeed;
        float seed;
        float responseLag;
        Vector3 lagged;
        Vector3 lagVel;
        float yawSmoothed;
        float yawVel;
        bool initialized;

        public void SetVisualRoot(Transform t) => visualRoot = t;

        public void ApplyState(float x, float y, float z, float heading, float speed, int action, bool visible)
        {
            if (gameObject.activeSelf != visible) gameObject.SetActive(visible);
            if (!visible) return;

            if (isBall)
            {
                var prev = transform.position;
                transform.position = new Vector3(x, y, z);
                // roll around the axis perpendicular to travel
                var delta = transform.position - prev;
                delta.y = 0;
                float dist = delta.magnitude;
                if (dist > 1e-5f && visualRoot != null)
                {
                    var axis = Vector3.Cross(Vector3.up, delta / dist);
                    const float BALL_R = 0.11f;
                    visualRoot.Rotate(axis, dist / BALL_R * Mathf.Rad2Deg, Space.World);
                }
                return;
            }

            var target = new Vector3(x, y, z);
            var yawTarget = heading * Mathf.Rad2Deg;

            if (!initialized)
            {
                // stable per-player randomness (id hash, set by the factory before
                // the first state arrives), not frame randomness
                seed = (Mathf.Abs(string.IsNullOrEmpty(entityId) ? GetInstanceID() : entityId.GetHashCode()) % 1000) * 0.7131f;
                responseLag = 0.1f + Mathf.Repeat(seed, 1f) * maxResponseLag;
            }

            // hard cuts (seek / period change / bench teleport): snap, don't glide
            if (!initialized || (target - lagged).sqrMagnitude > 36f)
            {
                lagged = target;
                lagVel = Vector3.zero;
                yawSmoothed = yawTarget;
                yawVel = 0f;
                initialized = true;
            }

            // per-player response lag — breaks the lockstep team-shape glide
            lagged = Vector3.SmoothDamp(lagged, target, ref lagVel, responseLag);

            smoothedSpeed = Mathf.Lerp(smoothedSpeed, speed, 0.15f);
            float idle = 1f - Mathf.Clamp01(smoothedSpeed / 1.6f);

            // stationary players get a slow personal wander + facing drift instead
            // of freezing solid (fades out as soon as real movement arrives)
            float tN = Time.time * 0.32f + seed;
            float nx = Mathf.PerlinNoise(seed, tN) - 0.5f;
            float nz = Mathf.PerlinNoise(seed + 31.7f, tN) - 0.5f;
            var wander = new Vector3(nx, 0f, nz) * (idleWander * idle);
            float yawNoise = (Mathf.PerlinNoise(seed + 63.1f, tN * 1.4f) - 0.5f) * 2f * idleYawDrift * idle;

            transform.position = lagged + wander;

            float yaw = Mathf.SmoothDampAngle(yawSmoothed, yawTarget, ref yawVel, 0.18f);
            yawSmoothed = yaw;
            var lean = Mathf.Clamp01(smoothedSpeed / 8f) * runLean;
            transform.rotation = Quaternion.Euler(lean, yaw + yawNoise, 0f);

            if (visualRoot != null)
            {
                // run bob while moving; slow breathing sway while idle
                float bob = Mathf.Clamp01(smoothedSpeed / 6f);
                float phase = Time.time * (4f + smoothedSpeed * 1.6f) + seed;
                float runY = Mathf.Abs(Mathf.Sin(phase)) * 0.05f * bob;
                float idleY = Mathf.Sin(Time.time * 1.1f + seed) * 0.012f * idle;
                visualRoot.localPosition = new Vector3(0, runY + idleY, 0);
            }
        }
    }

    public static class EntityFactory
    {
        public static EntityView Create(EntityMsg e, TeamMsg team, Transform parent)
        {
            bool isBall = e.role == "ball";
            var prefab = Resources.Load<GameObject>(isBall ? "Ball" : "Player");
            GameObject go = prefab != null
                ? Object.Instantiate(prefab, parent)
                : GameObject.CreatePrimitive(PrimitiveType.Capsule);
            if (prefab == null) go.transform.SetParent(parent, false);
            go.name = isBall ? "Ball" : $"{e.number} {e.name} ({e.team})";

            var view = go.AddComponent<EntityView>();
            view.entityId = e.id;
            view.role = e.role;
            view.isBall = isBall;
            var root = go.transform.Find("Visual");
            view.SetVisualRoot(root != null ? root : go.transform.childCount > 0 ? go.transform.GetChild(0) : null);

            if (!isBall && team != null) Dress(go, e, team);
            return view;
        }

        static void Dress(GameObject go, EntityMsg e, TeamMsg team)
        {
            bool gk = e.position == "GK";
            var kit = team.kit;
            var shirt = Parse(gk ? kit.secondary : kit.primary, Color.white);
            var shorts = Parse(gk ? kit.secondary : kit.shorts, Color.white);
            var socks = Parse(kit.socks, Color.white);
            var skin = Parse(kit.skin, new Color(0.78f, 0.53f, 0.26f));
            var numberColor = Parse(kit.numberColor, Color.white);

            foreach (var target in go.GetComponentsInChildren<KitTarget>(true))
            {
                var r = target.GetComponent<Renderer>();
                if (r == null) continue;
                var c = target.part switch
                {
                    KitPart.Shirt => shirt,
                    KitPart.Shorts => shorts,
                    KitPart.Socks => socks,
                    KitPart.Skin => skin,
                    _ => shirt,
                };
                // per-renderer material instance — MaterialPropertyBlock overrides
                // are unreliable with the SRP batcher on WebGL
                r.material.SetColor("_BaseColor", c);
            }

            var label = go.GetComponentInChildren<TextMesh>(true);
            if (label != null)
            {
                label.text = e.number > 0 ? $"{e.number}  {e.name}" : e.name;
                label.color = new Color(1f, 1f, 1f, 0.85f);
                _ = numberColor;
            }
        }

        static Color Parse(string hex, Color fallback)
        {
            return !string.IsNullOrEmpty(hex) && ColorUtility.TryParseHtmlString(hex, out var c) ? c : fallback;
        }
    }
}
