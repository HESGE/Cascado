import { renderBoard as boardSVG } from './board.js';
import { createGame, getView } from './engine.js';
import { GEOMETRY_VERSION } from './geometry.js';
import { ORIGINAL_START_ANGLES } from './starting-position.js';

let previewInstance = 0;
const mountedPreviews = new WeakMap();

function previewFace(game, face, namespace) {
  const view = { ...getView(game, face), readOnly: true, selected: null };
  // Both SVGs live in the same document. Local mask/gradient IDs must remain
  // unique, including when Safari resolves a back-face url(#...) reference.
  return boardSVG(view)
    .replace(/\bid="([^"]+)"/g, (_, id) => `id="${namespace}-${id}"`)
    .replace(/url\(#([^\)]+)\)/g, (_, id) => `url(#${namespace}-${id})`)
    .replace('<svg ', '<svg aria-hidden="true" focusable="false" ');
}

/** A fresh illustration, never a projection of the saved/current session.
 * The engine supplies the matching local angles of both physical faces. */
export function rulesPreviewMarkup() {
  const namespace = `rules-preview-${++previewInstance}`;
  const demonstration = createGame(['Face A', 'Face B'], 0, GEOMETRY_VERSION);
  demonstration.angles = [...ORIGINAL_START_ANGLES];
  return `<figure class="rules-preview" data-rules-preview data-preview-paused="false" data-preview-manual="false">
    <div class="rules-preview-stage" role="img" aria-label="Vue en trois dimensions du jeu : deux faces et cinq roues communes.">
      <div class="rules-preview-object" id="${namespace}-object" data-preview-object inert aria-hidden="true">
        <div class="rules-preview-edge rules-preview-edge-left"></div>
        <div class="rules-preview-edge rules-preview-edge-right"></div>
        <div class="rules-preview-edge rules-preview-edge-top"></div>
        <div class="rules-preview-edge rules-preview-edge-bottom"></div>
        <div class="rules-preview-face rules-preview-face-front">${previewFace(demonstration, 0, `${namespace}-a`)}<span class="rules-preview-face-label">Face A</span></div>
        <div class="rules-preview-face rules-preview-face-back">${previewFace(demonstration, 1, `${namespace}-b`)}<span class="rules-preview-face-label">Face B</span></div>
      </div>
    </div>
    <figcaption>Deux faces, les mêmes roues.<br><span>Chaque joueur voit son côté du plateau.</span></figcaption>
    <div class="rules-preview-controls">
      <button class="secondary" type="button" data-preview-toggle aria-controls="${namespace}-object" aria-pressed="false" aria-label="Mettre la rotation en pause">Pause</button>
      <button class="secondary" type="button" data-preview-flip aria-controls="${namespace}-object">Voir l’autre face</button>
    </div>
  </figure>`;
}

/** Returns cleanup for the owner of the rules screen. No frame loop, timer,
 * game action, persistence or session data is used by the presentation. */
export function setupRulesPreview(container) {
  if (!container || typeof container.querySelector !== 'function') return () => {};
  const object = container.querySelector('[data-preview-object]');
  const toggle = container.querySelector('[data-preview-toggle]');
  const flip = container.querySelector('[data-preview-flip]');
  if (!object?.style || typeof toggle?.addEventListener !== 'function'
      || typeof flip?.addEventListener !== 'function') return () => {};
  mountedPreviews.get(container)?.();
  const browser = container.ownerDocument?.defaultView ?? globalThis;
  const preference = typeof browser.matchMedia === 'function'
    ? browser.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let paused = false;
  let manual = false;
  let angle = -18;
  let disposed = false;

  function currentAngle() {
    const transform = typeof browser.getComputedStyle === 'function' ? browser.getComputedStyle(object).transform : '';
    const match = transform?.match(/^matrix3d\(([^)]+)\)$/);
    if (match) {
      const values = match[1].split(',').map(Number);
      if (values.length === 16 && values.every(Number.isFinite)) return Math.atan2(values[8], values[0]) * 180 / Math.PI;
    }
    return angle;
  }

  function sync() {
    container.dataset.previewPaused = String(paused);
    container.dataset.previewManual = String(manual);
    toggle.setAttribute('aria-pressed', String(paused));
    toggle.setAttribute('aria-label', paused ? 'Reprendre la rotation' : 'Mettre la rotation en pause');
    toggle.textContent = paused ? 'Reprendre' : 'Pause';
  }

  function onToggle() {
    if (preference?.matches) return;
    if (manual) {
      angle = currentAngle();
      object.style.setProperty('--preview-from', `${angle}deg`);
      object.style.transform = '';
      manual = false;
      paused = false;
    } else paused = !paused;
    sync();
  }

  function onFlip() {
    const previousAngle = currentAngle();
    const transform = typeof browser.getComputedStyle === 'function' ? browser.getComputedStyle(object).transform : '';
    if (transform && transform !== 'none') object.style.transform = transform;
    manual = true;
    paused = true;
    sync();
    // Preserve the current pose before the explicit half-turn. This layout read
    // happens only on a requested flip, never in an animation frame loop.
    void object.offsetWidth;
    angle = previousAngle + 180;
    object.style.transform = `rotateX(-4deg) rotateY(${angle}deg)`;
    object.style.setProperty('--preview-from', `${angle}deg`);
  }

  function onPreferenceChange() {
    const reduced = Boolean(preference?.matches);
    container.dataset.previewReduced = String(reduced);
    toggle.hidden = reduced;
    if (reduced) {
      manual = true;
      paused = true;
      angle = -18;
      object.style.transform = 'rotateX(-4deg) rotateY(-18deg)';
      object.style.setProperty('--preview-from', '-18deg');
    }
    sync();
  }

  toggle.addEventListener('click', onToggle);
  flip.addEventListener('click', onFlip);
  if (typeof preference?.addEventListener === 'function') preference.addEventListener('change', onPreferenceChange);
  else if (typeof preference?.addListener === 'function') preference.addListener(onPreferenceChange);
  onPreferenceChange();

  function cleanup() {
    if (disposed) return;
    disposed = true;
    toggle.removeEventListener('click', onToggle);
    flip.removeEventListener('click', onFlip);
    if (typeof preference?.removeEventListener === 'function') preference.removeEventListener('change', onPreferenceChange);
    else if (typeof preference?.removeListener === 'function') preference.removeListener(onPreferenceChange);
    container.dataset.previewPaused = 'true';
    if (mountedPreviews.get(container) === cleanup) mountedPreviews.delete(container);
  }
  mountedPreviews.set(container, cleanup);
  return cleanup;
}
