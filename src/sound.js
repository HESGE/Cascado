// Kenney CC0 recordings, served locally. See docs/SONS-LIBRES.md.
// The caller supplies visible effects or anonymous opponent falls; this module
// never reads the game state or schedules sounds for a hidden screen.
export const SOUND_AVAILABLE = true;
// The requested restoration starts with sound on once, then keeps new choices.
export const SOUND_PREFERENCE_KEY = 'ddc-sound-v2';
export const SOUND_ASSETS = Object.freeze({
  wheel: new URL('../assets/audio/slide.wav', import.meta.url).href,
  detent: new URL('../assets/audio/wheel.wav', import.meta.url).href,
  slide: new URL('../assets/audio/slide.wav', import.meta.url).href,
  drop: new URL('../assets/audio/drop.wav', import.meta.url).href,
});

const SETTINGS = {
  // Use only the textured tail of the slide recording, away from its impact.
  wheel: { interval: 90, travel: 12, gain: 0.6, offset: 0.11, duration: 0.11, cutoff: 1600, attack: 0.012, release: 0.028 },
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
  let unlockAttempt = 0;
  let rotationTravel = 0;
  let firstRotationMovement = true;
  const buffers = new Map();
  const active = new Set();
  const warmups = new Set();
  const lastPlayed = new Map();
  let sessionBeforePlayback = null;

  function playbackSession() {
    // On compatible iPhones, explicit game audio uses the media volume rather
    // than the ringer switch. Older browsers keep their normal audio policy.
    try {
      const session = options.audioSession ?? globalThis.navigator?.audioSession;
      if (!session) return;
      if (!sessionBeforePlayback) sessionBeforePlayback = { session, type: session.type };
      session.type = 'playback';
    } catch { /* This optional API must not prevent ordinary Web Audio. */ }
  }

  function releaseSession() {
    if (!sessionBeforePlayback) return;
    try { sessionBeforePlayback.session.type = sessionBeforePlayback.type; } catch { /* Optional API. */ }
    sessionBeforePlayback = null;
  }

  function clearWarmup(warmup, stopSource = false) {
    warmups.delete(warmup);
    warmup.source.onended = null;
    if (stopSource) { try { warmup.source.stop(); } catch { /* Already ended. */ } }
    try { warmup.source.disconnect(); warmup.gain.disconnect(); } catch { /* Optional audio. */ }
  }

  function primeContext(audioContext) {
    // Start a real, all-zero sample within the gesture, before any await. It
    // cannot become an audible delayed effect and does not consume a game voice.
    for (const warmup of warmups) clearWarmup(warmup, true);
    let warmup = null;
    try {
      const source = audioContext.createBufferSource();
      const gain = audioContext.createGain();
      source.buffer = audioContext.createBuffer(1, 1, audioContext.sampleRate || 44100);
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(audioContext.destination);
      warmup = { source, gain };
      warmups.add(warmup);
      source.onended = () => clearWarmup(warmup);
      source.start(0);
    } catch {
      if (warmup) clearWarmup(warmup, true);
      // A refused compatibility prime must not prevent ordinary resume().
    }
  }

  function stop() {
    generation++;
    unlocked = false;
    rotationTravel = 0;
    firstRotationMovement = true;
    lastPlayed.clear();
    for (const voice of active) {
      voice.source.onended = null;
      try { voice.source.stop(); } catch { /* Already ended. */ }
      try { voice.source.disconnect(); voice.filter?.disconnect(); voice.gain.disconnect(); } catch { /* Optional audio. */ }
    }
    active.clear();
    for (const warmup of warmups) clearWarmup(warmup, true);
    releaseSession();
  }

  async function loadClips(audioContext) {
    if (!fetchAudio) return;
    const missing = [...new Set(Object.values(SOUND_ASSETS))].filter(url =>
      Object.entries(SOUND_ASSETS).some(([kind, asset]) => asset === url && !buffers.has(kind)));
    await Promise.all(missing.map(async url => {
      try {
        const response = await fetchAudio(url);
        if (!response.ok || context !== audioContext || audioContext.state === 'closed') return;
        const data = await response.arrayBuffer();
        if (context !== audioContext || audioContext.state === 'closed') return;
        const buffer = await audioContext.decodeAudioData(data);
        if (context !== audioContext || audioContext.state === 'closed') return;
        for (const [kind, asset] of Object.entries(SOUND_ASSETS)) if (asset === url) buffers.set(kind, buffer);
      } catch { /* Missing audio, offline first visit or decoder rejection: stay silent. */ }
    }));
  }

  function clipsLoading(audioContext) {
    if (buffers.size === Object.keys(SOUND_ASSETS).length) return Promise.resolve();
    if (loading?.context === audioContext) return loading.promise;
    const pending = { context: audioContext, promise: null };
    pending.promise = loadClips(audioContext).finally(() => {
      if (loading === pending) loading = null;
    });
    loading = pending;
    return pending.promise;
  }

  async function activate(replaceContext = false) {
    if (!enabled || !AudioContextClass) return false;
    if (context && (replaceContext || context.state === 'closed')) {
      const previous = context;
      stop();
      context = null;
      loading = null;
      try { master?.disconnect(); } catch { /* Optional audio. */ }
      master = null;
      try { previous.close?.()?.catch?.(() => {}); } catch { /* Already closed. */ }
    }
    const attempt = ++unlockAttempt;
    const attemptGeneration = generation;
    let audioContext = context;
    const current = () => enabled && generation === attemptGeneration
      && unlockAttempt === attempt && context === audioContext;
    try {
      // Select the media route before WebKit creates the audio hardware session.
      playbackSession();
      const created = !context;
      if (created) {
        context = new AudioContextClass();
        audioContext = context;
        master = context.createGain();
        master.gain.value = 0.3;
        master.connect(context.destination);
      }
      const needsPrime = created || audioContext.state !== 'running';
      // Both operations execute synchronously in the caller's gesture.
      const resuming = audioContext.state !== 'running' ? audioContext.resume() : Promise.resolve();
      if (needsPrime) primeContext(audioContext);
      const pendingClips = clipsLoading(audioContext);
      await resuming;
      if (!current()) return false;
      unlocked = audioContext.state === 'running';
      await pendingClips;
      return current() && unlocked && audioContext.state === 'running';
    } catch {
      if (current()) {
        unlocked = false;
        for (const warmup of warmups) clearWarmup(warmup, true);
        releaseSession();
      }
      return false;
    }
  }

  function play(kind) {
    if (!enabled || !unlocked || context?.state !== 'running' || !buffers.has(kind)) return false;
    const time = now();
    const settings = SETTINGS[kind];
    if (time - (lastPlayed.get(kind) ?? -Infinity) < settings.interval) return false;
    // Leave a short gap after the stronger alignment click, too.
    if (kind === 'wheel' && time - (lastPlayed.get('detent') ?? -Infinity) < SETTINGS.detent.interval) return false;
    // A press may cross several gates, but sound never accumulates in a queue.
    if (active.size >= 5) {
      if (kind !== 'detent') return false;
      // The alignment click has priority over an older motion sound.
      const voice = [...active].find(item => item.kind === 'wheel') ?? active.values().next().value;
      voice.source.onended = null;
      try { voice.source.stop(); voice.source.disconnect(); voice.filter?.disconnect(); voice.gain.disconnect(); } catch { /* Optional audio. */ }
      active.delete(voice);
    }
    let voice = null;
    try {
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffers.get(kind);
      if (source.playbackRate) source.playbackRate.value = settings.rate ?? 1;
      let filter = null;
      let duration = null;
      if (kind === 'wheel') {
        duration = Math.min(settings.duration, Math.max(0, source.buffer.duration - settings.offset));
        if (!duration) return false;
        const start = context.currentTime;
        // A soft friction burst has neither the attack nor the bright snap of
        // the alignment clip. All ramps belong to this immediate voice only.
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(settings.gain, start + settings.attack);
        gain.gain.setValueAtTime(settings.gain, start + Math.max(settings.attack, duration - settings.release));
        gain.gain.linearRampToValueAtTime(0, start + duration);
        if (context.createBiquadFilter) {
          filter = context.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = settings.cutoff;
          filter.Q.value = 0.6;
        }
      } else gain.gain.value = settings.gain;
      source.connect(filter ?? gain);
      if (filter) filter.connect(gain);
      gain.connect(master);
      voice = { source, filter, gain, kind };
      source.onended = () => {
        active.delete(voice);
        source.disconnect();
        filter?.disconnect();
        gain.disconnect();
      };
      active.add(voice);
      if (kind === 'wheel') source.start(context.currentTime, settings.offset, duration);
      else source.start();
      lastPlayed.set(kind, time);
      return true;
    } catch {
      if (voice) {
        active.delete(voice);
        voice.source.onended = null;
        try { voice.source.disconnect(); voice.filter?.disconnect(); voice.gain.disconnect(); } catch { /* Optional audio. */ }
      }
      return false; // Sound must never interrupt a move.
    }
  }

  function turn(travelDegrees = SETTINGS.wheel.travel) {
    if (!Number.isFinite(travelDegrees) || travelDegrees === 0) return;
    if (!enabled || !unlocked || context?.state !== 'running' || !buffers.has('wheel')) {
      rotationTravel = 0;
      firstRotationMovement = true;
      return;
    }
    const time = now();
    if (time - (lastPlayed.get('detent') ?? -Infinity) < SETTINGS.detent.interval) {
      rotationTravel = 0;
      return;
    }
    // The first actual movement confirms a new gesture, including a short step.
    // Following bursts require twelve degrees of travel in either direction.
    // Saturation prevents fast/coalesced motion from creating a sound backlog.
    rotationTravel = firstRotationMovement ? SETTINGS.wheel.travel
      : Math.min(SETTINGS.wheel.travel, rotationTravel + Math.abs(travelDegrees));
    firstRotationMovement = false;
    if (rotationTravel + 1e-9 < SETTINGS.wheel.travel
      || time - (lastPlayed.get('wheel') ?? -Infinity) < SETTINGS.wheel.interval) return;
    rotationTravel = 0;
    play('wheel');
  }

  return {
    get available() { return available; },
    get enabled() { return enabled; },
    get ready() { return enabled && unlocked && context?.state === 'running' && buffers.size === Object.keys(SOUND_ASSETS).length; },
    unlock() { return activate(); },
    async confirmEnabled() {
      const warming = activate(true);
      const attemptGeneration = generation;
      const audioContext = context;
      await warming;
      // This is confirmation of an explicit unmute, never a queued game event.
      // Another successful gesture may resume this same context while we wait.
      if (generation !== attemptGeneration || context !== audioContext) return false;
      return play('detent');
    },
    setEnabled(value) {
      enabled = available && Boolean(value);
      if (!enabled) { unlocked = false; stop(); }
    },
    turn,
    resetTurn() { rotationTravel = 0; firstRotationMovement = true; },
    detent() { rotationTravel = 0; play('detent'); },
    slide() { play('slide'); },
    drop() { play('drop'); },
    stop() { unlocked = false; stop(); },
  };
}
