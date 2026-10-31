import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, getView, rotate, endTurn, allowedWheels, adjudicateExitBatch } from '../src/engine.js';
import { GEOMETRY_VERSION, PREVIOUS_GEOMETRY_VERSION, LEGACY_GEOMETRY_VERSION, SUPPORTED_GEOMETRY_VERSIONS,
  inputGates, physicalAngleFor, notchAngle, angularDistance, WHEELS, normalizeAngle } from '../src/geometry.js';
import { tokenNumber, tokenSeries, tokenTotal, queueLanes, nextBySeries } from '../src/tokens.js';

const ids = total => Array.from({length:total}, (_, i) => i+1);
function emptyGame() {
  const game = createGame();
  for (const face of game.faces) face.queue = [];
  return game;
}
function release(game, face, id) {
  game.faces[face].slots[4][0] = id;
  game.angles[4] = physicalAngleFor(face, 5, 0, 90, game.geometryVersion);
  game.engaged = null;game.lastWheel = null;
  rotate(game, 5, .001);
}

test('new game has ten unique IDs split into two 1–5 series on each face', () => {
  const game = createGame();
  assert.equal(tokenTotal(game.geometryVersion),10);
  assert.deepEqual(inputGates(game.geometryVersion),[210,330]);
  for (const face of [0,1]) {
    const view = getView(game,face);
    assert.deepEqual(view.queue, ids(10));
    assert.deepEqual(view.queues, [[1,2,3,4,5],[6,7,8,9,10]]);
    assert.deepEqual(view.queues.map(lane=>lane.map(tokenNumber)),[ids(5),ids(5)]);
    assert.deepEqual(view.nextBySeries,[1,1]);
    assert.equal(view.totalTokens,10);
    assert.equal('faces' in view,false);
    assert.equal('verdict' in view,false);
    assert.equal('events' in view,false);
    view.queues[0].pop();
    assert.deepEqual(game.faces[face].queue,ids(10));
  }
});

test('either entrance loads only its own first token on both faces, even on a tiny move', () => {
  for (const face of [0,1]) for (const lane of [0,1]) {
    const game = emptyGame();
    game.faces[face].queue=ids(10);
    game.angles[0]=physicalAngleFor(face,1,0,inputGates(game.geometryVersion)[lane],game.geometryVersion);
    rotate(game,1,.001);
    const id = lane === 0 ? 1 : 6;
    assert.equal(game.faces[face].slots[0][0],id);
    assert.deepEqual(game.faces[face].queue,ids(10).filter(token=>token!==id));
    const transfer=game.events.flatMap(event=>event.transfers).find(transfer=>transfer.token===id);
    assert.deepEqual(transfer.from,{queue:true,lane});
    assert.deepEqual(queueLanes(game.faces[face],game.geometryVersion)[1-lane],lane===0?[6,7,8,9,10]:[1,2,3,4,5]);
  }
});

test('entrance crossing is detected independently of the input sampling interval', () => {
  for (const face of [0,1]) for (const lane of [0,1]) {
    const base=emptyGame();base.faces[face].queue=lane===0?[1]:[6];
    base.angles[0]=normalizeAngle(physicalAngleFor(face,1,0,inputGates(base.geometryVersion)[lane],base.geometryVersion)-20);
    const coarse=structuredClone(base), fine=structuredClone(base);
    rotate(coarse,1,40);
    for(let step=0;step<400;step++)rotate(fine,1,.1);
    assert.deepEqual(coarse.faces,fine.faces);
    assert.equal(coarse.faces[face].queue.length,0);
  }
});

test('exit orders are independent, five exits alone do not win, all ten do', () => {
  const game=emptyGame();
  for(const id of [6,1,7,2,8])release(game,0,id);
  assert.equal(game.verdict,null);
  assert.deepEqual(nextBySeries(game.faces[0],game.geometryVersion),[3,4]);
  for(const id of [3,9,4,10])release(game,0,id);
  assert.equal(game.verdict,null);
  release(game,0,5);
  assert.equal(game.verdict.winner,0);
  assert.equal(game.verdict.reason,'complete');
  assert.equal(game.verdict.snapshot.faces[0].exited.length,10);
  const first=structuredClone(game.verdict);
  release(game,1,2);
  assert.deepEqual(game.verdict,first,'a later wrong exit cannot replace the first decision');
});

test('a wrong exit loses within its own series, even when another series has advanced', () => {
  assert.equal(adjudicateExitBatch([[6],[]],[[1],[]],10),null);
  assert.equal(adjudicateExitBatch([[1,2,3,4],[]],[[5],[]],10),null);
  assert.equal(adjudicateExitBatch([[6],[]],[[2],[]],10).winner,1);
  assert.equal(adjudicateExitBatch([[1],[]],[[7],[]],10).winner,1);
  assert.equal(adjudicateExitBatch([[],[]],[[1,6],[]],10),null);
  assert.equal(adjudicateExitBatch([[1,6],[]],[[2,3,7,8],[]],10),null);
  const nine=[1,2,3,4,5,6,7,8,9];
  assert.equal(adjudicateExitBatch([nine,nine],[[10],[10]],10).reason,'draw');
});

test('all profiles conserve every ID after full and partial rotations', () => {
  for(const version of SUPPORTED_GEOMETRY_VERSIONS){
    const game=createGame(['A','B'],0,version);
    for(let turn=0;turn<80;turn++){
      const allowed=allowedWheels(game), wheel=allowed[turn%allowed.length];
      rotate(game,wheel,(turn%2?-1:1)*(90+(turn*47)%360));
      endTurn(game);
      for(const face of game.faces){
        const tokens=[...face.queue,...face.slots.flat().filter(id=>id!==null),...face.exited];
        assert.deepEqual(tokens.sort((a,b)=>a-b),ids(tokenTotal(version)));
      }
    }
  }
});

test('old profiles keep one entrance and five tokens; delta2 preserves measured sign', () => {
  for(const version of [PREVIOUS_GEOMETRY_VERSION,LEGACY_GEOMETRY_VERSION]){
    const game=createGame(['A','B'],0,version);
    assert.deepEqual(inputGates(version),[270]);
    assert.deepEqual(getView(game,0).queues,[ids(5)]);
    assert.equal(getView(game,1).totalTokens,5);
  }
  const a=notchAngle(0,2,0,0,GEOMETRY_VERSION);
  const mirroredB=normalizeAngle(180-notchAngle(1,2,0,0,GEOMETRY_VERSION));
  assert.equal(angularDistance((mirroredB-a)%120,90),0);
  assert.equal(tokenSeries(6),1);
});
