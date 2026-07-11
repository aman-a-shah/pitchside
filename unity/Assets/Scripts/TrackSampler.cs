// C# port of src/ir/sampler.ts — evaluates a dense uniform-grid track at an
// arbitrary clock time with smooth interpolation. Used only for editor preview
// playback (the website streams already-sampled states into the heap buffer).

using UnityEngine;

namespace Pitchside
{
    public struct TrackSample
    {
        public float x, y, z, speed, heading;
        public int action;
    }

    public class Track
    {
        public float hz;
        public float t0;
        public int count;
        public float[] x, y, z, speed, heading;
        public byte[] action;

        static float LerpAngle(float a, float b, float f)
        {
            const float TAU = Mathf.PI * 2f;
            float d = (b - a) % TAU;
            if (d > Mathf.PI) d -= TAU;
            else if (d < -Mathf.PI) d += TAU;
            return a + d * f;
        }

        public void Sample(float t, ref TrackSample o)
        {
            if (count == 0 || x == null || x.Length == 0)
            {
                o = default;
                return;
            }

            float fpos = (t - t0) * hz;
            if (fpos <= 0f) { Copy(0, ref o); return; }
            if (fpos >= count - 1) { Copy(count - 1, ref o); return; }

            int i = (int)fpos;
            float f = fpos - i;
            int j = i + 1;

            o.x = x[i] + (x[j] - x[i]) * f;
            o.y = y[i] + (y[j] - y[i]) * f;
            o.z = z[i] + (z[j] - z[i]) * f;
            o.speed = speed[i] + (speed[j] - speed[i]) * f;
            o.heading = LerpAngle(heading[i], heading[j], f);
            o.action = action != null && action.Length > 0 ? action[f < 0.5f ? i : j] : 0;
        }

        void Copy(int i, ref TrackSample o)
        {
            o.x = x[i];
            o.y = y[i];
            o.z = z[i];
            o.speed = speed[i];
            o.heading = heading[i];
            o.action = action != null && action.Length > i ? action[i] : 0;
        }
    }
}
