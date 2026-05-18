/*
 * Orbit Drift — 07-simulation-gameplay
 * Frame update, gravity assists, heat/fuel, Lagrange nodes, scanning, particles, floating text.
 * Keep this file loaded after all earlier numbered files.
 */

'use strict';

function update(dt) {
  time += dt;
  frame++;
  if (messageTime > 0 && messageTime < 90) messageTime -= dt;
  if (gravityAdviceTime > 0) gravityAdviceTime -= dt;
  if (tutorialHintTime > 0) tutorialHintTime -= dt;
  updateBodies(dt);
  if (state === 'play') updateGame(dt);
  else setEngineAudio(false, 0);
  updateParticles(dt);
  updateTexts(dt);
}

function updateGame(dt) {
  if (frame % (lowPower ? 28 : 14) === 0) {
    ensureChunksAround(player.x, player.y, lowPower ? 1 : 2);
    cleanupFarBodies();
  }
  pointerWorld();

  const left = keys.KeyA || keys.ArrowLeft;
  const right = keys.KeyD || keys.ArrowRight;
  const thrustInput = pointer.down || keys.KeyW || keys.ArrowUp || keys.Space;
  const brakeInput = keys.KeyS || keys.ArrowDown;
  const preG = gravityAt(player.x, player.y, true);
  const gravityBurn = clamp(Math.log1p(preG.mag) / 9.6, 0, .55);

  const turnRate = 3.85;
  const pointerAimActive = pointer.has && performance.now() - pointer.last < Math.max(0, difficultyNumber('autoAimMs', 4500));
  if (pointerAimActive) {
    const desired = Math.atan2(pointer.wy - player.y, pointer.wx - player.x);
    player.angle += clamp(angleDiff(player.angle, desired), -turnRate * dt, turnRate * dt);
  }
  if (left) player.angle -= turnRate * .95 * dt;
  if (right) player.angle += turnRate * .95 * dt;

  let ctrlAx = 0;
  let ctrlAy = 0;
  let thrusting = false;

  if (thrustInput && player.fuel > .8) {
    const thrust = 76 * difficulty.thrust * (1 + gravityBurn * .35);
    ctrlAx += Math.cos(player.angle) * thrust;
    ctrlAy += Math.sin(player.angle) * thrust;
    player.fuel -= (9.8 - gravityBurn * 2.0) * dt;
    player.noThrustTime = 0;
    thrusting = true;
    engineParticles(dt);
  } else {
    player.noThrustTime += dt;
  }
  player.thrusting = thrusting;
  player.gravBoost = lerp(player.gravBoost || 0, thrusting ? gravityBurn : 0, 1 - Math.pow(.045, dt));

  if (brakeInput && player.fuel > .6) {
    const retro = Math.atan2(-player.vy, -player.vx);
    const brake = 62 * difficulty.brake;
    ctrlAx += Math.cos(retro) * brake;
    ctrlAy += Math.sin(retro) * brake;
    player.fuel -= 8.5 * dt;
    player.brake = true;
    brakeParticles(dt);
  } else {
    player.brake = false;
  }
  setEngineAudio(thrusting || player.brake, clamp(hypot(ctrlAx, ctrlAy) / 110, 0, 1));

  // Velocity Verlet / kick-drift-kick. It keeps orbits much more stable than a simple Euler step.
  const g0 = gravityAt(player.x, player.y, true);
  const w0 = stellarWindAt(player.x, player.y);
  const ax0 = g0.ax + w0.ax + ctrlAx;
  const ay0 = g0.ay + w0.ay + ctrlAy;
  const halfVx = player.vx + ax0 * dt * .5;
  const halfVy = player.vy + ay0 * dt * .5;
  const nextX = player.x + halfVx * dt;
  const nextY = player.y + halfVy * dt;
  const g1 = gravityAt(nextX, nextY, true);
  const w1 = stellarWindAt(nextX, nextY);
  const ax1 = g1.ax + w1.ax + ctrlAx;
  const ay1 = g1.ay + w1.ay + ctrlAy;

  updateThermalAndFuel(dt);
  if (state !== 'play') return;

  if (!thrusting && g1.body && g1.mag > 2.2) {
    player.driftCharge += dt * clamp(g1.mag / 26, .18, 3.1) * clamp(hypot(player.vx, player.vy) / 240, .42, 3.2);
  } else {
    player.driftCharge = Math.max(0, player.driftCharge - dt * .12);
  }
  player.driftCharge = clamp(player.driftCharge, 0, 10);
  updateGravityFlow(g1, dt);
  navSignal = lerp(navSignal, target ? clamp(1 - worldDistanceToTarget() / 5200, .05, 1) : 0, .03);

  detectGravityAssist(g1, dt);

  player.x = nextX;
  player.y = nextY;
  player.vx = halfVx + ax1 * dt * .5;
  player.vy = halfVy + ay1 * dt * .5;

  const speed = hypot(player.vx, player.vy);
  const maxSpeed = 980 * difficulty.maxSpeed;
  if (speed > maxSpeed) {
    const k = maxSpeed / speed;
    player.vx *= k;
    player.vy *= k;
  }

  if (!pointerAimActive && speed > 18 && !left && !right) {
    player.angle += angleDiff(player.angle, Math.atan2(player.vy, player.vx)) * difficultyNumber('autoAlignK', .02);
  }

  player.trail.push({ x: player.x, y: player.y, speed, heat: player.heat });
  if (player.trail.length > 150) player.trail.shift();

  checkCollisionsAndScans(dt);
  checkLagrangeNodes(dt);
  updateTutorialHints(thrusting, brakeInput);

  const lookX = player.x + player.vx * .33;
  const lookY = player.y + player.vy * .33;
  camera.x = lerp(camera.x, lookX, 1 - Math.pow(.0032, dt));
  camera.y = lerp(camera.y, lookY, 1 - Math.pow(.0032, dt));
  camera.shake = Math.max(0, camera.shake - dt * 25);
  const baseZoom = W < 700 ? .88 : 1;
  camera.zoom = lerp(camera.zoom, baseZoom * userZoom, .040);
}

function showTutorialHint(text, duration = 2.4) {
  tutorialHint = text;
  tutorialHintTime = duration;
}

function updateTutorialHints(thrusting, brakeInput) {
  if (!player || state !== 'play' || score > 8) return;
  if (tutorialHintTime > 0) return;
  if (tutorialStage === 0 && time > 1.0) {
    tutorialStage = 1;
    showTutorialHint('Тяга меняет курс. Отпускай её, чтобы поле вело корабль дальше.');
  } else if (tutorialStage === 1 && target && worldDistanceToTarget() < 1700) {
    tutorialStage = 2;
    showTutorialHint('Кольцо цели даёт очки. Чище дуга — выше награда.');
  } else if (tutorialStage === 2 && player.noThrustTime > 1.4 && player.driftCharge > 1.2) {
    tutorialStage = 3;
    showTutorialHint('Инерция копит заряд дуги. Риск окупается, пока нагрев и нагрузка в норме.');
  } else if (tutorialStage === 3 && (player.heat > .45 || player.stress > .45 || brakeInput || thrusting)) {
    tutorialStage = 4;
    showTutorialHint('Следи за нагревом и нагрузкой. Красные шкалы требуют выхода из поля.');
  }
}

function updateGravityFlow(g, dt) {
  if (!player || state !== 'play') return;
  const speed = hypot(player.vx, player.vy);
  const inReadableField = g && g.body && g.mag > 1.35 && speed > 95;
  if (!player.thrusting && inReadableField && player.heat < .92 && (player.stress || 0) < .96) {
    player.flowTime = (player.flowTime || 0) + dt;
    const level = Math.floor(player.driftCharge / 2.25);
    if (level > flowAwardLevel && level >= 1) {
      flowAwardLevel = level;
      const gained = Math.min(5, 1 + level);
      score += gained;
      best = Math.max(best, score);
      saveBest();
      texts.push({ x: player.x, y: player.y - 30, text: `чистая дуга +${gained}`, hue: g.body.hue || 205, life: 1.15, max: 1.15 });
      gravityAdvice = level >= 3 ? 'Поле держит курс. Не жги тягу без нужды.' : 'Хорошая дуга. Держи инерцию.';
      gravityAdviceTime = 1.6;
      soundCue('flow', g.body, level);
    }
  } else {
    player.flowTime = Math.max(0, (player.flowTime || 0) - dt * 1.25);
    if (player.driftCharge < .7) flowAwardLevel = 0;
  }
}

function detectGravityAssist(g, dt) {
  if (!g.body || !player || player.thrusting) return;
  const b = g.body;
  if (b.kind !== 'planet' && b.kind !== 'star') return;
  const d = hypot(player.x - b.x, player.y - b.y);
  if (d > Math.max(b.scan + 260, b.r + 360)) return;
  const relSpeed = hypot(player.vx - (b.vx || 0), player.vy - (b.vy || 0));
  if (!assistMemory || assistMemory.id !== b.id || time - assistMemory.t > 5) {
    assistMemory = { id: b.id, t: time, speedIn: relSpeed, minD: d, silent: player.noThrustTime };
    return;
  }
  assistMemory.minD = Math.min(assistMemory.minD, d);
  assistMemory.silent += dt;
  if (d > assistMemory.minD + 80 && assistMemory.silent > .55 && b.id !== lastAssistBody) {
    const gain = relSpeed - assistMemory.speedIn;
    if (gain > 7) {
      const points = clamp(Math.floor(gain / 8), 1, 12);
      score += points;
      best = Math.max(best, score);
      saveBest();
      texts.push({ x: player.x, y: player.y - 22, text: `гравиманёвр +${points}`, hue: b.hue, life: 1.2, max: 1.2 });
      burst(player.x, player.y, 30, b.hue, .55);
      soundCue('assist', b, points);
      lastAssistBody = b.id;
      message = 'Гравитация добавила скорость';
      messageTime = .9;
      completeSlingObjective(b, points);
    }
    assistMemory = null;
  }
}

function updateThermalAndFuel(dt) {
  const rad = radiationAt(player.x, player.y);
  const flux = rad.flux;
  player.fuel += dt * (2.7 + clamp(Math.sqrt(Math.max(flux, 0)) * .18, 0, 9)) * difficulty.fuelRegen;
  player.fuel = clamp(player.fuel, 0, player.maxFuel);

  const danger = Math.max(0, flux - .54);
  const heatAdd = clamp(danger * .065, 0, rad.body && (rad.body.class === 'O' || rad.body.class === 'B' || rad.body.family === 'redgiant') ? 1.5 : .92);
  player.heat += heatAdd * dt * difficulty.heatRisk;
  player.heat -= dt * (.09 + (player.thrusting ? 0 : .065));
  player.heat = clamp(player.heat, 0, 1.18);

  const tide = tidalStressAt(player.x, player.y);
  const targetStress = clamp(tide.stress * difficulty.stressRisk, 0, 1.28);
  player.stress = lerp(player.stress || 0, targetStress, 1 - Math.pow(.08, dt));
  if (player.stress > .92 && tide.body && Math.random() < dt * 16) {
    particles.push({ x: player.x + rnd(Math.random, -12, 12), y: player.y + rnd(Math.random, -12, 12), vx: rnd(Math.random, -18, 18), vy: rnd(Math.random, -18, 18), size: rnd(Math.random, 1, 2.5), hue: tide.body.hue || 255, life: .28, max: .28, drag: .92 });
  }

  const heatRisk = player.heat > .72;
  const stressRisk = player.stress > .72;
  warningClock = Math.max(0, warningClock - dt);
  if (warningClock <= 0 && (heatRisk || stressRisk)) {
    warningClock = .62;
    soundCue('warn');
    if (messageTime <= .16 || (message && message.startsWith('Риск:'))) {
      message = heatRisk && stressRisk
        ? 'Риск: перегрев и перегрузка'
        : (heatRisk ? 'Риск: перегрев' : 'Риск: перегрузка');
      messageTime = .78;
    }
  }

  if (player.heat >= 1) endGame('Корабль перегрелся у звезды');
  if (player.stress >= 1.08) endGame('Корабль не выдержал нагрузки');
}

function lagrangeNodesNearby(limit = 10) {
  if (!player) return [];
  const byId = new Map();
  for (const b of bodies) byId.set(b.id, b);
  const nodes = [];
  for (const p of bodies) {
    if (p.kind !== 'planet' || !p.parentId || p.home) continue;
    const parent = byId.get(p.parentId);
    if (!parent || parent.kind !== 'star') continue;
    const dToPlayer = hypot(player.x - p.x, player.y - p.y);
    if (dToPlayer > 2700) continue;
    const px = p.x - parent.x;
    const py = p.y - parent.y;
    const orbitR = hypot(px, py);
    if (orbitR < 180) continue;
    const base = Math.atan2(py, px);
    const stability = clamp((parent.mass || 1) / Math.max((p.mass || .02) * 42, .001), .25, 3.2);
    for (const item of [{label:'L4', sign: 1}, {label:'L5', sign: -1}]) {
      const a = base + item.sign * Math.PI / 3;
      const x = parent.x + Math.cos(a) * orbitR;
      const y = parent.y + Math.sin(a) * orbitR;
      const d = hypot(player.x - x, player.y - y);
      if (d > 2300) continue;
      const key = `${p.id}:${item.label}`;
      nodes.push({ x, y, d, key, label: item.label, hue: p.hue, body: p, parent, stability, reward: 3 + Math.floor(stability) + (p.reward || 1) });
    }
  }
  nodes.sort((a, b) => a.d - b.d);
  return nodes.slice(0, limit);
}

function checkLagrangeNodes(dt) {
  if (!player || state !== 'play') return;
  player.nodeCooldown = Math.max(0, (player.nodeCooldown || 0) - dt);
  if (player.nodeCooldown > 0) return;
  if (player.thrusting || player.noThrustTime < .7) return;
  const nodes = lagrangeNodesNearby(8);
  for (const n of nodes) {
    if (visitedNodes.has(n.key)) continue;
    const d = hypot(player.x - n.x, player.y - n.y);
    if (d > 46) continue;
    const rel = hypot(player.vx - (n.body.vx || 0), player.vy - (n.body.vy || 0));
    const quietBonus = player.noThrustTime > 2.0 ? 2 : 0;
    const speedBonus = rel < 190 ? 2 : 0;
    const gained = n.reward + quietBonus + speedBonus;
    visitedNodes.add(n.key);
    player.nodeCooldown = 1.2;
    score += gained;
    chain += 1;
    best = Math.max(best, score);
    saveBest();
    player.fuel = clamp(player.fuel + (20 + speedBonus * 4) * difficultyNumber('rewardFuelMul', 1), 0, player.maxFuel);
    player.driftCharge = clamp(player.driftCharge + 1.5, 0, 10);
    player.heat = Math.max(0, player.heat - .05 * difficultyNumber('rewardHeatReliefMul', 1));
    player.stress = Math.max(0, (player.stress || 0) - .04 * difficultyNumber('rewardStressReliefMul', 1));
    texts.push({ x: n.x, y: n.y - 24, text: `${n.label} точка +${gained}`, hue: n.hue, life: 1.45, max: 1.45 });
    burst(n.x, n.y, 44, n.hue, .72);
    soundCue('node', n.body, n.label === 'L4' ? 1 : 2);
    message = `${n.label}: спокойная точка пройдена`;
    messageTime = 1.05;
    return;
  }
}

function checkCollisionsAndScans(dt) {
  const now = time;
  for (const b of bodies) {
    const d = hypot(player.x - b.x, player.y - b.y);
    if (b.kind === 'blackhole') {
      if (d < b.event) {
        endGame('Корабль ушёл за горизонт событий');
        return;
      }
    } else if (d < b.r + player.r) {
      endGame(b.kind === 'star' ? 'Корабль сгорел в звезде' : 'Корабль столкнулся с объектом');
      return;
    }

    if (b.kind !== 'blackhole' && !b.home && !b.visited && b.scanCooldown <= 0) {
      const band = Math.abs(d - b.scan) < b.scanWidth * difficulty.scanEase;
      const speed = hypot(player.vx - (b.vx || 0), player.vy - (b.vy || 0));
      const safeSpeed = speed > difficultyNumber('scanMinSpeed', 78);
      if (band && safeSpeed && now - player.lastScanAt > .62) {
        const q = orbitalElements(b);
        scanBody(b, q && q.quality > difficultyNumber('perfectQuality', .76), q ? q.quality : 0, speed, d);
        return;
      }
    }
  }
}

function scanBody(body, perfect, quality, relSpeed = 0, distance = 0) {
  body.visited = true;
  body.scanCooldown = 3;
  player.lastScanId = body.id;
  player.lastScanAt = time;
  chain += 1;

  const obj = objectiveScore(body, perfect, quality, relSpeed, distance);
  const targetBonus = body.target ? 2 + obj.bonus : 0;
  const driftBonus = Math.min(6, Math.floor(player.driftCharge * .68));
  const perfectBonus = perfect ? Math.max(1, Math.ceil((body.reward || 1) * .45)) : 0;
  const riskBonus = body.family === 'neutron' || body.kind === 'comet' || body.family === 'whitedwarf' ? 2 : 0;
  const routeBonus = body.target && obj.ok ? Math.min(5, Math.floor(navSignal * 5)) : 0;
  const base = body.reward || 1;
  const gained = base + targetBonus + driftBonus + perfectBonus + riskBonus + routeBonus;
  score += gained;
  best = Math.max(best, score);
  saveBest();

  const fuelBonus = body.kind === 'star' ? 16 : (body.kind === 'comet' ? 10 : 24);
  player.fuel = clamp(player.fuel + (fuelBonus + perfectBonus * 4) * difficultyNumber('rewardFuelMul', 1), 0, player.maxFuel);
  player.heat = Math.max(0, player.heat - (perfect ? .13 : .07) * difficultyNumber('rewardHeatReliefMul', 1));
  player.stress = Math.max(0, (player.stress || 0) - .08 * difficultyNumber('rewardStressReliefMul', 1));

  const label = body.target && obj.label ? `${obj.label} +${gained}` : (perfect ? `орбита +${gained}` : `скан +${gained}`);
  texts.push({ x: body.x, y: body.y - body.r - 34, text: label, hue: body.hue, life: 1.35, max: 1.35 });
  burst(body.x, body.y, perfect || obj.ok ? 86 : 54, body.hue, perfect || obj.ok ? 1.25 : .88);
  camera.shake = Math.max(camera.shake, perfect || obj.ok ? 7 : 4);

  soundCue(perfect || obj.ok ? 'perfect' : 'scan', body);

  player.driftCharge = Math.max(0, player.driftCharge - 3.0);
  if (body.target && objective) {
    message = obj.ok ? `${objective.title}: выполнено` : `${objective.title}: частично выполнено`;
  } else {
    message = perfect ? 'Орбита стабилизирована' : `Скан завершён: ${labelOf(body)}`;
  }
  messageTime = .95;

  if (body.target) chooseTarget();
  else if (!target || target.visited) chooseTarget();
}

function pointerWorld() {
  const w = screenToWorld(pointer.x, pointer.y);
  pointer.wx = w.x;
  pointer.wy = w.y;
}

function engineParticles(dt) {
  const amount = Math.ceil(5 * dt * 60);
  for (let i = 0; i < amount; i++) {
    const a = player.angle + Math.PI + rnd(Math.random, -.34, .34);
    const speed = rnd(Math.random, 70, 160);
    particles.push({
      x: player.x - Math.cos(player.angle) * 13 + rnd(Math.random, -3, 3),
      y: player.y - Math.sin(player.angle) * 13 + rnd(Math.random, -3, 3),
      vx: player.vx * .12 + Math.cos(a) * speed,
      vy: player.vy * .12 + Math.sin(a) * speed,
      size: rnd(Math.random, 1.1, 2.6),
      hue: rnd(Math.random, 188, 216),
      life: rnd(Math.random, .16, .32),
      max: .32,
      drag: .94
    });
  }
}

function brakeParticles(dt) {
  if (Math.random() > dt * 42) return;
  particles.push({
    x: player.x + rnd(Math.random, -10, 10),
    y: player.y + rnd(Math.random, -10, 10),
    vx: rnd(Math.random, -35, 35),
    vy: rnd(Math.random, -35, 35),
    size: rnd(Math.random, 1, 2.2),
    hue: 186,
    life: .28,
    max: .28,
    drag: .91
  });
}

function burst(x, y, count, hue, power = 1) {
  count = Math.floor(lowPower ? count * .58 : count);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * TAU;
    const s = rnd(Math.random, 34, 255) * power;
    particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      size: rnd(Math.random, 1, 3),
      hue: hue + rnd(Math.random, -18, 18),
      life: rnd(Math.random, .38, 1.05),
      max: 1.05,
      drag: .982
    });
  }
}

function updateParticles(dt) {
  for (const p of particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.pow(p.drag || .98, dt * 60);
    p.vy *= Math.pow(p.drag || .98, dt * 60);
  }
  particles = particles.filter(p => p.life > 0);
  const particleLimit = lowPower ? 220 : 420;
  if (particles.length > particleLimit) particles.splice(0, particles.length - particleLimit);
}

function updateTexts(dt) {
  for (const f of texts) {
    f.life -= dt;
    f.y -= 30 * dt;
  }
  texts = texts.filter(f => f.life > 0);
}
