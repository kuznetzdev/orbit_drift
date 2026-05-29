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
  'setTransform','clearRect','fillRect','strokeRect','beginPath','moveTo','lineTo','arc','arcTo','ellipse','closePath','stroke','fill','save','restore','translate','rotate','scale','fillText','strokeText','rect','clip','quadraticCurveTo','bezierCurveTo'
];
const canvasCtx = Object.fromEntries(ctxMethods.map(k => [k, () => {}]));
canvasCtx.measureText = text => ({ width: String(text).length * 7 });
canvasCtx.createLinearGradient = () => ({ addColorStop: () => {} });
canvasCtx.createRadialGradient = () => ({ addColorStop: () => {} });
canvasCtx.setLineDash = () => {};
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

function assertResponsiveUiRects() {
  const result = evaluate(`(() => {
    const viewports = [
      { name: 'desktop', w: 1280, h: 720, dpr: 2 },
      { name: 'mobile', w: 390, h: 740, dpr: 3 },
      { name: 'short-mobile', w: 360, h: 640, dpr: 2.5 }
    ];

    const finiteRect = rect =>
      !!rect
      && ['x', 'y', 'w', 'h'].every(key => Number.isFinite(Number(rect[key])))
      && rect.w > 0
      && rect.h > 0;
    const withinViewport = (rect, width, height, pad = 0) =>
      finiteRect(rect)
      && rect.x >= pad
      && rect.y >= pad
      && rect.x + rect.w <= width - pad
      && rect.y + rect.h <= height - pad;
    const areaOverlap = (a, b) => {
      if (!finiteRect(a) || !finiteRect(b)) return 0;
      const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
      const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      return x * y;
    };
    const separated = (a, b, tolerance = 1) => areaOverlap(a, b) <= tolerance;
    const readable = value => {
      const text = String(value || '').trim();
      return text.length >= 2
        && !/undefined|null|todo|nan/i.test(text)
        && !/\\uFFFD/.test(text);
    };

    const snapshots = [];
    for (const vp of viewports) {
      window.innerWidth = vp.w;
      window.innerHeight = vp.h;
      window.devicePixelRatio = vp.dpr;
      resize();

      state = 'menu';
      setupWorld(true);
      const overlay = overlayMetrics(true);
      const difficulties = menuDifficultyRects();
      const sound = menuSoundRect();
      const start = menuStartRect();
      const menuRects = difficulties.concat([sound, start]);
      const menuPairsSeparated = menuRects.every((rect, i) =>
        menuRects.every((other, j) => i >= j || separated(rect, other))
      );
      const menuTextReadable = DIFFICULTIES.every(d =>
        readable(d.label || d.name)
        && readable(d.title)
        && readable(d.riskText)
        && readable(d.rewardText)
      );

      startGame();
      const score = drawScorePanel(uiMargin(), uiMargin(), W < 640 || H < 540);
      const objectivePanel = drawObjectivePanel(uiMargin(), score.y + score.h + (W < 640 || H < 540 ? 8 : 10), W < 640 || H < 540);
      const ship = drawShipPanel(W < 640 || H < 540);
      const quick = quickButtonRects();
      const menuButton = quick.find(button => button.action === 'menu') || null;
      const quickPairsSeparated = quick.every((rect, i) =>
        quick.every((other, j) => i >= j || separated(rect, other))
      );
      const panelRects = [score, objectivePanel].filter(rect => finiteRect(rect));
      if (ship) panelRects.push(ship);
      const panelPairsSeparated = panelRects.every((rect, i) =>
        panelRects.every((other, j) => i >= j || separated(rect, other, 2))
      );
      const quickClearOfPanels = quick.every(button =>
        panelRects.every(panel => separated(button, panel, 2))
      );

      snapshots.push({
        name: vp.name,
        width: W,
        height: H,
        dpr: DPR,
        lowPower,
        uiScale,
        backgroundStars: backgroundStars.length,
        menuOverlayValid: withinViewport({ x: overlay.x, y: overlay.y, w: overlay.boxW, h: overlay.boxH }, W, H),
        menuDifficultyCount: difficulties.length,
        menuRectsInBounds: menuRects.every(rect => withinViewport(rect, W, H, 0)),
        menuPairsSeparated,
        menuTextReadable,
        startReadable: readable(start.label || 'start'),
        objectiveReadable:
          !!objective
          && readable(objective.code)
          && readable(objective.title)
          && readable(objective.hint)
          && readable(objectiveVerb(objective))
          && readable(objectiveMetaText(objective))
          && readable(objectiveSuccessText(objective)),
        quickCount: quick.length,
        quickRectsInBounds: quick.every(rect => withinViewport(rect, W, H, 0)),
        quickPairsSeparated,
        hasMenuButton: !!menuButton,
        menuButtonReadable: !!menuButton && readable(menuButton.label),
        panelRectsInBounds: panelRects.every(rect => withinViewport(rect, W, H, 0)),
        panelPairsSeparated,
        quickClearOfPanels
      });
    }
    return snapshots;
  })()`);

  for (const snapshot of result) {
    assert(snapshot.menuOverlayValid, `${snapshot.name}: menu overlay must stay inside viewport`);
    assert(snapshot.menuDifficultyCount === 3, `${snapshot.name}: menu must expose all difficulty buttons`);
    assert(snapshot.menuRectsInBounds, `${snapshot.name}: menu controls must stay inside viewport`);
    assert(snapshot.menuPairsSeparated, `${snapshot.name}: menu controls must not overlap`);
    assert(snapshot.menuTextReadable, `${snapshot.name}: difficulty cards must keep readable labels`);
    assert(snapshot.objectiveReadable, `${snapshot.name}: play HUD objective text must stay readable`);
    assert(snapshot.quickCount >= 7, `${snapshot.name}: quick actions are missing`);
    assert(snapshot.quickRectsInBounds, `${snapshot.name}: quick actions must stay inside viewport`);
    assert(snapshot.quickPairsSeparated, `${snapshot.name}: quick actions must not overlap`);
    assert(snapshot.hasMenuButton, `${snapshot.name}: play HUD must include a menu button`);
    assert(snapshot.menuButtonReadable, `${snapshot.name}: menu quick button must have a readable label`);
    assert(snapshot.panelRectsInBounds, `${snapshot.name}: HUD panels must stay inside viewport`);
    assert(snapshot.panelPairsSeparated, `${snapshot.name}: HUD panels must not overlap`);
    assert(snapshot.quickClearOfPanels, `${snapshot.name}: quick actions must not cover HUD panels`);
  }
}

function assertAdaptivePerformanceLimits() {
  const result = evaluate(`(() => {
    const originalTouch = navigator.maxTouchPoints;
    const samples = [];

    function sample(name, width, height, dpr, touchPoints) {
      navigator.maxTouchPoints = touchPoints;
      window.innerWidth = width;
      window.innerHeight = height;
      window.devicePixelRatio = dpr;
      resize();
      setupWorld(false);
      camera.x = player.x;
      camera.y = player.y;
      camera.zoom = width < 700 ? .88 : 1;
      frame += 1;

      const hasPrediction = typeof rebuildPredictionCache === 'function';
      if (hasPrediction) rebuildPredictionCache();
      const hasGravityField = typeof rebuildGravityFieldCache === 'function';
      if (hasGravityField) rebuildGravityFieldCache();
      const hasVisibleBodies = typeof visibleBodies === 'function';
      const visibleCount = hasVisibleBodies ? visibleBodies().length : null;

      samples.push({
        name,
        width,
        height,
        dpr: DPR,
        lowPower,
        uiScale,
        canvasPixels: canvas.width * canvas.height,
        backgroundStars: backgroundStars.length,
        hasPrediction,
        predictionPoints: hasPrediction && predictionCache.points ? predictionCache.points.length : null,
        hasGravityField,
        fieldLines: hasGravityField && gravityFieldCache.lines ? gravityFieldCache.lines.length : null,
        hasVisibleBodies,
        visibleCount,
        totalBodies: bodies.length,
        perfFinite:
          Number.isFinite(perf.frameMs)
          && Number.isFinite(perf.fps)
          && Number.isFinite(perf.bodies)
          && Number.isFinite(perf.gravSources)
          && Number.isFinite(perf.fieldLines)
      });
    }

    sample('desktop', 1280, 720, 2, 0);
    sample('mobile', 390, 740, 3, 1);
    navigator.maxTouchPoints = originalTouch;
    return samples;
  })()`);

  const desktop = result.find(sample => sample.name === 'desktop');
  const mobile = result.find(sample => sample.name === 'mobile');
  assert(desktop && mobile, 'adaptive performance samples are missing');
  assert(desktop.dpr <= 1.55, 'desktop DPR cap must prevent excessive canvas size');
  assert(mobile.lowPower === true, 'mobile viewport must enable low-power mode');
  assert(mobile.dpr <= 1.0, 'mobile DPR cap must prevent high-DPR overdraw');
  assert(desktop.canvasPixels <= 1280 * 720 * 1.55 * 1.55 + 1280, 'desktop canvas pixel budget is too high');
  assert(mobile.canvasPixels <= 390 * 740 + 390, 'mobile canvas pixel budget is too high');
  assert(desktop.backgroundStars > mobile.backgroundStars, 'mobile starfield should be lighter than desktop');
  for (const sample of result) {
    assert(sample.perfFinite, `${sample.name}: perf counters must stay finite`);
    if (sample.hasPrediction) {
      assert(sample.predictionPoints >= 14, `${sample.name}: prediction path became too short`);
      assert(sample.predictionPoints <= (sample.lowPower ? 64 : 112), `${sample.name}: prediction path exceeds adaptive budget`);
    }
    if (sample.hasGravityField) {
      assert(sample.fieldLines >= 0, `${sample.name}: gravity field line count must be non-negative`);
      assert(sample.fieldLines <= (sample.lowPower ? 120 : 360), `${sample.name}: gravity field exceeds adaptive budget`);
    }
    if (sample.hasVisibleBodies) {
      assert(sample.visibleCount >= 1, `${sample.name}: visible body collection must include nearby bodies`);
      assert(sample.visibleCount <= sample.totalBodies, `${sample.name}: visible body count cannot exceed total bodies`);
    }
  }
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

function assertAudioFallbackAndRiskFeedback() {
  const result = evaluate(`(() => {
    const originalWarn = console.warn;
    const originalSoundCue = soundCue;
    let warnCount = 0;
    const cues = [];

    try {
      console.warn = () => { warnCount += 1; };
      soundOn = true;
      audioCtx = null;
      audioReady = false;
      audioError = null;
      audioUnlocking = false;

      const ready = ensureAudio();
      soundCue('heat', null, 1);
      soundCue('stress', null, 2);
      soundCue('critical', null, 3);
      soundCue('impact', null, 2);

      setupWorld(false);
      soundCue = (name, body, amount) => { cues.push({ name, amount: amount || 0 }); };
      warningClock = 0;
      player.heat = .73;
      player.stress = .12;
      triggerRiskFeedback(riskLevel(player.heat), riskLevel(player.stress), { body: null }, { body: null });
      player.heat = .10;
      player.stress = .87;
      triggerRiskFeedback(riskLevel(player.heat), riskLevel(player.stress), { body: null }, { body: null });
      player.heat = .10;
      player.stress = .96;
      triggerRiskFeedback(riskLevel(player.heat), riskLevel(player.stress), { body: null }, { body: null });

      return {
        promiseLike: !!ready && typeof ready.then === 'function',
        audioFailedCleanly: audioReady === false && !!audioError,
        unlockingCleared: audioUnlocking === false,
        warnedOnce: warnCount === 1,
        levels: [riskLevel(.71), riskLevel(.72), riskLevel(.86), riskLevel(.95)].join(','),
        cues: cues.map(cue => cue.name).join(',')
      };
    } finally {
      console.warn = originalWarn;
      soundCue = originalSoundCue;
    }
  })()`);

  assert(result.promiseLike, 'ensureAudio must expose async readiness');
  assert(result.audioFailedCleanly, 'audio fallback must keep the game alive without Web Audio');
  assert(result.unlockingCleared, 'audioUnlocking must clear after failed unlock');
  assert(result.warnedOnce, 'audio warnings must be throttled');
  assert(result.levels === '0,1,2,3', 'risk thresholds must stay at 0.72/0.86/0.95');
  assert(result.cues === 'heat,stress,critical', 'risk feedback must escalate through heat/stress/critical cues');
}

function assertStartupSurvival() {
  const result = evaluate(`(() => {
    const originalRandom = Math.random;
    const previousDifficultyIndex = difficultyIndex;
    const previousDifficulty = difficulty;
    const samplesPerDifficulty = 200;
    const seconds = 5;
    const dt = 1 / 60;
    const report = [];

    try {
      for (let d = 0; d < DIFFICULTIES.length; d++) {
        difficultyIndex = d;
        difficulty = DIFFICULTIES[d];
        let deaths = 0;
        let minClearance = Infinity;
        let minForeignDistance = Infinity;
        let worstReason = '';
        let worstNearest = '';
        let worstState = '';
        let minTargetHeatClearance = Infinity;

        for (let sample = 0; sample < samplesPerDifficulty; sample++) {
          Math.random = mulberry32(hash2(0x51A7 + d * 193, sample * 7919 + 17));
          time = 0;
          frame = 0;
          setupWorld(false);
          clearGameplayInput();

          const startX = player.x;
          const startY = player.y;
          if (target && target.kind === 'star') {
            minTargetHeatClearance = Math.min(minTargetHeatClearance, hypot(target.x - startX, target.y - startY) - (target.heatRadius || 0));
          }
          for (const body of bodies) {
            if (body.home) continue;
            const centerDistance = hypot(body.x - startX, body.y - startY);
            minForeignDistance = Math.min(minForeignDistance, centerDistance);
            minClearance = Math.min(minClearance, centerDistance - (body.r || 0) - player.r);
          }

          const steps = Math.ceil(seconds / dt);
          for (let i = 0; i < steps && state === 'play'; i++) update(dt);
          if (state !== 'play') {
            deaths += 1;
            worstReason = message || worstReason;
            let nearest = null;
            let nearestD = Infinity;
            for (const body of bodies) {
              const dBody = hypot(player.x - body.x, player.y - body.y);
              if (dBody < nearestD) {
                nearest = body;
                nearestD = dBody;
              }
            }
            if (nearest) {
              worstNearest = nearest.kind + ':'
                + (nearest.label || nearest.class || '') + ':'
                + (nearest.home ? 'home' : 'foreign') + ':'
                + (nearest.target ? 'target' : 'free') + ':'
                + nearestD.toFixed(2);
            }
            worstState = 't=' + time.toFixed(2)
              + ', speed=' + hypot(player.vx, player.vy).toFixed(2)
              + ', targetD=' + (target ? hypot(target.x - player.x, target.y - player.y).toFixed(2) : 'none');
          }
        }

        report.push({
          id: difficulty.id,
          deaths,
          samples: samplesPerDifficulty,
          minForeignDistance: Number.isFinite(minForeignDistance) ? Number(minForeignDistance.toFixed(3)) : null,
          minClearance: Number.isFinite(minClearance) ? Number(minClearance.toFixed(3)) : null,
          minTargetHeatClearance: Number.isFinite(minTargetHeatClearance) ? Number(minTargetHeatClearance.toFixed(3)) : null,
          worstReason,
          worstNearest,
          worstState
        });
      }
    } finally {
      Math.random = originalRandom;
      difficultyIndex = previousDifficultyIndex;
      difficulty = previousDifficulty;
      setupWorld(true);
    }

    return report;
  })()`);

  for (const item of result) {
    assert(item.deaths === 0, `${item.id}: startup deaths ${item.deaths}/${item.samples}; ${item.worstReason}; nearest ${item.worstNearest}; ${item.worstState}`);
    assert(item.minForeignDistance === null || item.minForeignDistance >= 900, `${item.id}: foreign body inside 900px startup area`);
    assert(item.minClearance === null || item.minClearance >= 0, `${item.id}: foreign body overlaps startup clearance`);
    assert(item.minTargetHeatClearance === null || item.minTargetHeatClearance >= 900, `${item.id}: startup target heat zone is too close`);
  }
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
  assertAudioFallbackAndRiskFeedback();
  assertStartupSurvival();
  assertObjectiveHudFields();
  assertResponsiveUiRects();
  assertAdaptivePerformanceLimits();
  assertOptionalMenuReturnUx();
  assertDeterministicFallbackTarget();
  console.log('smoke: ok');
} catch (error) {
  console.error(error && error.stack || error);
  process.exit(1);
}
