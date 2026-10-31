import {
  ANGULAR_TOLERANCE, GEOMETRY_VERSION, LEGACY_GEOMETRY_VERSION, SUPPORTED_GEOMETRY_VERSIONS, inputGates, OUTPUT_GATE,
  WHEELS, wheelsFor, gates, normalizeAngle, notchAngle, physicalAngleFor,
} from './geometry.js';
import { tokenNumber, tokenSeries, tokenTotal, queueLanes, nextBySeries } from './tokens.js';
import { mouthInterval, passableMouthInterval, openingOverlap, openingAngleBounds } from './openings.js';

const COLORS = ['#F5AC45', '#63D0B1'];
const SYMBOLS = ['●', '◆'];
const FACE_GATES = [gates(0), gates(1)];
const clone = (value) => JSON.parse(JSON.stringify(value));

export function createGame(players = ['Camille', 'Léa'], starter = 0, geometryVersion = GEOMETRY_VERSION) {
  if (!Array.isArray(players) || players.length !== 2 || ![0, 1].includes(starter)) {
    throw new TypeError('Une partie exige deux joueurs et un premier joueur 0 ou 1.');
  }
  const wheels = wheelsFor(geometryVersion);
  return {
    schemaVersion: 1,
    geometryVersion,
    players: players.map((name, index) => ({ name: String(name).trim() || `Joueur ${index + 1}`, symbol: SYMBOLS[index], color: COLORS[index] })),
    angles: wheels.map(() => 0),
    faces: [0, 1].map(() => ({ queue: Array.from({ length: tokenTotal(geometryVersion) }, (_, index) => index + 1), slots: wheels.map(({ notches }) => Array(notches).fill(null)), exited: [] })),
    active: starter,
    turn: 1,
    engaged: null,
    lastWheel: null,
    verdict: null,
    events: [],
  };
}

/** Adopt the firmer passage rule without replaying any saved movement. */
export function upgradeGameGeometry(state) {
  if (SUPPORTED_GEOMETRY_VERSIONS.includes(state.geometryVersion)) return false;
  if (!['ddc-v1','ddc-v1.1','ddc-v1.2'].includes(state.geometryVersion)) throw new RangeError('Version de géométrie incompatible.');
  state.geometryVersion = LEGACY_GEOMETRY_VERSION;
  return true;
}

function lastTokenOnFive(face) {
  const remaining = face.queue.length + face.slots.flat().filter((token) => token !== null).length;
  return remaining === 1 && face.slots[4].some((token) => token !== null);
}

export function allowedWheels(state) {
  if (state.engaged !== null) return [state.engaged];
  const exception = lastTokenOnFive(state.faces[state.active]);
  return WHEELS.map(({ id }) => id).filter((id) => id !== state.lastWheel || (id === 5 && exception));
}

/** This projection intentionally contains neither opponent data nor the verdict. */
export function getView(state, faceIndex) {
  if (![0, 1].includes(faceIndex)) throw new RangeError('Face inconnue.');
  const face = state.faces[faceIndex];
  return {
    faceIndex,
    geometryVersion: state.geometryVersion,
    ...state.players[faceIndex],
    angles: WHEELS.map(({ id }) => notchAngle(faceIndex, id, 0, state.angles[id - 1], state.geometryVersion)),
    queue: [...face.queue],
    queues: queueLanes(face, state.geometryVersion),
    nextBySeries: nextBySeries(face, state.geometryVersion),
    totalTokens: tokenTotal(state.geometryVersion),
    slots: face.slots.map((slots) => [...slots]),
    exited: [...face.exited],
    next: face.exited.length + 1,
    engaged: state.engaged,
    lastWheel: state.lastWheel,
    allowedWheels: allowedWheels(state),
  };
}

/** Pure rule arbitration for all exits at one mechanical instant. */
export function adjudicateExitBatch(exitedBefore, batches, totalTokens = 5) {
  const causes = [];
  for (const face of [0, 1]) {
    const tokens = [...batches[face]].sort((a, b) => a - b);
    if (tokens.length === 0) continue;
    const invalid = Array.from({ length: totalTokens / 5 }, (_, lane) => {
      const expected = exitedBefore[face].filter(token => tokenSeries(token) === lane).length + 1;
      return tokens.filter(token => tokenSeries(token) === lane)
        .some((token, index) => tokenNumber(token) !== expected + index);
    }).some(Boolean);
    if (invalid || tokens.some(token => token < 1 || token > totalTokens)) {
      causes.push({ face, winner: 1 - face, reason: 'order', tokens });
    } else if (exitedBefore[face].length + tokens.length === totalTokens) {
      causes.push({ face, winner: face, reason: 'complete', tokens });
    }
  }
  if (causes.length === 0) return null;
  const winners = new Set(causes.map(({ winner }) => winner));
  if (winners.size > 1) return { winner: null, reason: 'draw', causes };
  return { winner: causes[0].winner, reason: causes.some(({ reason }) => reason === 'order') ? 'order' : 'complete', causes };
}

function availableNotch(state, faceIndex, wheelId, gate, occupied) {
  return state.faces[faceIndex].slots[wheelId - 1].findIndex((token, notch) =>
    (occupied ? token !== null : token === null)
    && passableMouthInterval(wheelId,notchAngle(faceIndex,wheelId,notch,state.angles[wheelId-1],state.geometryVersion),gate) !== null);
}

function pendingTransfers(state, faceIndex) {
  const face = state.faces[faceIndex];
  const pending = [];
  const reservedEntries = new Set();
  for (const [lane, gate] of inputGates(state.geometryVersion).entries()) {
    const token = face.queue.find(id => tokenSeries(id) === lane);
    if (token === undefined) continue;
    const notch = availableNotch(state, faceIndex, 1, gate, false);
    if (notch >= 0 && !reservedEntries.has(notch)) {
      reservedEntries.add(notch);
      pending.push({ face: faceIndex, token, from: { queue: true, lane }, to: { wheel: 1, notch } });
    }
  }
  for (const gate of FACE_GATES[faceIndex]) {
    const source = availableNotch(state, faceIndex, gate.from, gate.sourceAngle, true);
    if (source < 0) continue;
    const sourceAngle=notchAngle(faceIndex,gate.from,source,state.angles[gate.from-1],state.geometryVersion);
    const target=face.slots[gate.to-1].findIndex((token,notch)=>token===null
      && openingOverlap(gate.from,sourceAngle,gate.sourceAngle,gate.to,
        notchAngle(faceIndex,gate.to,notch,state.angles[gate.to-1],state.geometryVersion),gate.targetAngle)!==null);
    if (target < 0) continue;
    // The fixed links descend. A receiving seat may sit slightly higher while
    // its mouth already overlaps; that must not block this forgiving passage.
    pending.push({ face: faceIndex, token: face.slots[gate.from - 1][source], from: { wheel: gate.from, notch: source }, to: { wheel: gate.to, notch: target } });
  }
  const exiting = availableNotch(state, faceIndex, 5, OUTPUT_GATE, true);
  if (exiting >= 0) pending.push({ face: faceIndex, token: face.slots[4][exiting], from: { wheel: 5, notch: exiting }, to: { exited: true } });
  return pending;
}

/** Atomic closure at a fixed angle. The graph descends, so this always terminates. */
function stabilize(state, movingWheel) {
  const allTransfers = [];
  const exitBatches = [[], []];
  const exitedBefore = state.faces.map(({ exited }) => [...exited]);
  for (;;) {
    const pending = [0, 1].flatMap((faceIndex) => pendingTransfers(state, faceIndex));
    if (pending.length === 0) break;
    // Remove every source before occupying any destination: neither player gets priority.
    for (const transfer of pending) {
      const face = state.faces[transfer.face];
      if (transfer.from.queue) face.queue.splice(face.queue.indexOf(transfer.token), 1);
      else face.slots[transfer.from.wheel - 1][transfer.from.notch] = null;
    }
    for (const transfer of pending) {
      const face = state.faces[transfer.face];
      if (transfer.to.exited) exitBatches[transfer.face].push(transfer.token);
      else face.slots[transfer.to.wheel - 1][transfer.to.notch] = transfer.token;
    }
    allTransfers.push(...pending);
  }
  if (allTransfers.length === 0) return;
  for (const face of [0, 1]) {
    state.faces[face].exited.push(...exitBatches[face].sort((a, b) => a - b));
  }
  const event = {
    id: state.events.length + 1,
    wheel: movingWheel,
    angle: Math.round(state.angles[movingWheel - 1] * 1e9) / 1e9,
    transfers: allTransfers,
  };
  state.events.push(event);
  if (state.verdict === null) {
    const decision = adjudicateExitBatch(exitedBefore, exitBatches, tokenTotal(state.geometryVersion));
    if (decision) {
      state.verdict = {
        ...decision,
        snapshot: clone({
          angles: state.angles,
          faces: state.faces,
          active: state.active,
          turn: state.turn,
          engaged: state.engaged,
          lastWheel: state.lastWheel,
          eventId: event.id,
        }),
      };
    }
  }
}

/** Gate boundaries in physical angle; no frame-rate dependent stepping. */
function trajectoryStops(state, wheelId, delta) {
  const start = state.angles[wheelId - 1];
  const finish = start + delta;
  const low = Math.min(start, finish);
  const high = Math.max(start, finish);
  const direction = Math.sign(delta);
  const wheel = WHEELS[wheelId - 1];
  const stops = [start, finish];
  const addWindow=(face,gate,interval)=>{
    const bounds=openingAngleBounds(wheelId,interval);
    if(!bounds)return;
    for(let notch=0;notch<wheel.notches;notch+=1){
      for(const offset of bounds){
        const base=physicalAngleFor(face,wheelId,notch,gate+offset,state.geometryVersion);
        const first=Math.ceil((low-base)/360);
        const last=Math.floor((high-base)/360);
        for(let revolution=first;revolution<=last;revolution+=1){
          const boundary=base+revolution*360;
          if(direction*(boundary-start)>0&&direction*(finish-boundary)>=0)stops.push(boundary);
        }
      }
    }
  };
  for (const face of [0, 1]) {
    for(const gate of FACE_GATES[face]){
      if(gate.from!==wheelId&&gate.to!==wheelId)continue;
      const movingSource=gate.from===wheelId;
      const other=movingSource?gate.to:gate.from;
      const movingGate=movingSource?gate.sourceAngle:gate.targetAngle;
      const otherGate=movingSource?gate.targetAngle:gate.sourceAngle;
      // Every companion opening is considered, including empty ones. Boundary
      // times never depend on token ownership or a hidden result.
      for(let notch=0;notch<WHEELS[other-1].notches;notch+=1){
        const interval=mouthInterval(other,notchAngle(face,other,notch,state.angles[other-1],state.geometryVersion),otherGate,true);
        if(interval)addWindow(face,movingGate,interval);
      }
    }
    if(wheelId===1)for(const entrance of inputGates(state.geometryVersion))addWindow(face,entrance);
    if(wheelId===5)addWindow(face,OUTPUT_GATE);
  }
  stops.sort((a, b) => direction * (a - b));
  return stops.filter((angle, index) => index === 0 || Math.abs(angle - stops[index - 1]) > ANGULAR_TOLERANCE);
}

/** Mutates only accepted, finite movement. UI controls enforce degrees per second. */
export function rotate(state, wheelId, physicalDeltaDegrees) {
  if (!WHEELS.some(({ id }) => id === wheelId) || !Number.isFinite(physicalDeltaDegrees) || Math.abs(physicalDeltaDegrees) < 1e-12) return false;
  if (!allowedWheels(state).includes(wheelId)) return false;
  state.engaged = wheelId;
  const finish = normalizeAngle(state.angles[wheelId - 1] + physicalDeltaDegrees);
  for (const angle of trajectoryStops(state, wheelId, physicalDeltaDegrees)) {
    state.angles[wheelId - 1] = normalizeAngle(angle);
    stabilize(state, wheelId);
  }
  // A near-duplicate final boundary may be merged, but the commanded angle is exact.
  state.angles[wheelId - 1] = finish;
  stabilize(state, wheelId);
  return true;
}

export function endTurn(state) {
  if (state.engaged === null) return false;
  state.lastWheel = state.engaged;
  state.engaged = null;
  state.active = 1 - state.active;
  state.turn += 1;
  return true;
}
