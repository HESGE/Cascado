/** Render only one authorised player's projection, never a complete game. */
import {
  WHEELS as geometryWheels, LINKS as geometryLinks, LEGACY_GEOMETRY_VERSION,
  NOTCH_RADIUS, inputGates, queuePosition, trayPosition, trayEntry, boardHeightFor,
} from './geometry.js';
import { tokenPositions } from './motion.js';
import { renderOpponentProgress } from './opponent-progress.js';
import { passageStates, endGateStates } from './alignment.js';
import { tokenNumber, tokenSeries, tokenTotal, seriesCount, nextBySeries } from './tokens.js';

const WHEELS = geometryWheels.map(wheel => ({ ...wheel, r: wheel.radius, n: wheel.notches }));
const LINKS = geometryLinks.map(({ from, to }) => [from, to]);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const f = value => number(value).toFixed(3);
const point = (radius, degrees) => {
  const radians = number(degrees) * Math.PI / 180;
  return [radius * Math.cos(radians), radius * Math.sin(radians)];
};
const palette = color => /^#[\da-f]{6}$/i.test(String(color)) ? color : '#F5AC45';
const geometryOf = view => view.geometryVersion ?? LEGACY_GEOMETRY_VERSION;

export function seriesAppearance(view, lane = 0) {
  const first = palette(view.color);
  return {
    color: palette(view.seriesColors?.[lane] ?? (lane === 0 ? first
      : first.toUpperCase() === '#63D0B1' ? '#F5AC45' : '#63D0B1')),
    label: lane === 0 ? 'série gauche' : 'série droite',
    symbol: lane === 0 ? '●' : '◆',
  };
}

function token(value, x, y, view) {
  if (!Number.isInteger(value) || value < 1 || value > tokenTotal(geometryOf(view))) return '';
  const label = tokenNumber(value);
  const lane = tokenSeries(value);
  const { color } = seriesAppearance(view, lane);
  const motif = seriesCount(geometryOf(view)) > 1 ? lane === 0
    ? '<circle cx="7" cy="-7" r="1.8" fill="#173E50"/>'
    : '<path d="m7-9.4 2.4 2.4L7-4.6 4.6-7z" fill="#173E50"/>' : '';
  return `<g class="board-token" data-token="${value}" data-token-number="${label}" data-series="${lane}" transform="translate(${f(x)} ${f(y)})" aria-hidden="true">
    <circle cy="1.5" r="12" fill="#032B3C" opacity=".22"/>
    <circle r="12" fill="${color}"/><circle r="9.1" fill="none" stroke="#173E50" stroke-opacity=".28" stroke-width=".8"/>
    <text y="5.5" fill="#173E50" text-anchor="middle" font-size="16" font-weight="750">${label}</text>
    ${motif}
  </g>`;
}

function renderWheel(wheel, view, color) {
  const { id, x, y, r, n } = wheel;
  const base = number(view.angles?.[id - 1]);
  const direction = view.faceIndex === 1 ? -1 : 1;
  const selected = (view.selected ?? view.engaged) === id;
  const allowed = (view.allowedWheels ?? [1, 2, 3, 4, 5]).includes(id);
  const interactive = allowed && !view.readOnly;
  const slots = view.slots?.[id - 1] ?? [];
  const cutouts = Array.from({ length: n }, (_, k) => `<g transform="rotate(${f(direction * k * 360 / n)})"><circle cx="${r - NOTCH_RADIUS}" r="${NOTCH_RADIUS}" fill="black"/><rect x="${r - NOTCH_RADIUS}" y="${-NOTCH_RADIUS}" width="40" height="${2*NOTCH_RADIUS}" fill="black"/></g>`).join('');
  const ownTokens = slots.filter(value => Number.isInteger(value) && value >= 1 && value <= tokenTotal(geometryOf(view)))
    .map(value => seriesCount(geometryOf(view)) > 1 ? `${tokenNumber(value)}, ${seriesAppearance(view, tokenSeries(value)).label}` : String(value));
  const contents = ownTokens.length ? `, jeton${ownTokens.length > 1 ? 's' : ''} ${ownTokens.join(', ')}` : ', vide';
  const label = `Roue ${id}${view.engaged === id ? ', engagée pour ce tour' : selected ? ', sélectionnée' : ''}${allowed ? '' : ', interdite pour ce tour'}${contents}`;
  return `<g class="board-wheel${selected ? ' is-selected' : ''}${allowed ? '' : ' is-forbidden'}" data-wheel="${id}" role="button" tabindex="${interactive ? '0' : '-1'}" aria-label="${escape(label)}" aria-disabled="${!interactive}" aria-pressed="${selected}">
    <circle class="wheel-well" cx="${x}" cy="${y}" r="${r + 2.5}" fill="#07384D"/>
    ${selected ? `<circle cx="${x}" cy="${y}" r="${r + 5}" fill="none" stroke="${color}" stroke-width="3"/>` : ''}
    <g transform="translate(${x} ${y})"><g data-wheel-rotor="${id}" transform="rotate(${f(base)})">
      <mask id="wheel-cutout-${id}" maskUnits="userSpaceOnUse" x="${-r - 2}" y="${-r - 2}" width="${r * 2 + 4}" height="${r * 2 + 4}"><circle r="${r}" fill="white"/>${cutouts}</mask>
      <g mask="url(#wheel-cutout-${id})"><circle r="${r}" fill="${allowed ? 'url(#ivory-wheel)' : '#D2DCD5'}"/></g>
    </g></g>
    <circle cx="${x}" cy="${y + 1.8}" r="11" fill="#032F43" opacity=".16"/><circle cx="${x}" cy="${y}" r="11" fill="url(#wheel-hub)"/><circle cx="${x}" cy="${y}" r="3" fill="#91A2A1"/>
    <circle class="wheel-focus" cx="${x}" cy="${y}" r="${r + 1}" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-dasharray="4 3"/>
    <circle class="wheel-hit" cx="${x}" cy="${y}" r="${r}" fill="transparent"/>
  </g>`;
}

function portMarker(wheel, angle, status, key) {
  const [dx1, dy1] = point(wheel.r - 3, angle);
  const [dx2, dy2] = point(wheel.r + 4, angle);
  const color = status === 'ready' || status === 'open' ? '#8FE2BF'
    : status === 'full' ? '#F5AC45' : '#B0D3DD';
  const line = `M${f(wheel.x + dx1)} ${f(wheel.y + dy1)}L${f(wheel.x + dx2)} ${f(wheel.y + dy2)}`;
  return `<g class="passage-marker is-${status}" data-port="${key}" data-port-angle="${f(angle)}" opacity="${status === 'closed' ? '.65' : '1'}"><path d="${line}" stroke="#07384D" stroke-width="4.5"/><path d="${line}" stroke="${color}" stroke-width="2.1"/>${status === 'ready' ? `<circle cx="${f(wheel.x + dx2)}" cy="${f(wheel.y + dy2)}" r="1.8" fill="${color}"/>` : ''}</g>`;
}

/** Angles are already local; slot order is reversed on the back face. */
export function renderBoard(view, { opponentProgress = null } = {}) {
  const version = geometryOf(view);
  const total = tokenTotal(version);
  const lanes = seriesCount(version);
  const color = palette(view.color);
  const back = view.faceIndex === 1;
  const mirror = x => back ? 360 - x : x;
  const wheels = WHEELS.map(wheel => ({ ...wheel, x: mirror(wheel.x) }));
  const links = LINKS.map(([from, to]) => {
    const a = wheels[from - 1]; const b = wheels[to - 1];
    return `<path d="M${a.x} ${a.y}L${b.x} ${b.y}"/>`;
  }).join('');
  const exited = (view.exited ?? []).slice(0, total);
  const tray = Array.from({ length: total }, (_, index) => {
    const { x, y } = trayPosition(view.faceIndex, index, version);
    const occupied = lanes > 1 ? exited.includes(index + 1) : exited[index] != null;
    const appearance = seriesAppearance(view, Math.floor(index / 5));
    return occupied ? '' : `<g data-tray-slot="${index + 1}" aria-hidden="true"><circle cx="${f(x)}" cy="${f(y)}" r="11" fill="none" stroke="${lanes > 1 ? appearance.color : '#518698'}" stroke-opacity="${lanes > 1 ? '.7' : '1'}"/><text x="${f(x)}" y="${f(y + 5)}" fill="#B8D0D7" text-anchor="middle" font-size="15">${tokenNumber(index + 1)}</text></g>`;
  }).join('');
  const ramps = Array.from({ length: lanes }, (_, lane) => {
    const low = trayPosition(view.faceIndex, lane * 5, version);
    const entry = trayEntry(view.faceIndex, version, lane);
    return `<path class="tray-ramp" data-tray-lane="${lane}" d="M${mirror(115)} 463V477L${f(entry.x)} ${f(entry.y)}L${f(low.x)} ${f(low.y)}" fill="none" stroke="#064156" stroke-width="27" stroke-linecap="round" stroke-linejoin="round"/><path class="tray-slope" d="M${f(entry.x)} ${f(entry.y + 12)}L${f(low.x)} ${f(low.y + 12)}" fill="none" stroke="${lanes > 1 ? seriesAppearance(view, lane).color : '#3C87A0'}" stroke-opacity="${lanes > 1 ? '.65' : '1'}" stroke-width="1.4" stroke-linecap="round"/>`;
  }).join('');
  const inputs = lanes > 1 ? inputGates(version).map((angle, lane) => {
    const tail = queuePosition(4, lane, version);
    const head = queuePosition(0, lane, version);
    const [dx, dy] = point(WHEELS[0].radius - NOTCH_RADIUS, angle);
    const path = `M${f(tail.x)} ${f(tail.y)}L${f(head.x)} ${f(head.y)}L${f(180 + dx)} ${f(101 + dy)}`;
    return `<path data-queue-lane="${lane}" d="${path}"/><path d="${path}" stroke="${seriesAppearance(view, lane).color}" stroke-opacity=".55" stroke-width="1.4"/>`;
  }).join('') : '<path d="M52 19L180 40V78"/><path d="M52 19L180 40" stroke="#3C87A0" stroke-width="1.4"/>';
  const wheelLabels = [[250, 80], [317, 169], [75, 251], [330, 300], [28, 364]].map(([x, y], index) => `<text x="${mirror(x)}" y="${y}" fill="#B0D3DD" font-size="23" font-weight="550" text-anchor="middle">${index + 1}</text>`).join('');
  const following = lanes > 1 ? nextBySeries(view, version).map((next, lane) =>
    `${seriesAppearance(view, lane).label} ${next > 5 ? 'sortie' : `prochain jeton ${next}`}`).join(', ')
    : number(view.next) > 5 ? 'série sortie' : `prochain jeton ${Math.trunc(number(view.next)) || 1}`;
  const ownLabel = `Plateau de ${view.name ?? 'joueur'}, ${exited.length} jeton${exited.length > 1 ? 's' : ''} arrivé${exited.length > 1 ? 's' : ''}, ${following}`;
  const markers = passageStates(view).map(gate => {
    const sourceStatus = gate.state === 'ready' ? 'ready' : gate.sourceAligned >= 0 ? 'full' : 'closed';
    const receiverStatus = gate.state === 'ready' ? 'ready' : gate.receiverAligned >= 0 ? 'open'
      : gate.receiverAlignedOccupied >= 0 ? 'full' : 'closed';
    return portMarker(wheels[gate.from - 1], gate.sourceAngle, sourceStatus, `${gate.from}-${gate.to}-source`)
      + portMarker(wheels[gate.to - 1], gate.targetAngle, receiverStatus, `${gate.from}-${gate.to}-receiver`);
  }).join('') + endGateStates(view).map(gate => portMarker(wheels[gate.wheel - 1], gate.angle,
    gate.ready ? 'ready' : gate.occupied ? 'full' : gate.open ? 'open' : 'closed', gate.kind)).join('');
  const tokens = tokenPositions(view).map(position => token(position.token, position.x, position.y, view)).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" class="game-board" viewBox="0 0 360 ${boardHeightFor(version)}" role="group" aria-label="${escape(ownLabel)}">
    <defs><linearGradient id="ivory-wheel" x2=".5" y2="1"><stop stop-color="#FFFEF8"/><stop offset="1" stop-color="#EDE9DB"/></linearGradient><linearGradient id="wheel-hub" x2="0" y2="1"><stop stop-color="#FFFFFF"/><stop offset="1" stop-color="#D9DEDC"/></linearGradient></defs>
    <g aria-hidden="true" fill="none" stroke="#07384D" stroke-width="${2*NOTCH_RADIUS}" stroke-linecap="round">${links}${inputs}<path d="M${mirror(115)} 435V479"/></g>
    <g class="board-fixed" pointer-events="none" aria-hidden="true">${ramps}${tray}</g>
    ${wheels.map(wheel => renderWheel(wheel, view, color)).join('')}
    <g class="passage-markers" pointer-events="none" aria-hidden="true" stroke-linecap="round">${markers}</g>
    <g class="board-fixed" pointer-events="none" aria-hidden="true">${wheelLabels}</g>
    <g class="board-tokens" pointer-events="none">${tokens}</g>
    ${opponentProgress ? renderOpponentProgress(opponentProgress, view.faceIndex) : ''}
  </svg>`;
}

export function wheelCenter(id, faceIndex = 0) {
  const wheel = WHEELS[Number(id) - 1];
  return wheel ? { x: faceIndex === 1 ? 360 - wheel.x : wheel.x, y: wheel.y, radius: wheel.r } : null;
}
