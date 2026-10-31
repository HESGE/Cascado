import test from 'node:test';
import assert from 'node:assert/strict';
import { createSoundPlayer, SOUND_ASSETS, SOUND_AVAILABLE } from '../src/sound.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

// Fake Web Audio nodes retain their lifecycle so a mask can be checked for
// lingering sources. No browser, external dependency or real audio is needed.
function harness(options = {}) {
  const state = { time: 0, contexts: [], sources: [], gains: [], filters: [], requests: [], resumeStates: [], warmups: [], warmupGains: [], events: [], decoded: [], decoding: [] };
  class FakeAudioContext {
    constructor() {
      if (options.constructorError) throw new Error('Audio unavailable');
      this.state = 'suspended';
      this.currentTime = 1;
      this.sampleRate = 48000;
      this.sessionAtConstruction = options.audioSession?.type;
      this.destination = {};
      state.events.push('construct');
      state.contexts.push(this);
    }
    async resume() {
      state.events.push('resume');
      state.resumeStates.push(this.state);
      if (options.resumeError) throw new Error('Gesture blocked');
      if (options.resumeGate) await options.resumeGate.promise;
      this.state = 'running';
    }
    async close() {
      this.state = 'closed';
      this.closed = true;
    }
    createBuffer(channels, length, sampleRate) {
      if (options.primeError) throw new Error('Prime unavailable');
      const samples = new Float32Array(length);
      return { length, numberOfChannels: channels, sampleRate, duration: length / sampleRate, getChannelData: () => samples };
    }
    createGain() {
      const audioContext = this;
      const automation = [];
      const gain = {
        gain: {
          value: 0,
          automation,
          setValueAtTime(value, time) { automation.push({ ramp: false, value, time }); },
          linearRampToValueAtTime(value, time) { automation.push({ ramp: true, value, time }); },
        },
        connected: false,
        connect(target) {
          this.connected = true; this.target = target;
          (target === audioContext.destination && this.gain.value === 0 ? state.warmupGains : state.gains).push(this);
        },
        disconnect() { this.connected = false; },
      };
      return gain;
    }
    createBiquadFilter() {
      const filter = {
        frequency: { value: 0 }, Q: { value: 0 }, connected: false,
        connect(target) { this.connected = true; this.target = target; },
        disconnect() { this.connected = false; },
      };
      state.filters.push(filter);
      return filter;
    }
    createBufferSource() {
      const source = {
        context: this,
        started: false, stopped: false, connected: false, playbackRate: {value: 1},
        connect(target) { this.connected = true; this.target = target; },
        disconnect() { this.connected = false; },
        start(...args) {
          const prime = this.buffer?.length === 1;
          state.events.push(prime ? 'prime-start' : 'effect-start');
          if (!prime && options.startError) throw new Error('Source start refused');
          this.started = true; this.startArgs = args;
          (prime ? state.warmups : state.sources).push(this);
        },
        stop() { this.stopped = true; },
        finish() { this.onended?.(); },
      };
      return source;
    }
    async decodeAudioData() {
      state.decoding.push(this);
      const gate = options.decodeGate;
      if (gate) await gate.promise;
      if (options.decoderError) throw new Error('Decoder unavailable');
      const buffer = { duration: 0.3, decodedIn: this };
      state.decoded.push(buffer);
      return buffer;
    }
  }
  const player = createSoundPlayer({
    // The browser layer is injected so lifecycle and playback stay deterministic.
    ...(!options.production ? { available: true } : {}),
    ...(options.enabled !== undefined ? { enabled: options.enabled } : {}),
    ...(options.audioSession !== undefined ? { audioSession: options.audioSession } : {}),
    AudioContext: FakeAudioContext,
    now: () => state.time,
    fetch: async url => {
      state.events.push('fetch');
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
  state.time = 150; player.turn();
  assert.equal(state.sources.length, 2);
  player.slide(); player.drop();
  assert.equal(state.sources.length, 4, 'les trois familles restent indépendantes');
  state.sources.forEach(source => source.finish());
  assert.equal(state.sources.every(source => !source.connected), true);
  assert.equal(state.gains.slice(1).every(gain => !gain.connected), true);
});

test('audio : la rotation plafonne ses frottements à 90 ms et laisse respirer le clic d’alignement', async () => {
  const { player, state } = harness();
  await player.unlock();
  player.turn();
  state.time = 89; player.turn();
  assert.equal(state.sources.length, 1, 'pas de crépitement entre deux frottements de rotation');
  state.time = 90; player.turn();
  assert.equal(state.sources.length, 2);
  state.time = 100; player.detent();
  assert.equal(state.sources.length, 3, 'un alignement reste prioritaire sur la rotation');
  state.time = 239; player.turn();
  assert.equal(state.sources.length, 3, 'le clic fort garde un court silence après lui');
  state.time = 240; player.turn();
  assert.equal(state.sources.length, 4);
});

test('audio : le premier mouvement sonne puis chaque course de douze degrés, même en inversant', async () => {
  const { player, state } = harness();
  await player.unlock();
  player.resetTurn();
  assert.equal(state.sources.length, 0, 'le simple contact ne joue aucun son');
  player.turn(1);
  assert.equal(state.sources.length, 1, 'un premier petit mouvement reste audible');
  for (let degree = 1; degree <= 11; degree++) {
    state.time = degree * 30;
    player.turn(1);
  }
  assert.equal(state.sources.length, 1, 'le temps écoulé seul ne remplace pas la course angulaire');
  state.time = 360; player.turn(1);
  assert.equal(state.sources.length, 2);
  state.time = 500; player.turn(6);
  state.time = 600; player.turn(-6);
  assert.equal(state.sources.length, 3, 'aller puis revenir compte douze degrés et non zéro');
});

test('audio : une vitesse réellement plus élevée rapproche les frottements sans dépasser le plafond', async () => {
  async function movingAt(speed) {
    const { player, state } = harness();
    const heard = [];
    await player.unlock();
    player.resetTurn();
    for (let frame = 1; frame <= 100; frame++) {
      state.time = frame * 20;
      const before = state.sources.length;
      player.turn(speed * .02);
      if (state.sources.length !== before) {
        heard.push(state.time);
        state.sources.at(-1).finish();
      }
    }
    return heard;
  }
  const slow = await movingAt(30);
  const normal = await movingAt(90);
  const fast = await movingAt(180);
  assert.ok(slow.length < normal.length && normal.length < fast.length);
  assert.equal(slow[1] - slow[0], 400, '30 degrés par seconde : douze degrés en 400 ms');
  assert.equal(normal[1] - normal[0], 140, '90 degrés par seconde : arrondi à la prochaine image');
  assert.equal(fast[1] - fast[0], 100, '180 degrés par seconde : plafond temporel et arrondi à l’image');
  for (const times of [slow, normal, fast]) {
    assert.ok(times.slice(1).every((time, index) => time - times[index] >= 90));
  }
});

test('audio : une image coalescée ou un énorme déplacement ne crée jamais une rafale à rattraper', async () => {
  const { player, state } = harness();
  await player.unlock();
  player.turn(1);
  state.time = 100;
  player.turn(1e300);
  assert.equal(state.sources.length, 2, 'au plus un frottement par mouvement appliqué');
  state.time = 1000;
  assert.equal(state.sources.length, 2, 'aucun son pendant l’immobilité');
  player.turn(1);
  assert.equal(state.sources.length, 2, 'l’excès du déplacement précédent a été jeté');
  state.time = 1100; player.turn(11);
  assert.equal(state.sources.length, 3);
});

test('audio : resetTurn oublie la course sans arrêter les chutes ni contourner les 90 ms', async () => {
  const { player, state } = harness();
  await player.unlock();
  player.drop(); player.turn(1);
  state.time = 20;
  player.resetTurn();
  assert.equal(state.sources.length, 2);
  assert.equal(state.sources.every(source => !source.stopped), true);
  player.turn(1);
  assert.equal(state.sources.length, 2, 'un nouveau geste ne contourne pas le plafond commun');
  state.time = 90;
  player.turn(1);
  assert.equal(state.sources.length, 3, 'le mouvement en cours peut reprendre au plafond sans attendre un autre cran entier');
  state.time = 110; player.turn(11);
  player.resetTurn();
  state.time = 200;
  assert.equal(state.sources.length, 3, 'un relâchement ne déclenche aucun son');
  player.turn(1);
  assert.equal(state.sources.length, 4, 'seul le premier mouvement du nouveau geste confirme la reprise');
  state.time = 400; player.turn(1);
  assert.equal(state.sources.length, 4, 'la course du geste précédent ne traverse pas le reset');
});

test('audio : la priorité d’alignement jette toute course parcourue dans sa pause de 140 ms', async () => {
  const { player, state } = harness();
  await player.unlock();
  player.turn(1);
  state.time = 100; player.turn(11);
  player.detent();
  state.time = 200; player.turn(1e300);
  assert.equal(state.sources.length, 2);
  state.time = 240; player.turn(1);
  assert.equal(state.sources.length, 2, 'ni le reliquat avant alignement ni le mouvement supprimé ne sont rejoués');
  state.time = 260; player.turn(11);
  assert.equal(state.sources.length, 3, 'douze nouveaux degrés permettent le prochain frottement');
});

test('audio : les valeurs invalides et immobiles ne comptent pas dans la course angulaire', async () => {
  const { player, state } = harness();
  await player.unlock();
  for (const value of [NaN, Infinity, -Infinity, '12', null, 0, true, {}, []]) player.turn(value);
  assert.equal(state.sources.length, 0);
  player.turn(1);
  state.time = 200;
  player.turn(11);
  for (const value of [NaN, Infinity, -Infinity, '12', null, 0, true, {}, []]) player.turn(value);
  assert.equal(state.sources.length, 1);
  player.turn(-1);
  assert.equal(state.sources.length, 2, 'les appels invalides n’ajoutent ni ne rejouent de distance');
});

test('audio : masque et sourdine effacent la phase angulaire avant une vraie reprise', async () => {
  for (const interruption of ['mask', 'mute']) {
    const { player, state } = harness();
    await player.unlock();
    player.turn(1);
    state.time = 100; player.turn(11);
    if (interruption === 'mask') player.stop();
    else player.setEnabled(false);
    state.time = 300;
    player.turn(1e300);
    assert.equal(state.sources.length, 1);
    player.setEnabled(true);
    await player.unlock();
    assert.equal(state.sources.length, 1, 'réactiver ne rejoue aucune rotation');
    player.turn(1);
    assert.equal(state.sources.length, 2, 'la reprise confirme uniquement son premier mouvement réel');
    state.time = 500; player.turn(1);
    assert.equal(state.sources.length, 2, 'les degrés précédant le masque sont oubliés');
  }
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

test('audio : la rotation est un court frottement filtré avec fondus, distinct du clic net d’alignement', async () => {
  const {player,state} = harness();
  await player.unlock();
  player.turn(); player.detent();
  assert.equal(state.sources.length,2);
  assert.notEqual(state.sources[0].buffer,state.sources[1].buffer, 'la rotation ne recycle plus le clic d’alignement');
  assert.equal(state.sources[1].playbackRate.value,.82);
  const friction = state.sources[0];
  const filter = state.filters[0];
  const envelope = state.gains[1].gain.automation;
  assert.equal(state.filters.length,1, 'le clic net conserve son signal sans filtre');
  assert.equal(friction.target,filter);
  assert.equal(filter.target,state.gains[1]);
  assert.equal(filter.type,'lowpass');
  assert.ok(filter.frequency.value >= 800 && filter.frequency.value <= 2000, 'les aigus secs sont atténués');
  assert.equal(friction.playbackRate.value,1, 'la distinction ne repose pas sur un simple changement de hauteur');
  assert.equal(friction.startArgs[0],friction.context.currentTime, 'le frottement commence immédiatement');
  assert.ok(friction.startArgs[1] >= .1, 'le départ exclut l’impact initial de slide.wav');
  assert.ok(friction.startArgs[2] <= .12, 'un bref fragment remplace le glissement entier');
  assert.equal(envelope[0].value,0);
  assert.equal(envelope[0].time,friction.startArgs[0]);
  assert.equal(envelope[1].ramp,true);
  assert.ok(envelope[1].time > envelope[0].time, 'l’attaque est adoucie');
  assert.equal(envelope.at(-1).value,0);
  assert.equal(envelope.at(-1).ramp,true);
  assert.equal(envelope.at(-1).time,friction.startArgs[0]+friction.startArgs[2]);
  assert.ok(state.gains[2].gain.value > Math.max(...envelope.map(point=>point.value)), 'le bruit de fond reste moins amplifié que le clic net');
  assert.deepEqual(state.sources[1].startArgs,[], 'l’alignement garde le clip entier');
  assert.equal(state.requests.length,3,'la rotation réutilise le clip de glissement déjà local');
  state.time=50; player.detent();
  state.time=139; player.detent();
  assert.equal(state.sources.length,2);
  state.time=140; player.detent();
  assert.equal(state.sources.length,3);
  player.setEnabled(false);
  assert.equal(state.sources.every(source=>source.stopped),true);
  assert.equal(state.filters.every(filter=>!filter.connected),true);
});

test('audio : les glissements et les chutes conservent leurs clips complets et leur volume', async () => {
  const { player, state } = harness();
  await player.unlock();
  player.slide(); player.drop();
  assert.deepEqual(state.sources.map(source=>source.startArgs),[[],[]]);
  assert.deepEqual(state.sources.map(source=>source.playbackRate.value),[1,1]);
  assert.deepEqual(state.gains.slice(1).map(gain=>gain.gain.value),[.55,.85]);
  assert.equal(state.filters.length,0);
  assert.notEqual(state.sources[0].buffer,state.sources[1].buffer);
});

test('audio : un cran reste prioritaire à la limite des voix, sans lecture différée', async () => {
  const {player,state} = harness();
  await player.unlock();
  for(let i=0;i<5;i++) { state.time+=150; player.turn(); }
  player.detent();
  assert.equal(state.sources.length,6);
  assert.equal(state.sources[0].stopped,true);
  assert.equal(state.filters[0].connected,false, 'l’alignement libère aussi le filtre de la rotation évincée');
  assert.equal(state.sources.filter(source=>!source.stopped).length,5);
  player.stop();
  state.time+=500; player.detent();
  assert.equal(state.sources.length,6);
});

test('audio : un contexte interrompu reprend au prochain geste sans recharger les clips', async () => {
  const { player, state } = harness();
  await player.unlock();
  player.turn();
  const context = state.contexts[0];
  context.state = 'interrupted';
  state.time = 200;
  player.drop();
  assert.equal(state.sources.length, 1, 'aucune lecture pendant une interruption iPhone');
  await player.unlock();
  player.drop();
  assert.deepEqual(state.resumeStates, ['suspended', 'interrupted']);
  assert.equal(state.contexts.length, 1);
  assert.equal(state.requests.length, 3);
  assert.equal(state.sources.length, 2);
  assert.equal(state.sources[1].context, context);
});

test('audio : un contexte fermé est remplacé et ses anciennes voix sont libérées', async () => {
  const { player, state } = harness();
  await player.unlock();
  player.turn();
  const original = state.contexts[0];
  original.state = 'closed';
  await player.unlock();
  assert.equal(state.contexts.length, 2);
  assert.equal(state.sources[0].stopped, true);
  assert.equal(state.sources[0].connected, false);
  assert.equal(state.sources[0].onended, null);
  player.drop();
  assert.equal(state.sources.length, 2);
  assert.equal(state.sources[1].context, state.contexts[1]);
  assert.equal(state.requests.length, 3, 'les buffers décodés restent utilisables dans le nouveau contexte');
});

test('audio : un premier échec HTTP ou décodage peut être récupéré au geste suivant', async () => {
  for (const failure of ['httpError', 'decoderError']) {
    const options = { [failure]: true };
    const { player, state } = harness(options);
    await player.unlock();
    player.turn(); player.drop();
    assert.equal(state.sources.length, 0, `${failure} reste silencieux`);
    assert.equal(state.requests.length, 3);
    options[failure] = false;
    await player.unlock();
    assert.equal(state.sources.length, 0, 'une récupération ne rejoue pas les événements perdus');
    player.turn(); player.detent(); player.slide(); player.drop();
    assert.equal(state.sources.length, 4, `${failure} récupère toutes les familles`);
    assert.equal(state.requests.length, 6);
    await player.unlock();
    assert.equal(state.requests.length, 6, 'aucun nouveau chargement une fois les clips disponibles');
    assert.equal(state.contexts.length, 1);
  }
});

test('audio : la session média retrouve sa catégorie au masque et à la mise en sourdine', async () => {
  const audioSession = { type: 'ambient' };
  const { player, state } = harness({ audioSession });
  await player.unlock();
  assert.equal(audioSession.type, 'playback');
  await player.unlock();
  player.stop();
  assert.equal(audioSession.type, 'ambient', 'deux gestes ne remplacent pas la catégorie initiale par playback');
  await player.unlock();
  assert.equal(audioSession.type, 'playback');
  player.drop();
  player.setEnabled(false);
  assert.equal(audioSession.type, 'ambient');
  assert.equal(state.sources[0].stopped, true);
  await player.unlock();
  assert.equal(audioSession.type, 'ambient', 'un geste ne réclame pas la session quand le son est coupé');
  player.setEnabled(true);
  await player.unlock();
  assert.equal(audioSession.type, 'playback');
  player.stop();
  assert.equal(audioSession.type, 'ambient');
});

test('audio : un refus de la catégorie média laisse fonctionner Web Audio', async () => {
  let attempts = 0;
  const audioSession = {
    get type() { return 'auto'; },
    set type(value) { attempts++; throw new Error(`Unsupported session: ${value}`); },
  };
  const { player, state } = harness({ audioSession });
  await assert.doesNotReject(() => player.unlock());
  player.drop();
  assert.equal(state.sources.length, 1);
  assert.ok(attempts > 0);
  assert.doesNotThrow(() => player.stop());
  assert.equal(state.sources[0].stopped, true);
  assert.equal(audioSession.type, 'auto');
});

test('audio : activer explicitement le son joue un seul cran de confirmation', async () => {
  const { player, state } = harness({ enabled: false });
  assert.equal(await player.confirmEnabled(), false);
  assert.equal(state.contexts.length, 0, 'la confirmation ne réactive pas une préférence muette');
  player.setEnabled(true);
  assert.equal(await player.confirmEnabled(), true);
  assert.equal(state.sources.length, 1);
  assert.equal(state.sources[0].started, true);
  assert.equal(state.sources[0].playbackRate.value, .82);
  assert.equal(state.requests.length, 3);
});

test('audio : une confirmation en attente ne sonne jamais après masque ou sourdine', async () => {
  for (const gateName of ['fetchGate', 'resumeGate']) {
    for (const interruption of ['mask', 'mute']) {
      const gate = deferred();
      const audioSession = { type: 'auto' };
      const { player, state } = harness({ [gateName]: gate, audioSession });
      const pending = player.confirmEnabled();
      await Promise.resolve();
      if (interruption === 'mask') player.stop();
      else player.setEnabled(false);
      gate.resolve();
      assert.equal(await pending, false);
      assert.equal(state.sources.length, 0, `${gateName}/${interruption} ne laisse pas de clic retardé`);
      assert.equal(audioSession.type, 'auto', 'la résolution tardive ne reprend pas la session média');
      player.turn(); player.drop();
      assert.equal(state.sources.length, 0);
      player.setEnabled(true);
      await player.unlock();
      assert.equal(state.sources.length, 0, 'reprendre ne rejoue pas la confirmation annulée');
      player.turn();
      assert.equal(state.sources.length, 1, 'un nouvel événement peut rejouer après un nouveau geste');
      player.stop();
    }
  }
});

test('audio : la catégorie média et l’échantillon muet sont établis avant toute attente', async () => {
  const resumeGate = deferred();
  const fetchGate = deferred();
  const audioSession = { type: 'ambient' };
  const { player, state } = harness({ resumeGate, fetchGate, audioSession });
  const pending = player.unlock();
  assert.equal(state.contexts[0].sessionAtConstruction, 'playback');
  assert.deepEqual(state.events.slice(0, 3), ['construct', 'resume', 'prime-start']);
  assert.equal(state.warmups.length, 1);
  const prime = state.warmups[0];
  assert.equal(prime.started, true);
  assert.deepEqual(prime.startArgs, [0]);
  assert.equal(prime.buffer.length, 1);
  assert.equal(prime.buffer.numberOfChannels, 1);
  assert.equal(prime.buffer.sampleRate, 48000);
  assert.equal(prime.buffer.getChannelData(0)[0], 0);
  assert.equal(prime.target.gain.value, 0);
  assert.equal(prime.target.target, state.contexts[0].destination);
  assert.equal(player.ready, false);
  assert.equal(state.sources.length, 0, 'l’amorce ne compte pas parmi les effets audibles');
  prime.finish();
  assert.equal(prime.connected, false);
  assert.equal(prime.target.connected, false);
  assert.equal(prime.onended, null);
  resumeGate.resolve(); fetchGate.resolve();
  await pending;
  assert.equal(player.ready, true);
  player.detent();
  assert.equal(state.sources.length, 1, 'l’amorce ne consomme pas le quota ou le délai du clic');
});

test('audio : masque et sourdine arrêtent aussi l’amorce silencieuse suspendue', async () => {
  for (const interruption of ['mask', 'mute']) {
    const resumeGate = deferred();
    const { player, state } = harness({ resumeGate });
    const pending = player.unlock();
    const prime = state.warmups[0];
    if (interruption === 'mask') player.stop();
    else player.setEnabled(false);
    assert.equal(prime.stopped, true);
    assert.equal(prime.connected, false);
    assert.equal(prime.target.connected, false);
    assert.equal(prime.onended, null);
    resumeGate.resolve();
    await pending;
    assert.equal(player.ready, false);
    assert.equal(state.sources.length, 0);
  }
});

test('audio : une interruption réamorce le même contexte et nettoie l’ancienne amorce', async () => {
  const { player, state } = harness();
  await player.unlock();
  state.contexts[0].state = 'interrupted';
  await player.unlock();
  assert.equal(state.contexts.length, 1);
  assert.equal(state.warmups.length, 2);
  assert.equal(state.warmups[0].stopped, true);
  assert.equal(state.warmups[0].connected, false);
  assert.equal(state.warmups[1].started, true);
  assert.equal(player.ready, true);
  player.stop();
  assert.equal(state.warmups[1].stopped, true);
});

test('audio : refuser l’amorce de compatibilité ne supprime pas la reprise ordinaire', async () => {
  const { player, state } = harness({ primeError: true });
  await player.unlock();
  assert.equal(player.ready, true);
  player.drop();
  assert.equal(state.sources.length, 1);
});

test('audio : un ancien resume rejeté ne rend pas muette une activation plus récente', async () => {
  for (const maskBetween of [false, true]) {
    const oldResume = deferred();
    const options = { resumeGate: oldResume };
    const { player, state } = harness(options);
    const obsolete = player.unlock();
    if (maskBetween) player.stop();
    options.resumeGate = null;
    await player.unlock();
    assert.equal(player.ready, true);
    player.drop();
    assert.equal(state.sources.length, 1);
    oldResume.reject(new Error('Old gesture rejected late'));
    await obsolete;
    assert.equal(player.ready, true, `le rejet obsolète ne traverse pas ${maskBetween ? 'le masque' : 'la nouvelle tentative'}`);
    state.time = 200;
    player.drop();
    assert.equal(state.sources.length, 2);
  }
});

test('audio : un ancien resume résolu ne réautorise pas une tentative plus récente refusée', async () => {
  for (const maskBetween of [false, true]) {
    const oldResume = deferred();
    const options = { resumeGate: oldResume };
    const { player, state } = harness(options);
    const obsolete = player.unlock();
    if (maskBetween) player.stop();
    options.resumeGate = null;
    options.resumeError = true;
    await player.unlock();
    oldResume.resolve();
    await obsolete;
    assert.equal(state.contexts[0].state, 'running', 'le faux navigateur termine la vieille opération');
    assert.equal(player.ready, false, 'seule la dernière tentative peut autoriser les effets');
    player.drop();
    assert.equal(state.sources.length, 0);
  }
});

test('audio : tester le son recrée même un contexte running et conserve les clips décodés', async () => {
  const { player, state } = harness();
  await player.unlock();
  player.drop();
  const previous = state.contexts[0];
  const confirmation = player.confirmEnabled();
  assert.equal(state.contexts.length, 2, 'la recréation a lieu dans le geste, avant les promesses');
  assert.equal(previous.closed, true);
  assert.equal(state.sources[0].stopped, true);
  assert.equal(await confirmation, true);
  assert.equal(state.sources.length, 2);
  assert.equal(state.sources[1].context, state.contexts[1]);
  assert.equal(state.requests.length, 3, 'les clips déjà disponibles ne sont pas rechargés');
  assert.equal(player.ready, true);
  assert.equal(await player.confirmEnabled(), true, 'un nouvel essai explicite peut confirmer sans ancien throttle');
  assert.equal(state.contexts.length, 3);
  assert.equal(state.sources.length, 3);
});

test('audio : la confirmation survit à un geste de reprise réussi sur le même contexte', async () => {
  const oldResume = deferred();
  const options = { resumeGate: oldResume };
  const { player, state } = harness(options);
  const confirmation = player.confirmEnabled();
  options.resumeGate = null;
  await player.unlock();
  assert.equal(player.ready, true);
  oldResume.resolve();
  assert.equal(await confirmation, true);
  assert.equal(state.sources.length, 1);
  assert.equal(state.contexts.length, 1, 'une reprise banale ne remplace pas le contexte du clic demandé');
});

test('audio : deux tests explicites concurrents ne confirment que le dernier contexte', async () => {
  const oldResume = deferred();
  const options = { resumeGate: oldResume };
  const { player, state } = harness(options);
  const obsolete = player.confirmEnabled();
  options.resumeGate = null;
  assert.equal(await player.confirmEnabled(), true);
  oldResume.reject(new Error('Obsolete context rejected'));
  assert.equal(await obsolete, false);
  assert.equal(player.ready, true);
  assert.equal(state.sources.length, 1);
  assert.equal(state.sources[0].context, state.contexts[1]);
});

test('audio : une confirmation retourne false si le clip, la reprise ou le véritable start échoue', async () => {
  for (const options of [{ httpError: true }, { decoderError: true }, { resumeError: true }, { constructorError: true }, { startError: true }]) {
    const { player, state } = harness(options);
    assert.equal(await player.confirmEnabled(), false);
    assert.equal(state.sources.length, 0);
    if (options.startError) {
      assert.equal(state.gains.slice(1).every(gain => !gain.connected), true, 'une voix refusée est déconnectée');
    }
  }
});

test('audio : un ancien décodage ne remplit pas le cache ni ne termine le chargement du nouveau contexte', async () => {
  const oldDecode = deferred();
  const newDecode = deferred();
  const options = { decodeGate: oldDecode };
  const { player, state } = harness(options);
  const obsolete = player.unlock();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.decoding.length, 3);
  options.decodeGate = newDecode;
  const confirmation = player.confirmEnabled();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.decoding.length, 6);
  assert.equal(state.requests.length, 6);
  oldDecode.resolve();
  await obsolete;
  assert.equal(player.ready, false, 'le décodage de l’ancien contexte ne fournit aucun clip au nouveau');
  assert.equal(state.sources.length, 0);
  const sameContext = player.unlock();
  assert.equal(state.requests.length, 6, 'le finally obsolète ne supprime pas le chargement courant partagé');
  newDecode.resolve();
  await sameContext;
  assert.equal(await confirmation, true);
  assert.equal(player.ready, true);
  assert.equal(state.sources.length, 1);
  assert.equal(state.sources[0].buffer.decodedIn, state.contexts[1], 'seuls les buffers décodés pour la génération courante sont publiés');
});
