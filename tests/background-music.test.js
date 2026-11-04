import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackgroundMusic, normalizeMusicVolume } from '../src/background-music.js';

function harness(options = {}) {
  const started = [];
  const elements = [];
  const gains = [];
  const attempts = [];
  class Audio extends EventTarget {
    paused = true;
    volume = 1;
    ended = false;
    constructor() {
      super();
      elements.push(this);
    }
    set src(url) {
      this.track = url.split('/').at(-1);
      this.ended = false;
      this.error = null;
    }
    play() {
      attempts.push(this.track);
      if (options.tryPlay) return options.tryPlay(this);
      this.paused = false;
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
    finish() {
      this.ended = true;
      this.paused = true;
      this.dispatchEvent(new Event('ended'));
    }
    fail() {
      this.error = { code: 2 };
      this.paused = true;
      this.dispatchEvent(new Event('error'));
    }
  }
  class AudioContext {
    state = 'suspended';
    resume() {
      this.state = 'running';
      return Promise.resolve();
    }
    createGain() {
      const gain = { gain: { value: 1 }, connect() {} };
      gains.push(gain.gain);
      return gain;
    }
    createMediaElementSource() {
      return { connect() {} };
    }
  }
  const music = createBackgroundMusic({ Audio, AudioContext, onTrackChange: track => started.push(track),
    random: () => 0, ...options });
  return { music, started, elements, gains, attempts };
}

test('draws a different track on completion and excludes the previously stored track at startup', async () => {
  const previous = 'five-wheel-motif-6m00s.mp3';
  const { music, elements, started } = harness({ lastTrack: previous });
  music.setActive(true);
  assert.equal(elements.length, 0);

  music.unlock();
  await Promise.resolve();
  assert.equal(started[0], 'five-wheel-motif-6m01s.mp3');
  assert.equal(elements[0].preload, 'none');
  elements[0].finish();
  await Promise.resolve();
  assert.deepEqual(started, ['five-wheel-motif-6m01s.mp3', previous]);
  assert.equal(elements.length, 1);
});

test('sets a quiet music gain and resumes the same position after mute or leaving play', async () => {
  const { music, elements, started, gains } = harness();
  music.unlock();
  assert.equal(elements.length, 0);
  music.setActive(true);
  await Promise.resolve();
  const [audio] = elements;
  assert.equal(gains[0].value, 0.075);
  assert.equal(audio.volume, 1);

  music.setVolume(100);
  assert.equal(gains[0].value, 0.3);
  music.setVolume(0);
  assert.equal(audio.paused, true);
  music.setVolume(50);
  assert.equal(gains[0].value, 0.15);
  assert.equal(audio.paused, false);
  music.setEnabled(false);
  assert.equal(audio.paused, true);
  music.setActive(false);
  music.setEnabled(true);
  assert.equal(audio.paused, true);
  music.setActive(true);
  assert.equal(audio.paused, false);
  await Promise.resolve();
  assert.equal(started.length, 1);
});

test('retries a refused autoplay on the next gesture and skips an unavailable track', async () => {
  let denied = true;
  const { music, started, elements, attempts } = harness({ tryPlay(audio) {
    if (denied) {
      denied = false;
      return Promise.reject(new DOMException('Gesture needed', 'NotAllowedError'));
    }
    audio.paused = false;
    return Promise.resolve();
  } });
  music.setActive(true);
  music.unlock();
  await Promise.resolve();
  assert.equal(started.length, 0);
  music.unlock();
  await Promise.resolve();
  assert.equal(started.length, 1);
  assert.equal(attempts[0], attempts[1]);
  elements[0].fail();
  await Promise.resolve();
  assert.notEqual(started[1], started[0]);
});

test('an old play promise cannot record a new track after playback is paused', async () => {
  let resolvePlay;
  const { music, started, elements } = harness({ tryPlay(audio) {
    audio.paused = false;
    return new Promise(resolve => { resolvePlay = resolve; });
  } });
  music.setActive(true);
  music.unlock();
  music.setActive(false);
  resolvePlay();
  await Promise.resolve();
  assert.equal(elements[0].paused, true);
  assert.equal(started.length, 0);
});

test('normalizes stored volume values', () => {
  assert.equal(normalizeMusicVolume(null), 25);
  assert.equal(normalizeMusicVolume('invalid'), 25);
  assert.equal(normalizeMusicVolume('90.5'), 91);
  assert.equal(normalizeMusicVolume(-1), 0);
  assert.equal(normalizeMusicVolume(110), 100);
});
