import test from 'node:test';
import assert from 'node:assert/strict';
import { installViewportLock } from '../src/viewport-lock.js';

class Events {
  listeners = new Map();
  addEventListener(type, callback, options) { this.listeners.set(type, { callback, options }); }
  removeEventListener(type, callback) { if (this.listeners.get(type)?.callback === callback) this.listeners.delete(type); }
  emit(type, fields = {}) {
    const event = new Event(type, { cancelable: fields.cancelable ?? true });
    for (const [key,value] of Object.entries(fields)) if (key !== 'cancelable') Object.defineProperty(event,key,{value});
    this.listeners.get(type)?.callback(event);
    return event;
  }
}

function target(control = null) {
  const node = new Events();
  node.closest = selector => control && selector.split(', ').some(item => item === control) ? node : null;
  return node;
}

function harness(initial = null) {
  let surface = initial;
  let observed;
  let smallHeight = 640;
  const classes = new Set();
  const properties = new Map();
  const app = {};
  const probe = { style: {}, setAttribute() {}, getBoundingClientRect: () => ({height: smallHeight}), remove() { this.removed = true; } };
  const doc = Object.assign(new Events(), {
    createElement: () => probe,
    body: { append() {} },
    querySelector: selector => selector === '#app' ? app
      : ['play','handoff','confirmation','landscape'].includes(surface) ? {} : null,
    documentElement: {
      style: { setProperty: (name,value) => properties.set(name,value), removeProperty: name => properties.delete(name) },
      classList: {
        toggle(name, active) { if (active) classes.add(name); else classes.delete(name); },
        remove(name) { classes.delete(name); },
      },
    },
  });
  let observer;
  class Observer {
    constructor(callback) { this.callback = callback; observer = this; }
    observe(node, options) { observed = { target: node, options }; }
    disconnect() { this.disconnected = true; }
  }
  const win = Object.assign(new Events(), {
    innerHeight: 720, innerWidth: 360, scrollX: 0, scrollY: 0, desktop: false, scrollCalls: 0,
    visualViewport: Object.assign(new Events(), {height: 640, scale: 1}),
    matchMedia() { return {matches: this.desktop}; },
    timers: new Map(),
    setTimeout(callback) { const id = Symbol(); this.timers.set(id,callback); return id; },
    clearTimeout(id) { this.timers.delete(id); },
    scrollTo(x,y) { this.scrollX = x; this.scrollY = y; this.scrollCalls++; },
  });
  const dispose = installViewportLock({ document: doc, window: win, MutationObserverClass: Observer });
  return { classes, properties, observed, win, doc, probe, dispose, observer, target,
    emit: (type, fields = {}) => win.emit(type, {target: target(),...fields}),
    setSmallHeight(value) { smallHeight = value; },
    setSurface(value, notify = true) { surface = value; if (notify) observer.callback(); } };
}

const heightOf = h => h.properties.get('--game-viewport-height');

test('game, transition and handoff surfaces block panning at the root', () => {
  const h = harness();
  for (const surface of ['play','handoff','confirmation','landscape']) {
    h.setSurface(surface);
    assert.equal(h.classes.has('game-viewport-locked'),true);
    assert.equal(h.emit('touchstart').defaultPrevented,true);
    assert.equal(h.emit('touchmove').defaultPrevented,true);
    assert.equal(h.emit('wheel').defaultPrevented,true);
    assert.equal(heightOf(h),'639px');
  }
});

test('first touch and move are intercepted in capture, explicitly non-passive, without stopping rotation events', () => {
  const h = harness('play');
  for (const type of ['touchstart','touchmove','wheel']) {
    assert.deepEqual(h.win.listeners.get(type).options,{capture:true,passive:false});
    const event = h.emit(type);
    assert.equal(event.defaultPrevented,true);
    assert.equal(event.cancelBubble,false);
  }
  assert.equal(h.emit('pointerdown',{pointerType:'touch'}).defaultPrevented,false);
});

test('changing to play or to a menu is honored before the observer runs', () => {
  const h = harness('preparation');
  assert.equal(h.emit('touchmove').defaultPrevented,false);
  h.setSurface('play',false);
  assert.equal(h.emit('touchmove').defaultPrevented,true);
  h.setSurface('rules',false);
  assert.equal(h.emit('touchmove').defaultPrevented,false);
  assert.equal(h.classes.has('game-viewport-locked'),false);
  assert.equal(heightOf(h),undefined);
  for (const menu of ['home','preparation','rules','statistics','result','ai-wait']) {
    h.setSurface(menu);
    assert.equal(h.emit('wheel').defaultPrevented,false);
    assert.equal(h.emit('touchstart').defaultPrevented,false);
    assert.equal(h.emit('touchmove').defaultPrevented,false);
  }
});

test('original SVG touch target remains protected after selection detaches it, then is released', () => {
  const h = harness('play');
  const wheel = target();
  h.emit('pointerdown',{target:wheel,pointerType:'touch'});
  assert.deepEqual(wheel.listeners.get('touchmove').options,{capture:true,passive:false});
  // Dispatch on the detached node itself: it has no path to the window.
  assert.equal(wheel.emit('touchstart',{target:wheel}).defaultPrevented,true);
  assert.equal(wheel.emit('touchmove',{target:wheel}).defaultPrevented,true);
  wheel.emit('touchend',{targetTouches:[{}]});
  assert.equal(wheel.listeners.size,4,'another finger on the same target still needs the listener');
  wheel.emit('touchend',{targetTouches:[]});
  assert.equal(wheel.listeners.size,0);
});

test('Touch Events alone also retain a target; cancellation, menu exit and blur release references', () => {
  const h = harness('play');
  for (const finish of ['cancel','menu','blur','pagehide','hidden']) {
    const wheel = target();
    h.emit('touchstart',{target:wheel});
    assert.equal(wheel.listeners.size,4);
    if(finish === 'cancel') wheel.emit('touchcancel',{targetTouches:[]});
    if(finish === 'menu') h.setSurface('home');
    if(finish === 'blur') h.emit('blur');
    if(finish === 'pagehide') h.emit('pagehide');
    if(finish === 'hidden') { h.doc.hidden = true; h.doc.emit('visibilitychange'); }
    assert.equal(wheel.listeners.size,0);
    h.setSurface('play');
  }
});

test('touchstart before pointerdown also retains one target and does not cancel pointer events', () => {
  const h = harness('play');
  const wheel = target();
  assert.equal(h.emit('touchstart',{target:wheel}).defaultPrevented,true);
  assert.equal(h.emit('pointerdown',{target:wheel,pointerType:'touch'}).defaultPrevented,false);
  assert.equal(wheel.listeners.size,4);
  assert.equal(wheel.emit('touchmove',{target:wheel}).defaultPrevented,true);
  wheel.emit('touchcancel',{targetTouches:[]});
  assert.equal(wheel.listeners.size,0);
});

test('button/link taps, native controls, browser wheel zoom and non-cancellable events are preserved', () => {
  const h = harness('play');
  for (const control of ['button','a','label','select','option','input','textarea']) {
    const node = target(control);
    assert.equal(h.emit('touchstart',{target:node}).defaultPrevented,false,control);
    assert.equal(h.emit('click',{target:node}).defaultPrevented,false,control);
  }
  assert.equal(h.emit('touchmove',{target:target('button')}).defaultPrevented,true,'dragging a button must not pan');
  for (const control of ['select','option','input','textarea']) {
    assert.equal(h.emit('touchmove',{target:target(control)}).defaultPrevented,false);
  }
  assert.equal(h.emit('wheel',{ctrlKey:true}).defaultPrevented,false);
  assert.equal(h.emit('wheel',{metaKey:true}).defaultPrevented,false);
  assert.equal(h.emit('touchstart',{cancelable:false}).defaultPrevented,false);
  assert.equal(h.emit('touchmove',{cancelable:false}).defaultPrevented,false);
});

test('toolbar and visual viewport changes do not resize the board during a phone gesture or a turn transition', () => {
  const h = harness('play');
  h.win.innerHeight = 780;
  h.win.visualViewport.height = 780;
  h.setSmallHeight(780); // Some older Safari versions incorrectly vary svh too.
  h.win.emit('resize');
  h.win.visualViewport.emit('resize');
  h.setSurface('handoff');
  h.setSurface('play');
  assert.equal(heightOf(h),'639px');
  h.setSurface('home');
  h.setSurface('play');
  assert.equal(heightOf(h),'779px','entering a new locked session takes a fresh measurement');
});

test('keyboard closing after setup cannot leave a tiny board on iPhone', () => {
  const h = harness();
  h.win.visualViewport.height = 290;
  h.setSurface('handoff');
  assert.equal(heightOf(h),'639px','svh and innerHeight exclude the transient iPhone keyboard');
  h.win.visualViewport.height = 640;
  h.win.visualViewport.emit('resize');
  assert.equal(heightOf(h),'639px');
});

test('orientation, desktop window resizing and page restoration refresh the dimensions', () => {
  const h = harness('play');
  h.win.innerWidth = 640;
  h.win.innerHeight = 360;
  h.setSmallHeight(360);
  h.win.emit('resize');
  assert.equal(heightOf(h),'359px');
  h.win.desktop = true;
  h.win.innerHeight = 500;
  h.setSmallHeight(500);
  h.win.emit('resize');
  assert.equal(heightOf(h),'499px');
  h.setSmallHeight(480);
  h.win.emit('pageshow');
  assert.equal(heightOf(h),'479px');
});

test('a pre-existing menu offset and unexpected root scrolling are reset only while locked', () => {
  const h = harness('home');
  h.win.scrollY = 200;
  h.setSurface('play');
  assert.equal(h.win.scrollY,0);
  h.win.scrollY = -35;
  h.emit('scroll');
  assert.equal(h.win.scrollY,0);
  h.setSurface('rules');
  h.win.scrollY = 100;
  h.emit('scroll');
  assert.equal(h.win.scrollY,100);
});

test('orientation settles after its first resize and cancels the pending measurement on menu exit', () => {
  const h = harness('play');
  h.win.emit('orientationchange');
  h.win.innerWidth = 640;
  h.win.emit('resize');
  h.win.innerHeight = 360;
  h.setSmallHeight(360);
  for(const [id,callback] of [...h.win.timers]) { h.win.timers.delete(id); callback(); }
  assert.equal(heightOf(h),'359px');
  h.win.emit('orientationchange');
  h.setSurface('home');
  assert.equal(h.win.timers.size,0);
});

test('no svh support falls back to innerHeight; pinch zoom does not define game height', () => {
  const h = harness();
  h.setSmallHeight(0);
  h.win.visualViewport.height = 200;
  h.win.visualViewport.scale = 2;
  h.setSurface('play');
  assert.equal(heightOf(h),'719px');
});

test('disposing the lock releases the target, dimensions, probe, observer and all listeners', () => {
  const h = harness('play');
  const wheel = target();
  h.emit('pointerdown',{target:wheel,pointerType:'touch'});
  h.dispose();
  assert.equal(h.classes.has('game-viewport-locked'),false);
  assert.equal(heightOf(h),undefined);
  assert.equal(h.win.listeners.size,0);
  assert.equal(h.win.visualViewport.listeners.size,0);
  assert.equal(h.doc.listeners.size,0);
  assert.equal(h.win.timers.size,0);
  assert.equal(wheel.listeners.size,0);
  assert.equal(h.observer.disconnected,true);
  assert.equal(h.probe.removed,true);
});
