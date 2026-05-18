/*
 * Orbit Drift — 01-config-state
 * Constants, persistent settings, global state, math helpers, deterministic random helpers, star profile selection.
 * Keep this file loaded after all earlier numbered files.
 */

'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const TAU = Math.PI * 2;
const BASE_WORLD_SEED = 942331;
let worldSeed = BASE_WORLD_SEED;
let mapCode = '000000';
const CHUNK = 2400;
const G = 11500000;
const MAX_DT = 0.032;
const PHYSICS_STEP = 1 / 110;
const SOFTENING = 10;
const FIELD_CUTOFF = 18500;
const ZOOM_MIN = .78;
const ZOOM_MAX = 1.24;
const STORAGE_KEY = 'orbit-drift-best-v11';
const SETTINGS_KEY = 'orbit-drift-settings-v11';

const DIFFICULTIES = [
  {
    id: 'ZEN', name: 'ZEN', label: 'Легко', title: 'мягкий старт',
    note: 'цели ближе · топлива больше · ошибки легче исправить',
    gravity: .92, thrust: 1.06, brake: 1.04, targetMin: .76, targetMax: .88,
    fuelRegen: 1.18, heatRisk: .68, stressRisk: .72, maxSpeed: .90, scanEase: 1.18,
    routeRisk: .62, bodyRange: .94
  },
  {
    id: 'FLOW', name: 'FLOW', label: 'Нормально', title: 'лучший баланс',
    note: 'поле заметное · цели дальше · нужна точность',
    gravity: 1.12, thrust: .94, brake: .95, targetMin: .96, targetMax: 1.03,
    fuelRegen: 1.00, heatRisk: .94, stressRisk: .96, maxSpeed: 1.0, scanEase: 1.0,
    routeRisk: 1.0, bodyRange: 1.0
  },
  {
    id: 'DEEP', name: 'DEEP', label: 'Сложно', title: 'сильная гравитация',
    note: 'дальние цели · слабее тяга · меньше права на ошибку',
    gravity: 1.38, thrust: .78, brake: .84, targetMin: 1.13, targetMax: 1.22,
    fuelRegen: .86, heatRisk: 1.16, stressRisk: 1.20, maxSpeed: 1.08, scanEase: .88,
    routeRisk: 1.32, bodyRange: 1.12
  }
];

const CONCEPT_LOCK = 'minimal orbital drift: dark geometric space, visible gravity, one-screen navigation, readable computer-like telemetry';

function readSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; }
  catch (_) { return {}; }
}

function writeSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ difficultyIndex, soundOn, navLayer, gravityLayer, userZoom })); }
  catch (_) {}
}

const initialSettings = readSettings();
let difficultyIndex = Math.max(0, Math.min(DIFFICULTIES.length - 1, Number(initialSettings.difficultyIndex ?? 1)));
let difficulty = DIFFICULTIES[difficultyIndex];
let soundOn = initialSettings.soundOn !== false;
let userZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Number(initialSettings.userZoom || 1)));
const TOUCH_CAPABLE = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;

function readBest() {
  try { return Number(localStorage.getItem(STORAGE_KEY) || 0); }
  catch (_) { return 0; }
}

function saveBest() {
  try { localStorage.setItem(STORAGE_KEY, String(Math.floor(best || 0))); }
  catch (_) {}
}

let W = 0;
let H = 0;
let DPR = 1;
let lowPower = false;
let uiScale = 1;
let lastTime = performance.now();
let time = 0;
let frame = 0;

let bodies = [];
let particles = [];
let texts = [];
let backgroundStars = [];
let generated = new Set();
let nextBodyId = 1;
let target = null;
let player = null;
let state = 'menu';
let score = 0;
let chain = 0;
let best = readBest();
let message = '';
let messageTime = 0;
let navLayer = initialSettings.navLayer !== false;
let gravityLayer = initialSettings.gravityLayer !== false;
let lastAssistBody = 0;
let assistMemory = null;
let objective = null;
let routeOptions = [];
let routeChoice = 0;
let navSignal = 0;
let gravityAdvice = '';
let gravityAdviceTime = 0;
let flowAwardLevel = 0;
let visitedNodes = new Set();
let gravityFieldCache = { frame: -999, camX: NaN, camY: NaN, zoom: NaN, width: 0, height: 0, lines: [] };
let predictionCache = { frame: -999, x: NaN, y: NaN, vx: NaN, vy: NaN, points: [] };
let perf = { frameMs: 16, fps: 60, bodies: 0, gravSources: 0, fieldLines: 0 };

const camera = { x: 0, y: 0, shake: 0, zoom: 1 };
const pointer = { down: false, has: false, x: 0, y: 0, wx: 0, wy: 0, last: 0 };
const touchZoom = { active: false, dist: 0, startZoom: 1 };
const keys = Object.create(null);

let audioCtx = null;
let audioReady = false;
let masterGain = null;
let engineOsc = null;
let engineGain = null;
let warningClock = 0;

const MAIN_SEQUENCE = {
  M: { mass: 0.32, radius: 0.45, temp: 3300,  lum: 0.012, hue: 8,   name: 'red dwarf',     reward: 2,  rarity: 54 },
  K: { mass: 0.72, radius: 0.72, temp: 4500,  lum: 0.25,  hue: 24,  name: 'orange dwarf',  reward: 3,  rarity: 22 },
  G: { mass: 1.00, radius: 1.00, temp: 5800,  lum: 1.00,  hue: 45,  name: 'yellow dwarf',  reward: 4,  rarity: 11 },
  F: { mass: 1.38, radius: 1.32, temp: 7000,  lum: 3.6,   hue: 58,  name: 'white-yellow',  reward: 5,  rarity: 7  },
  A: { mass: 2.15, radius: 1.85, temp: 9200,  lum: 22,    hue: 205, name: 'white-blue',    reward: 7,  rarity: 4  },
  B: { mass: 7.20, radius: 4.80, temp: 19000, lum: 1100,  hue: 220, name: 'blue giant',    reward: 10, rarity: 1.5},
  O: { mass: 22.0, radius: 9.50, temp: 34000, lum: 52000, hue: 232, name: 'blue superhot', reward: 16, rarity: .5 }
};

const PLANET_TYPES = [
  { key: 'rock',   label: 'RK', name: 'rocky',     mass: [.035, .13], radius: [15, 28], hue: [22, 52],   reward: 1, ring: .04 },
  { key: 'iron',   label: 'FE', name: 'iron core', mass: [.075, .20], radius: [13, 24], hue: [0, 22],    reward: 2, ring: .02 },
  { key: 'ice',    label: 'IC', name: 'ice world', mass: [.025, .10], radius: [16, 30], hue: [178, 214], reward: 1, ring: .08 },
  { key: 'ocean',  label: 'OC', name: 'oceanic',   mass: [.045, .14], radius: [18, 31], hue: [195, 235], reward: 2, ring: .06 },
  { key: 'gas',    label: 'GJ', name: 'gas giant', mass: [.23, .62],  radius: [34, 54], hue: [34, 74],   reward: 4, ring: .64 },
  { key: 'helium', label: 'HE', name: 'cold giant',mass: [.18, .50],  radius: [30, 50], hue: [190, 240], reward: 3, ring: .42 }
];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, k) => a + (b - a) * k;
const hypot = Math.hypot;
const sqr = v => v * v;
const rnd = (rng, a, b) => a + rng() * (b - a);
const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
const angleDiff = (a, b) => wrapAngle(b - a);
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / Math.max(e1 - e0, 1e-9), 0, 1);
  return t * t * (3 - 2 * t);
};

function hash2(x, y) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(worldSeed | 0, 1442695041)) | 0;
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function chooseWeighted(items, rng) {
  const total = items.reduce((s, it) => s + it.w, 0);
  let roll = rng() * total;
  for (const it of items) {
    roll -= it.w;
    if (roll <= 0) return it.v;
  }
  return items[items.length - 1].v;
}

function chooseMainClass(rng, depth = 0) {
  let weights = Object.keys(MAIN_SEQUENCE).map(k => ({ v: k, w: MAIN_SEQUENCE[k].rarity }));
  if (depth < 5 || score < 22) {
    weights = weights.map(it => ({ v: it.v, w: (it.v === 'O' || it.v === 'B') ? it.w * .18 : it.w }));
  }
  if (score < 12) weights = weights.map(it => ({ v: it.v, w: it.v === 'O' ? 0 : (it.v === 'B' ? it.w * .2 : it.w) }));
  return chooseWeighted(weights, rng);
}

function chooseStellarProfile(rng, depth = 0) {
  const specials = [];
  specials.push({ v: { family: 'main', class: chooseMainClass(rng, depth) }, w: 92 });
  specials.push({ v: { family: 'brown', class: 'BD' }, w: score > 6 ? 4.8 : 2.5 });
  specials.push({ v: { family: 'redgiant', class: 'RG' }, w: score > 12 ? 2.8 : .5 });
  specials.push({ v: { family: 'whitedwarf', class: 'WD' }, w: score > 16 ? 2.2 : .2 });
  specials.push({ v: { family: 'neutron', class: 'NS' }, w: score > 32 ? .45 : 0 });
  return chooseWeighted(specials, rng);
}
