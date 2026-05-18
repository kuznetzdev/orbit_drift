#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const indexPath = path.join(root, 'index.html');
const jsDir = path.join(root, 'src', 'js');
const cssPath = path.join(root, 'src', 'styles', 'main.css');

const required = [
  '01-config-state.js',
  '02-viewport-camera.js',
  '03-audio.js',
  '04-world-generation.js',
  '05-game-flow-objectives.js',
  '06-physics-orbits.js',
  '07-simulation-gameplay.js',
  '08-render-space.js',
  '09-render-ui.js',
  '10-input-main-loop.js'
];

function fail(message) {
  console.error(`validate: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(indexPath)) fail('index.html not found');
if (!fs.existsSync(cssPath)) fail('src/styles/main.css not found');

const html = fs.readFileSync(indexPath, 'utf8');
for (const file of required) {
  const full = path.join(jsDir, file);
  if (!fs.existsSync(full)) fail(`${file} not found`);
  const expected = `src/js/${file}`;
  if (!html.includes(expected)) fail(`${expected} is not linked in index.html`);
}

const linked = [...html.matchAll(/<script\s+defer\s+src="src\/js\/([^"]+)"\s*><\/script>/g)].map(m => m[1]);
if (linked.join('|') !== required.join('|')) {
  fail(`script order mismatch. Expected ${required.join(', ')}, got ${linked.join(', ')}`);
}

for (const file of required) {
  const full = path.join(jsDir, file);
  const code = fs.readFileSync(full, 'utf8');
  try {
    new vm.Script(code, { filename: file });
  } catch (error) {
    fail(`${file} syntax error: ${error.message}`);
  }
}

const css = fs.readFileSync(cssPath, 'utf8');
if (!css.includes('touch-action: none')) fail('mobile touch handling CSS missing');
if (!html.includes('maximum-scale=1')) fail('mobile viewport cap missing');

console.log('validate: ok');
