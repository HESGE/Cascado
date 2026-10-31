/** The only opponent information authorised on a playing surface: collected
 * tokens. This projection never contains a live wheel or a terminal result. */
import { LEGACY_GEOMETRY_VERSION } from './geometry.js';
import { seriesCount, tokenNumber, tokenSeries, tokenTotal } from './tokens.js';

function validateViewer(viewerFaceIndex) {
  if (viewerFaceIndex !== 0 && viewerFaceIndex !== 1) throw new RangeError('Face inconnue.');
}

/** Keep this explicit list: neither the private face nor player metadata is spread. */
export function getOpponentProgress(game, viewerFaceIndex) {
  validateViewer(viewerFaceIndex);
  const opponent = 1 - viewerFaceIndex;
  const geometryVersion = game.geometryVersion ?? LEGACY_GEOMETRY_VERSION;
  return {
    name: game.players[opponent].name,
    color: game.players[opponent].color,
    geometryVersion,
    totalTokens: tokenTotal(geometryVersion),
    exited: [...game.faces[opponent].exited],
  };
}

const escape = value => String(value).replace(/[&<>"']/g,
  character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const palette = color => /^#[\da-f]{6}$/i.test(String(color)) ? String(color) : '#F5AC45';

function appearance(summary, lane) {
  const first = palette(summary.color);
  return {
    color: lane === 0 ? first : first.toUpperCase() === '#63D0B1' ? '#F5AC45' : '#63D0B1',
    label: lane === 0 ? 'série gauche' : 'série droite',
  };
}

function collectedToken(id, summary, lanes) {
  const lane = tokenSeries(id);
  const { color } = appearance(summary, lane);
  const motif = lanes > 1 ? lane === 0
    ? '<circle cx="5.3" cy="-5.3" r="1.3" fill="#173E50"/>'
    : '<path d="m5.3-7 1.7 1.7-1.7 1.7-1.7-1.7z" fill="#173E50"/>' : '';
  return `<circle cy="1" r="9" fill="#032B3C" opacity=".22"/><circle r="9" fill="${color}"/><circle r="6.9" fill="none" stroke="#173E50" stroke-opacity=".28" stroke-width=".65"/><text y="4" fill="#173E50" text-anchor="middle" font-size="12" font-weight="750">${tokenNumber(id)}</text>${motif}`;
}

/** A static, non-interactive collection summary. Deliberately separate its DOM
 * identities from the own-face animation layer's token and rotor selectors. */
export function renderOpponentProgress(summary, viewerFaceIndex) {
  validateViewer(viewerFaceIndex);
  if (!summary) return '';
  const geometryVersion = summary.geometryVersion ?? LEGACY_GEOMETRY_VERSION;
  const total = tokenTotal(geometryVersion);
  const lanes = seriesCount(geometryVersion);
  const exited = [...new Set((summary.exited ?? [])
    .filter(id => Number.isInteger(id) && id >= 1 && id <= total))];
  const name = String(summary.name ?? '').trim() || 'Adversaire';
  const characters = Array.from(name);
  const shortName = characters.length > 12 ? `${characters.slice(0, 11).join('')}…` : name;
  const listed = Array.from({ length: lanes }, (_, lane) => {
    const numbers = exited.filter(id => tokenSeries(id) === lane).map(tokenNumber);
    return `${appearance(summary, lane).label} : ${numbers.length ? numbers.join(', ') : 'aucun'}`;
  }).join('. ');
  const label = `Jetons collectés de ${name} : ${exited.length} sur ${total}. ${listed}.`;
  const left = viewerFaceIndex === 0 ? 216 : 24;
  const places = Array.from({ length: total }, (_, index) => {
    const id = index + 1;
    const lane = tokenSeries(id);
    const collected = exited.includes(id);
    const x = left + index % 5 * 22;
    const y = 493 + lane * 24;
    return `<g class="opponent-slot${collected ? ' is-collected' : ''}" data-opponent-slot="${id}"${collected ? ` data-opponent-token="${id}" data-opponent-series="${lane}" data-opponent-number="${tokenNumber(id)}"` : ''} transform="translate(${x} ${y})">${collected ? collectedToken(id, summary, lanes) : `<circle r="9" fill="none" stroke="#BDD6E0" stroke-width=".7" opacity=".35"/><text y="3.5" fill="#BDD6E0" text-anchor="middle" font-size="10" opacity=".35">${tokenNumber(id)}</text>`}</g>`;
  }).join('');
  return `<g class="opponent-progress" data-opponent-progress pointer-events="none" opacity="0.48" role="img" aria-label="${escape(label)}"><g aria-hidden="true"><text class="opponent-title" x="${left - 9}" y="470" fill="#D7E8ED" font-size="10" font-weight="550">${escape(shortName)} · ${exited.length}/${total}</text>${places}</g></g>`;
}
