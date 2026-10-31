// Kenney CC0 recordings, served locally. See docs/SONS-LIBRES.md.
// Call only for the visible face; this module never reads the game state.
export const SOUND_AVAILABLE = true;
// The requested restoration starts with sound on once, then keeps new choices.
export const SOUND_PREFERENCE_KEY = 'ddc-sound-v2';
export const SOUND_ASSETS = Object.freeze({
  wheel: new URL('../assets/audio/wheel.wav', import.meta.url).href,
  detent: new URL('../assets/audio/wheel.wav', import.meta.url).href,
  slide: new URL('../assets/audio/slide.wav', import.meta.url).href,
  drop: new URL('../assets/audio/drop.wav', import.meta.url).href,
});

const SETTINGS = {
  wheel: { interval: 72, gain: 0.35 },
  detent: { interval: 140, gain: 1, rate: 0.82 },
  slide: { interval: 80, gain: 0.55 },
  drop: { interval: 80, gain: 0.85 },
};

/** Small, optional sound layer: no event queue, timers or delayed playback. */
export function createSoundPlayer(options = {}) {
  const available = options.available ?? SOUND_AVAILABLE;
  const AudioContextClass = options.AudioContext ?? globalThis.AudioContext ?? globalThis.webkitAudioContext;
  const fetchAudio = options.fetch ?? globalThis.fetch?.bind(globalThis);
  const now = options.now ?? (() => globalThis.performance.now());
  let enabled = available && (options.enabled ?? true);
  let context = null;
  let master = null;
  let loading = null;
  let unlocked = false;
  let generation = 0;
  const buffers = new Map();
  const active = new Set();
  const lastPlayed = new Map();

  function stop() {
    generation++;
    lastPlayed.clear();
    for (const voice of active) {
      voice.source.onended = null;
      try { voice.source.stop(); } catch { /* Already ended. */ }
      try { voice.source.disconnect(); voice.gain.disconnect(); } catch { /* Optional audio. */ }
    }
    active.clear();
  }

  async function loadClips() {
    if (!fetchAudio) return;
    await Promise.all([...new Set(Object.values(SOUND_ASSETS))].map(async url => {
      try {
        const response = await fetchAudio(url);
        if (!response.ok) return;
        const data = await response.arrayBuffer();
        const buffer = await context.decodeAudioData(data);
        for (const [kind, asset] of Object.entries(SOUND_ASSETS)) if (asset === url) buffers.set(kind, buffer);
      } catch { /* Missing audio, offline first visit or decoder rejection: stay silent. */ }
    }));
  }

  async function unlock() {
    if (!enabled || !AudioContextClass) return;
    try {
      if (!context) {
        context = new AudioContextClass();
        master = context.createGain();
        master.gain.value = 0.3;
        master.connect(context.destination);
      }
      // resume() must be invoked inside a real pointer/key gesture on mobile.
      const attempt = generation;
      const resuming = context.state === 'suspended' ? context.resume() : Promise.resolve();
      if (!loading) loading = loadClips();
      await resuming;
      if (generation === attempt && enabled) unlocked = context.state === 'running';
      await loading;
    } catch { unlocked = false; }
  }

  function play(kind) {
    if (!enabled || !unlocked || context?.state !== 'running' || !buffers.has(kind)) return;
    const time = now();
    const settings = SETTINGS[kind];
    if (time - (lastPlayed.get(kind) ?? -Infinity) < settings.interval) return;
    // A press may cross several gates, but sound never accumulates in a queue.
    if (active.size >= 5) {
      if (kind !== 'detent') return;
      // The alignment click has priority over an older motion sound.
      const voice = [...active].find(item => item.kind === 'wheel') ?? active.values().next().value;
      voice.source.onended = null;
      try { voice.source.stop(); voice.source.disconnect(); voice.gain.disconnect(); } catch { /* Optional audio. */ }
      active.delete(voice);
    }
    try {
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffers.get(kind);
      if (source.playbackRate) source.playbackRate.value = settings.rate ?? 1;
      gain.gain.value = settings.gain;
      source.connect(gain);
      gain.connect(master);
      const voice = { source, gain, kind };
      source.onended = () => {
        active.delete(voice);
        source.disconnect();
        gain.disconnect();
      };
      active.add(voice);
      source.start();
      lastPlayed.set(kind, time);
    } catch { /* Sound must never interrupt a move. */ }
  }

  return {
    get available() { return available; },
    get enabled() { return enabled; },
    unlock,
    setEnabled(value) {
      enabled = available && Boolean(value);
      if (!enabled) { unlocked = false; stop(); }
    },
    turn() { play('wheel'); },
    detent() { play('detent'); },
    slide() { play('slide'); },
    drop() { play('drop'); },
    stop() { unlocked = false; stop(); },
  };
}
