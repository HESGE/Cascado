import test from 'node:test';
import assert from 'node:assert/strict';
import { WHEEL_GRAB_MARGIN, wheelAtPoint } from '../src/wheel-hit.js';
import { WHEELS, centerFor } from '../src/geometry.js';
import { createWheelGesture, advanceWheelGesture } from '../src/gesture.js';

function circles(face = 0, scale = 1, offset = {x:0,y:0}) {
  return WHEELS.map(wheel => {
    const center=centerFor(face,wheel.id);
    return {id:wheel.id,x:offset.x+center.x*scale,y:offset.y+center.y*scale,radius:wheel.radius*scale};
  });
}

function between(a, b, distanceFromA) {
  const length=Math.hypot(b.x-a.x,b.y-a.y);
  return {x:a.x+(b.x-a.x)*distanceFromA/length,y:a.y+(b.y-a.y)*distanceFromA/length};
}

for(const face of [0,1]) {
  test(`face ${face}: all physical wheel bodies retain their own target`, () => {
    const wheels=circles(face);
    for(const wheel of wheels) {
      for(const offset of [0,.25,.8,1]) {
        const point={x:wheel.x,y:wheel.y-wheel.radius*offset};
        assert.equal(wheelAtPoint(point,wheels),wheel.id);
        assert.equal(wheelAtPoint(point,[...wheels].reverse()),wheel.id);
      }
    }
  });

  test(`face ${face}: an actual neighbouring disk wins over an enlarged invisible collar`, () => {
    const wheels=circles(face);
    const a=wheels[1],b=wheels[2];
    const point=between(b,a,b.radius-1);
    assert.ok(Math.hypot(point.x-a.x,point.y-a.y)-a.radius<WHEEL_GRAB_MARGIN);
    assert.equal(wheelAtPoint(point,wheels),3);
    assert.equal(wheelAtPoint(point,[...wheels].reverse()),3);
  });

  test(`face ${face}: ambiguous collars choose the nearest rim rather than the nearest centre`, () => {
    const wheels=circles(face);
    const a=wheels[1],b=wheels[2];
    const gap=Math.hypot(b.x-a.x,b.y-a.y)-a.radius-b.radius;
    const point=between(a,b,a.radius+gap/2-.2);
    assert.ok(Math.hypot(point.x-b.x,point.y-b.y)<Math.hypot(point.x-a.x,point.y-a.y));
    assert.equal(wheelAtPoint(point,wheels),2);
    assert.equal(wheelAtPoint(point,[...wheels].reverse()),2);
    assert.equal(wheelAtPoint(between(a,b,a.radius+gap/2+.2),wheels),3);
  });

  test(`face ${face}: exact rim-distance ties are stable across SVG paint order`, () => {
    const wheels=circles(face);
    const a=wheels[1],b=wheels[2];
    const gap=Math.hypot(b.x-a.x,b.y-a.y)-a.radius-b.radius;
    const point=between(a,b,a.radius+gap/2);
    assert.equal(wheelAtPoint(point,wheels),2);
    assert.equal(wheelAtPoint(point,[...wheels].reverse()),2);
  });
}

test('the default collar is sixteen CSS pixels, independent of SVG scale and screen translation', () => {
  assert.equal(WHEEL_GRAB_MARGIN,16);
  for(const scale of [.35,.5,1,1.7,3]) {
    const wheels=circles(0,scale,{x:31.5,y:77.25});
    const first=wheels[0];
    for(const extra of [1,8,16]) {
      assert.equal(wheelAtPoint({x:first.x,y:first.y-first.radius-extra},wheels),1);
    }
    assert.equal(wheelAtPoint({x:first.x,y:first.y-first.radius-16.01},wheels),null);
  }
});

test('a forbidden physical wheel is still resolved and never replaced by an authorised neighbour', () => {
  const wheels=circles();
  wheels[1].allowed=true;
  wheels[2].allowed=false;
  const point=between(wheels[2],wheels[1],wheels[2].radius-1);
  assert.equal(wheelAtPoint(point,wheels),3);
  const legal=[1,2,4,5];
  assert.equal(legal.includes(wheelAtPoint(point,wheels)),false,'the caller can reject this target normally');
});

test('the helper reads no permissions, selected wheel, angles, tokens, result or other game data', () => {
  const wheels=circles();
  for(const wheel of wheels)for(const key of ['allowed','selected','engaged','angle','slots','tokens','verdict']) {
    Object.defineProperty(wheel,key,{get(){throw new Error(`private ${key}`);}});
  }
  Object.defineProperty(wheels,'game',{get(){throw new Error('private game');}});
  assert.equal(wheelAtPoint({x:wheels[0].x,y:wheels[0].y-wheels[0].radius-10},wheels),1);
});

test('frozen circles and the input point remain unchanged', () => {
  const wheels=circles(1,.8,{x:17,y:62});
  const point={x:wheels[4].x,y:wheels[4].y};
  const before=structuredClone({wheels,point});
  wheels.forEach(Object.freeze);Object.freeze(wheels);Object.freeze(point);
  assert.equal(wheelAtPoint(point,wheels),5);
  assert.deepEqual({wheels,point},before);
});

test('custom margins affect only the collar, while invalid margins fall back to the safe default', () => {
  const wheels=circles();const first=wheels[0];
  const point={x:first.x,y:first.y-first.radius-10};
  assert.equal(wheelAtPoint(point,wheels,{margin:0}),null);
  assert.equal(wheelAtPoint(point,wheels,{margin:8}),null);
  assert.equal(wheelAtPoint(point,wheels,{margin:10}),1);
  for(const margin of [NaN,Infinity,-1,'100']) assert.equal(wheelAtPoint(point,wheels,{margin}),1);
  assert.equal(wheelAtPoint({x:first.x,y:first.y},wheels,{margin:0}),1);
});

test('invalid coordinates and circles cannot capture an arbitrary distant point', () => {
  const wheels=circles();
  for(const point of [undefined,null,{}, {x:NaN,y:1},{x:1,y:Infinity},{x:'180',y:101}]) {
    assert.equal(wheelAtPoint(point,wheels),null);
  }
  for(const invalid of [undefined,null,{},[],[
    {id:0,x:0,y:0,radius:100}, {id:6,x:0,y:0,radius:100},
    {id:1,x:NaN,y:0,radius:100}, {id:2,x:0,y:0,radius:Infinity},
    {id:3,x:0,y:0,radius:-1}, {id:4,x:0,y:0,radius:0},
  ]]) assert.equal(wheelAtPoint({x:0,y:0},invalid),null);
  assert.equal(wheelAtPoint({x:-1000,y:-1000},wheels),null);
});

test('the enlarged radius is a start target only; a captured gesture can continue far outside it', () => {
  const wheels=circles();const first=wheels[0];
  const start={x:first.x+first.radius+10,y:first.y};
  assert.equal(wheelAtPoint(start,wheels),1);
  const gesture=createWheelGesture(first,start);
  const far={x:first.x,y:first.y+first.radius+200};
  assert.ok(Math.hypot(far.x-first.x,far.y-first.y)>first.radius+WHEEL_GRAB_MARGIN);
  assert.equal(advanceWheelGesture(gesture,far),90);
  assert.deepEqual(gesture.center,{x:first.x,y:first.y},'the captured centre stays that of the initial wheel');
});
