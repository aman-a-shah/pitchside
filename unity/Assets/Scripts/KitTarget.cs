// Marks a renderer as tintable by a team kit color. MonoBehaviours must live in
// a file named after the class or Unity cannot serialize them into prefabs.

using UnityEngine;

namespace Pitchside
{
    public enum KitPart
    {
        Shirt,
        Shorts,
        Socks,
        Skin,
        Number,
    }

    public class KitTarget : MonoBehaviour
    {
        public KitPart part = KitPart.Shirt;
    }
}
