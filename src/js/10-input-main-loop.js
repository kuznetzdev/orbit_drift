/*
 * Orbit Drift — 10-input-main-loop
 * Pointer/touch/keyboard input, pinch zoom, loop bootstrap.
 * Keep this file loaded after all earlier numbered files.
 */

'use strict';

function roundRect(x, y, w, h, r) {
  if (w <= 0) return;
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function fmtSigned(v, digits = 0) {
  const s = Number(v).toFixed(digits);
  return (v >= 0 ? '+' : '') + s;
}

function fmtNum(v, digits = 0) {
  if (!isFinite(v)) return '∞';
  return Number(v).toFixed(digits);
}

function worldDistanceToTarget() {
  if (!target || !player) return 0;
  return hypot(target.x - player.x, target.y - player.y);
}

function onPointerDown(x, y) {
  pointer.down = true;
  pointer.has = true;
  pointer.x = x;
  pointer.y = y;
  pointer.last = performance.now();
  const before = state;
  if (handleUiTap(x, y)) {
    if (before === 'play' || state !== 'play') pointer.down = false;
    return;
  }
  ensureAudio();
  if (state !== 'play') startGame();
}

function onPointerMove(x, y) {
  pointer.has = true;
  pointer.x = x;
  pointer.y = y;
  pointer.last = performance.now();
}

function onPointerUp() {
  pointer.down = false;
}

canvas.addEventListener('mousedown', e => onPointerDown(e.clientX, e.clientY));
window.addEventListener('mousemove', e => onPointerMove(e.clientX, e.clientY));
window.addEventListener('mouseup', onPointerUp);

canvas.addEventListener('wheel', e => {
  if (state !== 'play') return;
  e.preventDefault();
  adjustViewZoom(e.deltaY < 0 ? 1 : -1);
}, { passive: false });

function touchDist(a, b) {
  return hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function updateTouchZoom(e) {
  if (e.touches.length < 2) return false;
  const a = e.touches[0];
  const b = e.touches[1];
  const d = Math.max(16, touchDist(a, b));
  if (!touchZoom.active) {
    touchZoom.active = true;
    touchZoom.dist = d;
    touchZoom.startZoom = userZoom;
    pointer.down = false;
    return true;
  }
  setViewZoom(touchZoom.startZoom * (d / Math.max(touchZoom.dist, 16)), true);
  return true;
}

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  if (updateTouchZoom(e)) return;
  const touch = e.touches[0];
  if (touch) onPointerDown(touch.clientX, touch.clientY);
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (updateTouchZoom(e)) return;
  const touch = e.touches[0];
  if (touch) onPointerMove(touch.clientX, touch.clientY);
}, { passive: false });

canvas.addEventListener('touchend', e => {
  e.preventDefault();
  if (e.touches.length >= 2) { updateTouchZoom(e); return; }
  touchZoom.active = false;
  if (e.touches.length === 1) {
    const touch = e.touches[0];
    onPointerMove(touch.clientX, touch.clientY);
    pointer.down = false;
    return;
  }
  onPointerUp();
}, { passive: false });

window.addEventListener('keydown', e => {
  const codes = ['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'KeyG', 'KeyN', 'KeyM', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Digit1', 'Digit2', 'Digit3', 'Minus', 'Equal', 'NumpadSubtract', 'NumpadAdd'];
  if (codes.includes(e.code)) e.preventDefault();

  if ((state === 'menu' || state === 'dead') && /^Digit[1-3]$/.test(e.code) && !keys[e.code]) {
    setDifficultyIndex(Number(e.code.slice(-1)) - 1);
    if (state === 'menu') setupWorld(true);
  }
  if (state === 'menu' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight') && !keys[e.code]) {
    cycleDifficulty(e.code === 'ArrowRight' ? 1 : -1);
    setupWorld(true);
  }
  if (e.code === 'KeyM' && !keys[e.code]) toggleSound();
  if (e.code === 'KeyN' && !keys[e.code]) { navLayer = !navLayer; writeSettings(); soundCue('select', null, 1); }
  if (e.code === 'KeyG' && !keys[e.code]) { gravityLayer = !gravityLayer; writeSettings(); soundCue('select', null, 2); }
  if (e.code === 'KeyR' && !keys[e.code] && state === 'play') cycleTarget();
  if ((e.code === 'Minus' || e.code === 'NumpadSubtract') && !keys[e.code]) adjustViewZoom(-1);
  if ((e.code === 'Equal' || e.code === 'NumpadAdd') && !keys[e.code]) adjustViewZoom(1);

  keys[e.code] = true;
  if ((e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') && state !== 'play') startGame();
});

window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('resize', resize);

function loop(now) {
  const rawDt = Math.min(MAX_DT, Math.max(.001, (now - lastTime) / 1000));
  lastTime = now;
  perf.frameMs = lerp(perf.frameMs || 16, rawDt * 1000, .08);
  perf.fps = lerp(perf.fps || 60, 1 / Math.max(rawDt, .001), .08);

  let remaining = rawDt;
  let guard = 0;
  while (remaining > 1e-6 && guard < (lowPower ? 3 : 4)) {
    const step = Math.min(lowPower ? 1 / 85 : PHYSICS_STEP, remaining);
    update(step);
    remaining -= step;
    guard++;
  }
  draw();
  requestAnimationFrame(loop);
}

resize();
setupWorld(true);
requestAnimationFrame(loop);
