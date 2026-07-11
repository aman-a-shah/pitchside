// WebGL build entry — run from the menu (Pitchside → Build WebGL) or headless:
//   npm run build:unity        (from the repo root)
// Output lands in ../public/unity so Next.js serves it at /unity/Build/*.
// Gzip + decompression fallback means it works on any static host with zero
// server header configuration.

using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace Pitchside.EditorTools
{
    public static class PitchsideBuild
    {
        [MenuItem("Pitchside/Build WebGL")]
        public static void BuildMenu() => Build();

        public static void Build()
        {
            PitchsideSetup.EnsureSetup();

            PlayerSettings.companyName = "pitchside";
            PlayerSettings.productName = "pitchside";
            PlayerSettings.runInBackground = true;
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Gzip;
            PlayerSettings.WebGL.decompressionFallback = true;
            PlayerSettings.WebGL.powerPreference = WebGLPowerPreference.HighPerformance;

            string outDir = Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..", "public", "unity"));
            Directory.CreateDirectory(outDir);

            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = new[] { PitchsideSetup.ScenePath },
                target = BuildTarget.WebGL,
                locationPathName = outDir,
                options = BuildOptions.None,
            });

            if (report.summary.result == BuildResult.Succeeded)
            {
                Debug.Log($"[Pitchside] WebGL build OK → {outDir} ({report.summary.totalSize / (1024 * 1024)} MB)");
                if (Application.isBatchMode) EditorApplication.Exit(0);
            }
            else
            {
                Debug.LogError($"[Pitchside] WebGL build FAILED: {report.summary.result}");
                if (Application.isBatchMode) EditorApplication.Exit(1);
            }
        }
    }
}
