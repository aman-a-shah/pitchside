// One-time project generator. On first open of this project (or via the
// "Pitchside → Setup Or Repair Project" menu) it creates:
//   - URP pipeline + renderer assets, assigned project-wide, linear color space
//   - a night-broadcast post-processing volume profile (bloom kept SMALL —
//     large radii flood the frame white with additive/emissive materials)
//   - the procedurally-marked pitch texture + materials
//   - Player/Ball prefabs in Assets/Resources (restyle or replace them freely)
//   - the Match.unity scene: camera+director, moonlight sun, floodlights,
//     placeholder stands, global volume, and the MatchRunner bridge object
//
// Everything is created ONLY if missing, so your edits in the Unity Editor are
// never overwritten. Delete an asset (or the scene) and rerun the menu item to
// regenerate it from scratch.

using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace Pitchside.EditorTools
{
    [InitializeOnLoad]
    public static class PitchsideSetup
    {
        const string SettingsDir = "Assets/Settings";
        const string RendererPath = SettingsDir + "/PitchsideRenderer.asset";
        const string PipelinePath = SettingsDir + "/PitchsideURP.asset";
        const string VolumePath = SettingsDir + "/PitchsideVolumeProfile.asset";
        const string TextureDir = "Assets/Textures";
        const string PitchTexPath = TextureDir + "/PitchMarkings.png";
        const string MaterialDir = "Assets/Materials";
        const string ResourcesDir = "Assets/Resources";
        const string ScenesDir = "Assets/Scenes";
        public const string ScenePath = ScenesDir + "/Match.unity";

        static PitchsideSetup()
        {
            EditorApplication.delayCall += () =>
            {
                if (!File.Exists(PipelinePath) || !File.Exists(ScenePath)) EnsureSetup();
                else RepairPostProcessing();
            };
        }

        /// A URP renderer created from script starts with no PostProcessData,
        /// which silently disables ALL post-processing (the camera inspector
        /// then warns "post processing is currently disabled on the current
        /// renderer"). Point it at URP's default data. Also sweeps any
        /// missing-script leftovers (e.g. from the built-in-pipeline
        /// Post Processing v2 package, which URP projects must not use).
        [MenuItem("Pitchside/Repair Post-Processing")]
        public static void RepairPostProcessing()
        {
            var rendererData = AssetDatabase.LoadAssetAtPath<UniversalRendererData>(RendererPath);
            if (rendererData != null && rendererData.postProcessData == null)
            {
                rendererData.postProcessData = AssetDatabase.LoadAssetAtPath<PostProcessData>(
                    "Packages/com.unity.render-pipelines.universal/Runtime/Data/PostProcessData.asset");
                EditorUtility.SetDirty(rendererData);
                AssetDatabase.SaveAssets();
                Debug.Log("[Pitchside] Post-processing enabled on the URP renderer.");
            }

            int removed = 0;
            var scene = UnityEngine.SceneManagement.SceneManager.GetActiveScene();
            if (scene.isLoaded)
            {
                foreach (var root in scene.GetRootGameObjects())
                    foreach (var t in root.GetComponentsInChildren<Transform>(true))
                        removed += GameObjectUtility.RemoveMonoBehavioursWithMissingScript(t.gameObject);
                if (removed > 0)
                {
                    EditorSceneManager.MarkSceneDirty(scene);
                    Debug.Log($"[Pitchside] Removed {removed} missing-script component(s) — save the scene to keep this.");
                }
            }
        }

        [MenuItem("Pitchside/Setup Or Repair Project")]
        public static void EnsureSetup()
        {
            Directory.CreateDirectory(SettingsDir);
            Directory.CreateDirectory(TextureDir);
            Directory.CreateDirectory(MaterialDir);
            Directory.CreateDirectory(ResourcesDir);
            Directory.CreateDirectory(ScenesDir);

            PlayerSettings.colorSpace = ColorSpace.Linear;

            var pipeline = EnsurePipeline();
            var profile = EnsureVolumeProfile();
            EnsurePitchTexture();
            EnsureMaterials();
            EnsurePrefabs();
            EnsureScene(profile);

            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
            AssetDatabase.SaveAssets();
            Debug.Log("[Pitchside] Project setup complete. Open Assets/Scenes/Match.unity and press Play.");
            _ = pipeline;
        }

        // ------------------------------ URP ---------------------------------------

        static UniversalRenderPipelineAsset EnsurePipeline()
        {
            var existing = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(PipelinePath);
            if (existing != null)
            {
                Assign(existing);
                return existing;
            }

            var rendererData = ScriptableObject.CreateInstance<UniversalRendererData>();
            // without this, URP post-processing is silently disabled project-wide
            rendererData.postProcessData = AssetDatabase.LoadAssetAtPath<PostProcessData>(
                "Packages/com.unity.render-pipelines.universal/Runtime/Data/PostProcessData.asset");
            AssetDatabase.CreateAsset(rendererData, RendererPath);

            var rp = UniversalRenderPipelineAsset.Create(rendererData);
            AssetDatabase.CreateAsset(rp, PipelinePath);

            rp.supportsHDR = true;
            rp.shadowDistance = 190f;

            var so = new SerializedObject(rp);
            SetInt(so, "m_MainLightShadowmapResolution", 2048);
            SetBool(so, "m_SoftShadowsSupported", true);
            SetInt(so, "m_AdditionalLightsPerObjectLimit", 4);
            so.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(rp);

            Assign(rp);
            return rp;
        }

        static void Assign(UniversalRenderPipelineAsset rp)
        {
            GraphicsSettings.defaultRenderPipeline = rp;
            QualitySettings.renderPipeline = rp;
        }

        static void SetInt(SerializedObject so, string prop, int v)
        {
            var p = so.FindProperty(prop);
            if (p != null) p.intValue = v;
        }

        static void SetBool(SerializedObject so, string prop, bool v)
        {
            var p = so.FindProperty(prop);
            if (p != null) p.boolValue = v;
        }

        // --------------------------- post-processing --------------------------------

        static VolumeProfile EnsureVolumeProfile()
        {
            var existing = AssetDatabase.LoadAssetAtPath<VolumeProfile>(VolumePath);
            if (existing != null) return existing;

            var profile = ScriptableObject.CreateInstance<VolumeProfile>();
            AssetDatabase.CreateAsset(profile, VolumePath);

            var tone = profile.Add<Tonemapping>(true);
            tone.mode.Override(TonemappingMode.ACES);
            AssetDatabase.AddObjectToAsset(tone, profile);

            // deliberately restrained: high threshold, small intensity — the scene
            // floods white otherwise (see project notes on bloom fragility)
            var bloom = profile.Add<Bloom>(true);
            bloom.threshold.Override(1.15f);
            bloom.intensity.Override(0.35f);
            bloom.scatter.Override(0.55f);
            AssetDatabase.AddObjectToAsset(bloom, profile);

            var color = profile.Add<ColorAdjustments>(true);
            color.postExposure.Override(0.15f);
            color.saturation.Override(6f);
            color.contrast.Override(8f);
            AssetDatabase.AddObjectToAsset(color, profile);

            var vignette = profile.Add<Vignette>(true);
            vignette.intensity.Override(0.22f);
            vignette.smoothness.Override(0.42f);
            AssetDatabase.AddObjectToAsset(vignette, profile);

            AssetDatabase.SaveAssets();
            return profile;
        }

        // ----------------------------- pitch texture --------------------------------

        // world meters covered by the texture (pitch + grass runoff margin)
        const float PitchL = 105f, PitchW = 68f, Margin = 3f;
        const float TexWorldX = PitchL + Margin * 2f, TexWorldZ = PitchW + Margin * 2f;

        static void EnsurePitchTexture()
        {
            if (File.Exists(PitchTexPath)) return;

            const int W = 2048;
            int H = Mathf.RoundToInt(W * TexWorldZ / TexWorldX); // ≈ 1365
            var tex = new Texture2D(W, H, TextureFormat.RGB24, false);
            var pixels = new Color[W * H];

            var grassA = new Color(0.086f, 0.243f, 0.117f);
            var grassB = new Color(0.104f, 0.278f, 0.133f);
            var lineCol = new Color(0.92f, 0.94f, 0.92f);

            const float lineW = 0.07f;     // half line width, meters
            const float halfL = PitchL / 2f, halfW = PitchW / 2f;

            for (int py = 0; py < H; py++)
            {
                float z = (py / (float)(H - 1) - 0.5f) * TexWorldZ;
                for (int px = 0; px < W; px++)
                {
                    float x = (px / (float)(W - 1) - 0.5f) * TexWorldX;

                    // mow stripes along the length
                    int band = Mathf.FloorToInt((x + halfL) / (PitchL / 14f));
                    var c = (band & 1) == 0 ? grassA : grassB;

                    if (OnMarkings(x, z, lineW, halfL, halfW)) c = lineCol;
                    pixels[py * W + px] = c;
                }
            }

            tex.SetPixels(pixels);
            tex.Apply();
            File.WriteAllBytes(PitchTexPath, tex.EncodeToPNG());
            Object.DestroyImmediate(tex);
            AssetDatabase.ImportAsset(PitchTexPath);

            var importer = (TextureImporter)AssetImporter.GetAtPath(PitchTexPath);
            importer.wrapMode = TextureWrapMode.Clamp;
            importer.maxTextureSize = 2048;
            importer.mipmapEnabled = true;
            importer.SaveAndReimport();
        }

        static bool OnMarkings(float x, float z, float w, float halfL, float halfW)
        {
            float ax = Mathf.Abs(x), az = Mathf.Abs(z);

            // touchlines + goal lines
            if (ax <= halfL + w && az <= halfW + w && (Mathf.Abs(ax - halfL) <= w || Mathf.Abs(az - halfW) <= w))
                return true;
            if (ax > halfL + w || az > halfW + w) return false;

            // halfway line, centre circle + spot
            if (Mathf.Abs(x) <= w) return true;
            float dc = Mathf.Sqrt(x * x + z * z);
            if (Mathf.Abs(dc - 9.15f) <= w) return true;
            if (dc <= 0.18f) return true;

            // penalty box: 16.5m deep, half-width 20.16
            if (Mathf.Abs(ax - (halfL - 16.5f)) <= w && az <= 20.16f + w) return true;
            if (Mathf.Abs(az - 20.16f) <= w && ax >= halfL - 16.5f - w) return true;

            // goal area: 5.5m deep, half-width 9.16
            if (Mathf.Abs(ax - (halfL - 5.5f)) <= w && az <= 9.16f + w) return true;
            if (Mathf.Abs(az - 9.16f) <= w && ax >= halfL - 5.5f - w) return true;

            // penalty spots (11m) + arcs (r 9.15 around the spot, outside the box)
            float spotX = halfL - 11f;
            float dSpot = Mathf.Sqrt((ax - spotX) * (ax - spotX) + z * z);
            if (dSpot <= 0.16f) return true;
            if (Mathf.Abs(dSpot - 9.15f) <= w && ax <= halfL - 16.5f) return true;

            // corner arcs
            float dCorner = Mathf.Sqrt((ax - halfL) * (ax - halfL) + (az - halfW) * (az - halfW));
            if (Mathf.Abs(dCorner - 1f) <= w) return true;

            return false;
        }

        // ------------------------------ materials -----------------------------------

        static Material EnsureMaterial(string name, Color color, float smoothness, float metallic = 0f, Texture2D tex = null, Color? emission = null)
        {
            string path = MaterialDir + "/" + name + ".mat";
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m != null) return m;

            m = new Material(Shader.Find("Universal Render Pipeline/Lit"));
            m.SetColor("_BaseColor", color);
            m.SetFloat("_Smoothness", smoothness);
            m.SetFloat("_Metallic", metallic);
            if (tex != null) m.SetTexture("_BaseMap", tex);
            if (emission.HasValue)
            {
                m.EnableKeyword("_EMISSION");
                m.globalIlluminationFlags = MaterialGlobalIlluminationFlags.RealtimeEmissive;
                m.SetColor("_EmissionColor", emission.Value);
            }
            AssetDatabase.CreateAsset(m, path);
            return m;
        }

        static void EnsureMaterials()
        {
            var pitchTex = AssetDatabase.LoadAssetAtPath<Texture2D>(PitchTexPath);
            EnsureMaterial("Pitch", Color.white, 0.12f, 0f, pitchTex);
            EnsureMaterial("Surround", new Color(0.031f, 0.039f, 0.055f), 0.05f);
            EnsureMaterial("Stand", new Color(0.055f, 0.066f, 0.086f), 0.15f);
            EnsureMaterial("GoalFrame", new Color(0.95f, 0.96f, 0.97f), 0.6f, 0.1f);
            EnsureMaterial("BallWhite", new Color(0.95f, 0.95f, 0.95f), 0.55f);
            EnsureMaterial("KitShirt", Color.white, 0.35f);
            EnsureMaterial("KitShorts", Color.white, 0.35f);
            EnsureMaterial("KitSocks", Color.white, 0.35f);
            EnsureMaterial("Skin", new Color(0.78f, 0.53f, 0.26f), 0.3f);
            EnsureMaterial("FloodPole", new Color(0.12f, 0.13f, 0.15f), 0.3f, 0.4f);
        }

        // ------------------------------- prefabs ------------------------------------

        static void EnsurePrefabs()
        {
            EnsurePlayerPrefab();
            EnsureBallPrefab();
        }

        static GameObject Primitive(PrimitiveType type, string name, Transform parent, Vector3 pos, Vector3 scale, Material mat, KitPart? kit = null)
        {
            var go = GameObject.CreatePrimitive(type);
            go.name = name;
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos;
            go.transform.localScale = scale;
            var col = go.GetComponent<Collider>();
            if (col != null) Object.DestroyImmediate(col);
            go.GetComponent<Renderer>().sharedMaterial = mat;
            if (kit.HasValue) go.AddComponent<KitTarget>().part = kit.Value;
            return go;
        }

        static void EnsurePlayerPrefab()
        {
            string path = ResourcesDir + "/Player.prefab";
            if (File.Exists(path)) return;

            var shirt = AssetDatabase.LoadAssetAtPath<Material>(MaterialDir + "/KitShirt.mat");
            var shorts = AssetDatabase.LoadAssetAtPath<Material>(MaterialDir + "/KitShorts.mat");
            var socks = AssetDatabase.LoadAssetAtPath<Material>(MaterialDir + "/KitSocks.mat");
            var skin = AssetDatabase.LoadAssetAtPath<Material>(MaterialDir + "/Skin.mat");

            var root = new GameObject("Player");
            var visual = new GameObject("Visual").transform;
            visual.SetParent(root.transform, false);

            Primitive(PrimitiveType.Capsule, "Torso", visual, new Vector3(0, 1.12f, 0), new Vector3(0.44f, 0.32f, 0.30f), shirt, KitPart.Shirt);
            Primitive(PrimitiveType.Cylinder, "Hips", visual, new Vector3(0, 0.80f, 0), new Vector3(0.40f, 0.13f, 0.30f), shorts, KitPart.Shorts);
            Primitive(PrimitiveType.Cylinder, "LegL", visual, new Vector3(-0.11f, 0.36f, 0), new Vector3(0.12f, 0.34f, 0.12f), socks, KitPart.Socks);
            Primitive(PrimitiveType.Cylinder, "LegR", visual, new Vector3(0.11f, 0.36f, 0), new Vector3(0.12f, 0.34f, 0.12f), socks, KitPart.Socks);
            Primitive(PrimitiveType.Sphere, "Head", visual, new Vector3(0, 1.62f, 0), new Vector3(0.24f, 0.26f, 0.24f), skin, KitPart.Skin);
            Primitive(PrimitiveType.Capsule, "ArmL", visual, new Vector3(-0.30f, 1.14f, 0), new Vector3(0.10f, 0.26f, 0.10f), shirt, KitPart.Shirt);
            Primitive(PrimitiveType.Capsule, "ArmR", visual, new Vector3(0.30f, 1.14f, 0), new Vector3(0.10f, 0.26f, 0.10f), shirt, KitPart.Shirt);

            var labelGo = new GameObject("Label");
            labelGo.transform.SetParent(root.transform, false);
            labelGo.transform.localPosition = new Vector3(0, 2.15f, 0);
            var label = labelGo.AddComponent<TextMesh>();
            label.anchor = TextAnchor.MiddleCenter;
            label.alignment = TextAlignment.Center;
            label.fontSize = 48;
            label.characterSize = 0.045f;
            label.color = new Color(1, 1, 1, 0.85f);
            var font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            label.font = font;
            labelGo.GetComponent<MeshRenderer>().sharedMaterial = font.material;
            labelGo.AddComponent<Billboard>();

            PrefabUtility.SaveAsPrefabAsset(root, path);
            Object.DestroyImmediate(root);
        }

        static void EnsureBallPrefab()
        {
            string path = ResourcesDir + "/Ball.prefab";
            if (File.Exists(path)) return;

            var mat = AssetDatabase.LoadAssetAtPath<Material>(MaterialDir + "/BallWhite.mat");
            var root = new GameObject("Ball");
            var visual = new GameObject("Visual").transform;
            visual.SetParent(root.transform, false);
            Primitive(PrimitiveType.Sphere, "Sphere", visual, Vector3.zero, Vector3.one * 0.22f, mat);

            PrefabUtility.SaveAsPrefabAsset(root, path);
            Object.DestroyImmediate(root);
        }

        // -------------------------------- scene -------------------------------------

        static void EnsureScene(VolumeProfile profile)
        {
            if (File.Exists(ScenePath)) return;

            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            // night broadcast ambience
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(0.10f, 0.13f, 0.22f);
            RenderSettings.ambientEquatorColor = new Color(0.06f, 0.08f, 0.12f);
            RenderSettings.ambientGroundColor = new Color(0.025f, 0.032f, 0.045f);
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            RenderSettings.fogDensity = 0.0011f;
            RenderSettings.fogColor = new Color(0.016f, 0.023f, 0.043f);

            // --- camera ---
            var camGo = new GameObject("Main Camera");
            camGo.tag = "MainCamera";
            var cam = camGo.AddComponent<Camera>();
            cam.fieldOfView = 40f;
            cam.nearClipPlane = 0.5f;
            cam.farClipPlane = 2200f;
            cam.transform.position = new Vector3(0, 34, -96);
            cam.transform.LookAt(Vector3.zero);
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.008f, 0.012f, 0.03f);
            if (!camGo.TryGetComponent<UniversalAdditionalCameraData>(out var camData))
                camData = camGo.AddComponent<UniversalAdditionalCameraData>();
            camData.renderPostProcessing = true;
            camData.antialiasing = AntialiasingMode.SubpixelMorphologicalAntiAliasing;
            var director = camGo.AddComponent<CameraDirector>();

            // --- lights ---
            var sunGo = new GameObject("Moon Light");
            var sun = sunGo.AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.intensity = 1.05f;
            sun.color = new Color(0.84f, 0.89f, 1f);
            sun.shadows = LightShadows.Soft;
            sun.shadowStrength = 0.75f;
            sunGo.transform.rotation = Quaternion.Euler(52f, -38f, 0f);

            var floodParent = new GameObject("Floodlights").transform;
            var poleMat = AssetDatabase.LoadAssetAtPath<Material>(MaterialDir + "/FloodPole.mat");
            foreach (var corner in new[] { new Vector2(-62, -48), new Vector2(62, -48), new Vector2(-62, 48), new Vector2(62, 48) })
            {
                var tower = new GameObject("Floodlight").transform;
                tower.SetParent(floodParent, false);
                tower.position = new Vector3(corner.x, 0, corner.y);
                Primitive(PrimitiveType.Cylinder, "Pole", tower, new Vector3(0, 15, 0), new Vector3(0.8f, 15f, 0.8f), poleMat);
                var head = new GameObject("Lamp");
                head.transform.SetParent(tower, false);
                head.transform.localPosition = new Vector3(0, 30.5f, 0);
                head.transform.LookAt(new Vector3(corner.x * 0.15f, 0, corner.y * 0.15f));
                var spot = head.AddComponent<Light>();
                spot.type = LightType.Spot;
                spot.range = 190f;
                spot.spotAngle = 105f;
                spot.intensity = 35f;
                spot.color = new Color(0.95f, 0.97f, 1f);
                spot.shadows = LightShadows.None;
            }

            // --- post fx ---
            var volGo = new GameObject("Post FX Volume");
            var vol = volGo.AddComponent<Volume>();
            vol.isGlobal = true;
            vol.sharedProfile = profile;

            // --- pitch + surround ---
            var pitchMat = AssetDatabase.LoadAssetAtPath<Material>(MaterialDir + "/Pitch.mat");
            var pitch = Primitive(PrimitiveType.Plane, "Pitch", null, Vector3.zero,
                new Vector3(TexWorldX / 10f, 1f, TexWorldZ / 10f), pitchMat);
            pitch.isStatic = true;

            var surroundMat = AssetDatabase.LoadAssetAtPath<Material>(MaterialDir + "/Surround.mat");
            var surround = Primitive(PrimitiveType.Plane, "Surround", null, new Vector3(0, -0.02f, 0),
                new Vector3(40f, 1f, 32f), surroundMat);
            surround.isStatic = true;

            // --- goals ---
            var goalMat = AssetDatabase.LoadAssetAtPath<Material>(MaterialDir + "/GoalFrame.mat");
            foreach (int side in new[] { -1, 1 })
            {
                var goal = new GameObject(side < 0 ? "Goal West" : "Goal East").transform;
                goal.position = new Vector3(side * 52.5f, 0, 0);
                const float halfGoal = 3.66f, barH = 2.44f, r = 0.055f;
                Primitive(PrimitiveType.Cylinder, "PostL", goal, new Vector3(0, barH / 2f, -halfGoal), new Vector3(r * 2, barH / 2f, r * 2), goalMat);
                Primitive(PrimitiveType.Cylinder, "PostR", goal, new Vector3(0, barH / 2f, halfGoal), new Vector3(r * 2, barH / 2f, r * 2), goalMat);
                var bar = Primitive(PrimitiveType.Cylinder, "Crossbar", goal, new Vector3(0, barH, 0), new Vector3(r * 2, halfGoal, r * 2), goalMat);
                bar.transform.localRotation = Quaternion.Euler(90, 0, 0);
                goal.gameObject.isStatic = true;
            }

            // --- placeholder stands (replace these with real assets in the editor) ---
            var standMat = AssetDatabase.LoadAssetAtPath<Material>(MaterialDir + "/Stand.mat");
            var stands = new GameObject("Stands").transform;
            foreach (var (pos, scale, yaw) in new (Vector3, Vector3, float)[]
            {
                (new Vector3(0, 5f, -48f), new Vector3(125f, 10f, 14f), 0f),
                (new Vector3(0, 5f, 48f), new Vector3(125f, 10f, 14f), 0f),
                (new Vector3(-66f, 5f, 0), new Vector3(14f, 10f, 82f), 0f),
                (new Vector3(66f, 5f, 0), new Vector3(14f, 10f, 82f), 0f),
            })
            {
                var s = Primitive(PrimitiveType.Cube, "Stand", stands, pos, scale, standMat);
                s.transform.localRotation = Quaternion.Euler(0, yaw, 0);
                s.isStatic = true;
            }

            // --- match runner (bridge between the website / editor source and the scene) ---
            var runner = new GameObject("MatchRunner");
            var bridge = runner.AddComponent<MatchBridge>();
            var entities = new GameObject("Entities").transform;
            entities.SetParent(runner.transform, false);
            bridge.entityRoot = entities;
            bridge.cameraDirector = director;
            director.bridge = bridge;
            var source = runner.AddComponent<EditorMatchSource>();
            source.bridge = bridge;

            EditorSceneManager.SaveScene(scene, ScenePath);
        }
    }
}
