export const MUSIC_ENABLED_KEY = 'ddc-music-enabled';
export const MUSIC_VOLUME_KEY = 'ddc-music-volume';
export const LAST_MUSIC_TRACK_KEY = 'ddc-last-music-track';
export const DEFAULT_MUSIC_VOLUME = 25;

const TRACKS = [
  'five-wheel-motif-6m00s.mp3',
  'five-wheel-motif-6m01s.mp3',
  'five-wheel-motif-6m02s.mp3',
  'five-wheel-motif-6m03s.mp3',
  'five-wheel-motif-6m05s.mp3',
  'five-wheel-motif-6m32s.mp3',
  'two-player-victory.mp3',
];
const MAX_GAIN = 0.3;

export function normalizeMusicVolume(value) {
  if (value == null || value === '') return DEFAULT_MUSIC_VOLUME;
  const volume = Number(value);
  return Number.isFinite(volume) ? Math.round(Math.max(0, Math.min(100, volume))) : DEFAULT_MUSIC_VOLUME;
}

export function createBackgroundMusic(options = {}) {
  const AudioClass = options.Audio ?? globalThis.Audio;
  const AudioContextClass = options.AudioContext ?? globalThis.AudioContext ?? globalThis.webkitAudioContext;
  const random = options.random ?? Math.random;
  let enabled = options.enabled ?? true;
  let volume = normalizeMusicVolume(options.volume);
  let lastTrack = options.lastTrack;
  let active = false;
  let interacted = false;
  let audio = null;
  let context = null;
  let gain = null;
  let currentTrack = null;
  let pending = null;
  const unavailable = new Set();

  function applyVolume() {
    const level = volume * MAX_GAIN / 100;
    // Mobile Safari may leave HTMLMediaElement.volume at 1.
    if (gain) gain.gain.value = level;
    else if (audio) audio.volume = level;
  }

  function pause() {
    pending = null;
    audio?.pause();
  }

  function advance() {
    pause();
    currentTrack = null;
    play();
  }

  function skipUnavailable() {
    if (!currentTrack) return;
    unavailable.add(currentTrack);
    advance();
  }

  function prepareAudio() {
    audio = new AudioClass();
    audio.preload = 'none';
    // Reuse the same element when the source changes so the browser can
    // carry the user's playback permission forward to the following tracks.
    audio.addEventListener('ended', () => {
      if (audio.ended && currentTrack) advance();
    });
    audio.addEventListener('error', () => {
      if (audio.error && audio.error.code !== 1) skipUnavailable();
    });
    if (AudioContextClass) {
      let routing;
      try {
        routing = new AudioContextClass();
        const master = routing.createGain();
        master.connect(routing.destination);
        routing.createMediaElementSource(audio).connect(master);
        context = routing;
        gain = master;
      } catch {
        try { routing?.close()?.catch(() => {}); } catch { /* Native volume fallback. */ }
      }
    }
    applyVolume();
  }

  function resumeContext() {
    if (!context || context.state === 'running') return;
    try { context.resume()?.catch(() => {}); } catch { /* Retry on a later gesture. */ }
  }

  function play() {
    if (!interacted || !active || !enabled || volume === 0 || !AudioClass) return;
    if (!audio) {
      try { prepareAudio(); }
      catch { audio = null; return; }
    }
    resumeContext();
    if (audio.ended && currentTrack) {
      pause();
      currentTrack = null;
    }
    if (pending || !audio.paused) return;
    if (!currentTrack) {
      const candidates = TRACKS.filter(track => track !== lastTrack && !unavailable.has(track));
      if (!candidates.length) return;
      currentTrack = candidates[Math.floor(random() * candidates.length)];
      audio.src = new URL(`../assets/audio/music/${currentTrack}`, import.meta.url).href;
    }

    const attempt = {};
    pending = attempt;
    const failed = error => {
      if (pending !== attempt) return;
      pending = null;
      if (error?.name === 'NotSupportedError') skipUnavailable();
    };
    // Start both the media element and its audio context within the gesture.
    try {
      Promise.resolve(audio.play()).then(() => {
        if (pending !== attempt) return;
        pending = null;
        if (lastTrack === currentTrack) return;
        lastTrack = currentTrack;
        options.onTrackChange?.(lastTrack);
      }, failed);
    } catch (error) {
      failed(error);
    }
  }

  return {
    setActive(next) {
      if (active === next) return;
      active = next;
      if (active) {
        unavailable.clear();
        play();
      } else pause();
    },
    setEnabled(next) {
      if (enabled === next) return;
      enabled = next;
      if (enabled) {
        unavailable.clear();
        play();
      } else pause();
    },
    setVolume(next) {
      volume = normalizeMusicVolume(next);
      applyVolume();
      if (volume > 0) play();
      else pause();
    },
    unlock() {
      interacted = true;
      play();
    },
  };
}
