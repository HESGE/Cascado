/** Alignment help reads only the authorised local projection, never game state. */
import {
  LEGACY_GEOMETRY_VERSION, inputGates, OUTPUT_GATE, WHEELS,
  angularDistance, gates, normalizeAngle,
} from './geometry.js';
import { passableMouthInterval, openingOverlap } from './openings.js';
import { queueLanes } from './tokens.js';

function localNotchAngle(view, wheelId, notch) {
  const wheel = WHEELS[wheelId - 1];
  const direction = view.faceIndex === 1 ? -1 : 1;
  return normalizeAngle(Number(view.angles[wheelId - 1]) + direction * notch * 360 / wheel.notches);
}

function alignedNotch(view, wheelId, angle, occupied) {
  return (view.slots[wheelId - 1] ?? []).findIndex((token, notch) =>
    (occupied === null || (occupied ? token !== null : token === null))
    && passableMouthInterval(wheelId,localNotchAngle(view,wheelId,notch),angle)!==null);
}

/** Each index refers only to an encoche of the visible face; -1 means absent. */
export function passageStates(view) {
  return gates(view.faceIndex).map(gate => {
    const sourceAligned = alignedNotch(view, gate.from, gate.sourceAngle, true);
    const receiver=(occupied)=>{
      if(sourceAligned<0)return alignedNotch(view,gate.to,gate.targetAngle,occupied);
      return view.slots[gate.to-1].findIndex((token,notch)=>(occupied?token!==null:token===null)
        && openingOverlap(gate.from,localNotchAngle(view,gate.from,sourceAligned),gate.sourceAngle,
          gate.to,localNotchAngle(view,gate.to,notch),gate.targetAngle)!==null);
    };
    const receiverAligned = receiver(false);
    const receiverAlignedOccupied = receiver(true);
    const state = sourceAligned < 0 ? 'source-closed'
      : receiverAligned >= 0 ? 'ready'
      : receiverAlignedOccupied >= 0 ? 'receiver-full' : 'receiver-closed';
    return { ...gate, sourceAligned, receiverAligned, receiverAlignedOccupied, state };
  });
}

/** The queue and tray have fixed, public ports as well. */
export function endGateStates(view) {
  const version = view.geometryVersion ?? LEGACY_GEOMETRY_VERSION;
  const queues = queueLanes(view, version);
  return [
    ...inputGates(version).map((angle, lane, entries) => ({
      kind: entries.length > 1 ? `input-${lane}` : 'input', lane, wheel: 1, angle,
      open: alignedNotch(view, 1, angle, false) >= 0,
      occupied: alignedNotch(view, 1, angle, true) >= 0,
      ready: queues[lane].length > 0 && alignedNotch(view, 1, angle, false) >= 0,
    })),
    { kind: 'output', wheel: 5, angle: OUTPUT_GATE,
      open: alignedNotch(view, 5, OUTPUT_GATE, null) >= 0,
      occupied: alignedNotch(view, 5, OUTPUT_GATE, true) >= 0,
      ready: alignedNotch(view, 5, OUTPUT_GATE, true) >= 0 },
  ];
}

function nearestLoadedDistance(view, wheelId, angle) {
  const distances = view.slots[wheelId - 1].flatMap((token, notch) => token === null ? []
    : [angularDistance(localNotchAngle(view, wheelId, notch), angle)]);
  return distances.length ? Math.min(...distances) : Infinity;
}

/** Concise explanations of visible geometry, without choosing a strategic move. */
export function alignmentHint(view, selected) {
  if (!WHEELS.some(wheel => wheel.id === selected)) {
    return 'Aligne suffisamment deux encoches pour laisser passer un jeton.';
  }
  const passages = passageStates(view);
  const loaded = view.slots[selected - 1].some(token => token !== null);
  if (loaded && selected === 5) {
    return 'Roue 5 : amène une encoche chargée vers la sortie du bas.';
  }
  if (loaded) {
    const outgoing = passages.filter(gate => gate.from === selected).sort((a, b) =>
      nearestLoadedDistance(view, selected, a.sourceAngle) - nearestLoadedDistance(view, selected, b.sourceAngle));
    const gate = outgoing[0];
    if (gate?.receiverAligned >= 0) {
      return `Roue ${gate.to} prête : amène ton jeton vers le passage.`;
    }
    if (gate?.receiverAlignedOccupied >= 0) {
      return view.engaged === selected
        ? `Réception occupée sur ${gate.to} : libère-la à un autre tour.`
        : `Roue ${selected} → ${gate.to} : prépare une encoche libre sur ${gate.to}.`;
    }
    if (gate) return view.engaged === selected
      ? `Réception fermée : prépare la roue ${gate.to} à un autre tour.`
      : `Roue ${selected} → ${gate.to} : prépare une encoche libre sur ${gate.to}.`;
  }
  if (selected === 1 && view.queue.length) {
    return inputGates(view.geometryVersion ?? LEGACY_GEOMETRY_VERSION).length > 1
      ? 'Roue 1 : tourne vers l’entrée gauche ou droite pour charger un jeton.'
      : 'Roue 1 : amène une encoche sous la file pour charger un jeton.';
  }
  const incoming = passages.filter(gate => gate.to === selected
    && view.slots[gate.from - 1].some(token => token !== null)).sort((a, b) =>
    nearestLoadedDistance(view, a.from, a.sourceAngle) - nearestLoadedDistance(view, b.from, b.sourceAngle));
  if (incoming[0]) {
    const gate = incoming[0];
    if (gate.receiverAligned < 0) return `Roue ${selected} : place une encoche libre face à la roue ${gate.from}.`;
    return view.engaged === selected
      ? `Roue ${selected} prête : le jeton de ${gate.from} pourra arriver à un autre tour.`
      : `Roue ${selected} prête : amène le jeton de la roue ${gate.from} vers le passage.`;
  }
  return `Roue ${selected} vide : prépare une encoche face à un passage.`;
}
