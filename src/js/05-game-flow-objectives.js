/*
 * Orbit Drift — 05-game-flow-objectives
 * World setup, start/end states, target selection, route objectives, scoring.
 * Keep this file loaded after all earlier numbered files.
 */

'use strict';

function setupWorld(preview = false) {
  worldSeed = newWorldSeed();
  mapCode = worldSeed.toString(16).toUpperCase().padStart(8, '0').slice(-6);
  gravityFieldCache.frame = -999;
  predictionCache.frame = -999;
  bodies = [];
  particles = [];
  texts = [];
  generated = new Set();
  nextBodyId = 1;
  target = null;
  score = 0;
  chain = 0;
  message = '';
  messageTime = 0;
  lastAssistBody = 0;
  assistMemory = null;
  objective = null;
  routeOptions = [];
  routeChoice = 0;
  navSignal = 0;
  gravityAdvice = '';
  gravityAdviceTime = 0;
  flowAwardLevel = 0;
  warningClock = 0;
  visitedNodes = new Set();
  tutorialHint = '';
  tutorialHintTime = 0;
  tutorialStage = 0;

  const homeStar = addStar({ family: 'main', class: 'G' }, 0, 0, Math.random);
  homeStar.home = true;
  homeStar.visited = true;
  homeStar.phase = 1.4;
  homeStar.r = 34;
  homeStar.scan = 230;
  homeStar.heatRadius = 540;
  homeStar.label = 'G2V';

  const homePlanet = addPlanet(homeStar, 370, -1.2, Math.random, true);
  homePlanet.hue = 208;
  homePlanet.r = 32;
  homePlanet.scan = 146;
  homePlanet.orbitSpeed = Math.sqrt(homeStar.mu / Math.max(homePlanet.orbitA * homePlanet.orbitA * homePlanet.orbitA, 1)) * .92;
  homePlanet.vx = -Math.sin(homePlanet.orbitAngle) * homePlanet.orbitA * homePlanet.orbitSpeed;
  homePlanet.vy =  Math.cos(homePlanet.orbitAngle) * homePlanet.orbitA * homePlanet.orbitSpeed;

  const spawnDx = -88;
  const spawnDy = -128;
  const spawnR = Math.hypot(spawnDx, spawnDy);
  const spawnTangent = Math.atan2(spawnDy, spawnDx) + Math.PI / 2;
  const spawnSpeed = Math.sqrt((homePlanet.mu * difficulty.gravity) / Math.max(spawnR, 1)) * .86;

  player = {
    x: homePlanet.x + spawnDx,
    y: homePlanet.y + spawnDy,
    vx: homePlanet.vx + Math.cos(spawnTangent) * spawnSpeed,
    vy: homePlanet.vy + Math.sin(spawnTangent) * spawnSpeed,
    angle: spawnTangent,
    r: 8.5,
    fuel: 86,
    maxFuel: 100,
    heat: 0,
    stress: 0,
    hull: 1,
    trail: [],
    thrusting: false,
    brake: false,
    driftCharge: 0,
    lastScanId: 0,
    lastScanAt: -99,
    noThrustTime: 0,
    gravBoost: 0,
    flowTime: 0,
    flowLevel: 0,
    nodeCooldown: 0,
    alive: true
  };

  camera.x = player.x;
  camera.y = player.y;
  camera.shake = 0;
  camera.zoom = 1;
  ensureChunksAround(0, 0, lowPower ? 2 : 3);
  chooseTarget(true);
  state = preview ? 'menu' : 'play';
}

function startGame() {
  ensureAudio();
  setupWorld(false);
  burst(player.x, player.y, 38, 200, .8);
  soundCue('start');
}

function clearGameplayInput() {
  pointer.down = false;
  pointer.has = false;
  pointer.last = 0;
  touchZoom.active = false;
  touchZoom.dist = 0;
  for (const code of Object.keys(keys)) keys[code] = false;
  if (player) {
    player.thrusting = false;
    player.brake = false;
  }
  setEngineAudio(false, 0);
}

function returnToDifficultyMenu() {
  if (state !== 'play' && state !== 'dead') return false;
  clearGameplayInput();
  setupWorld(true);
  clearGameplayInput();
  message = 'Выбор сложности';
  messageTime = 1.2;
  soundCue('select', null, 0);
  return true;
}

function endGame(reason) {
  if (state !== 'play') return;
  state = 'dead';
  message = reason;
  messageTime = 99;
  best = Math.max(best, score);
  saveBest();
  camera.shake = 22;
  burst(player.x, player.y, 78, 8, 1.15);
  soundCue('fail');
}

function routeBodyRisk(body) {
  return clamp(
    (body.kind === 'comet' ? .34 : 0)
    + (body.kind === 'asteroid' ? .10 : 0)
    + (body.binary ? .16 : 0)
    + (body.family === 'neutron' ? .76 : 0)
    + (body.family === 'whitedwarf' ? .52 : 0)
    + (body.class === 'O' || body.class === 'B' ? .60 : 0)
    + (body.luminosity > 50 ? .16 : 0),
    0,
    1
  );
}

function chooseTarget(force = false) {
  if (!player) return;
  ensureChunksAround(player.x, player.y, lowPower ? 3 : 4);

  const speedAngle = Math.atan2(player.vy, player.vx);
  const minD = (force ? 520 : 720 + Math.min(score, 45) * 7) * difficulty.targetMin;
  const maxD = (force ? 2300 : 3100 + Math.min(score, 65) * 15) * difficulty.targetMax;
  const candidates = [];
  const sectorX = Math.floor(player.x / CHUNK);
  const sectorY = Math.floor(player.y / CHUNK);
  const routeRng = mulberry32(hash2(sectorX * 4099 + score * 17 + (force ? 1 : 0), sectorY * 9173 + chain * 31));
  const riskPreference = clamp((difficulty.routeRisk - 1) * .92, -0.52, .46);

  for (const b of bodies) {
    if (b.kind === 'blackhole' || b.home || b.visited) continue;
    const d = hypot(b.x - player.x, b.y - player.y);
    if (d < minD || d > maxD) continue;
    const a = Math.atan2(b.y - player.y, b.x - player.x);
    const forward = (Math.cos(angleDiff(speedAngle, a)) + 1) * .5;
    const rewardWeight = Math.sqrt(b.reward || 1) / 4;
    const distanceFit = 1 - Math.abs(d - (minD + maxD) * .5) / ((maxD - minD) * .5);
    const variety = b.kind === 'comet' ? .2 : (b.kind === 'asteroid' ? .08 : (b.binary ? .1 : 0));
    const intrinsicRisk = routeBodyRisk(b);
    const baseScore = forward * .36 + distanceFit * .38 + rewardWeight * .23 + variety;
    const riskTerm = intrinsicRisk * riskPreference;
    candidates.push({
      body: b,
      risk: intrinsicRisk,
      v: baseScore + riskTerm + routeRng() * (.018 + difficulty.routeRisk * .014)
    });
  }

  if (!candidates.length) {
    const fallbackSeed = hash2(sectorX * 197 + Math.floor(score / 3) + (force ? 23 : 0), sectorY * 149 + chain * 5 + routeChoice);
    const fallbackRng = mulberry32(fallbackSeed);
    const a = speedAngle + rnd(fallbackRng, -.75, .75);
    const d = rnd(fallbackRng, 1700 * difficulty.targetMin, (3150 + score * 9) * difficulty.targetMax);
    const tx = player.x + Math.cos(a) * d;
    const ty = player.y + Math.sin(a) * d;
    const depth = Math.floor(hypot(tx, ty) / CHUNK);
    const env = stellarEnvironmentBias(Math.floor(tx / CHUNK), Math.floor(ty / CHUNK));
    const star = addStar(chooseStellarProfile(fallbackRng, Math.max(8, depth), env), tx, ty, fallbackRng);
    let companion = null;
    if (fallbackRng() < .28 && star.family === 'main') {
      const compEnv = clamp(env + rnd(fallbackRng, -.18, .18), -1, 1);
      companion = addCompanionStar(star, { family: 'main', class: chooseMainClass(fallbackRng, Math.max(9, depth + 1), compEnv) }, rnd(fallbackRng, 540, 920), fallbackRng() * TAU, fallbackRng);
    }
    populateSystemBodies(star, companion, fallbackRng, { minPlanets: star.family === 'neutron' ? 0 : 1, maxPlanets: 3 });
    routeOptions = [star];
    routeChoice = 0;
    setTarget(star, true);
    return;
  }

  candidates.sort((a, b) => b.v - a.v);
  routeOptions = [];
  const routeLimit = clamp(Math.floor(difficulty.routeOptionsCount || 3), 1, 6);
  for (const c of candidates) {
    if (!routeOptions.some(b => b.id === c.body.id)) routeOptions.push(c.body);
    if (routeOptions.length >= routeLimit) break;
  }
  if (!routeOptions.length) return;
  routeChoice = 0;
  setTarget(routeOptions[0], true);
}

function setTarget(body, announce = true) {
  for (const b of bodies) b.target = false;
  target = body || null;
  objective = target ? buildObjective(target) : null;
  if (target) {
    target.target = true;
    if (announce) {
      message = `${objective.title}: ${objective.condition}`;
      messageTime = 1.65;
    }
  }
}

function cycleTarget() {
  if (!player) return;
  routeOptions = routeOptions.filter(b => b && !b.visited && bodies.includes(b));
  if (routeOptions.length < 2) {
    chooseTarget(true);
    return;
  }
  routeChoice = (routeChoice + 1) % routeOptions.length;
  setTarget(routeOptions[routeChoice], true);
  soundCue('route', null, routeChoice);
}

function objectiveRoll(body) {
  const ix = Math.floor((body.x || 0) / 12) + Math.imul(body.id || 0, 73) + difficultyIndex * 997;
  const iy = Math.floor((body.y || 0) / 12) + Math.imul((body.reward || 1), 389) + (body.kind ? body.kind.length * 41 : 0);
  return mulberry32(hash2(ix, iy))();
}

function buildObjective(body) {
  const roll = objectiveRoll(body);
  let type = 'survey';
  if (body.kind === 'comet') type = roll < .7 ? 'rendezvous' : 'survey';
  else if (body.kind === 'planet') type = roll < .56 ? 'orbit' : 'sling';
  else if (body.kind === 'asteroid') type = roll < .62 ? 'survey' : 'silent';
  else if (body.kind === 'star') {
    if (body.family === 'neutron' || body.family === 'whitedwarf') type = roll < .6 ? 'tide' : 'sling';
    else if (body.luminosity > 18 || body.family === 'redgiant' || body.class === 'O' || body.class === 'B') type = roll < .64 ? 'skim' : 'survey';
    else type = roll < .48 ? 'orbit' : 'survey';
  }
  const defs = {
    survey:     { code: 'SCAN',   title: 'Скан цели', condition: 'пройди через кольцо сканирования', successText: 'Скан цели выполнен', partialText: 'Скан засчитан частично', hint: 'пролети через тонкое кольцо', bonus: 2, risk: 'низкий', reward: '+скан и топливо' },
    orbit:      { code: 'ORBIT',  title: 'Выйди на орбиту', condition: 'пройди кольцо ровной дугой', successText: 'Орбита засчитана', partialText: 'Орбита нестабильна, часть очков сохранена', hint: 'держи корабль на ровной дуге', bonus: 5, risk: 'средний', reward: '+точность' },
    sling:      { code: 'SLING',  title: 'Гравитационный разгон', condition: 'пролети рядом без тяги и набери скорость', successText: 'Разгон выполнен', partialText: 'Разгон не набран', hint: 'пройди рядом без тяги и выйди быстрее', bonus: 6, risk: 'средний', reward: '+скорость' },
    skim:       { code: 'SKIM',   title: 'Пролёт у звезды', condition: 'коснись зоны излучения и уйди без перегрева', successText: 'Опасный пролёт выполнен', partialText: 'Пролёт засчитан частично', hint: 'зайди в зону излучения и быстро уходи', bonus: 7, risk: 'нагрев', reward: '+риск' },
    rendezvous: { code: 'COMET',  title: 'Догнать комету', condition: 'сблизься с кометой на близкой скорости', successText: 'Сближение с кометой выполнено', partialText: 'Комета просканирована, скорость не выровнена', hint: 'сблизься с ней и выровняй скорость', bonus: 7, risk: 'скорость', reward: '+комета' },
    tide:       { code: 'TIDE',   title: 'Опасное сближение', condition: 'подойди близко и удержи нагрузку', successText: 'Опасное сближение выдержано', partialText: 'Сближение засчитано частично', hint: 'подойди близко, но не превысь нагрузку', bonus: 9, risk: 'нагрузка', reward: '+опасность' },
    silent:     { code: 'QUIET',  title: 'Скан без тяги', condition: 'пройди кольцо на инерции без тяги', successText: 'Скан без тяги выполнен', partialText: 'Скан засчитан, но тяга мешала', hint: 'пролети кольцо на инерции', bonus: 4, risk: 'контроль', reward: '+инерция' }
  };
  return { type, ...(defs[type] || defs.survey), bodyId: body.id, started: time };
}

function objectiveScore(body, perfect, quality, relSpeed, distance) {
  if (!body.target || !objective || objective.bodyId !== body.id) return { bonus: 0, ok: false, label: '' };
  let bonus = objective.bonus;
  let ok = false;
  let label = objective.code.toLowerCase();
  if (objective.type === 'orbit') {
    ok = perfect || quality > .72;
    bonus += Math.floor(quality * 4);
  } else if (objective.type === 'rendezvous') {
    ok = relSpeed < 210;
    bonus += relSpeed < 150 ? 3 : 0;
  } else if (objective.type === 'skim') {
    ok = body.kind === 'star' && relSpeed > 230 && player.heat < .9;
    bonus += Math.floor(clamp(relSpeed / 260, 0, 3));
  } else if (objective.type === 'tide') {
    ok = (player.stress || 0) > .16 && (player.stress || 0) < .96;
    bonus += Math.floor(clamp((player.stress || 0) * 8, 0, 5));
  } else if (objective.type === 'silent') {
    ok = player.noThrustTime > 1.2;
    bonus += player.noThrustTime > 2.6 ? 2 : 0;
  } else if (objective.type === 'sling') {
    ok = false;
    bonus = 0;
  } else {
    ok = true;
  }
  return { bonus: ok ? bonus : Math.floor(bonus * clamp(difficulty.partialObjectiveFactor, 0, .95)), ok, label };
}

function completeSlingObjective(body, points) {
  if (!target || !objective || objective.type !== 'sling' || body.id !== target.id || body.visited) return false;
  body.visited = true;
  body.scanCooldown = 3;
  chain += 1;
  const gained = (body.reward || 1) + objective.bonus + points + Math.min(5, Math.floor(player.driftCharge * .6));
  score += gained;
  best = Math.max(best, score);
  saveBest();
  player.fuel = clamp(player.fuel + 18 * difficulty.rewardFuelMul, 0, player.maxFuel);
  player.heat = Math.max(0, player.heat - .08 * difficulty.rewardHeatReliefMul);
  player.stress = Math.max(0, (player.stress || 0) - .05 * difficulty.rewardStressReliefMul);
  texts.push({ x: body.x, y: body.y - body.r - 42, text: `разгон +${gained}`, hue: body.hue, life: 1.45, max: 1.45 });
  burst(player.x, player.y, 66, body.hue, .85);
  message = objective.successText || 'Разгон выполнен';
  messageTime = 1.1;
  chooseTarget();
  return true;
}
