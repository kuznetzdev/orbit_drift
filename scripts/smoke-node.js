#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const jsFiles = [
  '01-config-state.js', '02-viewport-camera.js', '03-audio.js', '04-world-generation.js',
  '05-game-flow-objectives.js', '06-physics-orbits.js', '07-simulation-gameplay.js',
  '08-render-space.js', '09-render-ui.js', '10-input-main-loop.js'
];

const ctxMethods = [
  'setTransform','clearRect','fillRect','strokeRect','beginPath','moveTo','lineTo','arc','ellipse','closePath','stroke','fill','save','restore','translate','rotate','scale','fillText','strokeText','rect','clip','quadraticCurveTo','bezierCurveTo'
];
const canvasCtx = Object.fromEntries(ctxMethods.map(k => [k, () => {}]));
canvasCtx.measureText = text => ({ width: String(text).length * 7 });
canvasCtx.createLinearGradient = () => ({ addColorStop: () => {} });
canvasCtx.createRadialGradient = () => ({ addColorStop: () => {} });
canvasCtx.globalAlpha = 1;
canvasCtx.lineWidth = 1;
canvasCtx.font = '';
canvasCtx.fillStyle = '';
canvasCtx.strokeStyle = '';
canvasCtx.textAlign = 'left';
canvasCtx.textBaseline = 'alphabetic';
canvasCtx.lineCap = 'round';
canvasCtx.lineJoin = 'round';

const canvas = {
  width: 0,
  height: 0,
  getContext: () => canvasCtx,
  addEventListener: () => {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 })
};

const storage = new Map();
const sandbox = {
  console,
  Math,
  Date,
  performance: { now: () => 1000 },
  navigator: { maxTouchPoints: 0 },
  localStorage: {
    getItem: key => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => { storage.set(key, String(value)); }
  },
  document: { getElementById: id => id === 'game' ? canvas : null },
  window: null,
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 1,
  requestAnimationFrame: () => 1,
  cancelAnimationFrame: () => {},
  setTimeout,
  clearTimeout
};
sandbox.window = sandbox;
sandbox.window.addEventListener = () => {};
sandbox.window.removeEventListener = () => {};

try {
  vm.createContext(sandbox);
  for (const file of jsFiles) {
    const code = fs.readFileSync(path.join(root, 'src/js', file), 'utf8');
    vm.runInContext(code, sandbox, { filename: file });
  }
  console.log('smoke: ok');
} catch (error) {
  console.error(error && error.stack || error);
  process.exit(1);
}
