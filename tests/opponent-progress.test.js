import test from 'node:test';
import assert from 'node:assert/strict';
import { getOpponentProgress, renderOpponentProgress } from '../src/opponent-progress.js';
import {
  GEOMETRY_VERSION, PREVIOUS_GEOMETRY_VERSION, LEGACY_GEOMETRY_VERSION,
  WHEELS, boardHeightFor, centerFor, trayPosition,
} from '../src/geometry.js';
import { tokenTotal } from '../src/tokens.js';

const VERSIONS = [LEGACY_GEOMETRY_VERSION, PREVIOUS_GEOMETRY_VERSION, GEOMETRY_VERSION];

function game(geometryVersion = GEOMETRY_VERSION) {
  return {
    geometryVersion,
    players: [{name:'Camille',color:'#F5AC45'}, {name:'Léa',color:'#63D0B1'}],
    faces: [{exited:[1]}, {exited:geometryVersion === GEOMETRY_VERSION ? [1,6,2] : [1,2]}],
  };
}

function summary(geometryVersion = GEOMETRY_VERSION, exited = [1,6,2]) {
  return {name:'Léa',color:'#63D0B1',geometryVersion,totalTokens:tokenTotal(geometryVersion),exited};
}

function places(svg) {
  return [...svg.matchAll(/data-opponent-slot="(\d+)"[^>]*transform="translate\(([-\d.]+) ([-\d.]+)\)"/g)]
    .map(([,id,x,y])=>({id:Number(id),x:Number(x),y:Number(y)}));
}

for (const version of VERSIONS) {
  for (const viewer of [0,1]) {
    test(`${version}, viewer ${viewer}: projection contains only the other player’s collected results`, () => {
      const source=game(version);
      const opponent=1-viewer;
      const projected=getOpponentProgress(source,viewer);
      assert.deepEqual(projected,{
        name:source.players[opponent].name,color:source.players[opponent].color,
        geometryVersion:version,totalTokens:version===GEOMETRY_VERSION?10:5,
        exited:source.faces[opponent].exited,
      });
      assert.deepEqual(Object.keys(projected).sort(),['color','exited','geometryVersion','name','totalTokens']);
      assert.notEqual(projected.exited,source.faces[opponent].exited);
      projected.exited.push(5);
      assert.equal(source.faces[opponent].exited.includes(5),false);
      source.faces[opponent].exited.push(4);
      assert.equal(projected.exited.includes(4),false);
    });

    test(`${version}, viewer ${viewer}: the ghost stays bounded and separated from every own collection place and wheel`, () => {
      const local=summary(version,Array.from({length:tokenTotal(version)},(_,index)=>index+1));
      const svg=renderOpponentProgress(local,viewer);
      const coordinates=places(svg);
      assert.equal(coordinates.length,tokenTotal(version));
      const expectedX=viewer===0?[216,238,260,282,304]:[24,46,68,90,112];
      for(const [index,position] of coordinates.entries()) {
        assert.equal(position.x,expectedX[index%5]);
        assert.equal(position.y,493+Math.floor(index/5)*24);
        assert.ok(position.x-9>=0&&position.x+9<=360);
        assert.ok(position.y-9>=0&&position.y+10<=boardHeightFor(version));
        for(let own=0;own<tokenTotal(version);own++) {
          const target=trayPosition(viewer,own,version);
          assert.ok(Math.hypot(position.x-target.x,position.y-target.y)>9+12,
            'a ghost token does not overlap an own collected token');
        }
        for(const wheel of WHEELS) {
          const center=centerFor(viewer,wheel.id);
          assert.ok(Math.hypot(position.x-center.x,position.y-center.y)>wheel.radius+9,
            'the ghost does not cover a wheel');
        }
      }
      assert.match(svg,/class="opponent-title"[^>]*y="470"/);
    });
  }
}

test('projection never reads live positions, angles, events, verdict or the viewer’s exited tokens', () => {
  for(const viewer of [0,1]) {
    const source=game();
    for(const key of ['verdict','events','angles','engaged','lastWheel']) {
      Object.defineProperty(source,key,{get(){throw new Error(`private ${key}`);}});
    }
    for(const face of source.faces)for(const key of ['queue','slots']) {
      Object.defineProperty(face,key,{get(){throw new Error(`private face ${key}`);}});
    }
    Object.defineProperty(source.faces[viewer],'exited',{get(){throw new Error('own progress is not part of this projection');}});
    for(const player of source.players) {
      Object.defineProperty(player,'controller',{get(){throw new Error('private player metadata');}});
    }
    const result=getOpponentProgress(source,viewer);
    assert.equal(result.name,source.players[1-viewer].name);
  }
});

test('projection and rendering accept frozen inputs without modifying them', () => {
  const source=game();
  source.players.forEach(Object.freeze);
  source.faces.forEach(face=>{Object.freeze(face.exited);Object.freeze(face);});
  Object.freeze(source.players);Object.freeze(source.faces);Object.freeze(source);
  const projected=getOpponentProgress(source,0);
  const before=structuredClone(projected);
  Object.freeze(projected.exited);Object.freeze(projected);
  assert.doesNotThrow(()=>renderOpponentProgress(projected,0));
  assert.deepEqual(projected,before);
});

test('the two printed 1s retain distinct opponent identities and the existing series colours', () => {
  const svg=renderOpponentProgress(summary(GEOMETRY_VERSION,[1,6]),0);
  assert.equal((svg.match(/data-opponent-token=/g)??[]).length,2);
  assert.match(svg,/data-opponent-token="1" data-opponent-series="0" data-opponent-number="1"/);
  assert.match(svg,/data-opponent-token="6" data-opponent-series="1" data-opponent-number="1"/);
  assert.match(svg,/fill="#63D0B1"/);
  assert.match(svg,/fill="#F5AC45"/);
  assert.match(svg,/série gauche : 1\. série droite : 1\./);
  assert.match(svg,/<circle cx="5\.3" cy="-5\.3" r="1\.3"/);
  assert.match(svg,/<path d="m5\.3-7 1\.7 1\.7-1\.7 1\.7-1\.7-1\.7z"/);
});

test('only collected IDs have an identity; empty slots stay faint and non-interactive', () => {
  const svg=renderOpponentProgress(summary(GEOMETRY_VERSION,[2,7]),0);
  assert.equal((svg.match(/data-opponent-slot=/g)??[]).length,10);
  assert.equal((svg.match(/data-opponent-token=/g)??[]).length,2);
  assert.match(svg,/data-opponent-token="2"/);
  assert.match(svg,/data-opponent-token="7"/);
  assert.doesNotMatch(svg,/\bdata-token(?:=|\s)|\bdata-wheel(?:=|-)|\btabindex=|role="button"|aria-live=/);
  assert.match(svg,/class="opponent-progress" data-opponent-progress pointer-events="none" opacity="0\.48" role="img"/);
  assert.match(svg,/Léa : 2 sur 10/);
});

test('accessible results keep the full name while the visible title uses at most twelve characters', () => {
  const local=summary();local.name='abcdefghijklmnopqrst';
  const svg=renderOpponentProgress(local,0);
  assert.match(svg,/aria-label="Jetons collectés de abcdefghijklmnopqrst : 3 sur 10\./);
  assert.match(svg,/>abcdefghijk… · 3\/10<\/text>/);
  assert.doesNotMatch(svg,/>abcdefghijklmnopqrst ·/);
  assert.match(renderOpponentProgress(summary(LEGACY_GEOMETRY_VERSION,[]),1),/0 sur 5\. série gauche : aucun\./);
});

test('untrusted names are escaped in text and attributes and invalid colours cannot inject markup', () => {
  const local=summary();local.name='Léa <script>"&\'attaque</script>';local.color='#fff" onload="attaque';
  const svg=renderOpponentProgress(local,0);
  assert.match(svg,/Léa &lt;script&gt;&quot;&amp;&#39;attaque&lt;\/script&gt;/);
  assert.doesNotMatch(svg,/<script|onload=|fill="#fff"/);
  assert.match(svg,/fill="#F5AC45"/);
  assert.match(svg,/fill="#63D0B1"/);
});

test('rendering ignores duplicates, invalid IDs and metadata outside the summary contract', () => {
  const local=summary(GEOMETRY_VERSION,[1,1,6,0,11,NaN,'2',null]);
  for(const key of ['verdict','queue','slots','events','angles','faces']) {
    Object.defineProperty(local,key,{get(){throw new Error(`forbidden ${key}`);}});
  }
  const svg=renderOpponentProgress(local,0);
  assert.match(svg,/2 sur 10/);
  assert.equal((svg.match(/data-opponent-token=/g)??[]).length,2);
  const old=renderOpponentProgress(summary(LEGACY_GEOMETRY_VERSION,[1,6]),0);
  assert.match(old,/1 sur 5/);
  assert.doesNotMatch(old,/data-opponent-token="6"/);
});

test('missing summaries render nothing and absent geometry keeps the historical five-token profile', () => {
  assert.equal(renderOpponentProgress(undefined,0),'');
  assert.equal(renderOpponentProgress(null,1),'');
  const source=game();delete source.geometryVersion;
  const projected=getOpponentProgress(source,0);
  assert.equal(projected.geometryVersion,LEGACY_GEOMETRY_VERSION);
  assert.equal(projected.totalTokens,5);
});

test('invalid viewer indices are rejected rather than selecting an arbitrary player', () => {
  for(const viewer of [-1,2,'0',undefined,null]) {
    assert.throws(()=>getOpponentProgress(game(),viewer),RangeError);
    assert.throws(()=>renderOpponentProgress(summary(),viewer),RangeError);
  }
});
