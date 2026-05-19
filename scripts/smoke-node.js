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

function assert(condition, message) {
  if (!condition) throw new Error(`smoke assertion failed: ${message}`);
}

function evaluate(expression) {
  return vm.runInContext(expression, sandbox);
}

function assertDifficultyInvariants() {
  const result = evaluate(`(() => {
    const keys = [
      'gravity', 'thrust', 'brake', 'targetMin', 'targetMax', 'fuelRegen',
      'heatRisk', 'stressRisk', 'maxSpeed', 'scanEase', 'routeRisk',
      'bodyRange', 'autoAimMs', 'autoAlignK', 'predictionStepsMul',
      'routeOptionsCount', 'scanMinSpeed', 'perfectQuality',
      'partialObjectiveFactor', 'rewardFuelMul', 'rewardHeatReliefMul',
      'rewardStressReliefMul'
    ];
    return {
      count: DIFFICULTIES.length,
      ids: DIFFICULTIES.map(d => d.id),
      finite: DIFFICULTIES.every(d => keys.every(k => Number.isFinite(Number(d[k])))),
      positive: DIFFICULTIES.every(d => keys.every(k => Number(d[k]) > 0)),
      targetOrder: DIFFICULTIES.every(d => d.targetMin <= d.targetMax),
      harderTargets: DIFFICULTIES[0].targetMin < DIFFICULTIES[1].targetMin && DIFFICULTIES[1].targetMin < DIFFICULTIES[2].targetMin,
      harderRisk: DIFFICULTIES[0].heatRisk < DIFFICULTIES[1].heatRisk && DIFFICULTIES[1].heatRisk < DIFFICULTIES[2].heatRisk,
      fewerRoutes: DIFFICULTIES[0].routeOptionsCount > DIFFICULTIES[1].routeOptionsCount && DIFFICULTIES[1].routeOptionsCount > DIFFICULTIES[2].routeOptionsCount,
      fallback: difficultyNumber('missing-key', 123) === 123
    };
  })()`);

  assert(result.count === 3, 'expected three difficulty presets');
  assert(result.ids.join(',') === 'ZEN,FLOW,DEEP', 'difficulty ids changed');
  assert(result.finite, 'difficulty values must be finite numbers');
  assert(result.positive, 'difficulty values must stay positive');
  assert(result.targetOrder, 'targetMin must not exceed targetMax');
  assert(result.harderTargets, 'harder modes should push targets farther away');
  assert(result.harderRisk, 'harder modes should increase heat risk');
  assert(result.fewerRoutes, 'harder modes should expose fewer route choices');
  assert(result.fallback, 'difficultyNumber fallback is broken');
}

function assertGeneratedWorld() {
  const result = evaluate(`(() => ({
    state,
    hasPlayer: !!player && Number.isFinite(player.x) && Number.isFinite(player.y) && player.alive === true,
    bodyCount: bodies.length,
    homeStars: bodies.filter(b => b.kind === 'star' && b.home && b.visited).length,
    homePlanets: bodies.filter(b => b.kind === 'planet' && b.home && b.visited).length,
    generatedChunks: generated.size,
    hasTarget: !!target && target.target === true && target.home === false,
    routeCount: routeOptions.length,
    hasObjective: !!objective && objective.bodyId === target.id
  }))()`);

  assert(result.state === 'menu', 'preview world should leave state in menu');
  assert(result.hasPlayer, 'preview world must create a valid player');
  assert(result.bodyCount >= 3, 'world generation created too few bodies');
  assert(result.homeStars === 1, 'world must contain one visited home star');
  assert(result.homePlanets === 1, 'world must contain one visited home planet');
  assert(result.generatedChunks > 0, 'chunk generation did not run');
  assert(result.hasTarget, 'target selection did not produce an active target');
  assert(result.routeCount >= 1, 'route options are empty');
  assert(result.hasObjective, 'target objective is missing or detached');
}

function assertObjectiveHudFields() {
  const result = evaluate(`(() => {
    const samples = [];
    const kinds = [
      { kind: 'star', family: 'main', class: 'G', luminosity: 1, reward: 3 },
      { kind: 'star', family: 'main', class: 'O', luminosity: 42, reward: 5 },
      { kind: 'star', family: 'neutron', class: 'NS', luminosity: 8, reward: 7 },
      { kind: 'planet', reward: 3 },
      { kind: 'comet', reward: 4 },
      { kind: 'asteroid', reward: 2 }
    ];

    for (const base of kinds) {
      for (let id = 1; id <= 160; id += 1) {
        const body = {
          ...base,
          id,
          x: id * 37 + (base.kind.length * 11),
          y: -id * 29 + ((base.reward || 1) * 17)
        };
        samples.push(buildObjective(body));
      }
    }

    const requiredTypes = ['survey', 'orbit', 'sling', 'skim', 'rendezvous', 'tide', 'silent'];
    const readableString = value => typeof value === 'string' && value.trim().length >= 2;
    return {
      generatedHasHudFields:
        !!objective
        && readableString(objective.title)
        && readableString(objective.risk)
        && readableString(objective.reward)
        && readableString(objective.code)
        && readableString(objective.hint),
      generatedHasCondition: !!objective && readableString(objectiveVerb(objective)),
      generatedMetaReadable: !!objective && objectiveMetaText(objective).includes(objective.risk) && objectiveMetaText(objective).includes(objective.reward),
      allTypesCovered: requiredTypes.every(type => samples.some(obj => obj.type === type)),
      allSamplesReadable: samples.every(obj =>
        obj
        && readableString(objectiveVerb(obj))
        && readableString(obj.title)
        && readableString(obj.risk)
        && readableString(obj.reward)
        && readableString(obj.code)
        && readableString(obj.hint)
        && Number.isFinite(Number(obj.bonus))
        && Number.isFinite(Number(obj.bodyId))
      )
    };
  })()`);

  assert(result.generatedHasHudFields, 'generated objective must expose title/risk/reward/code/hint for HUD');
  assert(result.generatedHasCondition, 'generated objective must expose a readable condition for HUD');
  assert(result.generatedMetaReadable, 'objective meta text must include risk and reward');
  assert(result.allTypesCovered, 'objective samples should cover every objective type');
  assert(result.allSamplesReadable, 'every objective type must expose readable HUD fields');
}

function assertOptionalMenuReturnUx() {
  const result = evaluate(`(() => {
    function quickMenuButton() {
      state = 'play';
      W = 1280;
      H = 720;
      return quickButtonRects().find(button => button.action === 'menu') || null;
    }

    const menuButton = quickMenuButton();
    const hasReturnFunction = typeof returnToDifficultyMenu === 'function';
    let directReturnOk = true;
    let tapReturnOk = true;

    if (hasReturnFunction) {
      startGame();
      returnToDifficultyMenu();
      directReturnOk = state === 'menu' && menuDifficultyRects().length === DIFFICULTIES.length;
    }

    if (menuButton) {
      startGame();
      W = 1280;
      H = 720;
      const liveMenuButton = quickMenuButton();
      tapReturnOk = !!liveMenuButton
        && handleUiTap(liveMenuButton.x + liveMenuButton.w / 2, liveMenuButton.y + liveMenuButton.h / 2) === true
        && state === 'menu'
        && menuDifficultyRects().length === DIFFICULTIES.length;
    }

    return {
      hasReturnFunction,
      hasMenuQuickButton: !!menuButton,
      directReturnOk,
      tapReturnOk
    };
  })()`);

  assert(result.directReturnOk, 'returnToDifficultyMenu must switch play state back to difficulty menu');
  assert(result.tapReturnOk, 'quick button action menu must return to difficulty menu through UI handler');
}

function assertDeterministicFallbackTarget() {
  const result = evaluate(`(() => {
    const originalEnsureChunksAround = ensureChunksAround;
    const originalBuildObjective = buildObjective;
    const snapshots = [];

    function runFallback() {
      worldSeed = 0x5EED1234;
      bodies = [];
      generated = new Set();
      nextBodyId = 1;
      score = 9;
      chain = 2;
      routeChoice = 1;
      routeOptions = [];
      target = null;
      objective = null;
      difficulty = DIFFICULTIES[1];
      player = { x: 125, y: -340, vx: 72, vy: 31, alive: true };
      ensureChunksAround = () => {};
      buildObjective = body => ({ type: 'survey', code: 'SCAN', title: 'scan', bonus: 2, bodyId: body.id, started: 0 });
      chooseTarget(true);
      return {
        target: target && {
          kind: target.kind,
          family: target.family || '',
          className: target.class || '',
          x: Number(target.x.toFixed(3)),
          y: Number(target.y.toFixed(3)),
          mass: Number(target.mass.toFixed(6))
        },
        bodyCount: bodies.length,
        routeCount: routeOptions.length,
        targetIsRoute: routeOptions[0] === target,
        targetFlagged: !!target && target.target === true
      };
    }

    try {
      snapshots.push(runFallback());
      snapshots.push(runFallback());
    } finally {
      ensureChunksAround = originalEnsureChunksAround;
      buildObjective = originalBuildObjective;
    }

    return {
      first: snapshots[0],
      second: snapshots[1],
      same: JSON.stringify(snapshots[0]) === JSON.stringify(snapshots[1])
    };
  })()`);

  assert(result.first.target, 'fallback did not create a target');
  assert(result.first.target.kind === 'star', 'fallback target should be a star');
  assert(result.first.bodyCount >= 1, 'fallback did not add bodies');
  assert(result.first.routeCount === 1, 'fallback should expose exactly one route option');
  assert(result.first.targetIsRoute, 'fallback target is not the route option');
  assert(result.first.targetFlagged, 'fallback target is not marked active');
  assert(result.same, 'fallback target generation must be deterministic');
}

try {
  vm.createContext(sandbox);
  for (const file of jsFiles) {
    const code = fs.readFileSync(path.join(root, 'src/js', file), 'utf8');
    vm.runInContext(code, sandbox, { filename: file });
  }
  assertDifficultyInvariants();
  assertGeneratedWorld();
  assertObjectiveHudFields();
  assertOptionalMenuReturnUx();
  assertDeterministicFallbackTarget();
  console.log('smoke: ok');
} catch (error) {
  console.error(error && error.stack || error);
  process.exit(1);
}
