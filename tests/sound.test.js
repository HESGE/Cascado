import test from 'node:test';
import assert from 'node:assert/strict';
import { createSoundPlayer, SOUND_ASSETS, SOUND_AVAILABLE } from '../src/sound.js';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

// Fake Web Audio nodes retain their lifecycle so a mask can be checked for
// lingering sources. No browser, external dependency or real audio is needed.
function harness(options = {}) {
  const state = { time: 0, contexts: [], sources: [], gains: [], requests: [] };
  class FakeAudioContext {
    constructor() {
      if (options.constructorError) throw new Error('Audio unavailable');
      this.state = 'suspended';
      this.destination = {};
      state.contexts.push(this);
    }
    async resume() {
      if (options.resumeError) throw new Error('Gesture blocked');
      if (options.resumeGate) await options.resumeGate.promise;
      this.state = 'running';
    }
    createGain() {
      const gain = {
        gain: { value: 0 },
        connected: false,
        connect() { this.connected = true; },
        disconnect() { this.connected = false; },
      };
      state.gains.push(gain);
      return gain;
    }
    createBufferSource() {
      const source = {
        started: false, stopped: false, connected: false, playbackRate: {value: 1},
        connect() { this.connected = true; },
        disconnect() { this.connected = false; },
        start() { this.started = true; },
        stop() { this.stopped = true; },
        finish() { this.onended?.(); },
      };
      state.sources.push(source);
      return source;
    }
    async decodeAudioData() {
      if (options.decoderError) throw new Error('Decoder unavailable');
      return { duration: 0.3 };
    }
  }
  const player = createSoundPlayer({
    // The browser layer is injected so lifecycle and playback stay deterministic.
    ...(!options.production ? { available: true } : {}),
    ...(options.enabled !== undefined ? { enabled: options.enabled } : {}),
    AudioContext: FakeAudioContext,
    now: () => state.time,
    fetch: async url => {
      state.requests.push(url);
      if (options.fetchGate) await options.fetchGate.promise;
      if (options.fetchError) throw new Error('Offline');
      return { ok: !options.httpError, arrayBuffer: async () => new ArrayBuffer(8) };
    },
  });
  return { player, state };
}

test('audio : les sons sont disponibles et actifs par défaut, la sourdine reste volontaire', async () => {
  assert.equal(SOUND_AVAILABLE, true);
  const {player,state} = harness({production:true});
  assert.equal(player.available,true);
  assert.equal(player.enabled,true);
  player.detent();
  assert.equal(state.sources.length,0,'pas de son avant un geste autorisé');
  await player.unlock();
  player.detent();
  assert.equal(state.sources.length,1);
  const muted = harness({production:true,enabled:false});
  await muted.player.unlock();
  muted.player.turn(); muted.player.detent(); muted.player.slide(); muted.player.drop();
  assert.equal(muted.state.sources.length,0);
  assert.equal(muted.state.contexts.length,0);
});

test('audio : seul un geste explicite active les clips locaux, chargés une fois', async () => {
  const { player, state } = harness();
  player.turn(); player.slide(); player.drop();
  assert.equal(state.contexts.length, 0);
  assert.equal(state.requests.length, 0);
  assert.equal(state.sources.length, 0);
  await player.unlock();
  assert.equal(state.contexts.length, 1);
  assert.deepEqual(state.requests.sort(), [...new Set(Object.values(SOUND_ASSETS))].sort());
  player.turn();
  assert.equal(state.sources.filter(source => source.started).length, 1);
  await player.unlock();
  assert.equal(state.requests.length, 3);
  assert.equal(state.sources.length, 1, 'unlock ne rejoue aucun événement');
});

test('audio : les crans rapides sont limités sans supprimer glissement et contact', async () => {
  const { player, state } = harness();
  await player.unlock();
  player.turn();
  state.time = 30; player.turn();
  assert.equal(state.sources.length, 1);
  state.time = 100; player.turn();
  assert.equal(state.sources.length, 2);
  player.slide(); player.drop();
  assert.equal(state.sources.length, 4, 'les trois familles restent indépendantes');
  state.sources.forEach(source => source.finish());
  assert.equal(state.sources.every(source => !source.connected), true);
  assert.equal(state.gains.slice(1).every(gain => !gain.connected), true);
});

test('audio : le masque coupe toutes les voix et exige un nouveau geste', async () => {
  const { player, state } = harness();
  await player.unlock();
  player.turn(); player.slide(); player.drop(); player.detent();
  player.stop();
  assert.equal(state.sources.every(source => source.stopped && !source.connected), true);
  assert.equal(state.gains.slice(1).every(gain => !gain.connected), true);
  assert.equal(state.sources.every(source => source.onended === null), true);
  state.time = 500; player.turn(); player.slide(); player.drop();
  assert.equal(state.sources.length, 4);
  await player.unlock();
  assert.equal(state.sources.length, 4, 'aucun son du masque ne reste dans une file');
  player.turn();
  assert.equal(state.sources.length, 5);
});

test('audio : couper le son arrête immédiatement les clips, réactiver ne les rejoue pas', async () => {
  const { player, state } = harness();
  await player.unlock(); player.drop();
  player.setEnabled(false);
  assert.equal(player.enabled, false);
  assert.equal(state.sources[0].stopped, true);
  await player.unlock(); player.turn();
  assert.equal(state.sources.length, 1);
  player.setEnabled(true);
  assert.equal(player.enabled, true);
  state.time = 200; player.drop();
  assert.equal(state.sources.length, 1);
  await player.unlock(); player.drop();
  assert.equal(state.sources.length, 2);
});

test('audio : un téléchargement terminé après le masque ne lance aucun son tardif', async () => {
  const fetchGate = deferred();
  const { player, state } = harness({ fetchGate });
  const pending = player.unlock();
  await Promise.resolve();
  player.turn(); player.slide(); player.drop();
  player.stop();
  fetchGate.resolve();
  await pending;
  player.turn(); player.slide(); player.drop();
  assert.equal(state.sources.length, 0);
  await player.unlock();
  assert.equal(state.sources.length, 0, 'les appels pendant chargement sont abandonnés');
  player.drop();
  assert.equal(state.sources.length, 1);
});

test('audio : une activation navigateur en attente ne traverse pas le masque', async () => {
  const resumeGate = deferred();
  const { player, state } = harness({ resumeGate });
  const pending = player.unlock();
  player.stop();
  resumeGate.resolve();
  await pending;
  player.turn(); player.drop();
  assert.equal(state.sources.length, 0);
  await player.unlock(); player.turn();
  assert.equal(state.sources.length, 1);
});

test('audio : refus navigateur, hors ligne, HTTP et décodage restent non bloquants', async () => {
  for (const options of [
    { constructorError: true }, { resumeError: true }, { fetchError: true },
    { httpError: true }, { decoderError: true },
  ]) {
    const { player, state } = harness(options);
    await assert.doesNotReject(() => player.unlock());
    assert.doesNotThrow(() => { player.turn(); player.slide(); player.drop(); player.stop(); });
    assert.equal(state.sources.length, 0);
  }
});

test('audio : la polyphonie est bornée et les sons écartés ne sont jamais différés', async () => {
  const { player, state } = harness();
  await player.unlock();
  for (let index = 0; index < 8; index++) {
    state.time += 100;
    player.drop();
  }
  assert.equal(state.sources.length, 5);
  state.sources[0].finish();
  assert.equal(state.sources.length, 5, 'libérer une voix ne lance pas un son écarté');
  state.time += 100; player.drop();
  assert.equal(state.sources.length, 6);
});

test('audio : le cran est plus net que la rotation, partage le clip local et ne se répète pas à chaque image', async () => {
  const {player,state} = harness();
  await player.unlock();
  player.turn(); player.detent();
  assert.equal(state.sources.length,2);
  assert.equal(state.sources[0].buffer,state.sources[1].buffer);
  assert.equal(state.sources[1].playbackRate.value,.82);
  assert.ok(state.gains[2].gain.value > state.gains[1].gain.value * 2);
  assert.equal(state.requests.length,3,'le clip commun est téléchargé une fois');
  state.time=50; player.detent();
  state.time=139; player.detent();
  assert.equal(state.sources.length,2);
  state.time=140; player.detent();
  assert.equal(state.sources.length,3);
  player.setEnabled(false);
  assert.equal(state.sources.every(source=>source.stopped),true);
});

test('audio : un cran reste prioritaire à la limite des voix, sans lecture différée', async () => {
  const {player,state} = harness();
  await player.unlock();
  for(let i=0;i<5;i++) { state.time+=100; player.turn(); }
  player.detent();
  assert.equal(state.sources.length,6);
  assert.equal(state.sources[0].stopped,true);
  assert.equal(state.sources.filter(source=>!source.stopped).length,5);
  player.stop();
  state.time+=500; player.detent();
  assert.equal(state.sources.length,6);
});
