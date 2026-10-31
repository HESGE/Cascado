/** Lock the document, not just the board, while a private game surface is up. */
const LOCKED_SURFACE = '#app > .play, #app > .handoff, #app > .confirmation, #app > .landscape';
const NATIVE_CONTROL = 'select, option, input, textarea, [contenteditable]:not([contenteditable="false"])';
const TAP_CONTROL = `button, a, label, ${NATIVE_CONTROL}`;

export function installViewportLock({
  document: doc = globalThis.document,
  window: win = globalThis.window,
  MutationObserverClass = globalThis.MutationObserver,
} = {}) {
  const root = doc.documentElement;
  const app = doc.querySelector('#app');
  const options = { capture: true, passive: false };
  const retainedTargets = new Map();
  let locked = false;
  let width = 0;
  let height = 0;
  let disposed = false;
  let resizeTimer = null;
  // svh reserves room for expanded browser bars. Capture it in pixels so a
  // toolbar animation (including older Safari svh bugs) cannot resize a wheel.
  const probe = doc.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100svh;visibility:hidden;pointer-events:none;';
  doc.body.append(probe);

  const resetScroll = () => {
    if (locked && (win.scrollX || win.scrollY)) win.scrollTo(0, 0);
  };
  const measure = () => {
    // iPhone's keyboard only shrinks visualViewport. Do not capture that
    // temporary height when the setup form has just been submitted.
    const sizes = [win.innerHeight, probe.getBoundingClientRect().height]
      .filter(value => Number.isFinite(value) && value > 0);
    if (!sizes.length && win.visualViewport?.scale === 1) sizes.push(win.visualViewport.height);
    if (!sizes.length) return;
    // The one-pixel underfill avoids Safari treating a full-height root as a
    // scrollable boundary when its bottom toolbar is expanded by a pan.
    height = Math.max(1, Math.floor(Math.min(...sizes)) - 1);
    width = win.innerWidth;
    root.style.setProperty('--game-viewport-height', `${height}px`);
  };
  const clearTargets = () => {
    for (const release of [...retainedTargets.values()]) release();
  };
  const sync = () => {
    if (disposed) return false;
    const next = Boolean(doc.querySelector(LOCKED_SURFACE));
    if (next !== locked) {
      locked = next;
      if (locked) measure();
      root.classList.toggle('game-viewport-locked', locked);
      if (locked) resetScroll();
      else {
        clearTargets();
        if (resizeTimer !== null) { win.clearTimeout(resizeTimer); resizeTimer = null; }
        root.style.removeProperty('--game-viewport-height');
        height = width = 0;
      }
    }
    return locked;
  };
  const preventPan = event => {
    if (!sync() || !event.cancelable) return;
    if (event.target?.closest?.(NATIVE_CONTROL)) return;
    if (event.type === 'wheel' && (event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
  };
  const preventStart = event => {
    if (!sync() || !event.cancelable) return;
    // Keep native button clicks, select popups and assistive activation. Wheel
    // drags use Pointer Events and do not need synthesized mouse events.
    if (!event.target?.closest?.(TAP_CONTROL)) event.preventDefault();
  };
  const retainTarget = target => {
    if (!target?.addEventListener || retainedTargets.has(target)) return;
    const release = () => {
      target.removeEventListener('touchstart', preventStart, options);
      target.removeEventListener('touchmove', preventPan, options);
      target.removeEventListener('touchend', finish, options);
      target.removeEventListener('touchcancel', finish, options);
      retainedTargets.delete(target);
    };
    const finish = event => { if (!event.targetTouches?.length) release(); };
    retainedTargets.set(target, release);
    // Touch Events keep their original target even when refreshPlay replaces
    // its SVG. Detached-node events cannot bubble to the window listener.
    target.addEventListener('touchstart', preventStart, options);
    target.addEventListener('touchmove', preventPan, options);
    target.addEventListener('touchend', finish, options);
    target.addEventListener('touchcancel', finish, options);
  };
  const pointerStart = event => {
    // Retain before wheel selection can redraw the target. The touchstart
    // listener also covers browsers that dispatch Touch Events first.
    if (event.pointerType === 'touch' && sync()) retainTarget(event.target);
  };
  const touchStart = event => {
    if (!sync()) return;
    retainTarget(event.target);
    preventStart(event);
  };
  const resize = () => {
    if (!sync()) return;
    const desktop = win.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
    // A phone's vertical resize usually comes from its toolbar. Keep the
    // captured height until orientation/width changes; desktop windows resize.
    if (win.innerWidth !== width || desktop || !height) {
      measure();
      if (!desktop) settleDimensions();
    }
    resetScroll();
  };
  const remeasure = () => { if (sync()) { measure(); resetScroll(); } };
  const settleDimensions = () => {
    if (resizeTimer !== null) win.clearTimeout(resizeTimer);
    // iOS can report the new width before the final orientation height.
    resizeTimer = win.setTimeout(() => {
      resizeTimer = null;
      if (!disposed && locked) remeasure();
    }, 250);
  };
  const pageShow = () => { remeasure(); if (locked) settleDimensions(); };
  const visibility = () => { if (doc.hidden) clearTargets(); };
  win.addEventListener('pointerdown', pointerStart, { capture: true, passive: true });
  win.addEventListener('touchstart', touchStart, options);
  win.addEventListener('touchmove', preventPan, options);
  win.addEventListener('wheel', preventPan, options);
  win.addEventListener('scroll', resetScroll, { passive: true });
  win.addEventListener('resize', resize);
  win.visualViewport?.addEventListener('resize', resize);
  win.addEventListener('orientationchange', settleDimensions);
  win.addEventListener('pageshow', pageShow);
  win.addEventListener('blur', clearTargets);
  win.addEventListener('pagehide', clearTargets);
  doc.addEventListener('visibilitychange', visibility);
  const observer = new MutationObserverClass(sync);
  if (app) observer.observe(app, { childList: true });
  sync();
  return () => {
    disposed = true;
    if (resizeTimer !== null) win.clearTimeout(resizeTimer);
    observer.disconnect();
    clearTargets();
    win.removeEventListener('pointerdown', pointerStart, { capture: true });
    win.removeEventListener('touchstart', touchStart, options);
    win.removeEventListener('touchmove', preventPan, options);
    win.removeEventListener('wheel', preventPan, options);
    win.removeEventListener('scroll', resetScroll);
    win.removeEventListener('resize', resize);
    win.visualViewport?.removeEventListener('resize', resize);
    win.removeEventListener('orientationchange', settleDimensions);
    win.removeEventListener('pageshow', pageShow);
    win.removeEventListener('blur', clearTargets);
    win.removeEventListener('pagehide', clearTargets);
    doc.removeEventListener('visibilitychange', visibility);
    root.classList.remove('game-viewport-locked');
    root.style.removeProperty('--game-viewport-height');
    probe.remove();
  };
}
