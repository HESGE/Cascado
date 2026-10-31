import { createGame, rotate, getView, allowedWheels, upgradeGameGeometry } from './engine.js';
import { renderBoard, wheelCenter, seriesAppearance } from './board.js';
import { animateBoard, cancelBoardMotion, boardMotionRemaining, retimeBoardMotion, finishBoardMotion } from './motion.js';
import { createSoundPlayer, SOUND_PREFERENCE_KEY } from './sound.js';
import { loadGame, saveGame, clearGame, loadStatistics, resetStatistics } from './storage.js';
import { newSession, recipientOf, transmit, acceptReveal, visibleTransfers, hasOpponentFall } from './flow.js';
import { GEOMETRY_VERSION } from './geometry.js';
import { installViewportLock } from './viewport-lock.js';
import { getOpponentProgress } from './opponent-progress.js';
import { tokenTotal } from './tokens.js';
import { ROTATION_STEP, rotationDetentDelta } from './detents.js';
import { alignmentHint } from './alignment.js';
import { createWheelGesture, advanceWheelGesture } from './gesture.js';
import { wheelAtPoint } from './wheel-hit.js';
import { createMagneticDrag, advanceMagneticDrag } from './magnet.js';
import { createPassageFeedbackTracker, advancePassageFeedbackTracker } from './passage-feedback.js';
import { createAlignmentFeedback } from './feedback.js';
import { AI_LEVELS } from './ai.js';
import { createAIClient } from './ai-client.js';
import { playerSettings, isAIPlayer, singleHumanIndex, displayedFaceIndex, configurePlayers } from './players.js';
import { createAIRotation, advanceAIRotation, completeAIRotation, AI_THINK_MS, AI_SELECT_MS, AI_TOKEN_DURATION_SCALE, AI_SETTLE_MS } from './ai-motion.js';
import { createSeries, seriesOf, seriesGameId, parseSeriesCount, recordSeriesResult, createNextSeriesGame } from './series.js';
import { createSimulationClient } from './simulation-client.js';
import { configureStartingPosition, normalizeStartConfig } from './starting-position.js';
import { AI_SPEEDS, normalizeAISpeed, aiSpeedProfile, createAIWait, advanceAIWait } from './ai-speed.js';

const app = document.querySelector('#app');
app.dataset.geometryVersion = GEOMETRY_VERSION;
app.dataset.rotationMode = 'wheel-drag-magnet';
app.dataset.wheelGrab = 'expanded-16px';
app.dataset.passageMode = 'overlap-20';
app.dataset.alignmentFeedback = 'overlap-halo-haptic-click';
app.dataset.trayMode = 'slope-one-low';
app.dataset.handoffMode = 'single-confirmation';
app.dataset.playerMode = 'human-or-ai';
app.dataset.aiMotion = 'progressive';
app.dataset.aiView = 'human-face';
app.dataset.playLayout = 'edge-to-edge';
app.dataset.viewportLock = 'stable-height-touch-origin';
app.dataset.opponentResults = 'collected-transparent';
installViewportLock();
const HOLD_DELAY = 250;
const REPEAT_INTERVAL = 100;
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const brand = '<div class="brand">CASCADO</div>';
let session = null;
let mode = 'loading';
let selected = null;
let storageReady = false;
let statisticsRequest = 0;
let statisticsReturn = 'home';
let statisticsData = null;
let saving = Promise.resolve();
let failed = false;
let armAt = Infinity;
let blockers = new Set();
let keyboardStage = null;
let pointerStage = null;
const contacts = new Set();
const keys = new Set();
let surfacePress = null;
let deferredInstall = null;
let cacheReady = false;
let updateAvailable = false;
let registration = null;
let persisted = true;
let saveRevision = 0;
let aiGeneration = 0;
let aiTimer = null;
let aiWake = null;
let aiDirtyGame = null;
let aiSpeed = 'normal';
let seriesCountPreference = 10;
let simulationModePreference = 'headless';
let startModePreference = 'varied';
try { seriesCountPreference = parseSeriesCount(localStorage.getItem('ddc-series-count')) ?? 10; } catch { /* Optional preference. */ }
try { if(localStorage.getItem('ddc-simulation-mode') === 'board') simulationModePreference = 'board'; } catch { /* Optional preference. */ }
try { if(localStorage.getItem('ddc-start-mode') === 'classic') startModePreference = 'classic'; } catch { /* Optional preference. */ }
try { aiSpeed = normalizeAISpeed(localStorage.getItem('ddc-ai-speed')); } catch { /* Optional preference. */ }
app.dataset.aiSpeed = aiSpeed;
const ai = createAIClient();
const simulator = createSimulationClient();
let soundEnabled = true;
try { soundEnabled = localStorage.getItem(SOUND_PREFERENCE_KEY) !== 'off'; } catch { /* Optional preference. */ }
const sound = createSoundPlayer({ enabled: soundEnabled });
const alignmentFeedback = createAlignmentFeedback({
  allowed: () => mode === 'play' && !document.hidden,
  onArrival: () => sound.detent(),
  onChange: () => paintAlignmentFeedback(),
});

const landscape = () => matchMedia('(orientation: landscape)').matches && (matchMedia('(pointer: coarse)').matches || innerWidth < 950);
const player = () => session.game.players[recipientOf(session)];
const playerName = () => escape(player().name);
const symbol = value => value === 'diamond' || value === '◆' ? '◆' : '●';
const focusFirst = () => (app.querySelector('h1') ?? app.querySelector('button, input'))?.focus({preventScroll:true});
const aiDuel = () => session && [0, 1].every(index => isAIPlayer(session.game, index));
const headlessSeries = () => session?.game.simulationMode === 'headless' && Boolean(seriesOf(session.game));
const boardVisible = () => mode === 'play' || mode === 'ai-play';
const levelLabel = level => AI_LEVELS.find(item => item.id === level)?.label ?? 'Normal';
const hasAI = () => session && [0, 1].some(index => isAIPlayer(session.game, index));
const mixedGame = () => session && singleHumanIndex(session.game) !== null;
const displayedView = () => getView(session.game, displayedFaceIndex(session.game));
const speedSlot = (compact = false, pause = false) => `<div class="ai-speed-slot${compact ? ' is-compact' : ''}" data-ai-speed-slot data-speed-compact="${compact}" data-speed-pause="${pause}"></div>`;

// Keep the controls connected while Full replaces the observed face rapidly.
// A native select popup and the pause button survive every AI turn boundary.
const speedPanel = document.createElement('div');
speedPanel.id = 'ai-speed-panel';
speedPanel.hidden = true;
speedPanel.innerHTML = `<label><span>Vitesse IA</span><select name="ai-speed" aria-label="Vitesse des IA">${AI_SPEEDS.map(profile => `<option value="${profile.id}">${profile.label}</option>`).join('')}</select></label><button class="primary" type="button">Pause</button>`;
document.body.append(speedPanel);
const speedSelect = speedPanel.querySelector('select');
speedSelect.value = aiSpeed;
speedSelect.addEventListener('change', () => setAISpeed(speedSelect.value));
speedPanel.querySelector('button').addEventListener('click', () => interrupt());

function syncSpeedPanel() {
  const slot = app.querySelector('[data-ai-speed-slot]');
  if(!slot || !slot.getClientRects().length) {
    if(hasAI() && ['transition','revealing'].includes(mode)) return;
    speedPanel.hidden = true;
    return;
  }
  const rect = slot.getBoundingClientRect();
  const compact = slot.dataset.speedCompact === 'true';
  const pause = slot.dataset.speedPause === 'true';
  speedPanel.classList.toggle('is-compact', compact);
  speedPanel.querySelector('label > span').classList.toggle('sr-only', compact);
  const button = speedPanel.querySelector('button');
  button.hidden = !pause;
  button.setAttribute('aria-label',seriesOf(session?.game) ? 'Mettre la série en pause' : aiDuel() ? 'Mettre le duel en pause' : 'Mettre en pause');
  Object.assign(speedPanel.style,{left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`});
  speedPanel.hidden = false;
}

function setAISpeed(value) {
  const previous = aiSpeedProfile(aiSpeed);
  aiSpeed = normalizeAISpeed(value);
  const next = aiSpeedProfile(aiSpeed);
  app.dataset.aiSpeed = aiSpeed;
  speedSelect.value = aiSpeed;
  try { localStorage.setItem('ddc-ai-speed',aiSpeed); } catch { /* Optional preference. */ }
  if(mode === 'ai-play') {
    const container = app.querySelector('.board-wrap');
    if(next.full) finishBoardMotion(container);
    else if(!previous.full) retimeBoardMotion(container,previous.rate / next.rate);
  }
}

new MutationObserver(syncSpeedPanel).observe(app,{childList:true});
window.addEventListener('resize',syncSpeedPanel);
window.addEventListener('scroll',syncSpeedPanel,{capture:true,passive:true});
window.visualViewport?.addEventListener('resize', () => {
  if(surfacePress?.kind === 'pointer') finishSurfacePress();
  syncSpeedPanel();
});
window.visualViewport?.addEventListener('scroll', syncSpeedPanel);

function stageReady() {
  return performance.now() >= armAt && !blockers.size && persisted && !failed;
}

function armStage() {
  armAt = performance.now() + 300;
  blockers = new Set([...contacts, ...keys]);
  keyboardStage = null;
  pointerStage = null;
}

function activationAllowed(event) {
  if (!stageReady()) return false;
  if (event.detail > 0 && pointerStage !== mode) return false;
  if (event.detail === 0 && keys.size && keyboardStage !== mode) return false;
  return true;
}

function persist(meta = {}) {
  if (!session || failed) return saving;
  const snapshot = structuredClone(session);
  const revision = ++saveRevision;
  persisted = false;
  saving = saving.then(() => saveGame(snapshot, meta)).then(() => { if(revision===saveRevision)persisted = true; })
    .catch(error => { failStorage(error); });
  return saving;
}

function failStorage(error) {
  console.error('Sauvegarde indisponible', error?.name || 'Erreur');
  failed = true;
  stopMotion(false);
  mode = 'error';
  app.innerHTML = `<section class="screen error">${brand}<div class="avatar">!</div><h1>La partie est en sécurité sous le masque</h1><p>Le navigateur ne permet pas d’enregistrer la partie. Ferme les autres onglets du jeu, vérifie l’espace disponible puis réessaie.</p><p class="muted">La reprise du dernier mouvement ne peut pas être garantie.</p><button class="primary" data-action="reload">Réessayer</button></section>`;
}

function renderHome() {
  stopMotion();
  mode = 'home';
  app.innerHTML = `<section class="screen home">${brand}
    <div class="home-emblem" aria-hidden="true">◉</div>
    <p class="eyebrow">UN TÉLÉPHONE · HUMAINS OU IA</p>
    <h1>À chacun<br>son côté.</h1>
    <p>Tournez les roues. Faites sortir vos deux séries de 1 à 5 dans l’ordre. Gardez votre plateau pour vous.</p>
    <div class="actions">${session ? '<button class="primary" data-action="resume">Reprendre la partie</button>' : ''}<button class="${session ? 'secondary' : 'primary'}" data-action="new">Nouvelle partie</button><button class="secondary" data-action="automatic">Duel automatique</button><button class="secondary" data-action="rules">Comment jouer</button><button class="secondary" data-action="statistics">Statistiques</button></div>
    <div class="install-status" id="install-status">${offlineStatus()}</div>
    <button class="text-button" data-action="install">Installer sur mon téléphone</button>
    ${updateAvailable ? '<button class="secondary" data-action="update">Une mise à jour est disponible</button>' : ''}
    <p class="muted local-note">Sans compte · Partie enregistrée sur cet appareil<br><span data-release>Version 1.33</span></p></section>`;
}


function ensureStatisticsIdentity(game) {
  if(typeof game.statsId === 'string' && game.statsId.trim() && game.statsId.length <= 128) return false;
  game.statsId = crypto.randomUUID();
  return true;
}

async function ensureLegacyStatisticsIdentity(game) {
  if(typeof game.statsId === 'string' && game.statsId.trim() && game.statsId.length <= 128) return false;
  // Two windows upgrading the same old save must agree on its identity.
  const snapshot = {...game};
  delete snapshot.statsId;
  const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(snapshot)));
  game.statsId = `legacy-${[...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2,'0')).join('')}`;
  return true;
}

function statisticsBackButton() {
  return `<button class="secondary" data-action="statistics-back">${statisticsReturn === 'result' ? 'Retour au résultat' : 'Retour à l’accueil'}</button>`;
}

async function renderStatistics(message = '', keepReturn = false) {
  if(!keepReturn) statisticsReturn = mode === 'result' ? 'result' : 'home';
  stopMotion();
  mode = 'statistics';
  const request = ++statisticsRequest;
  app.innerHTML = `<section class="screen statistics">${brand}<h1 tabindex="-1">Statistiques</h1><p role="status">Chargement…</p>${statisticsBackButton()}</section>`;
  try {
    const data = await loadStatistics();
    if(mode !== 'statistics' || request !== statisticsRequest) return;
    statisticsData = data;
    drawStatistics(data,message);
  } catch {
    if(mode !== 'statistics' || request !== statisticsRequest) return;
    app.innerHTML = `<section class="screen statistics">${brand}<h1 tabindex="-1">Statistiques indisponibles</h1><p>Impossible de lire les statistiques sur cet appareil. Réessaie dans un instant.</p><button class="primary" data-action="statistics-retry">Réessayer</button>${statisticsBackButton()}</section>`;
    focusFirst();
  }
}

function drawStatistics(data, message = '') {
  const format = value => new Intl.NumberFormat('fr-FR',{maximumFractionDigits:1}).format(value);
  const average = data.totalGames ? format(data.totalTurns / data.totalGames) : '—';
  const profiles = [...data.profiles].sort((a,b) => b.wins - a.wins || b.played - a.played || a.name.localeCompare(b.name,'fr'));
  app.innerHTML = `<section class="screen statistics">${brand}<p class="eyebrow">SUR CET APPAREIL</p><h1 tabindex="-1">Statistiques</h1>
    ${message ? `<p class="statistics-notice" role="status">${escape(message)}</p>` : ''}
    <div class="statistics-summary"><div><strong>${format(data.totalGames)}</strong><span>Parties terminées</span></div><div><strong>${average}</strong><span>Tours en moyenne</span></div></div>
    <dl class="statistics-modes"><div><dt>Humain / humain</dt><dd>${format(data.modes.humanHuman)}</dd></div><div><dt>Humain / IA</dt><dd>${format(data.modes.humanAI)}</dd></div><div><dt>IA / IA</dt><dd>${format(data.modes.aiAI)}</dd></div></dl>
    ${profiles.length ? `<div class="statistics-profiles">${profiles.map(profile => `<article class="statistics-profile"><div class="statistics-player"><div><h2>${escape(profile.name)}</h2><p>${profile.controller === 'ai' ? `IA · ${levelLabel(profile.level)}` : 'Humain'}</p></div><span>${Math.round(profile.wins / profile.played * 100)} %<small>de victoires</small></span></div><dl><div><dt>Parties</dt><dd>${format(profile.played)}</dd></div><div><dt>Victoires</dt><dd>${format(profile.wins)}</dd></div><div><dt>Défaites</dt><dd>${format(profile.losses)}</dd></div><div><dt>Égalités</dt><dd>${format(profile.draws)}</dd></div></dl></article>`).join('')}</div><p class="muted statistics-note">Les profils sont regroupés par prénom et type de joueur. Chaque niveau d’IA a ses propres scores.</p>` : '<div class="statistics-empty"><h2>Aucune partie terminée</h2><p>Les scores apparaîtront après l’annonce de ton premier résultat.</p></div>'}
    <p class="muted statistics-note">Seuls les résultats annoncés sont comptés. Ces statistiques restent dans ce navigateur, sur cet appareil.</p>
    <div class="actions">${statisticsBackButton()}<button class="danger" data-action="statistics-reset" ${data.totalGames ? '' : 'disabled'}>Remettre les statistiques à zéro</button></div></section>`;
  focusFirst();
}

function confirmStatisticsReset(message = '') {
  if(!statisticsData?.totalGames) return;
  mode = 'statistics-reset';
  armStage();
  app.innerHTML = `<section class="screen statistics statistics-reset">${brand}<p class="eyebrow">STATISTIQUES</p><h1 tabindex="-1">Tout remettre à zéro ?</h1><p>Les compteurs et les profils des statistiques seront effacés définitivement.</p><p>Ta partie en cours et tes réglages seront conservés. Les anciens résultats ne seront pas comptés à nouveau.</p>${message ? `<p role="alert">${escape(message)}</p>` : ''}<div class="actions"><button class="primary" data-action="statistics-cancel">Annuler</button><button class="danger" data-action="statistics-reset-confirm">Oui, remettre à zéro</button></div></section>`;
  focusFirst();
}

async function clearStatistics() {
  if(mode !== 'statistics-reset') return;
  const request = ++statisticsRequest;
  mode = 'statistics-resetting';
  app.querySelectorAll('button').forEach(button => button.disabled = true);
  try {
    await resetStatistics();
    if(mode !== 'statistics-resetting' || request !== statisticsRequest) return;
    await renderStatistics('Les statistiques ont été remises à zéro.',true);
  } catch {
    if(mode === 'statistics-resetting' && request === statisticsRequest) confirmStatisticsReset('La remise à zéro n’a pas pu être enregistrée. Réessaie.');
  }
}

function offlineStatus() {
  return cacheReady ? '● Prêt hors ligne' : ('serviceWorker' in navigator ? 'Préparation du jeu hors ligne…' : 'Mode navigateur');
}

function prepare(replace = false, rematch = false, automatic = false) {
  stopMotion();
  mode = 'preparation';
  const names = automatic && !rematch ? ['IA 1','IA 2'] : session?.game.players.map(p => p.name) || ['Camille','Léa'];
  const settings = [0, 1].map(index => {
    const saved = playerSettings(session?.game.players[index]);
    return automatic ? {controller:'ai',level:saved.controller === 'ai' ? saved.level : 'normal'} : saved;
  });
  const starter = rematch ? 1 - (session.game.starter ?? 0) : 0;
  const seriesTarget = rematch ? seriesOf(session.game)?.target ?? seriesCountPreference : seriesCountPreference;
  const simulationMode = rematch ? (session.game.simulationMode === 'headless' ? 'headless' : 'board') : simulationModePreference;
  const startMode = rematch ? normalizeStartConfig(session.game.startConfig)?.mode ?? 'classic' : startModePreference;
  const fields = [0, 1].map(index => {
    const seat = index + 1;
    const config = settings[index];
    return `<fieldset class="player-setup"><legend>${index ? '◆' : '●'} ${automatic ? escape(names[index]) : `Joueur ${seat}`}</legend>
      ${automatic ? `<input type="hidden" name="player${seat}" value="${escape(names[index])}"><input type="hidden" name="controller${seat}" value="ai">` : `<label class="field"><span>Prénom du joueur ${seat}</span><input name="player${seat}" autocomplete="off" maxlength="20" required value="${escape(names[index])}"></label>
      <label class="field"><span>Qui joue pour le joueur ${seat} ?</span><select name="controller${seat}"><option value="human" ${config.controller === 'human' ? 'selected' : ''}>Humain</option><option value="ai" ${config.controller === 'ai' ? 'selected' : ''}>IA</option></select></label>`}
      <label class="field ai-level" ${config.controller === 'ai' ? '' : 'hidden'}><span>Niveau de l’IA ${seat}</span><select name="level${seat}" ${config.controller === 'ai' ? '' : 'disabled'}>${AI_LEVELS.map(level => `<option value="${level.id}" ${config.level === level.id ? 'selected' : ''}>${level.label}</option>`).join('')}</select></label></fieldset>`;
  }).join('');
  app.innerHTML = `<section class="screen preparation${automatic ? ' is-automatic' : ''}">${brand}<p class="eyebrow">${rematch ? 'REVANCHE' : automatic ? 'IA CONTRE IA' : 'NOUVELLE PARTIE'}</p><h1>${automatic ? 'Duel automatique' : 'Qui joue ?'}</h1><p>${automatic ? 'Choisis les niveaux, le nombre de parties, les départs et l’affichage. Les IA enchaînent les confrontations, puis affichent leur bilan.' : 'Chacun aura sa face du plateau. Choisissez qui commence.'}</p>
    <form id="setup">${automatic ? `<div class="automatic-levels">${fields}</div>` : fields}${automatic ? `<div class="series-count-field"><label class="field"><span>Nombre de parties</span><input type="number" name="series-count" inputmode="numeric" min="1" max="1000" step="1" required value="${seriesTarget}" aria-describedby="series-count-help"></label><div class="series-presets" role="group" aria-label="Nombre de parties proposé">${[10,50,100].map(count => `<button class="secondary" type="button" data-action="series-preset" data-count="${count}" aria-pressed="${seriesTarget===count}">${count} parties</button>`).join('')}</div><p id="series-count-help" class="muted">De 1 à 1 000 parties. Garde le jeu ouvert pour calculer.</p><label class="field"><span>Départs</span><select name="start-mode" aria-describedby="start-mode-help"><option value="varied" ${startMode==='varied' ? 'selected' : ''}>Variés — comparer les IA</option><option value="classic" ${startMode==='classic' ? 'selected' : ''}>Classiques — même position</option></select></label><p id="start-mode-help" class="muted">Variés : chaque position est jouée deux fois, premier joueur inversé. La dernière reste seule si le total est impair. Classiques : même position répétée.</p><label class="field"><span>Affichage</span><select name="simulation-mode" aria-describedby="simulation-mode-help"><option value="headless" ${simulationMode==='headless' ? 'selected' : ''}>Sans plateau — simulation rapide</option><option value="board" ${simulationMode==='board' ? 'selected' : ''}>Avec le plateau</option></select></label><p id="simulation-mode-help" class="muted">Sans plateau, les IA calculent à pleine vitesse. Seuls les scores et l’avancement sont affichés.</p></div>` : ''}<div data-setup-speed ${settings.some(config => config.controller === 'ai') && (!automatic || simulationMode !== 'headless') ? '' : 'hidden'}>${speedSlot()}</div>
    ${automatic ? `<input type="hidden" name="starter" value="${starter}"><p class="automatic-start">${escape(names[starter])} commence, puis le premier joueur alterne à chaque partie. Tu peux mettre la série en pause.</p>` : `<label class="field"><span>Premier joueur</span><select name="starter"><option value="0" ${starter === 0 ? 'selected' : ''}>Joueur 1</option><option value="1" ${starter === 1 ? 'selected' : ''}>Joueur 2</option></select></label>`}
    ${replace ? '<p class="replacement-note">Démarrer remplacera la partie enregistrée sur cet appareil.</p>' : ''}
    <button class="primary" type="submit">${automatic ? (replace ? 'Remplacer et lancer' : 'Lancer la série') : replace ? 'Remplacer et commencer' : 'Commencer la partie'}</button></form>
    <button class="secondary" data-action="home">Retour</button></section>`;
  app.querySelectorAll('select[name^="controller"]').forEach(control => control.addEventListener('change', () => {
    const field = control.closest('fieldset').querySelector('.ai-level');
    field.hidden = control.value !== 'ai';
    field.querySelector('select').disabled = field.hidden;
    app.querySelector('[data-setup-speed]').hidden = ![...app.querySelectorAll('select[name^="controller"]')].some(select => select.value === 'ai');
    syncSpeedPanel();
  }));
  app.querySelector('[name="simulation-mode"]')?.addEventListener('change',event => {
    app.querySelector('[data-setup-speed]').hidden = event.target.value === 'headless';
    syncSpeedPanel();
  });
  const countField = app.querySelector('[name="series-count"]');
  countField?.addEventListener('input',() => {
    const count = parseSeriesCount(countField.value);
    countField.setCustomValidity(count === null ? 'Choisis un nombre entier de 1 à 1 000.' : '');
    app.querySelectorAll('[data-action="series-preset"]').forEach(button => button.setAttribute('aria-pressed',String(Number(button.dataset.count)===count)));
  });
  app.querySelector('#setup').addEventListener('submit', async event => {
    event.preventDefault();
    if (!storageReady || failed) return;
    const data = new FormData(event.currentTarget);
    const target = automatic ? parseSeriesCount(data.get('series-count')) : null;
    if(automatic && target === null) { countField.reportValidity();return; }
    const chosenNames = automatic ? [...names] : [String(data.get('player1')).trim() || 'Joueur 1', String(data.get('player2')).trim() || 'Joueur 2'];
    const chosenStarter = automatic ? starter : Number(data.get('starter'));
    const game = configurePlayers(createGame(chosenNames, chosenStarter), [1, 2].map(seat => ({controller:automatic ? 'ai' : data.get(`controller${seat}`),level:data.get(`level${seat}`)})));
    if(automatic) {
      startModePreference = data.get('start-mode') === 'classic' ? 'classic' : 'varied';
      configureStartingPosition(game,{mode:startModePreference,seed:crypto.getRandomValues(new Uint32Array(1))[0]},1);
      try { localStorage.setItem('ddc-start-mode',startModePreference); } catch { /* Optional preference. */ }
      game.series = createSeries(target,{id:crypto.randomUUID(),firstStarter:chosenStarter});
      game.statsId = seriesGameId(game.series);
      game.simulationMode = data.get('simulation-mode') === 'headless' ? 'headless' : 'board';
      simulationModePreference = game.simulationMode;
      try { localStorage.setItem('ddc-simulation-mode',simulationModePreference); } catch { /* Optional preference. */ }
      seriesCountPreference = target;
      try { localStorage.setItem('ddc-series-count',String(target)); } catch { /* Optional preference. */ }
    }
    ensureStatisticsIdentity(game);
    session = newSession(game);
    app.dataset.geometryVersion = game.geometryVersion;
    const created = session;
    session.game.starter = chosenStarter;
    selected = null;
    if(mixedGame() && !landscape() && !document.hidden) {
      stopMotion();
      renderPlay(true);
      lockBoardForTransition();
    } else renderMask();
    const generation = aiGeneration;
    sound.unlock();
    await persist({type:'new-game'});
    if(session === created && generation === aiGeneration && ['ai-ready','transition'].includes(mode) && !failed && !document.hidden) await confirmReveal();
  });
}

const phoneIcon = `<svg class="phone-icon" viewBox="0 0 140 140" aria-hidden="true"><circle cx="60" cy="70" r="53" fill="#214c5e"/><rect x="38" y="29" width="45" height="82" rx="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M52 37h16M55 102h10M102 70h27m-9-9 9 9-9 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function renderMask() {
  if (!session) return renderHome();
  stopMotion(false);
  mode = landscape() ? 'landscape' : 'handoff';
  selected = session.game.engaged ?? session.game.selectedWheel ?? selected;
  armStage();
  if (mode === 'landscape') {
    app.innerHTML = `<section class="screen landscape">${brand}${phoneIcon}<h1>Remets le téléphone en portrait</h1><p>Le jeu est en pause et le plateau reste masqué.</p></section>`;
    return;
  }
  if(mixedGame()) {
    app.innerHTML = `<section class="screen handoff">${brand}<button class="handoff-home" data-action="home">Accueil</button><p class="eyebrow">PARTIE EN PAUSE</p>${phoneIcon}<h1 class="handoff-title" tabindex="-1">Prêt à reprendre ?</h1><p>Ton plateau restera affiché pendant le tour de l’IA.</p><div class="handoff-actions"><button class="primary" data-action="identify">Reprendre la partie</button></div></section>`;
    focusFirst();
    return;
  }
  if(isAIPlayer(session.game, recipientOf(session))) return renderAIReady();
  app.innerHTML = `<section class="screen handoff" style="--player-color:${player().color};--name-length:${Math.max(1,player().name.length)}">${brand}<button class="handoff-home" data-action="home">Accueil</button><p class="eyebrow">PASSAGE DU TÉLÉPHONE</p>${phoneIcon}
    <h1 class="handoff-title" tabindex="-1">Passe le téléphone<br><strong>à ${playerName()}</strong></h1><div class="symbol" aria-hidden="true">${symbol(player().symbol)}</div>
    <p>${playerName()}, appuie quand tu l’as en main.</p><div class="handoff-actions"><button class="primary" data-action="identify">Je suis ${playerName()} —<br>afficher mon plateau</button><p class="muted">Un appui affiche ton plateau.</p></div></section>`;
  focusFirst();
}

function renderAIReady(message = '') {
  mode = 'ai-ready';
  armStage();
  const duel = aiDuel();
  const series = seriesOf(session.game);
  if(series) {
    const complete = series.completed === series.target;
    app.innerHTML = `<section class="screen ai-wait series-screen">${brand}<p class="eyebrow">SIMULATION IA CONTRE IA</p><h1 tabindex="-1">${complete ? 'Série terminée' : 'Série en pause'}</h1><p>${message || `${series.completed} / ${series.target} parties terminées. ${complete ? 'Le bilan est prêt.' : session.phase === 'revealed-result' ? `La prochaine partie est la ${series.completed+1}.` : `Partie ${series.round} en cours.`}`}</p>${seriesScore(series)}${complete ? '' : headlessSeries() ? '<p class="muted">Simulation sans plateau, à pleine vitesse.</p>' : speedSlot()}<div class="actions"><button class="primary" data-action="ai-start">${complete ? 'Voir le bilan' : 'Reprendre la série'}</button><button class="secondary" data-action="home">Accueil</button></div></section>`;
    focusFirst();
    return;
  }
  app.innerHTML = `<section class="screen ai-wait ai-ready">${brand}<p class="eyebrow">${duel ? 'IA CONTRE IA' : 'TOUR DE L’IA'}</p><div class="avatar" aria-hidden="true">◉</div><h1 tabindex="-1">${duel ? 'Le duel est en pause' : `${playerName()} attend`}</h1><p>${message || (duel ? 'Les deux IA joueront à tour de rôle. Tu peux regarder et mettre la partie en pause.' : 'Tu suivras les roues sur ton plateau pendant le tour de l’IA.')}</p>${speedSlot()}<div class="actions"><button class="primary" data-action="ai-start">${duel ? (session.game.turn === 1 && !session.game.engaged ? 'Démarrer le duel' : 'Reprendre le duel') : 'Reprendre le tour de l’IA'}</button><button class="secondary" data-action="home">Accueil</button></div></section>`;
  focusFirst();
}

function soundIcon() {
  return `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>${sound.enabled ? '<path d="M16 8c3 2 3 6 0 8M19 5c5 4 5 10 0 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' : '<path d="m17 9 5 6m0-6-5 6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'}</svg>`;
}

function renderPlay(spectate = false) {
  if(session) app.dataset.geometryVersion = session.game.geometryVersion;
  if (!session || landscape() || document.hidden) return renderMask();
  mode = spectate ? 'ai-play' : 'play';
  if (session.game.engaged) selected = session.game.engaged;
  const view = displayedView();
  const mixed = mixedGame();
  // Keep the human's surface, layout and native speed control in place between
  // turns. Only the shared wheels and the active-turn labels change.
  const sameBoard = mixed && app.querySelector(`.play[data-face-index="${view.faceIndex}"]`);
  if(!sameBoard) app.innerHTML = `<section class="screen play" data-face-index="${view.faceIndex}" role="group" tabindex="0" style="--player-color:${view.color}">
    <div class="topbar">${brand}${seriesOf(session.game) ? `<span class="series-counter">Partie ${session.game.series.round} / ${session.game.series.target}</span>` : ''}<div class="topbar-actions">${sound.available ? `<button class="audio-toggle" data-action="sound" aria-label="${sound.enabled ? 'Couper le son' : 'Activer le son'}" aria-pressed="${sound.enabled}">${soundIcon()}</button>` : ''}<button class="pause" aria-label="Mettre en pause et masquer" data-action="pause">Ⅱ</button></div></div>
    <h1 class="player-title"><span class="symbol" aria-hidden="true">${symbol(view.symbol)}</span><span></span></h1>
    <div class="progress"></div>
    <div class="board-wrap">${renderBoard({...view, selected, readOnly:spectate}, {opponentProgress:getOpponentProgress(session.game,view.faceIndex)})}</div>
    <div class="wheel-status"><span id="selection-label"></span><span id="restriction-label"></span></div>
    <p class="alignment-help" id="alignment-help"></p>
    <div class="rotation-row"><div class="surface-help" id="rotation-readout" role="slider" tabindex="-1" aria-label="Rotation de la roue sélectionnée, flèches gauche et droite" aria-describedby="alignment-help" aria-valuemin="0" aria-valuemax="360" aria-valuenow="0" aria-disabled="true"></div>${mixed ? speedSlot(true) : ''}</div>
    ${spectate && !mixed ? speedSlot(false,true) : `<button class="primary end-turn" data-action="end" disabled>${mixed ? 'Terminer mon tour' : 'Terminer et masquer'}</button>`}<p class="sr-only" id="play-message" aria-live="polite"></p>
  </section>`;
  const surface = app.querySelector('.play');
  surface.classList.toggle('is-ai-play',spectate);
  surface.classList.toggle('has-ai-opponent',mixed);
  surface.classList.toggle('sound-muted',!sound.available);
  surface.setAttribute('aria-label',spectate ? (mixed ? `Plateau de ${view.name}, tour de l’IA. Les roues tournent automatiquement.` : 'Duel d’IA, plateau observé.') : 'Plateau de jeu. Maintiens une roue ou juste autour, puis fais glisser le doigt autour de son centre pour tourner.');
  if(sameBoard) refreshPlay();
  else updatePlayUI(view);
}

function updatePlayUI(view = displayedView()) {
  if (!boardVisible()) return;
  const spectate = mode === 'ai-play';
  const mixed = mixedGame();
  const activeName = session.game.players[session.game.active].name;
  app.querySelector('.player-title > span:last-child').textContent = mixed ? `Plateau de ${view.name}` : (spectate ? view.name : `À toi, ${view.name}`);
  const nextTokens = view.nextBySeries.map((next, lane) => {
    const { color, label, symbol } = seriesAppearance(view, lane);
    return `<b style="background:${color}" aria-label="${label}, ${next > 5 ? 'terminée' : `prochain jeton ${next}`}"><small aria-hidden="true">${view.totalTokens > 5 ? symbol : ''}</small>${next > 5 ? '✓' : next}</b>`;
  }).join('');
  app.querySelector('.progress').innerHTML = `<span><span class="next-label">${view.totalTokens > 5 ? 'PROCHAINS' : 'PROCHAIN JETON'}</span> <span class="series-next">${nextTokens}</span></span><span>${view.exited.length} / ${view.totalTokens} arrivés</span>`;
  app.querySelector('#selection-label').textContent = selected ? `Roue ${selected} ${session.game.engaged ? 'engagée' : 'sélectionnée'}` : spectate ? 'L’IA réfléchit…' : 'Choisis une roue';
  app.querySelector('#restriction-label').textContent = spectate ? `IA · ${levelLabel(playerSettings(session.game.players[session.game.active]).level)}` : view.lastWheel && !view.allowedWheels.includes(view.lastWheel) && !session.game.engaged ? `♙ ${view.lastWheel} interdite` : 'Rotation au doigt';
  app.querySelector('#alignment-help').textContent = spectate ? (app.dataset.aiPhase === 'falling' ? (mixed ? 'Tes jetons descendent…' : 'Les jetons descendent…') : app.dataset.aiPhase === 'settling' ? 'Le mouvement est terminé.' : selected && app.dataset.aiPhase !== 'thinking' ? `L’IA ${app.dataset.aiPhase === 'selected' ? 'choisit' : 'tourne'} la roue ${selected}.` : 'L’IA prépare son mouvement…') : alignmentHint(view,selected);
  const end = app.querySelector('[data-action="end"]');
  if(end) {
    end.disabled = spectate || !session.game.engaged || Boolean(surfacePress);
    end.textContent = spectate ? `${activeName} joue…` : mixed ? 'Terminer mon tour' : 'Terminer et masquer';
  }
  app.querySelector('.play').classList.toggle('is-dragging',surfacePress?.kind==='pointer');
  const readout = app.querySelector('#rotation-readout');
  readout.tabIndex = selected && !spectate ? 0 : -1;
  readout.setAttribute('aria-disabled', String(!selected || spectate));
  readout.setAttribute('aria-label',spectate ? 'Rotation jouée par l’IA' : 'Rotation de la roue sélectionnée, flèches gauche et droite');
  const angle = selected ? Math.round(view.angles[selected-1]) % 360 : 0;
  readout.setAttribute('aria-valuenow',String(angle));
  readout.setAttribute('aria-valuetext', spectate ? (selected ? `Roue ${selected}, ${angle} degrés.` : 'L’IA prépare son mouvement.') : selected ? `Roue ${selected}, ${angle} degrés. Flèche droite : sens horaire ; flèche gauche : sens antihoraire.` : 'Sélectionne une roue pour tourner.');
  readout.textContent = spectate ? (mixed ? `Tour de l’IA · ${activeName}` : `Tour ${session.game.turn} · ${activeName}`) : mixed ? 'À toi de jouer' : 'Tourne avec le doigt';
  syncSpeedPanel();
}

// Saving a turn never grants control of the next turn before its durable commit.
// Mixed play keeps the same board visible throughout this short transition.
function lockBoardForTransition() {
  mode = 'transition';
  const surface = app.querySelector('.play');
  if(!surface) return;
  surface.classList.add('is-ai-play');
  app.querySelectorAll('[data-wheel],#rotation-readout').forEach(node => {
    node.setAttribute('aria-disabled','true');
    node.tabIndex = -1;
  });
  const end = app.querySelector('[data-action="end"]');
  if(end) end.disabled = true;
}

function refreshPlay(beforeView = null, events = [], directRotation = false) {
  if (!boardVisible()) return;
  const view = displayedView();
  const container=app.querySelector('.board-wrap');
  if(!beforeView)cancelBoardMotion(container);
  container.innerHTML=renderBoard({...view,selected,readOnly:mode === 'ai-play'}, {opponentProgress:getOpponentProgress(session.game,view.faceIndex)});
  const profile = aiSpeedProfile(aiSpeed);
  const full = mode === 'ai-play' && profile.full;
  if(beforeView)animateBoard(container,beforeView,view,{events,directRotation,reducedMotion:full ? true : undefined,durationScale:mode === 'ai-play' && !full ? AI_TOKEN_DURATION_SCALE / profile.rate : 1,onSlide:()=>{if(mode !== 'ai-play' || !aiSpeedProfile(aiSpeed).full)sound.slide();},onDrop:()=>{if(mode !== 'ai-play' || !aiSpeedProfile(aiSpeed).full)sound.drop();}});
  updatePlayUI(view);
  paintAlignmentFeedback();
}

function soundOpponentFalls(newBatches, viewerFaceIndex) {
  if (!boardVisible() || document.hidden || (mode === 'ai-play' && aiSpeedProfile(aiSpeed).full)) return;
  // Only the presence of a new opponent cascade reaches audio. Its paths,
  // token numbers and verdict never enter the displayed animation or timers.
  if (hasOpponentFall(newBatches, viewerFaceIndex)) sound.drop();
}

function paintAlignmentFeedback() {
  app.querySelectorAll('[data-magnet-feedback]').forEach(node => node.remove());
  const id = alignmentFeedback.wheel;
  if (mode !== 'play' || !id || selected !== id) return;
  const target = app.querySelector(`[data-wheel="${id}"]`);
  const center = wheelCenter(id, session.game.active);
  if (!target || !center) return;
  const halo = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  halo.setAttribute('data-magnet-feedback', String(id));
  halo.setAttribute('class', 'magnet-feedback');
  halo.setAttribute('aria-hidden', 'true');
  halo.innerHTML = `<circle cx="${center.x}" cy="${center.y}" r="${center.radius + 8}" class="magnet-feedback-ring"/><circle cx="${center.x}" cy="${center.y}" r="14" class="magnet-feedback-hub"/>`;
  target.append(halo);
}

function applyRotations(localDeltas, directRotation = false, magneticDrag = null, passageTracker = null) {
  if (mode !== 'play' || !selected) return false;
  const before = getView(session.game,session.game.active);
  const firstNewEvent=session.game.events.length;
  const steps=[];
  let passageOpened = false;
  for(const localDelta of localDeltas){
    if(!Number.isFinite(localDelta)||!localDelta)continue;
    const physical=localDelta*(session.game.active===0?1:-1);
    const delta=directRotation
      ? (magneticDrag?advanceMagneticDrag(magneticDrag,physical):physical)
      : rotationDetentDelta(selected,session.game.angles[selected-1],Math.sign(physical),session.game.geometryVersion);
    if(rotate(session.game,selected,delta)) {
      steps.push(delta);
      // Feedback follows actual displayed movement and the common opening of
      // two own-face wheels, independently of the shared mechanical magnets.
      if(directRotation && passageTracker
        && advancePassageFeedbackTracker(passageTracker,delta*(session.game.active===0?1:-1))>0) passageOpened=true;
    }
  }
  if(!steps.length)return false;
  const newBatches=session.game.events.slice(firstNewEvent);
  const transfers=visibleTransfers(newBatches,session.game.active);
  if (!passageOpened) sound.turn(steps.reduce((sum,delta)=>sum+Math.abs(delta),0));
  refreshPlay(before,transfers,directRotation);
  soundOpponentFalls(newBatches,session.game.active);
  if(passageOpened)alignmentFeedback.pulse(selected);
  persist({type:'rotation',wheel:selected,delta:steps.reduce((sum,delta)=>sum+delta,0),steps});
  return true;
}
const applyRotation=localDelta=>applyRotations([localDelta]);

function announce(message) {
  if(mode!=='play')return;
  app.querySelector('#selection-label').textContent=message;
  app.querySelector('#play-message').textContent=message;
}

function selectWheel(id, focus = false) {
  if(mode!=='play')return false;
  if(surfacePress?.kind==='pointer')return false;
  if(session.game.engaged && session.game.engaged!==id){announce(`Continue sur la roue ${session.game.engaged}.`);return false;}
  if(!allowedWheels(session.game).includes(id)){announce(`Roue ${id} : jouée au tour précédent.`);return false;}
  if(selected===id){
    sound.unlock();
    if(focus)app.querySelector('#rotation-readout').focus({preventScroll:true});
    return true;
  }
  alignmentFeedback.stop();
  selected=id;session.game.selectedWheel=id;
  refreshPlay();persist({type:'select',wheel:id});
  sound.unlock();
  if(focus)app.querySelector('#rotation-readout').focus({preventScroll:true});
  return true;
}

function selectedCenterOnScreen() {
  const svg=app.querySelector('.game-board');
  const matrix=svg?.getScreenCTM();
  const center=wheelCenter(selected,session.game.active);
  if(!matrix||!center)return null;
  const point=svg.createSVGPoint();point.x=center.x;point.y=center.y;
  return point.matrixTransform(matrix);
}

function wheelAtScreenPoint(event) {
  const svg = app.querySelector('.game-board');
  const matrix = svg?.getScreenCTM();
  if (!matrix) return null;
  const scale = Math.hypot(matrix.a, matrix.b);
  const point = svg.createSVGPoint();
  const wheels = [1,2,3,4,5].map(id => {
    const center = wheelCenter(id,session.game.active);
    point.x = center.x; point.y = center.y;
    const screen = point.matrixTransform(matrix);
    return {id,x:screen.x,y:screen.y,radius:center.radius * scale};
  });
  return wheelAtPoint({x:event.clientX,y:event.clientY},wheels);
}

function flushWheelGesture(press=surfacePress) {
  if(press?.kind!=='pointer'||mode!=='play')return;
  press.frame=0;
  const deltas=press.deltas.splice(0);
  if(deltas.length)applyRotations(deltas,true,press.magnet,press.passageFeedback);
}

function queueWheelGesture(event) {
  const press=surfacePress;
  if(mode!=='play'||press?.kind!=='pointer'||press.source!==event.pointerId)return;
  const coalesced=event.getCoalescedEvents?.();
  for(const point of coalesced?.length?coalesced:[event]){
    const delta=advanceWheelGesture(press.gesture,{x:point.clientX,y:point.clientY});
    if(delta)press.deltas.push(delta);
  }
  if(press.deltas.length&&!press.frame)press.frame=requestAnimationFrame(()=>{
    if(surfacePress===press)flushWheelGesture(press);
  });
}

function finishSurfacePress(source = null, commit = false) {
  if(!surfacePress || (source!==null && source!==surfacePress.source))return;
  const previous=surfacePress;surfacePress=null;
  if(!commit)alignmentFeedback.stop();
  if(previous.frame)cancelAnimationFrame(previous.frame);
  if(commit&&mode==='play'){
    if(previous.kind==='pointer')flushWheelGesture(previous);
    else if(!previous.held)applyRotation(previous.direction*ROTATION_STEP);
  }
  sound.resetTurn();
  if(typeof previous.source==='number'&&app.hasPointerCapture(previous.source)){
    try{app.releasePointerCapture(previous.source);}catch{/* Pointer already gone. */}
  }
  if(mode==='play')updatePlayUI();
}

function beginSurfaceRotation(direction, source) {
  if(!selected||surfacePress||mode!=='play')return;
  sound.resetTurn();
  const started=performance.now();
  surfacePress={kind:'keyboard',source,direction,next:started+HOLD_DELAY,held:false,frame:0};
  sound.unlock();
  updatePlayUI();
  const frame=now=>{
    if(!surfacePress||mode!=='play')return;
    if(now>=surfacePress.next){
      surfacePress.held=true;
      surfacePress.next=now+REPEAT_INTERVAL;
      applyRotation(surfacePress.direction*ROTATION_STEP);
    }
    if(surfacePress)surfacePress.frame=requestAnimationFrame(frame);
  };
  if(surfacePress)surfacePress.frame=requestAnimationFrame(frame);
}

app.addEventListener('pointerdown',event=>{
  if(mode!=='play')return;
  if(contacts.size>1||!event.isPrimary){finishSurfacePress();return;}
  if(event.button!==0||event.target.closest('button,a,input,select,textarea,[data-action]'))return;
  if(surfacePress)return;
  const wheelId=wheelAtScreenPoint(event);
  if(!wheelId)return;
  event.preventDefault();
  if(!selectWheel(wheelId))return;
  const center=selectedCenterOnScreen();
  if(!center)return;
  sound.resetTurn();
  surfacePress={kind:'pointer',source:event.pointerId,frame:0,deltas:[],
    magnet:createMagneticDrag(selected,session.game.angles[selected-1],session.game.geometryVersion,session.game.active),
    passageFeedback:createPassageFeedbackTracker(getView(session.game,session.game.active),selected),
    gesture:createWheelGesture({x:center.x,y:center.y},{x:event.clientX,y:event.clientY})};
  app.setPointerCapture(event.pointerId);
  updatePlayUI();
});
app.addEventListener('pointermove',event=>{
  if(surfacePress?.kind!=='pointer'||surfacePress.source!==event.pointerId)return;
  event.preventDefault();queueWheelGesture(event);
});
app.addEventListener('contextmenu',event=>{
  if(mode==='play'&&event.target.closest('.game-board'))event.preventDefault();
});
app.addEventListener('lostpointercapture',event=>finishSurfacePress(event.pointerId));
document.addEventListener('pointerup',event=>{
  queueWheelGesture(event);
  finishSurfacePress(event.pointerId,true);
  if(event.isTrusted && boardVisible() && !document.hidden) sound.unlock();
},true);
document.addEventListener('touchend',event=>{
  if(event.isTrusted && boardVisible() && !document.hidden) sound.unlock();
},{capture:true,passive:true});
document.addEventListener('pointercancel',event=>finishSurfacePress(event.pointerId),true);

function stopMotion() {
  cancelAITurn();
  finishSurfacePress();
  alignmentFeedback.stop();
  cancelBoardMotion(app.querySelector('.board-wrap'));
  sound.stop();
}

function cancelAITurn() {
  saveAIMovement('ai-interrupt');
  aiGeneration++;
  app.dataset.aiPhase = 'paused';
  ai.cancel();
  simulator.cancel();
  if(aiTimer !== null) clearTimeout(aiTimer);
  aiTimer = null;
  const wake = aiWake;
  aiWake = null;
  wake?.(false);
}

function saveAIMovement(type = 'ai-progress') {
  const dirty = aiDirtyGame;
  aiDirtyGame = null;
  if(dirty && session?.game === dirty) return persist({type,wheel:dirty.engaged});
  return saving;
}

function waitAIFrame(milliseconds, generation) {
  if(generation !== aiGeneration) return Promise.resolve(false);
  return new Promise(resolve => {
    aiWake = resolve;
    aiTimer = setTimeout(() => {
      aiTimer = null;
      aiWake = null;
      resolve(generation === aiGeneration);
    }, milliseconds);
  });
}

async function waitForAI(milliseconds, generation, waitMotion = false) {
  const wait = createAIWait(milliseconds);
  let margin = createAIWait(120);
  let previous = performance.now();
  while(generation === aiGeneration) {
    if(aiSpeedProfile(aiSpeed).full) return true;
    const now = performance.now();
    const elapsed = now - previous;
    previous = now;
    advanceAIWait(wait,elapsed,aiSpeed);
    if(waitMotion && boardMotionRemaining(app.querySelector('.board-wrap')) > 0) margin = createAIWait(120);
    else advanceAIWait(margin,elapsed,aiSpeed);
    if(wait.done && (!waitMotion || margin.done)) return true;
    if(!await waitAIFrame(16,generation)) return false;
  }
  return false;
}

function renderSimulationProgress() {
  const series = seriesOf(session.game);
  mode = 'ai-simulation';
  app.dataset.aiPhase = 'simulation';
  app.innerHTML = `<section class="screen series-screen simulation-screen">${brand}<p class="eyebrow">SIMULATION SANS PLATEAU</p><h1 tabindex="-1">Les IA jouent.</h1><p class="simulation-count" aria-live="polite"></p><progress class="simulation-progress" max="${series.target}" value="${series.completed}" aria-label="Parties terminées"></progress><p class="simulation-round muted"></p><div class="simulation-scores">${seriesScore(series)}</div><p class="muted">Calcul à pleine vitesse, sans roues ni animations. Garde le jeu ouvert.</p><div class="actions"><button class="primary" data-action="ai-pause">Mettre la série en pause</button></div></section>`;
  updateSimulationProgress();
  focusFirst();
}

function updateSimulationProgress() {
  const series = seriesOf(session.game);
  app.querySelector('.simulation-count').textContent = `${series.completed} / ${series.target} parties terminées`;
  app.querySelector('.simulation-progress').value = series.completed;
  app.querySelector('.simulation-round').textContent = `Partie ${series.round} / ${series.target} · Tour ${session.game.turn}`;
  app.querySelector('.simulation-scores').innerHTML = seriesScore(series);
}

async function runHeadlessSimulation() {
  cancelAITurn();
  const generation = aiGeneration;
  const current = () => generation === aiGeneration && mode === 'ai-simulation'
    && headlessSeries() && !failed && !document.hidden && !landscape();
  renderSimulationProgress();
  let paintedAt = performance.now();
  while(current()) {
    const series = seriesOf(session.game);
    if(session.phase === 'revealed-result') {
      if(series.completed === series.target) { renderResult(); return; }
      const next = createNextSeriesGame(session.game);
      if(!next) { cancelAITurn(); renderAIReady('La simulation est en pause. Impossible de préparer la prochaine partie.'); return; }
      next.simulationMode = 'headless';
      session = newSession(next);
      await persist({type:'simulation-next',round:next.series.round});
      if(!current()) return;
    }
    const original = session;
    const result = await simulator.advance(original);
    if(!current() || session !== original) return;
    if(!result) { cancelAITurn(); renderAIReady('Le calcul a été interrompu. Tu peux reprendre la série.'); return; }
    // The worker owns a copy. Only a received checkpoint becomes authoritative;
    // a pause discards its unfinished calculation, never a committed result.
    session = result.session;
    selected = null;
    await persist({type:'simulation-progress',turns:result.turns});
    if(!current()) return;
    if(result.status === 'blocked') {
      cancelAITurn(); renderAIReady('Aucun coup valide n’a pu être calculé. La série est en pause, sans résultat ajouté.'); return;
    }
    if(session.phase === 'revealed-result' || performance.now()-paintedAt >= 250) {
      updateSimulationProgress();
      paintedAt = performance.now();
    }
    if(session.phase === 'revealed-result' && session.game.series.completed === session.game.series.target) {
      renderResult(); return;
    }
    // Keep Pause responsive even when a worker completes a whole short match.
    if(!await waitAIFrame(0,generation) || !current()) return;
  }
}

async function runAITurn() {
  cancelAITurn();
  const generation = aiGeneration;
  const game = session.game;
  const turn = game.turn;
  const active = game.active;
  const face = displayedFaceIndex(game);
  const current = () => generation === aiGeneration && session?.game === game
    && game.turn === turn && game.active === active && !document.hidden && !landscape()
    && !failed && mode === 'ai-play';
  selected = game.engaged ?? null;
  app.dataset.aiPhase = 'thinking';
  renderPlay(true);
  try {
    // The planner receives only its own face, never the authoritative game.
    const move = await ai.choose(getView(game, active), playerSettings(game.players[active]).level);
    if(!current()) return;
    if(!move || !allowedWheels(game).includes(move.wheel)
      || !Number.isFinite(move.localDelta) || Math.abs(move.localDelta) < 1e-9) {
      cancelAITurn();
      renderAIReady('Le tour est en pause. Tu peux relancer l’IA.');
      return;
    }
    if(!await waitForAI(AI_THINK_MS, generation) || !current()) return;
    selected = move.wheel;
    game.selectedWheel = selected;
    app.dataset.aiPhase = 'selected';
    refreshPlay();
    await persist({type:'ai-select',wheel:selected});
    if(!current() || !await waitForAI(AI_SELECT_MS, generation) || !current()) return;
    const rotation = createAIRotation(move.localDelta);
    sound.resetTurn();
    let previous = performance.now();
    let lastSaved = previous;
    app.dataset.aiPhase = 'rotating';
    updatePlayUI();
    while(!rotation.done) {
      if(!await waitAIFrame(16, generation) || !current()) return;
      const time = performance.now();
      const profile = aiSpeedProfile(aiSpeed);
      const delta = profile.full ? completeAIRotation(rotation) : advanceAIRotation(rotation, time - previous, profile.rate);
      previous = time;
      if(Math.abs(delta) < 1e-12) continue;
      const before = getView(game, face);
      const firstNewEvent = game.events.length;
      if(!rotate(game, selected, delta * (active === 0 ? 1 : -1))) {
        cancelAITurn();renderAIReady();return;
      }
      aiDirtyGame = game;
      const newBatches = game.events.slice(firstNewEvent);
      const transfers = visibleTransfers(newBatches, face);
      if(!profile.full) sound.turn(Math.abs(delta));
      if(transfers.length) app.dataset.aiPhase = 'falling';
      refreshPlay(before, transfers, true);
      soundOpponentFalls(newBatches, face);
      if(time - lastSaved >= 150 || rotation.done || transfers.length) {
        await saveAIMovement();
        if(!current()) return;
        lastSaved = performance.now();
      }
      // Only displayed falls add a presentation pause. The requested anonymous
      // opponent sound never changes the timing or progression of an AI turn.
      if(transfers.length) {
        sound.resetTurn();
        if(!await waitForAI(300,generation,true) || !current()) return;
        app.dataset.aiPhase = 'rotating';
        updatePlayUI();
      }
      // Exclude fall pauses and storage time; delayed frames have no catch-up.
      previous = performance.now();
    }
    await saveAIMovement('ai-rotation');
    if(!current()) return;
    app.dataset.aiPhase = 'settling';
    updatePlayUI();
    if(!await waitForAI(AI_SETTLE_MS,generation,true) || !current()) return;
    // Full still yields between turns, keeping the persistent speed and pause
    // controls responsive rather than running an uninterrupted simulation.
    if(aiSpeedProfile(aiSpeed).full && (!await waitAIFrame(32,generation) || !current())) return;
    await finishTurn();
  } catch {
    if(current()) { cancelAITurn();renderAIReady('Le tour est en pause. Tu peux relancer l’IA.'); }
  }
}

async function finishTurn() {
  const original = session;
  stopMotion();
  const generation = aiGeneration;
  mode = 'transition';
  if(mixedGame()) lockBoardForTransition();
  // Shared-phone games remove the private face before any save or next turn.
  else app.innerHTML = '<section class="screen handoff" aria-label="Plateau masqué"></section>';
  if(!transmit(session)) return renderMask();
  selected = null;
  session.game.selectedWheel = null;
  await persist({type:'end-turn'});
  if(failed || mode !== 'transition' || generation !== aiGeneration || original !== session) return;
  if(document.hidden || landscape()) return renderMask();
  // Passed verdicts may be announced here; an open hidden verdict never stops AI.
  if(mixedGame() || isAIPlayer(session.game, session.game.active)) await confirmReveal();
  else renderMask();
}

function renderResult() {
  const series = seriesOf(session.game);
  if(series && series.completed === series.target) return renderSeriesSummary(series);
  const verdict=session.game.verdict;
  if(!verdict)return renderMask();
  mode='result';
  const draw=verdict.winner===null;
  const winner=draw?null:session.game.players[verdict.winner];
  const reason=verdict.reason==='order'?'Un jeton est sorti hors de l’ordre attendu.':verdict.reason==='draw'?'Deux événements décisifs simultanés désignent des gagnants différents.':`Les ${tokenTotal(session.game.geometryVersion)} jetons sont sortis dans le bon ordre de leur série.`;
  app.innerHTML=`<section class="screen result">${brand}<p class="eyebrow">FIN DE PARTIE</p><div class="avatar" aria-hidden="true">${draw?'=':symbol(winner.symbol)}</div><h1 tabindex="-1">${draw?'Égalité !':`${escape(winner.name)} gagne !`}</h1><p>${reason}</p><div class="actions"><button class="primary" data-action="rematch">Revanche</button><button class="secondary" data-action="statistics">Statistiques</button><button class="secondary" data-action="home">Accueil</button></div></section>`;
  focusFirst();
}


function startingProtocolInfo(series) {
  const config = normalizeStartConfig(session.game.startConfig);
  const positions = Math.ceil(series.completed / 2);
  return `<p class="starting-protocol muted">${config?.mode === 'varied' ? `Départs variés · ${positions} / ${Math.ceil(series.target/2)} positions jouées<br>Code des départs : ${config.seed}` : 'Départs classiques · même position répétée.'}</p>`;
}

function seriesScore(series) {
  const percent = value => series.completed ? new Intl.NumberFormat('fr-FR',{maximumFractionDigits:1}).format(value/series.completed*100) : '0';
  const average = series.completed ? new Intl.NumberFormat('fr-FR',{maximumFractionDigits:1}).format(series.totalTurns/series.completed) : '—';
  return `<div class="series-score">${session.game.players.map((player,index) => `<article><h2>${escape(player.name)}</h2><p>IA · ${levelLabel(playerSettings(player).level)}</p><strong>${series.wins[index]}</strong><span>victoire${series.wins[index]===1 ? '' : 's'} · ${percent(series.wins[index])} %</span></article>`).join('')}</div><dl class="series-totals"><div><dt>Égalités</dt><dd>${series.draws}</dd></div><div><dt>Tours en moyenne</dt><dd>${average}</dd></div></dl>${startingProtocolInfo(series)}`;
}

function renderSeriesSummary(series) {
  mode = 'result';
  const winner = series.wins[0] === series.wins[1] ? null : series.wins[0] > series.wins[1] ? 0 : 1;
  app.innerHTML = `<section class="screen series-screen series-summary">${brand}<p class="eyebrow">SÉRIE TERMINÉE</p><h1 tabindex="-1">Bilan des confrontations</h1><p class="series-completed">${series.completed} / ${series.target} parties terminées</p><p>${winner === null ? 'Les deux IA ont autant de victoires.' : `${escape(session.game.players[winner].name)} remporte la série.`}</p>${seriesScore(series)}<p class="muted">Le premier joueur a alterné à chaque partie. Les résultats ont aussi été ajoutés aux statistiques générales.</p><div class="actions"><button class="primary" data-action="rematch">Nouvelle série</button><button class="secondary" data-action="statistics">Statistiques</button><button class="secondary" data-action="home">Accueil</button></div></section>`;
  focusFirst();
}

async function runSeriesTransition() {
  cancelAITurn();
  const original = session;
  const game = original.game;
  const series = seriesOf(game);
  if(!series || series.completed >= series.target) return renderResult();
  const generation = aiGeneration;
  const current = () => session === original && session.game === game && generation === aiGeneration
    && mode === 'series-next' && !failed && !document.hidden && !landscape();
  mode = 'series-next';
  app.dataset.aiPhase = 'between-games';
  const winner = game.verdict.winner;
  app.innerHTML = `<section class="screen series-screen">${brand}<p class="eyebrow">RÉSULTAT DE LA PARTIE ${series.completed}</p><h1 tabindex="-1">${winner === null ? 'Égalité !' : `${escape(game.players[winner].name)} gagne !`}</h1><p>${series.completed} / ${series.target} parties terminées</p>${seriesScore(series)}<p>La partie ${series.completed+1} va commencer…</p>${speedSlot(false,true)}</section>`;
  if(!await waitForAI(1200,generation) || !current()) return;
  // Yield even in Full, so Pause can stop the series at a match boundary.
  if(!await waitAIFrame(32,generation) || !current()) return;
  const next = createNextSeriesGame(game);
  if(!next) return renderResult();
  session = newSession(next);
  const created = session;
  selected = null;
  mode = 'revealing';
  await persist({type:'series-next',round:next.series.round});
  if(failed || session !== created || generation !== aiGeneration || mode !== 'revealing') return;
  if(document.hidden || landscape()) return renderMask();
  await confirmReveal();
}

function renderRules() {
  mode='rules';
  app.innerHTML=`<section class="screen rules">${brand}<p class="eyebrow">LES RÈGLES</p><h1>Fais-les tomber.<br>Dans le bon ordre.</h1>
    <ol><li>Chacun possède dix jetons : une série de 1 à 5 à gauche et une autre à droite, distinguées par leur couleur et leur symbole.</li><li>À ton tour, choisis une roue et tourne-la lentement. Les deux faces bougent ensemble.</li><li>Tu peux t’arrêter, reprendre et changer de sens sur cette même roue.</li><li>La dernière roue jouée par l’adversaire est interdite. Exception : ton dernier jeton est encore dans la roue 5.</li><li>Pour gagner, sors les dix jetons en respectant l’ordre de 1 à 5 dans chaque série. Tu peux alterner les deux séries. Une sortie hors ordre dans une série fait perdre son propriétaire.</li><li>Contre une IA, appuie sur « Terminer mon tour » et garde le téléphone. À deux humains, appuie sur « Terminer et masquer », puis donne le téléphone au joueur indiqué. Il appuie une seule fois sur le bouton à son prénom pour afficher son plateau.</li></ol>
    ${session && tokenTotal(session.game.geometryVersion) === 5 ? '<p>Ta partie déjà commencée conserve une seule série de cinq jetons et une seule entrée. Pour cette partie, fais sortir les cinq jetons de 1 à 5 pour gagner.</p>' : ''}
    <p>Pose le doigt sur une roue, maintiens-le et fais-le glisser autour de son centre pour la tourner. La roue suit ton mouvement, dans les deux sens, avec une légère aimantation près des alignements. Continue ton geste pour dépasser un alignement. Relâche pour t’arrêter ; garder le doigt immobile ne fait pas tourner. Si tu touches le moyeu, éloigne d’abord le doigt du centre puis poursuis ton geste. Au clavier, sélectionne une roue avec Entrée ou Espace, puis utilise les flèches gauche et droite pour avancer par crans assistés de 6° au maximum.</p><p>Pour faire tomber un jeton, aligne assez largement son ouverture avec une encoche libre de la roue du dessous. Un simple contact des bords ne suffit plus. Si la réception est fermée, prépare cette roue lors d’un autre tour. Les petits repères fixes indiquent les passages.</p><p>En bas du plateau, les jetons déjà arrivés de l’autre joueur apparaissent en transparence, avec son compteur. Ses jetons encore en jeu restent sur sa propre face.</p><p>Le bouton haut-parleur en haut du plateau active ou coupe les sons. Un clic confirme leur réactivation. La rotation produit un frottement discret : plus tu tournes vite, plus les sons se rapprochent ; ils s’arrêtent avec ton geste. Le clic net signale seulement un passage suffisamment ouvert entre deux roues de ta face pendant ton tour ; une seule encoche devant un conduit ne suffit pas. Il accompagne aussi un halo et, si disponible, une brève vibration. Tu entends aussi les chutes adverses, même sur la face cachée, avec un bruit générique. Sur les anciens iPhone ou si aucun son ne sort, désactive le mode silencieux et monte le volume multimédia. Full et les simulations sans plateau restent silencieux.</p><p>Choisis Humain ou IA pour chaque joueur au début de la partie. Les IA ont trois niveaux : Facile, Normal et Difficile. Elles jouent sur cet appareil et ne voient que leur propre face. Contre une IA, ton plateau reste affiché : regarde les roues tourner pendant son tour, puis reprends la main directement. Le bouton « Duel automatique » de l’accueil prépare deux IA. Choisis leurs niveaux, le nombre de parties, les départs et l’affichage, puis lance la série : les IA jouent seules jusqu’au bilan des confrontations. Avec les départs variés, chaque position initiale est jouée deux fois en inversant le premier joueur ; avec les départs classiques, la même position est répétée. Sans plateau, seuls l’avancement et les scores s’affichent, à pleine vitesse. Avec le plateau, tu peux suivre les mouvements et régler la vitesse. Tu peux mettre la série en pause et reprendre quand tu veux. Le résultat est annoncé au passage normal de tour, même si la partie est déjà décidée.</p><p class="muted">Convention de cette adaptation : les sorties simultanées doivent former les prochains numéros consécutifs de chacune des séries concernées. Si des fins simultanées désignent des gagnants différents, la partie est nulle. Le calage des roues est estimé à partir de la vidéo du jeu original ; il ne constitue pas une reproduction exacte.</p>
    <button class="primary" data-action="home">J’ai compris</button></section>`;
}

async function confirmReveal() {
  stopMotion();
  sound.unlock();
  const original = session;
  const generation = aiGeneration;
  // Ne jamais restaurer la permission après une interruption pendant l’écriture.
  const target=acceptReveal(session);
  if(target==='result') recordSeriesResult(session);
  mode='revealing';
  await persist({type:'reveal',target});
  if(failed||mode!=='revealing'||original!==session||generation!==aiGeneration)return;
  if(document.hidden||landscape())return renderMask();
  if(headlessSeries() && !(target === 'result' && session.game.series.completed === session.game.series.target)) {
    const task = runHeadlessSimulation();
    const launchedGeneration = aiGeneration;
    void task.catch(() => {
      if(aiGeneration !== launchedGeneration || mode !== 'ai-simulation' || failed) return;
      cancelAITurn(); renderAIReady('La simulation est en pause. Tu peux la reprendre.');
    });
    return;
  }
  if(target==='result') {
    const series = seriesOf(session.game);
    if(series && series.completed < series.target) await runSeriesTransition();
    else renderResult();
  } else if(isAIPlayer(session.game, session.game.active)) {
    const game = session.game;
    const task = runAITurn();
    const launchedGeneration = aiGeneration;
    // Release previous turns and games instead of retaining an async call chain
    // for the whole series. The next AI turn owns its cancellation guards.
    void task.catch(() => {
      if(session !== original || session.game !== game || aiGeneration !== launchedGeneration
        || mode !== 'ai-play' || failed || document.hidden || landscape()) return;
      cancelAITurn();
      renderAIReady('La simulation est en pause. Tu peux la reprendre.');
    });
  } else renderPlay();
}

function interrupt() {
  if(!session||!['play','handoff','revealing','result','landscape','ai-ready','ai-running','ai-play','transition','series-next','ai-simulation'].includes(mode))return;
  // Releases can occur outside the window. Forget physical contact bookkeeping,
  // then require a fresh activation after the full masked arming delay.
  contacts.clear();keys.clear();blockers.clear();
  renderMask();
}

document.addEventListener('pointerdown',event=>{
  contacts.add(event.pointerId);
  if(contacts.size>1)finishSurfacePress();
  if(stageReady())pointerStage=mode;
},true);
document.addEventListener('pointerup',event=>{contacts.delete(event.pointerId);blockers.delete(event.pointerId);},true);
document.addEventListener('pointercancel',event=>{contacts.delete(event.pointerId);blockers.delete(event.pointerId);},true);
document.addEventListener('keydown',event=>{
  if(['Enter',' '].includes(event.key)&&event.repeat){event.preventDefault();return;}
  if(!event.repeat&&stageReady())keyboardStage=mode;
  keys.add(`key:${event.code}`);
},true);
document.addEventListener('keyup',event=>{keys.delete(`key:${event.code}`);blockers.delete(`key:${event.code}`);},true);

app.addEventListener('click',async event=>{
  const wheel=event.target.closest('[data-wheel]');
  if(wheel&&mode==='play'){
    // Pointer contacts are handled on the stable surface. Virtual clicks select.
    if(event.detail===0)selectWheel(Number(wheel.dataset.wheel),true);
    return;
  }
  const action=event.target.closest('[data-action]')?.dataset.action;
  if(!action)return;
  if(['identify','ai-start','statistics-reset-confirm'].includes(action)&&!activationAllowed(event))return;
  switch(action){
    case 'new':prepare(Boolean(session));break;
    case 'automatic':if(mode==='home')prepare(Boolean(session),false,true);break;
    case 'series-preset':
      if(mode==='preparation') {
        const field = app.querySelector('[name="series-count"]');
        if(field) {field.value = event.target.closest('[data-count]').dataset.count;field.dispatchEvent(new Event('input'));}
      }
      break;
    case 'home':stopMotion();renderHome();break;
    case 'rules':renderRules();break;
    case 'statistics':if(['home','result'].includes(mode))await renderStatistics();break;
    case 'statistics-retry':if(mode==='statistics')await renderStatistics('',true);break;
    case 'statistics-back':
      if(mode!=='statistics')break;
      if(statisticsReturn==='result'&&session?.phase==='revealed-result')renderResult();else renderHome();
      break;
    case 'statistics-reset':if(mode==='statistics')confirmStatisticsReset();break;
    case 'statistics-cancel':if(mode==='statistics-reset')await renderStatistics('',true);break;
    case 'statistics-reset-confirm':await clearStatistics();break;
    case 'resume':renderMask();break;
    case 'identify':if(mode==='handoff'){sound.unlock();await confirmReveal();}break;
    case 'ai-start':if(mode==='ai-ready'){sound.unlock();await confirmReveal();}break;
    case 'ai-pause':interrupt();break;
    case 'pause':interrupt();break;
    case 'sound':
      if(!sound.available) break;
      sound.setEnabled(!sound.enabled);
      try{localStorage.setItem(SOUND_PREFERENCE_KEY,sound.enabled?'on':'off');}catch{/* Optional preference. */}
      if(sound.enabled)sound.confirmEnabled();
      event.target.closest('button').setAttribute('aria-label',sound.enabled?'Couper le son':'Activer le son');
      event.target.closest('button').setAttribute('aria-pressed',String(sound.enabled));
      event.target.closest('button').innerHTML=soundIcon();
      break;
    case 'end':
      if(mode!=='play'||surfacePress||contacts.size||!session.game.engaged)return;
      await finishTurn();
      break;
    case 'rematch':prepare(true,true,Boolean(seriesOf(session.game)));break;
    case 'reload':location.reload();break;
    case 'install':
      if(deferredInstall){await deferredInstall.prompt();deferredInstall=null;}
      else {
        mode='install';
        app.innerHTML=`<section class="screen rules">${brand}<h1>Le jeu, à portée de main.</h1><p>Sur iPhone : ouvre cette adresse dans Safari, touche Partager puis « Sur l’écran d’accueil ».</p><p>Sur Android : utilise le menu du navigateur puis « Installer l’application » ou « Ajouter à l’écran d’accueil ».</p><p>Attends l’indication « Prêt hors ligne » avant de couper la connexion. L’installation est facultative pour jouer.</p><button class="primary" data-action="home">Retour à l’accueil</button></section>`;
      }break;
    case 'update':
      if(mode!=='home')return;
      if(session&&session.phase!=='revealed-result'){mode='update-info';app.innerHTML=`<section class="screen rules">${brand}<h1>Mise à jour disponible</h1><p>Termine la partie en cours avant de mettre à jour le jeu. Ta sauvegarde reste sur cet appareil.</p><button class="primary" data-action="home">Retour</button></section>`;return;}
      registration?.waiting?.postMessage({type:'ACTIVATE_UPDATE'});break;
  }
});

app.addEventListener('keydown',event=>{
  if(mode!=='play')return;
  if(event.target.closest('input,select,textarea,[contenteditable]'))return;
  const wheel=event.target.closest('[data-wheel]');
  if(wheel&&['Enter',' '].includes(event.key)){
    event.preventDefault();if(!event.repeat)selectWheel(Number(wheel.dataset.wheel),true);return;
  }
  if(!['ArrowLeft','ArrowRight'].includes(event.key)||event.altKey||event.metaKey||event.ctrlKey||event.target.closest('button,[data-action]'))return;
  event.preventDefault();
  if(!event.repeat&&!surfacePress)beginSurfaceRotation(event.key==='ArrowLeft'?-1:1,`key:${event.code}`);
});
document.addEventListener('keyup',event=>finishSurfacePress(`key:${event.code}`,true),true);
document.addEventListener('visibilitychange',()=>{if(document.hidden)interrupt();});
window.addEventListener('blur',interrupt);
window.addEventListener('pagehide',interrupt);
window.addEventListener('popstate',interrupt);
window.addEventListener('pageshow',event=>{if(event.persisted)interrupt();});
window.addEventListener('resize',()=>{
  if(surfacePress?.kind==='pointer')finishSurfacePress();
  if(landscape()&&session)interrupt();
  else if(mode==='landscape')renderMask();
});
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstall=event;});

async function cacheStatus() {
  const worker=navigator.serviceWorker.controller||registration?.active;
  if(!worker)return;
  const channel=new MessageChannel();
  channel.port1.onmessage=event=>{
    cacheReady=event.data?.ready===true;
    const status=document.querySelector('#install-status');
    if(status)status.textContent=offlineStatus();
    channel.port1.close();
  };
  worker.postMessage({type:'CACHE_STATUS'},[channel.port2]);
}

async function setupPWA() {
  if(!('serviceWorker' in navigator))return;
  try{
    registration=await navigator.serviceWorker.register('./sw.js',{scope:'./'});
    updateAvailable=Boolean(registration.waiting&&navigator.serviceWorker.controller);
    registration.addEventListener('updatefound',()=>{
      registration.installing?.addEventListener('statechange',()=>{
        if(registration.waiting&&navigator.serviceWorker.controller){updateAvailable=true;if(mode==='home')renderHome();}
        cacheStatus();
      });
    });
    await navigator.serviceWorker.ready;
    await cacheStatus();
    navigator.serviceWorker.addEventListener('controllerchange',()=>{cacheStatus();});
    navigator.serviceWorker.addEventListener('message',event=>{
      if(mode!=='home')return;
      const status=app.querySelector('#install-status');
      if(!status)return;
      if(event.data?.type==='UPDATE_BLOCKED')status.textContent='Ferme les autres fenêtres du jeu, puis réessaie la mise à jour.';
      if(event.data?.type==='UPDATE_ACCEPTED')status.textContent='Mise à jour préparée. Ferme puis rouvre le jeu pour l’utiliser.';
    });
  }catch{const status=document.querySelector('#install-status');if(status)status.textContent='Hors ligne indisponible pour le moment';}
}

async function boot() {
  try{
    session=await loadGame();storageReady=true;
    if(session&&session.game.schemaVersion!==1)throw new Error('Version de sauvegarde incompatible');
    const previousGeometry=session?.game.geometryVersion;
    const upgraded=session&&upgradeGameGeometry(session.game);
    if(session) app.dataset.geometryVersion = session.game.geometryVersion;
    const identified=session&&await ensureLegacyStatisticsIdentity(session.game);
    if(session)renderMask();else renderHome();
    if(upgraded||identified)await persist({type:upgraded?'geometry-upgrade':'statistics-identity',from:previousGeometry,to:session.game.geometryVersion});
    setupPWA();
  }catch(error){failStorage(error);}
}
boot();
