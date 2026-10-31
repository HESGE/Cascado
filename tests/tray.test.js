import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD, TOKEN_RADIUS, WHEELS, centerFor, trayPosition, trayEntry, GEOMETRY_VERSION, boardHeightFor, queuePosition } from '../src/geometry.js';
import { renderBoard } from '../src/board.js';
import { tokenPositions } from '../src/motion.js';

for (const face of [0, 1]) {
  test(`face ${face}: the numbered tray slopes down to 1 and leaves room for all five tokens`, () => {
    const slots = Array.from({length:5}, (_,index)=>trayPosition(face,index));
    const wheel = centerFor(face,5);
    for (let index = 0; index < slots.length; index++) {
      const slot = slots[index];
      assert.ok(slot.x - TOKEN_RADIUS >= 16 && slot.x + TOKEN_RADIUS <= BOARD.width - 16);
      assert.ok(slot.y + TOKEN_RADIUS <= BOARD.height - 4);
      assert.ok(Math.hypot(slot.x-wheel.x,slot.y-wheel.y) > WHEELS[4].radius + TOKEN_RADIUS,
        'a collected token never touches wheel 5');
      if (index) {
        const previous = slots[index-1];
        assert.ok(slot.x > previous.x && slot.y < previous.y, '1 remains at the low left end');
        assert.ok(Math.hypot(slot.x-previous.x,slot.y-previous.y) > TOKEN_RADIUS*2);
      }
    }
    // Include the 27-unit rail, rather than just the token centres.
    const entry = trayEntry(face);
    assert.ok(entry.y > 477 && entry.y < slots[4].y, 'the inlet descends to the top of the slope');
    // Leaving the vertical wheel outlet also stays below its solid rim.
    for (let i = 0; i <= 100; i++) {
      const x = wheel.x + (entry.x-wheel.x)*i/100;
      const y = 477 + (entry.y-477)*i/100;
      assert.ok(Math.hypot(x-wheel.x,y-wheel.y) >= WHEELS[4].radius+TOKEN_RADIUS);
    }
    for (let i = 0; i <= 100; i++) {
      const x = entry.x + (slots[0].x-entry.x)*i/100;
      const y = entry.y + (slots[0].y-entry.y)*i/100;
      assert.ok(x-13.5 >= 0 && x+13.5 <= BOARD.width && y+13.5 <= BOARD.height);
      assert.ok(Math.hypot(x-wheel.x,y-wheel.y) > WHEELS[4].radius+13.5,
        'the numbered rail clears the wheel rim');
    }
  });

  test(`face ${face}: empty numbers and collected tokens share the exact same sloping centres`, () => {
    const empty = {faceIndex:face,angles:WHEELS.map(()=>0),queue:[],exited:[],slots:WHEELS.map(w=>Array(w.notches).fill(null))};
    const svg = renderBoard(empty);
    const occupied = {...empty,exited:[1,2,3,4,5]};
    const tokens = tokenPositions(occupied);
    for (let index = 0; index < 5; index++) {
      const slot = trayPosition(face,index);
      assert.match(svg,new RegExp(`data-tray-slot="${index+1}"[^>]*><circle cx="${slot.x.toFixed(3)}" cy="${slot.y.toFixed(3)}"`));
      const token = tokens.find(position=>position.token===index+1);
      assert.equal(token.x,slot.x); assert.equal(token.y,slot.y);
    }
    assert.doesNotMatch(renderBoard(occupied),/data-tray-slot=/,'occupied labels are replaced by their token');
    assert.match(svg,/class="tray-slope"/);
    assert.doesNotMatch(svg,/<rect x="(?:19|186)" y="476"/,'the old horizontal receptacle has gone');
  });
}

for (const face of [0, 1]) {
  test(`face ${face}: the new board fits two complete, sloping collection rows with distinct slots`, () => {
    const positions = Array.from({length:10}, (_, index) => trayPosition(face, index, GEOMETRY_VERSION));
    for (const [index, slot] of positions.entries()) {
      assert.ok(slot.x - TOKEN_RADIUS >= 0 && slot.x + TOKEN_RADIUS <= BOARD.width);
      assert.ok(slot.y + TOKEN_RADIUS <= boardHeightFor(GEOMETRY_VERSION));
      if (index % 5) {
        assert.ok(slot.x > positions[index-1].x);
        assert.ok(slot.y < positions[index-1].y, '1 stays at the lowest end in both rows');
      }
      for (let other = 0; other < index; other++) {
        assert.ok(Math.hypot(slot.x-positions[other].x,slot.y-positions[other].y) >= TOKEN_RADIUS*2,
          'collected tokens of either series never overlap');
      }
    }
    const base = {faceIndex:face,geometryVersion:GEOMETRY_VERSION,color:face ? '#63D0B1' : '#F5AC45',
      angles:WHEELS.map(()=>0),queue:[],exited:[],slots:WHEELS.map(wheel=>Array(wheel.notches).fill(null))};
    const empty = renderBoard(base);
    assert.match(empty, /viewBox="0 0 360 540"/);
    assert.equal((empty.match(/data-tray-slot=/g) ?? []).length, 10);
    assert.equal((empty.match(/data-tray-lane=/g) ?? []).length, 2);
    const occupied = {...base,exited:[6,1]};
    const collected = tokenPositions(occupied);
    for (const id of occupied.exited) {
      const position = collected.find(token=>token.token===id);
      assert.equal(position.x,positions[id-1].x);
      assert.equal(position.y,positions[id-1].y);
      assert.doesNotMatch(renderBoard(occupied),new RegExp(`data-tray-slot="${id}"`));
    }
    assert.match(renderBoard(occupied), /data-tray-slot="2"/);
    assert.match(renderBoard(occupied), /data-tray-slot="7"/);
  });
}

test('both new entry ramps fit five separated tokens inside the portrait board', () => {
  const positions = [0,1].flatMap(lane => Array.from({length:5}, (_, index) => queuePosition(index,lane,GEOMETRY_VERSION)));
  for (const [index, position] of positions.entries()) {
    assert.ok(position.x - TOKEN_RADIUS >= 0 && position.x + TOKEN_RADIUS <= BOARD.width);
    assert.ok(position.y - TOKEN_RADIUS >= 0);
    for (let other=0;other<index;other++) assert.ok(Math.hypot(position.x-positions[other].x,position.y-positions[other].y) >= TOKEN_RADIUS*2);
  }
});
