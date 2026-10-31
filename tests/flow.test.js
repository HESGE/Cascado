import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,rotate} from '../src/engine.js';
import {newSession,revealTarget,recipientOf,transmit,acceptReveal,visibleTransfers} from '../src/flow.js';

test('une fin cachée ne se révèle pas en reprenant un tour non transmis',()=>{
  const s=newSession(createGame());
  s.game.verdict={winner:1,reason:'order'};
  assert.equal(revealTarget(s),'play');
  assert.equal(recipientOf(s),0);
  assert.equal(acceptReveal(s),'play');
});

test('le passage conserve le destinataire et autorise le résultat après transmission',()=>{
  const s=newSession(createGame());
  rotate(s.game,1,1);
  s.game.verdict={winner:0,reason:'complete'};
  assert.equal(transmit(s),true);
  assert.equal(s.phase,'passed');
  assert.equal(recipientOf(s),1);
  assert.equal(revealTarget(s),'result');
  assert.equal(acceptReveal(s),'result');
  assert.equal(s.phase,'revealed-result');
});

test('un résultat déjà annoncé ne rouvre aucun plateau jouable',()=>{
  const s=newSession(createGame());s.phase='revealed-result';
  s.game.verdict={winner:null,reason:'draw'};
  assert.equal(revealTarget(s),'result');
});

test('un tour sans mouvement ne peut pas être transmis',()=>{
  const s=newSession(createGame());
  assert.equal(transmit(s),false);
  assert.equal(s.phase,'open');
});

test('les animations et sons ne reçoivent que les transferts de la face autorisée',()=>{
  const visible={face:0,token:1,from:{wheel:1,notch:0},to:{wheel:2,notch:1}};
  const hidden={face:1,token:5,from:{wheel:5,notch:0},to:{exited:true}};
  const ordinary=[{id:10,wheel:1,angle:45,transfers:[visible]}];
  const decisive=[{id:9,wheel:1,angle:44,transfers:[hidden]},{id:11,wheel:1,angle:45,transfers:[visible,hidden]}];
  assert.deepEqual(visibleTransfers(ordinary,0),visibleTransfers(decisive,0));
  assert.deepEqual(visibleTransfers(ordinary,1),[]);
  assert.deepEqual(Object.keys(visibleTransfers(decisive,0)[0]).sort(),['angle','from','to','token','wheel']);
});
