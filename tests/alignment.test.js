import test from 'node:test';
import assert from 'node:assert/strict';
import { passageStates, endGateStates, alignmentHint } from '../src/alignment.js';
import { renderBoard } from '../src/board.js';
import { WHEELS, gates, normalizeAngle, notchAngle, GEOMETRY_VERSION, inputGates } from '../src/geometry.js';
import { mouthInterval, passableMouthInterval, openingOverlap } from '../src/openings.js';

function view(faceIndex = 0) {
  return {
    faceIndex, name: 'Camille', color: '#F5AC45',
    angles: WHEELS.map(wheel => notchAngle(faceIndex, wheel.id, 0, 0)),
    queue: [1, 2, 3, 4, 5], exited: [],
    slots: WHEELS.map(wheel => Array(wheel.notches).fill(null)),
    allowedWheels: [1, 2, 3, 4, 5], engaged: null,
  };
}

function orient(local, wheelId, notch, gate) {
  const direction = local.faceIndex === 1 ? -1 : 1;
  local.angles[wheelId - 1] = normalizeAngle(gate - direction * notch * 360 / WHEELS[wheelId - 1].notches);
}

for (const faceIndex of [0, 1]) {
  test(`face ${faceIndex}: all passages recognise local notch order and require an empty receiver`, () => {
    for (const gate of gates(faceIndex)) {
      const from = WHEELS[gate.from - 1];
      const to = WHEELS[gate.to - 1];
      for (let source = 0; source < from.notches; source++) {
        for (let target = 0; target < to.notches; target++) {
          const local = view(faceIndex);
          local.slots[from.id - 1][source] = 1;
          orient(local, from.id, source, gate.sourceAngle);
          orient(local, to.id, target, gate.targetAngle);
          const status = passageStates(local).find(item => item.from === from.id && item.to === to.id);
          assert.equal(status.sourceAligned, source);
          assert.equal(status.receiverAligned, target);
          assert.equal(status.receiverAlignedOccupied, -1);
          assert.equal(status.state, 'ready');
          local.slots[to.id - 1][target] = 2;
          const full = passageStates(local).find(item => item.from === from.id && item.to === to.id);
          assert.equal(full.receiverAligned, -1);
          assert.equal(full.receiverAlignedOccupied, target);
          assert.equal(full.state, 'receiver-full');
        }
      }
    }
  });

  test(`face ${faceIndex}: markers require the same twenty-unit shared width as the engine`, () => {
    const local = view(faceIndex);
    const gate = gates(faceIndex)[0];
    local.slots[0][0] = 1;
    orient(local, 1, 0, gate.sourceAngle + 5);
    orient(local, 2, 0, gate.targetAngle - 5);
    assert.equal(passageStates(local)[0].state, 'ready');
    assert.ok(openingOverlap(1,local.angles[0],gate.sourceAngle,2,local.angles[1],gate.targetAngle));
    orient(local,2,0,gate.targetAngle+5);
    assert.ok(mouthInterval(1,local.angles[0],gate.sourceAngle));
    assert.ok(mouthInterval(2,local.angles[1],gate.targetAngle));
    assert.ok(passableMouthInterval(1,local.angles[0],gate.sourceAngle));
    assert.ok(passableMouthInterval(2,local.angles[1],gate.targetAngle));
    assert.equal(openingOverlap(1,local.angles[0],gate.sourceAngle,2,local.angles[1],gate.targetAngle),null);
    assert.equal(passageStates(local)[0].state, 'receiver-closed');
    orient(local,1,0,gate.sourceAngle+12);
    orient(local,2,0,gate.targetAngle);
    assert.ok(mouthInterval(1,local.angles[0],gate.sourceAngle));
    assert.equal(passageStates(local)[0].state, 'source-closed');
    orient(local,1,0,gate.sourceAngle);
    assert.equal(passageStates(local)[0].state, 'ready');
  });
}

test('a source needs a visible token; an aligned empty hole does not advertise a pending fall', () => {
  const local = view();
  const gate = gates(0)[0];
  orient(local, 1, 0, gate.sourceAngle);
  orient(local, 2, 0, gate.targetAngle);
  assert.equal(passageStates(local)[0].state, 'source-closed');
});

test('entry and exit markers distinguish empty openings from loaded passages', () => {
  const local = view();
  orient(local, 1, 0, 270);
  orient(local, 5, 0, 90);
  const [entry, exit] = endGateStates(local);
  assert.equal(entry.ready, true);
  assert.equal(exit.open, true);
  assert.equal(exit.ready, false);
  local.slots[0][0] = 1;
  local.slots[4][0] = 2;
  assert.equal(endGateStates(local)[0].ready, false);
  assert.equal(endGateStates(local)[1].ready, true);
});

test('entry and exit markers keep narrow visible ports closed', () => {
  for (const faceIndex of [0, 1]) {
    const local = view(faceIndex);
    orient(local, 1, 0, 270 + 12);
    orient(local, 5, 0, 90 + 9);
    local.slots[4][0] = 1;
    assert.ok(mouthInterval(1, local.angles[0], 270));
    assert.ok(mouthInterval(5, local.angles[4], 90));
    const [entry, exit] = endGateStates(local);
    assert.equal(entry.open, false);
    assert.equal(entry.ready, false);
    assert.equal(exit.open, false);
    assert.equal(exit.ready, false);
  }
});

test('the hint chooses the closest visible loaded exit and respects the one-wheel turn', () => {
  const local = view();
  local.slots[1][0] = 1;
  local.angles[1] = 100; // nearest outlet is wheel 4, rather than wheel 3.
  local.angles[3] = 40;
  assert.equal(alignmentHint(local, 2), 'Roue 2 → 4 : prépare une encoche libre sur 4.');
  local.engaged = 2;
  assert.equal(alignmentHint(local, 2), 'Réception fermée : prépare la roue 4 à un autre tour.');
  const gate = gates(0).find(item => item.from === 2 && item.to === 4);
  orient(local, 4, 0, gate.targetAngle);
  assert.equal(alignmentHint(local, 2), 'Roue 4 prête : amène ton jeton vers le passage.');
  local.slots[3][0] = 2;
  assert.match(alignmentHint(local, 2), /occupée.*autre tour/);
});

test('help remains concise for queue loading, empty receiving wheels and the tray', () => {
  const local = view();
  assert.match(alignmentHint(local, null), /deux encoches/);
  assert.match(alignmentHint(local, 1), /charger/);
  local.slots[4][0] = 1;
  assert.match(alignmentHint(local, 5), /sortie du bas/);
  local.slots[1][0] = 2;
  for (const engaged of [null, 1, 2, 3, 4, 5]) {
    local.engaged = engaged;
    for (const selected of [null, 1, 2, 3, 4, 5]) assert.ok(alignmentHint(local, selected).length <= 90);
  }
  local.slots[0][0] = 3;
  orient(local, 2, 0, gates(0)[0].targetAngle);
  local.engaged = 2;
  assert.match(alignmentHint(local, 2), /autre tour|passage|encoche/);
});

test('helpers and fixed markers read no opponent, events, physical angles or hidden verdict', () => {
  const local = view();
  const before = {
    passages: passageStates(local), ends: endGateStates(local),
    hints: [null, 1, 2, 3, 4, 5].map(selected => alignmentHint(local, selected)),
    board: renderBoard(local),
  };
  for (const name of ['faces', 'events', 'verdict', 'opponent', 'game', 'physicalAngles']) {
    Object.defineProperty(local, name, { get() { throw new Error(`private access: ${name}`); } });
  }
  assert.deepEqual(passageStates(local), before.passages);
  assert.deepEqual(endGateStates(local), before.ends);
  assert.deepEqual([null, 1, 2, 3, 4, 5].map(selected => alignmentHint(local, selected)), before.hints);
  assert.equal(renderBoard(local), before.board);
});

test('the SVG has fourteen fixed geometric port markers and no misleading 15-degree ruler', () => {
  const local = view();
  const board = renderBoard(local);
  assert.equal((board.match(/class="passage-marker is-/g) ?? []).length, 14);
  assert.match(board, /data-port="1-2-source" data-port-angle="60\.562"/);
  assert.match(board, /data-port="input" data-port-angle="270\.000"/);
  assert.match(board, /data-port="output" data-port-angle="90\.000"/);
  assert.doesNotMatch(board, /stroke="#A8BCBC"/);
  assert.equal((board.match(/data-token=/g) ?? []).length, 5);
  const mirror = renderBoard(view(1));
  assert.match(mirror, /data-port="1-2-source" data-port-angle="119\.438"/);
});

for (const face of [0,1]) {
  test(`face ${face}: each new entry marker reads only its own queue lane`, () => {
    const local = {...view(face),geometryVersion:GEOMETRY_VERSION,queue:[1,2,3,4,5,6,7,8,9,10]};
    for (const lane of [0,1]) {
      orient(local,1,0,inputGates(GEOMETRY_VERSION)[lane]);
      const entries = endGateStates(local).filter(gate=>gate.kind.startsWith('input'));
      assert.equal(entries.length, 2);
      assert.equal(entries[lane].ready, true);
      assert.equal(entries[1-lane].ready, false);
      const depleted = {...local,queue:local.queue.filter(id => Math.floor((id-1)/5)!==lane)};
      assert.equal(endGateStates(depleted)[lane].ready,false);
    }
    const svg = renderBoard(local);
    assert.equal((svg.match(/class="passage-marker is-/g) ?? []).length,15);
    assert.match(svg,/data-port="input-0" data-port-angle="210\.000"/);
    assert.match(svg,/data-port="input-1" data-port-angle="330\.000"/);
    assert.match(alignmentHint(local,1),/gauche ou droite/);
  });
}

test('two-series rendering still ignores every hidden-state field and names both visible 1s', () => {
  const local = {...view(),geometryVersion:GEOMETRY_VERSION,queue:[2,3,4,5,7,8,9,10]};
  local.slots[1][0]=1;
  local.slots[1][1]=6;
  const before=renderBoard(local);
  assert.match(before,/jetons 1, série gauche, 1, série droite/);
  for(const name of ['faces','opponent','verdict','events','game']) Object.defineProperty(local,name,{get(){throw new Error(`private ${name}`);}});
  assert.equal(renderBoard(local),before);
  assert.doesNotThrow(()=>alignmentHint(local,2));
});
