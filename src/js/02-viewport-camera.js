/*
 * Orbit Drift — 02-viewport-camera
 * Canvas sizing, low-power detection, starfield background, world/screen coordinate transforms.
 * Keep this file loaded after all earlier numbered files.
 */

'use strict';

function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  const smallScreen = W < 760 || H < 520;
  lowPower = TOUCH_CAPABLE || smallScreen;
  uiScale = clamp(Math.min(W / 960, H / 640), .78, 1.08);
  // Keep mobile sharp enough, but avoid 2x/3x canvas overdraw on phones.
  DPR = Math.min(smallScreen ? 1.0 : (lowPower ? 1.08 : 1.55), window.devicePixelRatio || 1);
  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  buildBackgroundStars();
  gravityFieldCache.frame = -999;
  predictionCache.frame = -999;
}

function buildBackgroundStars() {
  const count = Math.floor((W * H) / (lowPower ? 5600 : 3300));
  backgroundStars = [];
  for (let i = 0; i < count; i++) {
    backgroundStars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: rnd(Math.random, .25, 1.15),
      a: rnd(Math.random, .12, .62),
      layer: rnd(Math.random, .035, .31),
      p: Math.random() * TAU
    });
  }
}

function worldToScreen(x, y) {
  return { x: (x - camera.x) * camera.zoom + W / 2, y: (y - camera.y) * camera.zoom + H / 2 };
}

function screenToWorld(x, y) {
  return { x: (x - W / 2) / camera.zoom + camera.x, y: (y - H / 2) / camera.zoom + camera.y };
}
