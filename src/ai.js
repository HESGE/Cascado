/** Local opponents. Their entire information boundary is the active getView projection. */
import { createGame, rotate } from './engine.js';
import {
  WHEELS, OUTPUT_GATE, gates, inputGates, normalizeAngle, physicalAngleFor,
  notchAngle, angularDistance, SUPPORTED_GEOMETRY_VERSIONS, LEGACY_GEOMETRY_VERSION,
} from './geometry.js';
import { tokenSeries, tokenTotal, queueLanes, nextBySeries } from './tokens.js';

export const AI_LEVELS = Object.freeze([
  Object.freeze({ id: 'easy', label: 'Facile' }),
  Object.freeze({ id: 'normal', label: 'Normal' }),
  Object.freeze({ id: 'hard', label: 'Difficile' }),
]);

const FACE_GATES = [gates(0), gates(1)];
const PROGRESS = [0, 1, 2, 3, 3, 4, 5];
const EPSILON = 1e-6;
const CONFIG = {
  easy: { depth: 1, beam: 1 },
  normal: { depth: 2, beam: 3 },
  // One more own move exposes downstream preparation beyond the next transfer.
  hard: { depth: 4, beam: 4 },
};

function virtualGame(view) {
  const geometryVersion = view.geometryVersion ?? LEGACY_GEOMETRY_VERSION;
  const state = createGame(['', ''], view.faceIndex, geometryVersion);
  state.angles = view.angles.map((angle, index) => physicalAngleFor(view.faceIndex, index + 1, 0, angle, geometryVersion));
  state.faces[view.faceIndex] = {
    queue: [...view.queue], slots: view.slots.map(slots => [...slots]), exited: [...view.exited],
  };
  // No invented observation, move, token or verdict belonging to the other player.
  state.faces[1 - view.faceIndex].queue = [];
  state.engaged = view.engaged;
  state.lastWheel = view.lastWheel;
  return state;
}

function copyPosition(state) {
  return {
    ...state,
    angles: [...state.angles],
    faces: state.faces.map(face => ({
      queue: [...face.queue], slots: face.slots.map(slots => [...slots]), exited: [...face.exited],
    })),
    // Each simulation only needs its new trajectory, not an expanding replay.
    events: [], verdict: null,
  };
}

function location(face, token) {
  if (face.exited.includes(token)) return { wheel: 6, notch: 0 };
  for (const wheel of WHEELS) {
    const notch = face.slots[wheel.id - 1].indexOf(token);
    if (notch >= 0) return { wheel: wheel.id, notch };
  }
  return { wheel: 0, notch: 0 };
}

function phi(state, wheel, notch) {
  return notchAngle(state.active, wheel, notch, state.angles[wheel - 1], state.geometryVersion);
}

/** Distance to preparing the next actual transfer, with empty receiving seats only. */
function readiness(state, token) {
  const face = state.faces[state.active];
  const at = location(face, token);
  if (at.wheel === 6) return 0;
  if (at.wheel === 0) {
    const lane = tokenSeries(token);
    if (queueLanes(face, state.geometryVersion)[lane]?.[0] !== token || face.slots[0][0] !== null) return 360;
    return angularDistance(phi(state, 1, 0), inputGates(state.geometryVersion)[lane]);
  }
  if (at.wheel === 5) return angularDistance(phi(state, 5, at.notch), OUTPUT_GATE);
  let distance = 360;
  for (const gate of FACE_GATES[state.active].filter(gate => gate.from === at.wheel)) {
    for (let receiver = 0; receiver < face.slots[gate.to - 1].length; receiver++) {
      if (face.slots[gate.to - 1][receiver] !== null) continue;
      const sourceDistance = angularDistance(phi(state, at.wheel, at.notch), gate.sourceAngle);
      const targetDistance = angularDistance(phi(state, gate.to, receiver), gate.targetAngle);
      distance = Math.min(distance, sourceDistance + targetDistance);
    }
  }
  return distance;
}

function score(state) {
  const face = state.faces[state.active];
  if (state.verdict?.reason === 'order') return -1e9;
  if (face.exited.length === tokenTotal(state.geometryVersion)) return 1e9;
  let value = face.exited.length * 100000;
  // Keep the next number far more valuable than advancing the rest of the queue.
  // Aligning a source or receiver is useful even when this turn cannot yet transfer.
  for (const [lane, next] of nextBySeries(face, state.geometryVersion).entries()) {
    for (let number = next; number <= 5; number++) {
      const token = lane * 5 + number;
      const weight = 0.12 ** (number - next);
      value += weight * (PROGRESS[location(face, token).wheel] * 1200 - readiness(state, token));
    }
  }
  return value;
}

function candidates(state, legal) {
  const faceIndex = state.active;
  const face = state.faces[faceIndex];
  const targets = [];
  const add = (wheel, notch, angle) => {
    if (!legal.includes(wheel)) return;
    const target = physicalAngleFor(faceIndex, wheel, notch, angle, state.geometryVersion);
    const positive = normalizeAngle(target - state.angles[wheel - 1]);
    // Both trajectories matter: the long way can cross an earlier output and
    // lose, even though its final pose is identical to the short way.
    for (const delta of positive < EPSILON ? [0.05, -0.05] : [positive, positive - 360]) {
      if (!targets.some(move => move.wheel === wheel && Math.abs(move.delta - delta) < EPSILON)) {
        targets.push({ wheel, delta });
      }
    }
  };
  if (face.slots[0][0] === null) {
    queueLanes(face, state.geometryVersion).forEach((queue, lane) => {
      if (queue.length) add(1, 0, inputGates(state.geometryVersion)[lane]);
    });
  }
  for (const gate of FACE_GATES[faceIndex]) {
    const source = face.slots[gate.from - 1];
    const receiving = face.slots[gate.to - 1];
    if (!source.some(token => token !== null) || !receiving.includes(null)) continue;
    for (let notch = 0; notch < source.length; notch++) {
      if (source[notch] !== null) add(gate.from, notch, gate.sourceAngle);
    }
    for (let notch = 0; notch < receiving.length; notch++) {
      if (receiving[notch] === null) add(gate.to, notch, gate.targetAngle);
    }
  }
  for (let notch = 0; notch < face.slots[4].length; notch++) {
    if (face.slots[4][notch] !== null) add(5, notch, OUTPUT_GATE);
  }
  // If the only relevant wheels are forbidden, prepare an empty receiver for
  // the next token, rather than spinning an arbitrary wheel back and forth.
  if (!targets.length) {
    for (const gate of FACE_GATES[faceIndex]) {
      for (let notch = 0; notch < face.slots[gate.to - 1].length; notch++) {
        if (face.slots[gate.to - 1][notch] === null) add(gate.to, notch, gate.targetAngle);
      }
    }
  }
  if (!targets.length && legal.length) targets.push({ wheel: legal[0], delta: 6 });
  return targets;
}

function rankedMoves(state, legal) {
  const ranked = candidates(state, legal).map(move => {
    const after = copyPosition(state);
    const accepted = rotate(after, move.wheel, move.delta);
    return { ...move, after, value: accepted ? score(after) : -Infinity };
  }).filter(move => Math.abs(move.delta) >= 0.5 || move.after.events.some(event =>
    event.transfers.some(transfer => transfer.face === state.active)))
    // Quantized keys form a stable, transitive order. Sub-microdegree floating
    // noise must not change which equally useful route enters the limited beam.
    .sort((a, b) => Math.round(b.value / EPSILON) - Math.round(a.value / EPSILON)
      || Math.round(Math.abs(a.delta) / EPSILON) - Math.round(Math.abs(b.delta) / EPSILON)
      || a.wheel - b.wheel
      || Math.round(a.delta / EPSILON) - Math.round(b.delta / EPSILON));
  if (ranked.length) return ranked;
  const after = copyPosition(state);
  rotate(after, legal[0], 6);
  return [{ wheel: legal[0], delta: 6, after, value: score(after) }];
}

function continuation(state, depth, beam) {
  if (!depth || state.verdict || state.faces[state.active].exited.length === tokenTotal(state.geometryVersion)) return score(state);
  const next = copyPosition(state);
  next.engaged = null;
  // Future opponent rotations are unknown. This is preparation on our own
  // board, never a prediction using an unseen opponent position.
  next.lastWheel = null;
  const ranked = rankedMoves(next, WHEELS.map(({ id }) => id));
  let best = score(next);
  for (const move of ranked.slice(0, beam)) {
    best = Math.max(best, continuation(move.after, depth - 1, beam) - Math.abs(move.delta) * 0.003);
  }
  return best;
}

/** One legal, finite rotation in the active face's clockwise screen direction.
 * No observation beyond view is accepted. Bounded depth/beam keeps it offline
 * and responsive; injectable randomness makes easy-level choices reproducible. */
export function chooseAIMove(view, level = 'normal', options = {}) {
  if (!view || ![0, 1].includes(view.faceIndex) || !Array.isArray(view.allowedWheels)) return null;
  if (view.geometryVersion !== undefined &&
      !SUPPORTED_GEOMETRY_VERSIONS.includes(view.geometryVersion)) return null;
  const legal = [...new Set(view.allowedWheels)].filter(wheel => Number.isInteger(wheel) && wheel >= 1 && wheel <= 5);
  if (!legal.length) return null;
  const config = CONFIG[level] ?? CONFIG.normal;
  const state = virtualGame(view);
  const ranked = rankedMoves(state, legal);
  const safe = ranked.filter(move => move.value > -1e9);
  const pool = safe.length ? safe : ranked;
  let chosen;
  if (level === 'easy') {
    const random = typeof options.random === 'function' ? options.random : Math.random;
    const best = pool[0].value;
    // Small deliberate inaccuracies, while retaining number order whenever a
    // safe alternative exists. Never choose an unrelated destructive spin.
    const near = pool.filter(move => move.value >= best - 140).slice(0, 3);
    const sample = Math.min(0.999999999, Math.max(0, Number(random()) || 0));
    chosen = sample < 0.7 ? near[0] : near[1 + Math.floor((sample - 0.7) / 0.3 * Math.max(1, near.length - 1))] ?? near[0];
  } else {
    let best = -Infinity;
    for (const move of pool.slice(0, config.beam * 2)) {
      const projected = continuation(move.after, config.depth - 1, config.beam);
      // A nearer gain beats the same gain delayed. Root safety always wins.
      const value = projected * 0.85 + move.value * 0.15 - Math.abs(move.delta) * 0.003;
      if (value > best + EPSILON) { best = value; chosen = move; }
    }
  }
  if (!chosen) return null;
  return { wheel: chosen.wheel, localDelta: chosen.delta * (view.faceIndex === 0 ? 1 : -1) };
}
