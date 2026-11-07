/** Local opponents. Their entire information boundary is the active getView projection. */
import { createGame, rotate, endTurn, getView, allowedWheels, ONE_PIECE_MODE } from './engine.js';
import { aiPositionKey, aiStagnation, defensiveMode, rememberedOptions } from './ai-memory.js';
import {
  WHEELS, OUTPUT_GATE, gates, inputGates, normalizeAngle, physicalAngleFor,
  notchAngle, angularDistance, SUPPORTED_GEOMETRY_VERSIONS, GEOMETRY_VERSION, LEGACY_GEOMETRY_VERSION,
  MIRROR_GEOMETRY_VERSION, MIRROR_FIVE_GEOMETRY_VERSION,
} from './geometry.js';
import { tokenSeries, tokenNumber, tokenTotal, queueLanes, nextBySeries } from './tokens.js';
import { passableMouthInterval } from './openings.js';

export const AI_LEVELS = Object.freeze([
  Object.freeze({ id: 'easy', label: 'Facile' }),
  Object.freeze({ id: 'normal', label: 'Normal' }),
  Object.freeze({ id: 'hard', label: 'Difficile' }),
  Object.freeze({ id: 'expert', label: 'Expert' }),
]);

const FACE_GATES = [gates(0), gates(1)];
const WHEEL_IDS = WHEELS.map(({ id }) => id);
const PROGRESS = [0, 1, 2, 3, 3, 4, 5];
const EPSILON = 1e-6;
const GUST_COST = 600;
const SHUFFLED_PARKING_COST = Object.freeze([400, 0, 0, 0, 3000]);
const CONFIG = {
  easy: { depth: 1, beam: 1 },
  normal: { depth: 2, beam: 3 },
  // One more own move exposes downstream preparation beyond the next transfer.
  hard: { depth: 4, beam: 4 },
  // Deeper preparation with a narrower branch set, using the same own view.
  expert: { depth: 5, beam: 3 },
};
// The symmetric set benefits from comparing more routes over a shorter horizon:
// intervening shared rotations can invalidate distant own-board preparation.
const MIRROR_EXPERT_CONFIG = Object.freeze({ depth: 3, beam: 6 });

export function gustWheelForAI(view) {
  const wheel = view?.gust?.blockedWheel;
  return view?.gameMode === ONE_PIECE_MODE && view.engaged == null && view.gust?.remaining === 1
    && WHEEL_IDS.includes(wheel) && wheel === view.lastWheel ? wheel : null;
}

function virtualGame(view) {
  const geometryVersion = view.geometryVersion ?? LEGACY_GEOMETRY_VERSION;
  const state = createGame(['', ''], view.faceIndex, geometryVersion);
  state.angles = view.angles.map((angle, index) => physicalAngleFor(view.faceIndex, index + 1, 0, angle, geometryVersion));
  state.faces[view.faceIndex] = {
    queue: [...view.queue], slots: view.slots.map(slots => [...slots]), exited: [...view.exited],
  };
  // No invented observation, move, token or verdict belonging to the other player.
  state.faces[1 - view.faceIndex].queue = [];
  if (view.tokenOrder === 'shuffled') state.shuffledStart = true;
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

function score(state, anticipate = false) {
  const face = state.faces[state.active];
  if (state.verdict?.reason === 'order') return -1e9;
  if (face.exited.length === tokenTotal(state.geometryVersion)) return 1e9;
  const required = nextBySeries(face, state.geometryVersion);
  let value = face.exited.length * 100000;
  const futureWeight = anticipate ? 0.20 : 0.12;
  const downstream = anticipate ? downstreamPreparation(state, state.active) : null;
  // Keep the next number far more valuable than advancing the rest of the queue.
  // Aligning a source or receiver is useful even when this turn cannot yet transfer.
  for (const [lane, next] of required.entries()) {
    if (anticipate && next <= 5) {
      value -= 0.5 * preparationCost(transferPreparation(state, state.active, lane * 5 + next, WHEEL_IDS, downstream));
    }
    for (let number = next; number <= 5; number++) {
      const token = lane * 5 + number;
      const weight = futureWeight ** (number - next);
      value += weight * (PROGRESS[location(face, token).wheel] * 1200 - readiness(state, token));
    }
  }
  if (anticipate) {
    for (const token of face.slots[4]) {
      if (token !== null && tokenNumber(token) > required[tokenSeries(token)]) value -= 3000;
    }
  }
  if (state.shuffledStart) {
    for (const [lane, queue] of queueLanes(face, state.geometryVersion).entries()) {
      // Loading earlier heads makes the next required number accessible.
      const blockers = queue.indexOf(lane * 5 + required[lane]);
      if (blockers > 0) value -= blockers * 750;
    }
    for (let wheel = 0; wheel < face.slots.length; wheel++) {
      for (const token of face.slots[wheel]) {
        if (token !== null && tokenNumber(token) > required[tokenSeries(token)]) {
          // Free the single loading seat; park future numbers on wheels 2–4.
          // A premature number on wheel 5 can be lost on a shared rotation.
          value -= SHUFFLED_PARKING_COST[wheel];
        }
      }
    }
  }
  return value;
}

function candidates(state, legal, anticipate = false) {
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
  // A blocked entrance or next transfer can make downstream preparation
  // useful even when the other series already offers a different move.
  const prepareBlocked = anticipate && state.engaged === null && state.lastWheel !== null
    && nextBySeries(face, state.geometryVersion).some((next, lane) => next <= 5
      && transferPreparation(state, faceIndex, lane * 5 + next, legal).blocked > 0);
  if (!targets.length || prepareBlocked) {
    for (const gate of FACE_GATES[faceIndex]) {
      for (let notch = 0; notch < face.slots[gate.to - 1].length; notch++) {
        if (face.slots[gate.to - 1][notch] === null) add(gate.to, notch, gate.targetAngle);
      }
    }
  }
  if (!targets.length && legal.length) targets.push({ wheel: legal[0], delta: 6 });
  return targets;
}

// Quantized keys keep near-identical trajectories in a stable order.
function compareRankedMoves(a, b) {
  return Math.round(b.value / EPSILON) - Math.round(a.value / EPSILON)
    || Math.round(Math.abs(a.delta) / EPSILON) - Math.round(Math.abs(b.delta) / EPSILON)
    || a.wheel - b.wheel
    || Math.round(a.delta / EPSILON) - Math.round(b.delta / EPSILON);
}

function rankedMoves(state, legal, anticipate = false, relay = false, gustWheel = null) {
  const simulate = move => {
    const after = copyPosition(state);
    // The projection authorises this extra root only. Its virtual gesture
    // bypasses the lock; the live game spends the charge on accepted motion.
    if (move.wheel === gustWheel) after.engaged = move.wheel;
    const accepted = rotate(after, move.wheel, move.delta, { stopOnVerdict: anticipate });
    const value = accepted ? score(after, anticipate) : -Infinity;
    const cost = move.wheel === gustWheel && Math.abs(value) < 1e9 ? GUST_COST : 0;
    return { ...move, after, value: value - cost };
  };
  const ranked = candidates(state, legal, anticipate).map(simulate)
    .filter(move => Math.abs(move.delta) >= 0.5 || ownTransfers(move.after, state.active).length);
  if (gustWheel !== null && !legal.includes(gustWheel)) {
    // Save the single charge for a safe rotation that moves at least one pawn.
    const gustMoves = candidates(state, [gustWheel], anticipate).map(simulate)
      .filter(move => move.value > -1e9 && ownTransfers(move.after, state.active).length);
    ranked.push(...gustMoves);
  }
  ranked.sort(compareRankedMoves);
  if (ranked.length) return relay ? relayFinishes(state, ranked, simulate) : ranked;
  return [simulate({ wheel: legal[0], delta: 6 })];
}

function ownTransfers(state, owner) {
  return state.events.flatMap(event => event.transfers).filter(transfer => transfer.face === owner);
}

function preparedFeed(state, wheel) {
  const face = state.faces[state.active];
  for (const gate of FACE_GATES[state.active]) {
    if (gate.to !== wheel) continue;
    const sourceSeat = face.slots[gate.from - 1].findIndex(token => token !== null);
    if (sourceSeat < 0) continue;
    if (face.slots[wheel - 1].some((token, notch) => token === null
        && passableMouthInterval(wheel, phi(state, wheel, notch), gate.targetAngle) !== null)) {
      return { gate, sourceSeat };
    }
  }
  return null;
}

/** Revisit stops after a transfer opens a seat or puts a new pawn on the wheel.
 * Probe at most two extensions per wheel and direction, at the root only. */
function relayFinishes(state, ranked, simulate) {
  const owner = state.active;
  const prefixes = new Map();
  for (const move of ranked) {
    if (move.after.verdict || !Number.isFinite(move.value)) continue;
    const transfers = ownTransfers(move.after, owner);
    if (!transfers.some(transfer => transfer.from.wheel === move.wheel || transfer.to.wheel === move.wheel)) continue;
    const key = `${move.wheel}:${Math.sign(move.delta)}`;
    const previous = prefixes.get(key);
    if (!previous || Math.abs(move.delta) < Math.abs(previous.delta)) prefixes.set(key, move);
  }
  for (const prefix of prefixes.values()) {
    const { wheel } = prefix;
    const beforeCount = ownTransfers(prefix.after, owner).length;
    const extensions = candidates(prefix.after, [wheel])
      .filter(move => Math.sign(move.delta) === Math.sign(prefix.delta))
      .map(move => ({ wheel, delta: prefix.delta + move.delta }))
      .filter(move => Math.abs(move.delta) <= 360 && !ranked.some(existing =>
        existing.wheel === wheel && Math.abs(existing.delta - move.delta) < EPSILON))
      .sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));
    for (const extension of extensions.slice(0, 2)) {
      // Replay the whole gesture, including any intermediate order verdict.
      const move = simulate(extension);
      if (move.value > -1e9 && (ownTransfers(move.after, owner).length > beforeCount
          || (!move.after.verdict && preparedFeed(move.after, wheel)))) ranked.push(move);
    }
  }
  for (const move of ranked) {
    if (Math.abs(move.value) >= 1e9) continue;
    const transfers = ownTransfers(move.after, owner);
    if (!transfers.some(transfer => transfer.from.wheel === move.wheel || transfer.to.wheel === move.wheel)) continue;
    const distinct = new Set(transfers.map(transfer => transfer.token)).size;
    move.feed = preparedFeed(move.after, move.wheel);
    move.value += distinct >= 2 ? 180 : move.feed ? 60 : 0;
  }
  return ranked.sort(compareRankedMoves);
}

function possibleOpponentFeed(move, owner) {
  if (!move.feed) return false;
  const { gate, sourceSeat } = move.feed;
  const reply = copyPosition(move.after);
  if (!endTurn(reply)) return false;
  const angle = physicalAngleFor(owner, gate.from, sourceSeat, gate.sourceAngle, reply.geometryVersion);
  const positive = normalizeAngle(angle - reply.angles[gate.from - 1]);
  const delta = positive <= 180 ? positive : positive - 360;
  return rotate(reply, gate.from, delta, { stopOnVerdict: true }) && reply.verdict?.reason !== 'order'
    && ownTransfers(reply, owner).some(transfer => transfer.from.wheel === gate.from && transfer.to.wheel === gate.to);
}

function continuation(state, depth, beam, anticipate = false) {
  if (!depth || state.verdict || state.faces[state.active].exited.length === tokenTotal(state.geometryVersion)) return score(state, anticipate);
  const next = copyPosition(state);
  next.engaged = null;
  // Future opponent rotations are unknown. This is preparation on our own
  // board, never a prediction using an unseen opponent position.
  next.lastWheel = null;
  const ranked = rankedMoves(next, WHEEL_IDS, anticipate);
  let best = score(next, anticipate);
  for (const move of ranked.slice(0, beam)) {
    const projected = depth === 1 ? move.value : continuation(move.after, depth - 1, beam, anticipate);
    best = Math.max(best, projected - Math.abs(move.delta) * 0.003);
  }
  return best;
}

function entranceReleaseMoves(state, safeMoves) {
  const face = state.faces[state.active];
  const token = face.slots[0][0];
  // The only pawn on the wheels occupies the entry shared by both queues.
  // Take a transfer the engine can make now, before a shared rotation can
  // close the passage again. Search still compares the viable trajectories.
  if (token === null || !face.queue.length || face.slots.slice(1).some(slots => slots.some(id => id !== null))) {
    return safeMoves;
  }
  const releases = safeMoves.filter(move => move.after.faces[state.active].slots[0][0] !== token);
  return releases.length ? releases : safeMoves;
}

function defensiveValue(state, owner) {
  const own = state.faces[owner];
  const value = score({ ...state, active: owner });
  if (Math.abs(value) >= 1e9) return value;
  const next = own.exited.length + 1;
  // A completed pion stays valuable, without drowning out preparations for
  // the rest of the race in the immediate/horizon blend (100000 previously).
  let planned = value - own.exited.length * 88000;
  const projection = { ...state, active: owner };
  for (let token = next + 1; token <= 5; token++) {
    const ahead = token - next;
    planned += (0.35 ** ahead - 0.12 ** ahead)
      * (PROGRESS[location(own, token).wheel] * 1200 - readiness(projection, token));
  }
  // After a real hypothetical opposing turn, its chosen wheel is forbidden
  // to us. During our unfinished rotation, the next opposing wheel is unknown.
  const legal = state.active === owner && state.engaged === null
    ? allowedWheels(state) : WHEEL_IDS;
  const preparation = transferPreparation(state, owner, next, legal);
  planned -= preparationCost(preparation);
  return planned - own.slots[4].filter(token => token !== null && token > next).length * 3000;
}

function preparationCost({ steps, blocked, remaining }) {
  return steps * 120 + blocked * 180 + remaining * 80;
}

function downstreamPreparation(state, owner) {
  const face = state.faces[owner];
  // Beyond the first transfer, a received pion needs a source rotation at
  // each stage. Count the empty receivers still needing preparation along
  // the cheapest downstream route, even before a pion enters the board.
  const downstream = [0, 8, 8, 8, 8, 1];
  for (let from = 4; from >= 1; from--) {
    for (const gate of FACE_GATES[owner].filter(gate => gate.from === from)) {
      for (let seat = 0; seat < face.slots[gate.to - 1].length; seat++) {
        if (face.slots[gate.to - 1][seat] !== null) continue;
        const angle = notchAngle(owner, gate.to, seat, state.angles[gate.to - 1], state.geometryVersion);
        const receiver = angularDistance(angle, gate.targetAngle) > 1 ? 1 : 0;
        downstream[from] = Math.min(downstream[from], 1 + receiver + downstream[gate.to]);
      }
    }
  }
  return downstream;
}

/** Estimate distinct source/receiver adjustments before the next transfer.
 * This is planning cost, never a relaxation of physical passage conditions. */
function transferPreparation(state, owner, token, legal, downstream) {
  const face = state.faces[owner], at = location(face, token);
  const angle = (wheel, notch) => notchAngle(owner, wheel, notch,
    state.angles[wheel - 1], state.geometryVersion);
  const adjustment = (wheel, distance) => ({
    steps: distance > 1 ? 1 : 0,
    blocked: distance > 1 && !legal.includes(wheel) ? 1 : 0,
  });
  if (at.wheel === 6) return { steps: 0, blocked: 0, remaining: 0 };
  if (at.wheel === 5) return { ...adjustment(5, angularDistance(angle(5, at.notch), OUTPUT_GATE)), remaining: 0 };
  downstream ??= downstreamPreparation(state, owner);
  if (at.wheel === 0) {
    const lane = tokenSeries(token);
    if (face.queue.find(id => tokenSeries(id) === lane) !== token || face.slots[0][0] !== null) {
      return { steps: 3, blocked: 1, remaining: downstream[1] };
    }
    return { ...adjustment(1, angularDistance(angle(1, 0), inputGates(state.geometryVersion)[lane])), remaining: downstream[1] };
  }
  let best = { steps: 3, blocked: 1, remaining: 8 };
  for (const gate of FACE_GATES[owner].filter(gate => gate.from === at.wheel)) {
    const source = adjustment(at.wheel, angularDistance(angle(at.wheel, at.notch), gate.sourceAngle));
    for (let seat = 0; seat < face.slots[gate.to - 1].length; seat++) {
      if (face.slots[gate.to - 1][seat] !== null) continue;
      const target = adjustment(gate.to, angularDistance(angle(gate.to, seat), gate.targetAngle));
      const route = { steps: source.steps + target.steps, blocked: source.blocked + target.blocked,
        remaining: downstream[gate.to] };
      if (preparationCost(route) < preparationCost(best)) best = route;
    }
  }
  return best;
}

/** Include closing motions: opening every available transfer is not always safe. */
function tacticalMoves(state, legal, owner) {
  const projection = { ...state, active: owner };
  const moves = candidates(projection, legal);
  for (const wheel of legal) for (const delta of [-6, 6]) {
    if (!moves.some(move => move.wheel === wheel && Math.abs(move.delta - delta) < EPSILON)) {
      moves.push({ wheel, delta });
    }
  }
  return moves.map(move => {
    const after = copyPosition(state);
    if (!rotate(after, move.wheel, move.delta, { stopOnVerdict: true })) return null;
    return { ...move, after, value: defensiveValue(after, owner) };
  }).filter(Boolean).sort((a, b) => b.value - a.value
    || Math.abs(a.delta) - Math.abs(b.delta) || a.wheel - b.wheel || a.delta - b.delta);
}

function tacticalRole(before, move, owner) {
  const from = before.faces[owner], to = move.after.faces[owner];
  if (to.exited.length > from.exited.length) return 'exit';
  if (to.queue.length < from.queue.length) return 'load';
  if (JSON.stringify(from.slots) !== JSON.stringify(to.slots)) return 'transfer';
  return Math.abs(move.delta) > 6 + EPSILON ? 'prepare' : 'nudge';
}

/** Keep the work budget, but do not spend it on equivalent small rotations. */
function diverseMoves(state, moves, owner, limit) {
  if (moves.length <= limit) return moves;
  const original = moves.slice(0, limit);
  const role = new Map(moves.map(move => [move, tacticalRole(state, move, owner)]));
  const nudges = original.filter(move => role.get(move) === 'nudge').length;
  // Keep productive branches intact. The diagnosed failure was a plateau
  // crowded by small, non-transferring rotations, not a lack of raw depth.
  if (nudges < Math.max(2, Math.ceil(limit / 2))) return original;
  const selected = [];
  const seen = new Set();
  const add = move => {
    if (!move || selected.length >= limit || seen.has(move)) return;
    seen.add(move); selected.push(move);
  };
  for (const move of original.slice(0, Math.max(1, limit - 2))) add(move);
  // A longer receiver preparation must survive the flat-score ±6° tie-break.
  add(moves.find(move => role.get(move) === 'prepare'));
  const representedWheels = new Set(selected.map(move => move.wheel));
  for (const move of moves) {
    if (!representedWheels.has(move.wheel)) { add(move); representedWheels.add(move.wheel); }
  }
  const effects = new Set(selected.map(move => `${move.wheel}:${role.get(move)}:${JSON.stringify(move.after.faces[owner])}`));
  for (const move of moves) {
    const effect = `${move.wheel}:${role.get(move)}:${JSON.stringify(move.after.faces[owner])}`;
    if (!effects.has(effect)) { add(move); effects.add(effect); }
  }
  for (const move of moves) add(move);
  return selected;
}

function opponentReplies(after, owner) {
  const base = copyPosition(after);
  endTurn(base);
  // The opponent's last-token exception is hidden. Conservatively include
  // wheel 5 as possible, without inventing its token positions.
  const legal = WHEELS.map(wheel => wheel.id).filter(id => id !== base.lastWheel || id === 5);
  const targets = candidates({ ...base, active: owner }, legal);
  for (const wheel of legal) for (const delta of [-360, 360, -6, 6]) {
    if (!targets.some(move => move.wheel === wheel && Math.abs(move.delta - delta) < EPSILON)) {
      targets.push({ wheel, delta });
    }
  }
  return targets.map(move => {
    const reply = copyPosition(base);
    // Legality was bounded above, including the possible hidden exception.
    // Engaging the chosen wheel lets the engine replay that physical reply.
    reply.engaged = move.wheel;
    rotate(reply, move.wheel, move.delta, { stopOnVerdict: true });
    if (!reply.verdict) endTurn(reply);
    const value = defensiveValue(reply, owner);
    return { ...move, after: reply, value };
  });
}

function alternatingValue(state, owner, depth, history) {
  const moves = tacticalMoves(state, allowedWheels(state), owner);
  if (!moves.length) return defensiveValue(state, owner);
  if (depth === 1 || moves[0].value >= 1e9) return moves[0].value;
  let best = -Infinity;
  for (const move of moves.slice(0, 2)) {
    if (move.value <= -1e9) { best = Math.max(best, move.value); continue; }
    const replies = opponentReplies(move.after, owner).sort((a, b) => a.value - b.value
      || Math.abs(a.delta) - Math.abs(b.delta) || a.wheel - b.wheel || a.delta - b.delta);
    let worst = Infinity;
    for (const reply of replies.slice(0, 2)) {
      let value = reply.value;
      if (!reply.after.verdict) {
        value = alternatingValue(reply.after, owner, depth - 1, history);
        const key = aiPositionKey(getView(reply.after, owner));
        value -= history.filter(previous => previous === key).length * 500;
      }
      worst = Math.min(worst, value);
    }
    if (!Number.isFinite(worst)) worst = move.value;
    best = Math.max(best, worst * .8 + move.value * .2 - Math.abs(move.delta) * .003);
  }
  return best;
}

/** Own move, possible opposing rotation, then an actually legal own response. */
function chooseDefensiveMove(view, level, options) {
  const owner = view.faceIndex;
  const state = virtualGame(view);
  const legal = [...new Set(view.allowedWheels)].filter(id => Number.isInteger(id) && id >= 1 && id <= 5);
  if (!legal.length) return null;
  const history = rememberedOptions(view, level, options).recentPositions ?? [];
  const stagnation = aiStagnation(view, level, options);
  const roots = tacticalMoves(state, legal, owner);
  const immediateWin = roots.find(move => move.value >= 1e9);
  if (immediateWin) return { wheel: immediateWin.wheel, localDelta: immediateWin.delta * (owner === 0 ? 1 : -1) };
  const safeOwn = roots.filter(move => move.value > -1e9);
  const pool = safeOwn.length ? safeOwn : roots;
  if (!pool.length) return null;

  // Screen every candidate before narrowing the more expensive alternating
  // search, so a low-scoring shuttering move is not pruned before its safety.
  const guarded = pool.map(move => {
    if (move.value <= -1e9) return { ...move, threats: Infinity, replies: [] };
    const replies = opponentReplies(move.after, owner);
    return { ...move, replies, threats: replies.filter(reply => reply.value <= -1e9).length };
  });
  const minimumThreats = Math.min(...guarded.map(move => move.threats));
  const defended = guarded.filter(move => move.threats === minimumThreats);
  const rootLimit = level === 'expert' ? 12 : 8;
  const replyLimit = level === 'expert' ? 5 : 3;
  // Explore alternative wheels on a blocked route or after repeated turns
  // without moving a pion.
  const blockedNext = transferPreparation(state, owner, state.faces[owner].exited.length + 1, legal).blocked > 0;
  const shortlist = stagnation.turns >= 4 || blockedNext
    ? diverseMoves(state, defended, owner, rootLimit) : defended.slice(0, rootLimit);
  let chosen = shortlist[0];
  let best = -Infinity;
  for (const move of shortlist) {
    const replies = [...move.replies].sort((a, b) => a.value - b.value
      || Math.abs(a.delta) - Math.abs(b.delta) || a.wheel - b.wheel || a.delta - b.delta);
    let worst = Infinity;
    for (const reply of replies.slice(0, replyLimit)) {
      let value = reply.value;
      if (!reply.after.verdict) {
        value = alternatingValue(reply.after, owner, 2, history);
        const key = aiPositionKey(getView(reply.after, owner));
        value -= history.filter(previous => previous === key).length * 500;
      }
      worst = Math.min(worst, value);
    }
    if (!Number.isFinite(worst)) worst = move.value;
    const kind = tacticalRole(state, move, owner);
    const escapeCost = stagnation.turns >= 4 && (kind === 'prepare' || kind === 'nudge')
      ? Math.min(300, (stagnation.turns - 3)
        * (30 * stagnation.wheelCounts[move.wheel - 1] + (kind === 'nudge' ? 15 : 0))) : 0;
    const value = worst * .8 + move.value * .2 - Math.abs(move.delta) * .003 - escapeCost;
    if (value > best + EPSILON) { best = value; chosen = move; }
  }
  return { wheel: chosen.wheel, localDelta: chosen.delta * (owner === 0 ? 1 : -1) };
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
  if (defensiveMode(view, level)) return chooseDefensiveMove(view, level, options);
  const anticipate = view.tokenOrder !== 'shuffled' && (level === 'hard' || level === 'expert')
    && (view.geometryVersion === GEOMETRY_VERSION || view.geometryVersion === MIRROR_GEOMETRY_VERSION);
  const relay = anticipate && view.geometryVersion === GEOMETRY_VERSION;
  const config = level === 'expert' && (view.geometryVersion === MIRROR_GEOMETRY_VERSION
    || view.geometryVersion === MIRROR_FIVE_GEOMETRY_VERSION)
    ? MIRROR_EXPERT_CONFIG : CONFIG[level] ?? CONFIG.normal;
  const state = virtualGame(view);
  const gustWheel = gustWheelForAI(view);
  const ranked = rankedMoves(state, legal, anticipate, relay, gustWheel);
  const safe = ranked.filter(move => move.value > -1e9);
  const preferred = relay ? entranceReleaseMoves(state, safe) : safe;
  const pool = preferred.length ? preferred : ranked;
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
      const projected = continuation(move.after, config.depth - 1, config.beam, anticipate);
      // A nearer gain beats the same gain delayed. Root safety always wins.
      // A possible opponent-assisted transfer only breaks close ties.
      const opportunity = relay && possibleOpponentFeed(move, view.faceIndex) ? 12 : 0;
      const futureCost = move.wheel === gustWheel && Math.abs(move.value) < 1e9 ? GUST_COST * 0.85 : 0;
      const value = projected * 0.85 + move.value * 0.15 - futureCost
        - Math.abs(move.delta) * 0.003 + opportunity;
      if (value > best + EPSILON) { best = value; chosen = move; }
    }
  }
  if (!chosen) return null;
  return {
    wheel: chosen.wheel,
    localDelta: chosen.delta * (view.faceIndex === 0 ? 1 : -1),
    ...(chosen.wheel === gustWheel && !legal.includes(chosen.wheel) ? { useGust: true } : {}),
  };
}
