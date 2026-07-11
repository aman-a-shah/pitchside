// Announces the shared entity-state buffer (a pinned float[] inside the wasm
// heap) to the hosting page, and signals scene readiness. The React side
// (src/components/unity/UnityView.tsx) listens for these events and then
// writes sampled entity states directly into HEAPF32 every frame.
mergeInto(LibraryManager.library, {
  PitchsideAnnounceBuffer: function (ptr, floatCount) {
    var g = typeof globalThis !== 'undefined' ? globalThis : window;
    g.__pitchsideUnity = g.__pitchsideUnity || {};
    g.__pitchsideUnity.bufferPtr = ptr;
    g.__pitchsideUnity.bufferFloats = floatCount;
    // HEAPF32 is reassigned when the wasm memory grows — always go through
    // this getter rather than caching the array on the page side.
    g.__pitchsideUnity.getHeap = function () {
      return HEAPF32;
    };
    try {
      g.dispatchEvent(new CustomEvent('pitchside-unity-buffer'));
    } catch (e) {}
  },

  PitchsideNotifyReady: function () {
    var g = typeof globalThis !== 'undefined' ? globalThis : window;
    g.__pitchsideUnity = g.__pitchsideUnity || {};
    g.__pitchsideUnity.ready = true;
    try {
      g.dispatchEvent(new CustomEvent('pitchside-unity-ready'));
    } catch (e) {}
  },
});
