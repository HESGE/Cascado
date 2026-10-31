import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenPositions, planTokenMotion, sampleTokenPath } from '../src/motion.js';
import { renderBoard } from '../src/board.js';
import { WHEELS, notchAngle, physicalAngleFor, gates, trayPosition, trayEntry, GEOMETRY_VERSION, PREVIOUS_GEOMETRY_VERSION, LEGACY_GEOMETRY_VERSION, queuePosition, slotPosition } from '../src/geometry.js';

function view(faceIndex = 0) {
  return { faceIndex, name: 'Camille', color: '#F5AC45', angles: WHEELS.map(w => notchAngle(faceIndex, w.id, 0, 0, LEGACY_GEOMETRY_VERSION)),
    queue: [1, 2, 3, 4, 5], exited: [], slots: WHEELS.map(w => Array(w.notches).fill(null)), allowedWheels: [1, 2, 3, 4, 5] };
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} ≈ ${expected}`);

for (const face of [0, 1]) {
  test(`face ${face}: local queue, wheel seats and tray retain five distinct token identities`, () => {
    const a = view(face);
    a.queue = [3, 4, 5]; a.slots[0][0] = 2; a.angles[0] = 270; a.exited = [1];
    const points = tokenPositions(a);
    assert.deepEqual(points.map(p => p.token).sort(), [1, 2, 3, 4, 5]);
    const inWheel = points.find(p => p.token === 2); near(inWheel.x, 180); near(inWheel.y, 68);
    const inTray = points.find(p => p.token === 1); near(inTray.x, face === 0 ? 28 : 158); near(inTray.y, 494);
    const first = points.find(p => p.token === 3); near(first.x, 180); near(first.y, 40);
  });

  for (let index = 0; index < 5; index++) {
    test(`face ${face}: exit ${index + 1} descends to the high end and slides downhill to its numbered slot`, () => {
      const value = index + 1;
      const before = view(face); before.queue = []; before.exited = Array.from({length:index}, (_,i)=>i+1);
      before.slots[4][0] = value; before.angles[4] = 90;
      const after = structuredClone(before); after.slots[4][0] = null; after.exited.push(value);
      const [plan] = planTokenMotion(before, after, [{ token: value, from: {wheel: 5, notch: 0}, to: {exited: true} }]);
      assert.equal(plan.kind, 'exit');
      const chuteX = face === 0 ? 115 : 245;
      const entry = trayEntry(face);
      const target = trayPosition(face, index);
      assert.deepEqual(plan.points.slice(-3), [{x:chuteX,y:477}, entry, target]);
      assert.ok(target.x < entry.x && target.y > entry.y, 'the last segment descends to the left, never horizontally');
      near((target.y-entry.y)/(target.x-entry.x), -3.5/26);
      let previousY = plan.points[0].y;
      for (let frame = 0; frame <= 120; frame++) {
        const point = sampleTokenPath(plan, frame / 120);
        assert.ok(point.y >= previousY - 1e-8, 'the token never jumps upwards');
        assert.ok(point.y <= target.y + 1e-8, 'the token stays inside the receptacle');
        if (point.y < 477 - 1e-8) near(point.x, chuteX);
        previousY = point.y;
      }
      assert.deepEqual(sampleTokenPath(plan, 1), target);
    });
  }
}

test('one detent preserves intermediate receiving wheels when a token cascades through aligned openings', () => {
  const before = view(); before.queue = [2,3,4,5]; before.slots[0][0] = 1;
  const after = structuredClone(before); after.slots[0][0] = null; after.slots[2][0] = 1;
  const events = [
    {token:1,from:{wheel:1,notch:0},to:{wheel:2,notch:0}},
    {token:1,from:{wheel:2,notch:0},to:{wheel:3,notch:0}},
  ];
  const [plan] = planTokenMotion(before,after,events);
  assert.ok(plan.points.length >= 3);
  const secondSeat = tokenPositions({...after,slots:WHEELS.map(w=>Array(w.notches).fill(null)).map((s,i)=>i===1?[1,null,null]:s)}).find(p=>p.token===1);
  assert.ok(plan.points.some(p=>Math.hypot(p.x-secondSeat.x,p.y-secondSeat.y)<1e-7));
  assert.deepEqual(sampleTokenPath(plan,0),plan.points[0]);
  const end=tokenPositions(after).find(p=>p.token===1);
  assert.deepEqual(sampleTokenPath(plan,1),{x:end.x,y:end.y});
});

test('moving receivers use the local event orientation, and motion converges exactly on the latest visible notch', () => {
  const before = view(1); before.queue = [2,3,4,5]; before.slots[0][0] = 1;
  const after = structuredClone(before); after.slots[0][0] = null; after.slots[1][0] = 1;
  const gate=gates(1)[0];
  const physical=physicalAngleFor(1,2,0,gate.targetAngle,LEGACY_GEOMETRY_VERSION);
  after.angles[1]=notchAngle(1,2,0,physical-5,LEGACY_GEOMETRY_VERSION);
  const [plan]=planTokenMotion(before,after,[{token:1,wheel:2,angle:physical,from:{wheel:1,notch:0},to:{wheel:2,notch:0}}]);
  const target=tokenPositions(after).find(p=>p.token===1);
  assert.ok(Math.hypot(plan.points[1].x-target.x,plan.points[1].y-target.y)>1);
  const live={x:target.x+2,y:target.y+1};
  assert.deepEqual(sampleTokenPath(plan,1,live),live);
});

test('hidden events cannot create motion and a face change cannot replay the previous player’s paths', () => {
  const a=view(); const b=view(1);
  const hidden=[{face:1,token:1,from:{queue:true},to:{wheel:1,notch:0}}];
  assert.deepEqual(planTokenMotion(a,a,hidden),[]);
  assert.deepEqual(planTokenMotion(a,b,hidden),[]);
});

test('the SVG renders each token once in an independent overlay and preserves accessible wheel contents', () => {
  const a=view(); a.queue=[2,3,4,5]; a.slots[0][0]=1;
  const svg=renderBoard(a);
  assert.equal((svg.match(/data-token=/g)||[]).length,5);
  for(let token=1;token<=5;token++)assert.equal((svg.match(new RegExp(`data-token="${token}"`,'g'))||[]).length,1);
  assert.equal((svg.match(/data-wheel-rotor=/g)||[]).length,5);
  assert.match(svg,/Roue 1, jeton 1/);
  assert.match(svg,/class="board-tokens"/);
});

function animationHarness(run) {
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'performance');
  const oldRaf=globalThis.requestAnimationFrame; const oldCancel=globalThis.cancelAnimationFrame;
  let now=0; let id=0; const frames=new Map();
  Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>now}});
  globalThis.requestAnimationFrame=callback=>{frames.set(++id,callback);return id;};
  globalThis.cancelAnimationFrame=id=>frames.delete(id);
  const rotorNodes=WHEELS.map(w=>({dataset:{wheelRotor:String(w.id)},setAttribute(name,value){this[name]=value;}}));
  const tokenNodes=Array.from({length:10},(_,i)=>({dataset:{token:String(i+1)},setAttribute(name,value){this[name]=value;}}));
  const container={isConnected:true,querySelectorAll:selector=>selector==='[data-token]'?tokenNodes:rotorNodes};
  const tick=time=>{now=time;const waiting=[...frames.values()];frames.clear();for(const frame of waiting)frame(time);};
  try { return run({container,tick,rotorNodes,tokenNodes,setTime:time=>{now=time;},frames}); }
  finally {
    Object.defineProperty(globalThis,'performance',descriptor);
    if(oldRaf)globalThis.requestAnimationFrame=oldRaf;else delete globalThis.requestAnimationFrame;
    if(oldCancel)globalThis.cancelAnimationFrame=oldCancel;else delete globalThis.cancelAnimationFrame;
  }
}

const {animateBoard,cancelBoardMotion,boardMotionRemaining,retimeBoardMotion,finishBoardMotion}=await import('../src/motion.js');
const translated = position => `translate(${position.x.toFixed(4)} ${position.y.toFixed(4)})`;

for (const face of [0, 1]) {
  test(`face ${face}: direct rotation places the rotor and seated token at the exact pointer angle without easing`,()=>animationHarness(({container,tick,rotorNodes,tokenNodes})=>{
    let before=view(face);before.queue=[2,3,4,5];before.slots[0][0]=1;before.angles[0]=350;
    let elapsed=0;
    for(const angle of [359,1,133]) {
      const after=structuredClone(before);after.angles[0]=angle;
      animateBoard(container,before,after,{directRotation:true,reducedMotion:false});
      assert.equal(rotorNodes[0].transform,`rotate(${angle.toFixed(4)})`);
      const target=tokenPositions(after).find(position=>position.token===1);
      assert.equal(tokenNodes[0].transform,translated(target));
      tick(elapsed+=20);
      assert.equal(rotorNodes[0].transform,`rotate(${angle.toFixed(4)})`);
      assert.equal(tokenNodes[0].transform,translated(target));
      assert.ok(!rotorNodes.some(node=>node.transform.includes('NaN')));
      before=after;
    }
    cancelBoardMotion(container);
  }));
}

test('direct rotation keeps an in-flight token continuous across receiver moves and lets it arrive after release',()=>animationHarness(({container,tick,rotorNodes,tokenNodes})=>{
  const before=view();before.angles[0]=264;
  const after=structuredClone(before);after.angles[0]=270;after.queue.shift();after.slots[0][0]=1;
  let impacts=0;
  animateBoard(container,before,after,{events:[{token:1,from:{queue:true},to:{wheel:1,notch:0}}],directRotation:true,onDrop:()=>impacts++,reducedMotion:false});
  tick(100);const firstPosition=tokenNodes[0].transform;
  const moved=structuredClone(after);moved.angles[0]=295;
  animateBoard(container,after,moved,{directRotation:true,onDrop:()=>impacts++,reducedMotion:false});
  assert.equal(rotorNodes[0].transform,'rotate(295.0000)');
  assert.equal(tokenNodes[0].transform,firstPosition,'moving the receiver cannot teleport a falling token');
  tick(160);const secondPosition=tokenNodes[0].transform;
  const continued=structuredClone(moved);continued.angles[0]=310;
  animateBoard(container,moved,continued,{directRotation:true,onDrop:()=>impacts++,reducedMotion:false});
  assert.equal(tokenNodes[0].transform,secondPosition,'another direct update keeps the current visual position');
  // Releasing the pointer schedules no additional rotation or cancellation.
  tick(279);assert.equal(impacts,0);
  tick(281);assert.equal(impacts,1,'the fall keeps its initial 280 ms deadline');
  assert.equal(tokenNodes[0].transform,translated(tokenPositions(continued).find(position=>position.token===1)));
  tick(500);assert.equal(impacts,1);
  cancelBoardMotion(container);
}));

test('switching from direct rotation to keyboard easing preserves the fall and emits its impact only once',()=>animationHarness(({container,tick,setTime,rotorNodes,tokenNodes})=>{
  const before=view();before.angles[0]=264;
  const after=structuredClone(before);after.angles[0]=270;after.queue.shift();after.slots[0][0]=1;
  let impacts=0;
  animateBoard(container,before,after,{events:[{token:1,from:{queue:true},to:{wheel:1,notch:0}}],directRotation:true,onDrop:()=>impacts++,reducedMotion:false});
  tick(100);const inFlight=tokenNodes[0].transform;
  const keyboard=structuredClone(after);keyboard.angles[0]=276;
  animateBoard(container,after,keyboard,{onDrop:()=>impacts++,reducedMotion:false});
  assert.equal(tokenNodes[0].transform,inFlight);
  assert.equal(rotorNodes[0].transform,'rotate(270.0000)','keyboard motion starts at the last direct angle');
  tick(150);assert.equal(rotorNodes[0].transform,'rotate(273.0000)');
  tick(279);assert.equal(impacts,0);
  setTime(281);
  const next=structuredClone(keyboard);next.angles[0]=282;
  animateBoard(container,keyboard,next,{onDrop:()=>impacts++,reducedMotion:false});
  assert.equal(impacts,1,'an arrival between frames is delivered when retargeting');
  tick(500);assert.equal(impacts,1);
  assert.equal(tokenNodes[0].transform,translated(tokenPositions(next).find(position=>position.token===1)));
  cancelBoardMotion(container);
}));

test('masking during a direct gesture cancels the remaining fall and its sound',()=>animationHarness(({container,tick,frames})=>{
  const before=view();const after=structuredClone(before);after.queue.shift();after.slots[0][0]=1;
  let impacts=0;
  animateBoard(container,before,after,{events:[{token:1,from:{queue:true},to:{wheel:1,notch:0}}],directRotation:true,onDrop:()=>impacts++,reducedMotion:false});
  tick(100);cancelBoardMotion(container);
  assert.equal(frames.size,0);
  tick(1000);assert.equal(impacts,0);
}));

test('holding rotation retargets from the current frame and keeps the existing fall clock and single impact',()=>animationHarness(({container,tick,tokenNodes})=>{
  const before=view(); before.angles[0]=264;
  const after=structuredClone(before); after.angles[0]=270;after.queue.shift();after.slots[0][0]=1;
  let impacts=0;
  animateBoard(container,before,after,{events:[{token:1,from:{queue:true},to:{wheel:1,notch:0}}],onDrop:()=>impacts++,reducedMotion:false});
  tick(100);const inFlight=tokenNodes[0].transform;
  const continued=structuredClone(after);continued.angles[0]=276;
  animateBoard(container,after,continued,{onDrop:()=>impacts++,reducedMotion:false});
  assert.equal(tokenNodes[0].transform,inFlight,'retarget cannot jump the current token position');
  tick(279);assert.equal(impacts,0);
  tick(281);assert.equal(impacts,1,'the original fall arrives without being restarted at the second detent');
  tick(500);assert.equal(impacts,1);
  cancelBoardMotion(container);
}));

test('masking immediately cancels all outstanding visuals and their arrival sounds',()=>animationHarness(({container,tick,frames})=>{
  const before=view(); const after=structuredClone(before);after.queue.shift();after.slots[0][0]=1;
  let impacts=0;
  animateBoard(container,before,after,{events:[{token:1,from:{queue:true},to:{wheel:1,notch:0}}],onDrop:()=>impacts++,reducedMotion:false});
  tick(100);cancelBoardMotion(container);
  assert.equal(frames.size,0);
  tick(1000);assert.equal(impacts,0);
}));

test('slower AI falls retain their initial deadline and single impact across progressive wheel renders',()=>animationHarness(({container,tick,tokenNodes,rotorNodes})=>{
  const before=view();before.angles[0]=264;
  let after=structuredClone(before);after.angles[0]=270;after.queue.shift();after.slots[0][0]=1;
  let impacts=0;const slideDurations=[];
  const onSlide=plan=>{if(plan.token===1)slideDurations.push(plan.duration);};
  animateBoard(container,before,after,{events:[{token:1,from:{queue:true},to:{wheel:1,notch:0}}],directRotation:true,durationScale:1.5,onSlide,onDrop:()=>impacts++,reducedMotion:false});
  assert.equal(boardMotionRemaining(container),420);
  assert.deepEqual(slideDurations,[420]);
  for (let time=16;time<420;time+=16) {
    tick(time);const visible=tokenNodes[0].transform;
    const continued=structuredClone(after);continued.angles[0]+=1;
    animateBoard(container,after,continued,{directRotation:true,durationScale:1.5,onSlide,onDrop:()=>impacts++,reducedMotion:false});
    assert.equal(tokenNodes[0].transform,visible,'a receiver update preserves the falling token position');
    assert.equal(rotorNodes[0].transform,`rotate(${continued.angles[0].toFixed(4)})`,'AI engine frames keep direct rotor placement');
    assert.equal(boardMotionRemaining(container),420-time,'repeated scaling never extends the fall');
    assert.equal(impacts,0);
    after=continued;
  }
  tick(419);assert.equal(boardMotionRemaining(container),1);assert.equal(impacts,0);
  tick(420);assert.equal(boardMotionRemaining(container),0);assert.equal(impacts,1);
  assert.equal(tokenNodes[0].transform,translated(tokenPositions(after).find(position=>position.token===1)));
  animateBoard(container,after,after,{directRotation:true,durationScale:1.5,onDrop:()=>impacts++,reducedMotion:false});
  tick(800);assert.equal(impacts,1);assert.deepEqual(slideDurations,[420]);
  cancelBoardMotion(container);
}));

for(const face of [0,1]) {
  test(`face ${face}: a scaled exit follows the same chute and arrives at 630 ms`,()=>animationHarness(({container,tick,tokenNodes})=>{
    const before=view(face);before.queue=[];before.exited=[1,2,3,4];before.slots[4][0]=5;before.angles[4]=90;
    const after=structuredClone(before);after.slots[4][0]=null;after.exited.push(5);
    const events=[{token:5,from:{wheel:5,notch:0},to:{exited:true}}];
    const [plan]=planTokenMotion(before,after,events);let impacts=0;
    animateBoard(container,before,after,{events,directRotation:true,durationScale:1.5,onDrop:()=>impacts++,reducedMotion:false});
    assert.equal(boardMotionRemaining(container),630);
    tick(315);assert.equal(tokenNodes[4].transform,translated(sampleTokenPath(plan,.5)));
    assert.equal(boardMotionRemaining(container),315);assert.equal(impacts,0);
    tick(629);assert.equal(impacts,0);
    tick(630);assert.equal(impacts,1);assert.equal(boardMotionRemaining(container),0);
    assert.equal(tokenNodes[4].transform,translated(trayPosition(face,4)));
    tick(1000);assert.equal(impacts,1);
    cancelBoardMotion(container);
  }));
}

test('remaining motion measures only a moving eased rotor, while direct rotation has no rotor delay',()=>animationHarness(({container,tick,rotorNodes})=>{
  const before=view();
  assert.equal(boardMotionRemaining(container),0);assert.equal(boardMotionRemaining(null),0);
  animateBoard(container,before,before,{durationScale:1.5,reducedMotion:false});
  assert.equal(boardMotionRemaining(container),0,'unchanged rotors have no remaining motion');
  const after=structuredClone(before);after.angles[0]+=60;
  animateBoard(container,before,after,{durationScale:1.5,reducedMotion:false});
  assert.equal(boardMotionRemaining(container),100,'token scaling does not change keyboard easing');
  tick(40);assert.equal(boardMotionRemaining(container),60);
  const direct=structuredClone(after);direct.angles[0]+=10;
  animateBoard(container,after,direct,{directRotation:true,durationScale:1.5,reducedMotion:false});
  assert.equal(boardMotionRemaining(container),0);
  assert.equal(rotorNodes[0].transform,`rotate(${direct.angles[0].toFixed(4)})`);
  cancelBoardMotion(container);assert.equal(boardMotionRemaining(container),0);
}));

test('remaining time is the latest active arrival, without summing simultaneous falls',()=>animationHarness(({container,tick})=>{
  const before=view();before.queue=[2,3,4];before.slots[4][0]=5;
  const after=structuredClone(before);after.queue.shift();after.slots[0][0]=2;after.slots[4][0]=null;after.exited=[5];
  const events=[{token:2,from:{queue:true},to:{wheel:1,notch:0}},{token:5,from:{wheel:5,notch:0},to:{exited:true}}];
  let impacts=0;
  animateBoard(container,before,after,{events,directRotation:true,durationScale:1.5,onDrop:()=>impacts++,reducedMotion:false});
  assert.equal(boardMotionRemaining(container),630);
  tick(420);assert.equal(impacts,1);assert.equal(boardMotionRemaining(container),210);
  tick(630);assert.equal(impacts,2);assert.equal(boardMotionRemaining(container),0);
  cancelBoardMotion(container);
}));

test('canceling, removing, or reducing motion leaves no pending animation deadline',()=>animationHarness(({container,tick,frames})=>{
  const before=view();const after=structuredClone(before);after.queue.shift();after.slots[0][0]=1;
  const events=[{token:1,from:{queue:true},to:{wheel:1,notch:0}}];let impacts=0;
  const options={events,directRotation:true,durationScale:1.5,onDrop:()=>impacts++,reducedMotion:false};
  animateBoard(container,before,after,options);tick(40);assert.equal(boardMotionRemaining(container),380);
  cancelBoardMotion(container);assert.equal(boardMotionRemaining(container),0);assert.equal(frames.size,0);
  tick(800);assert.equal(impacts,0);
  animateBoard(container,before,after,options);container.isConnected=false;
  assert.equal(boardMotionRemaining(container),0);tick(850);assert.equal(frames.size,0);assert.equal(impacts,0);
  container.isConnected=true;
  animateBoard(container,before,after,{...options,reducedMotion:true});
  assert.equal(boardMotionRemaining(container),0);assert.equal(frames.size,0);assert.equal(impacts,1,'reduced motion presents the arrival immediately');
  tick(2000);assert.equal(impacts,1);
}));

test('invalid duration scaling preserves the standard human fall duration',()=>animationHarness(({container,tick})=>{
  const before=view();const after=structuredClone(before);after.queue.shift();after.slots[0][0]=1;
  const events=[{token:1,from:{queue:true},to:{wheel:1,notch:0}}];
  for (const durationScale of [0,-1,NaN,Infinity,'1.5',Number.MAX_VALUE]) {
    animateBoard(container,before,after,{events,directRotation:true,durationScale,reducedMotion:false});
    assert.equal(boardMotionRemaining(container),280);
    cancelBoardMotion(container);
  }
  tick(1000);
}));

test('slowing a fall halfway preserves its visible position and doubles only its remaining time',()=>animationHarness(({container,tick,tokenNodes,frames})=>{
  const before=view();const after=structuredClone(before);after.queue.shift();after.slots[0][0]=1;
  const events=[{token:1,from:{queue:true},to:{wheel:1,notch:0}}];let impacts=0;let slides=0;
  animateBoard(container,before,after,{events,directRotation:true,durationScale:1.5,onSlide:plan=>{if(plan.token===1)slides++;},onDrop:()=>impacts++,reducedMotion:false});
  tick(210);const halfway=tokenNodes[0].transform;
  retimeBoardMotion(container,2);
  assert.equal(tokenNodes[0].transform,halfway);
  assert.equal(boardMotionRemaining(container),420);
  assert.equal(frames.size,1,'retiming keeps one animation frame');
  tick(210);assert.equal(tokenNodes[0].transform,halfway,'the new clock starts at the same progress');
  tick(629);assert.equal(impacts,0);assert.equal(boardMotionRemaining(container),1);
  tick(630);assert.equal(impacts,1);assert.equal(boardMotionRemaining(container),0);
  assert.equal(tokenNodes[0].transform,translated(tokenPositions(after).find(position=>position.token===1)));
  tick(1000);assert.equal(impacts,1);assert.equal(slides,1);
  cancelBoardMotion(container);
}));

test('repeated live speed changes preserve receiver corrections without replaying a fall',()=>animationHarness(({container,tick,tokenNodes})=>{
  const before=view();before.angles[0]=264;
  const after=structuredClone(before);after.angles[0]=270;after.queue.shift();after.slots[0][0]=1;
  const events=[{token:1,from:{queue:true},to:{wheel:1,notch:0}}];let impacts=0;let slides=0;
  const callbacks={onSlide:plan=>{if(plan.token===1)slides++;},onDrop:()=>impacts++,directRotation:true,reducedMotion:false};
  animateBoard(container,before,after,{...callbacks,events,durationScale:1.5});
  tick(140);const first=tokenNodes[0].transform;
  const moved=structuredClone(after);moved.angles[0]=310;
  animateBoard(container,after,moved,{...callbacks,durationScale:1.5});
  assert.equal(tokenNodes[0].transform,first);
  retimeBoardMotion(container,2);tick(140);assert.equal(tokenNodes[0].transform,first);
  near(boardMotionRemaining(container),560);
  tick(280);const second=tokenNodes[0].transform;
  const movedAgain=structuredClone(moved);movedAgain.angles[0]=330;
  animateBoard(container,moved,movedAgain,{...callbacks,durationScale:3});
  assert.equal(tokenNodes[0].transform,second);
  retimeBoardMotion(container,.25);tick(280);
  assert.equal(tokenNodes[0].transform,second,'changing both speed and receiver does not jump');
  near(boardMotionRemaining(container),105);
  tick(384);assert.equal(impacts,0);
  tick(385);assert.equal(impacts,1);assert.equal(slides,1);
  assert.equal(tokenNodes[0].transform,translated(tokenPositions(movedAgain).find(position=>position.token===1)));
  retimeBoardMotion(container,2);tick(1000);assert.equal(impacts,1);assert.equal(boardMotionRemaining(container),0);
  cancelBoardMotion(container);
}));

test('retiming settles overdue impacts once before adjusting other pending paths',()=>animationHarness(({container,tick,setTime,tokenNodes})=>{
  const before=view();before.queue=[2,3,4];before.slots[4][0]=5;
  const after=structuredClone(before);after.queue.shift();after.slots[0][0]=2;after.slots[4][0]=null;after.exited=[5];
  const events=[{token:2,from:{queue:true},to:{wheel:1,notch:0}},{token:5,from:{wheel:5,notch:0},to:{exited:true}}];
  const impacts=[];
  animateBoard(container,before,after,{events,directRotation:true,durationScale:1.5,onDrop:plan=>impacts.push(plan.token),reducedMotion:false});
  tick(400);setTime(450);
  retimeBoardMotion(container,2);
  assert.deepEqual(impacts,[2],'the 420 ms fall arrives even between animation frames');
  assert.equal(tokenNodes[1].transform,translated(tokenPositions(after).find(position=>position.token===2)));
  near(boardMotionRemaining(container),360);
  tick(809);assert.deepEqual(impacts,[2]);
  tick(810);assert.deepEqual(impacts,[2,5]);
  retimeBoardMotion(container,.5);tick(1200);assert.deepEqual(impacts,[2,5]);
  cancelBoardMotion(container);
}));

test('an explicit speed change preserves an eased rotor progress without changing its target',()=>animationHarness(({container,tick,rotorNodes})=>{
  const before=view();const after=structuredClone(before);after.angles[0]+=60;
  animateBoard(container,before,after,{reducedMotion:false});
  tick(50);const halfway=rotorNodes[0].transform;
  retimeBoardMotion(container,2);tick(50);
  assert.equal(rotorNodes[0].transform,halfway);assert.equal(boardMotionRemaining(container),100);
  tick(149);assert.notEqual(rotorNodes[0].transform,`rotate(${after.angles[0].toFixed(4)})`);
  tick(150);assert.equal(rotorNodes[0].transform,`rotate(${after.angles[0].toFixed(4)})`);
  assert.equal(boardMotionRemaining(container),0);cancelBoardMotion(container);
}));

test('full speed finishes visible paths and their impacts once, retaining final static transforms',()=>animationHarness(({container,tick,tokenNodes,rotorNodes,frames})=>{
  const before=view();before.queue=[2,3,4];before.slots[4][0]=5;
  const after=structuredClone(before);after.angles[0]+=60;after.queue.shift();after.slots[0][0]=2;after.slots[4][0]=null;after.exited=[5];
  const events=[{token:2,from:{queue:true},to:{wheel:1,notch:0}},{token:5,from:{wheel:5,notch:0},to:{exited:true}}];
  const impacts=[];const slides=[];
  animateBoard(container,before,after,{events,durationScale:1.5,onSlide:plan=>slides.push(plan.token),onDrop:plan=>impacts.push(plan.token),reducedMotion:false});
  tick(40);assert.ok(boardMotionRemaining(container)>0);
  finishBoardMotion(container);
  assert.equal(frames.size,0);assert.equal(boardMotionRemaining(container),0);
  assert.deepEqual(impacts,[2,5]);assert.deepEqual(slides,[3,4,2,5]);
  for(const position of tokenPositions(after))assert.equal(tokenNodes[position.token-1].transform,translated(position));
  assert.equal(rotorNodes[0].transform,`rotate(${after.angles[0].toFixed(4)})`);
  const final=tokenNodes.map(node=>node.transform);
  finishBoardMotion(container);retimeBoardMotion(container,2);tick(1000);
  assert.deepEqual(tokenNodes.map(node=>node.transform),final);assert.deepEqual(impacts,[2,5]);assert.deepEqual(slides,[3,4,2,5]);
}));

test('invalid speed ratios, missing controllers and canceled or hidden boards are safe and silent',()=>animationHarness(({container,tick,tokenNodes,frames})=>{
  const before=view();const after=structuredClone(before);after.queue.shift();after.slots[0][0]=1;
  const events=[{token:1,from:{queue:true},to:{wheel:1,notch:0}}];let impacts=0;
  const options={events,directRotation:true,durationScale:1.5,onDrop:()=>impacts++,reducedMotion:false};
  retimeBoardMotion(null,2);retimeBoardMotion({},2);finishBoardMotion(null);finishBoardMotion({});
  animateBoard(container,before,after,options);tick(100);const current=tokenNodes[0].transform;
  for(const ratio of [0,-1,NaN,Infinity,'2',Number.MAX_VALUE]) {
    retimeBoardMotion(container,ratio);
    assert.equal(tokenNodes[0].transform,current);assert.equal(boardMotionRemaining(container),320);assert.equal(frames.size,1);
  }
  cancelBoardMotion(container);finishBoardMotion(container);retimeBoardMotion(container,2);tick(1000);assert.equal(impacts,0);
  animateBoard(container,before,after,options);tick(1040);container.isConnected=false;
  finishBoardMotion(container);assert.equal(frames.size,0);assert.equal(boardMotionRemaining(container),0);assert.equal(impacts,0);
  container.isConnected=true;
  animateBoard(container,before,after,options);container.isConnected=false;retimeBoardMotion(container,2);
  assert.equal(frames.size,0);tick(2000);assert.equal(impacts,0);
  container.isConnected=true;
  animateBoard(container,before,after,{...options,reducedMotion:true});
  assert.equal(impacts,1);retimeBoardMotion(container,2);finishBoardMotion(container);tick(3000);
  assert.equal(impacts,1);assert.equal(frames.size,0);assert.equal(boardMotionRemaining(container),0);
}));

function dualView(face = 0) {
  return { ...view(face), geometryVersion: GEOMETRY_VERSION,
    angles: WHEELS.map(wheel=>notchAngle(face,wheel.id,0,0,GEOMETRY_VERSION)),
    queue: Array.from({length:10}, (_, i) => i + 1), totalTokens: 10 };
}

for (const face of [0, 1]) {
  test(`face ${face}: two printed 1–5 series keep ten unique identities in separate entry lanes`, () => {
    const local = dualView(face);
    const positions = tokenPositions(local);
    assert.deepEqual(positions.map(position => position.token).sort((a,b) => a-b), [1,2,3,4,5,6,7,8,9,10]);
    for (const [id, lane] of [[1,0], [6,1]]) {
      const token = positions.find(position => position.token === id);
      const expected = queuePosition(0, lane, GEOMETRY_VERSION);
      assert.deepEqual({x:token.x,y:token.y}, expected);
      assert.equal(token.location.lane, lane);
    }
    const board = renderBoard(local);
    assert.equal((board.match(/data-token=/g) ?? []).length, 10);
    assert.equal((board.match(/data-token-number="1"/g) ?? []).length, 2);
    assert.match(board, /data-token="1" data-token-number="1" data-series="0"/);
    assert.match(board, /data-token="6" data-token-number="1" data-series="1"/);
  });

  test(`face ${face}: each coloured series falls to its own collection row without swapping identities`, () => {
    for (let id = 1; id <= 10; id++) {
      const before = dualView(face); before.queue = []; before.slots[4][0] = id; before.angles[4] = 90;
      const after = structuredClone(before); after.slots[4][0] = null; after.exited = [id];
      const [plan] = planTokenMotion(before, after, [{token:id,from:{wheel:5,notch:0},to:{exited:true}}]);
      assert.equal(plan.token, id);
      assert.equal(plan.location.index, id - 1);
      assert.equal(plan.location.lane, Math.floor((id-1)/5));
      const target = trayPosition(face, id - 1, GEOMETRY_VERSION);
      assert.deepEqual(sampleTokenPath(plan, 1), target);
      assert.ok(plan.points.some(point => point.y === trayEntry(face, GEOMETRY_VERSION, Math.floor((id-1)/5)).y));
      let previousY = plan.points[0].y;
      for (let frame = 0; frame <= 100; frame++) {
        const point = sampleTokenPath(plan, frame/100);
        assert.ok(point.y >= previousY - 1e-8);
        assert.ok(point.y <= target.y + 1e-8);
        previousY = point.y;
      }
    }
  });
}

test('a right-lane 1 animates independently of the left-lane 1 and still cancels when masked',()=>animationHarness(({container,tick,tokenNodes,frames})=>{
  const before = dualView();
  const after = structuredClone(before); after.queue = after.queue.filter(id => id !== 6); after.slots[0][0] = 6;
  let impacts = 0;
  animateBoard(container,before,after,{events:[{token:6,from:{queue:true,lane:1},to:{wheel:1,notch:0}}],onDrop:()=>impacts++,reducedMotion:false});
  const left = tokenNodes[0].transform;
  const right = tokenNodes[5].transform;
  tick(140);
  assert.equal(tokenNodes[0].transform, left, 'the other printed 1 remains in its queue');
  assert.notEqual(tokenNodes[5].transform, right, 'the right-lane token has its own moving node');
  cancelBoardMotion(container);
  tick(1000);
  assert.equal(impacts, 0);
  assert.equal(frames.size, 0);
}));

test('rear-face transfer paths retain the saved mechanical offsets of every supported geometry', () => {
  for(const geometryVersion of [undefined,LEGACY_GEOMETRY_VERSION,PREVIOUS_GEOMETRY_VERSION,GEOMETRY_VERSION]) {
    const version=geometryVersion??LEGACY_GEOMETRY_VERSION;
    const before=view(1);
    if(geometryVersion)before.geometryVersion=geometryVersion;
    before.queue=[];before.slots[0][0]=1;
    const after=structuredClone(before);after.slots[0][0]=null;after.slots[1][0]=1;
    const physical=physicalAngleFor(1,2,0,gates(1)[0].targetAngle,version);
    after.angles[1]=notchAngle(1,2,0,physical-3,version);
    const [plan]=planTokenMotion(before,after,[{token:1,wheel:2,angle:physical,from:{wheel:1,notch:0},to:{wheel:2,notch:0}}]);
    const seat=slotPosition(1,2,0,physical,version);
    near(plan.points[1].x,seat.x);near(plan.points[1].y,seat.y);
  }
});
