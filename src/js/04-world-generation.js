/*
 * Orbit Drift — 04-world-generation
 * Astrophysical body factories and deterministic procedural map/chunk generation.
 * Keep this file loaded after all earlier numbered files.
 */

'use strict';

function orbitSpeedAround(parentMu, orbitA, rng, minMul = .96, maxMul = 1.04) {
  if (!parentMu || !orbitA) return 0;
  const base = Math.sqrt(parentMu / Math.max(orbitA * orbitA * orbitA, 1));
  const dir = rng() < .5 ? -1 : 1;
  return base * rnd(rng, minMul, maxMul) * dir;
}

function localEccentricityCap(orbitA, innerOrbit, outerOrbit, hardCap = .16) {
  const innerGap = Math.max(40, orbitA - (innerOrbit || (orbitA - 220)));
  const outerGap = Math.max(40, (outerOrbit || (orbitA + innerGap)) - orbitA);
  const localGap = Math.min(innerGap, outerGap);
  const capFromGap = clamp((localGap / Math.max(orbitA, 1)) * .46, .012, hardCap);
  return capFromGap;
}

function sTypeStabilityLimit(hostMass, companionMass, binaryA, binaryE) {
  if (!hostMass || !companionMass || !binaryA) return Infinity;
  const mu = companionMass / Math.max(hostMass + companionMass, .000001);
  const e = clamp(binaryE || 0, 0, .8);
  const ratio = clamp(
    0.464 - 0.380 * mu - 0.631 * e + 0.586 * mu * e + 0.150 * e * e - 0.198 * mu * e * e,
    0.08,
    0.58
  );
  return binaryA * ratio;
}

function stableOrbitCeiling(star, companion) {
  if (!companion) return Infinity;
  return sTypeStabilityLimit(star.mass, companion.mass, companion.orbitA, companion.orbitE) * .97;
}

function systemBaseOrbit(star) {
  return star.scan + (star.family === 'redgiant' ? 280 : 150);
}

function buildPlanetOrbitPlan(star, rng, planetCount, extreme = false) {
  const baseOrbit = systemBaseOrbit(star);
  const plan = [];
  const brown = star.family === 'brown';
  let orbitA = baseOrbit + rnd(rng, extreme ? 18 : 24, extreme ? 220 : 180);
  for (let i = 0; i < planetCount; i++) {
    if (i > 0) {
      const minStep = brown ? 120 : 165;
      const maxStep = brown ? 220 : 310;
      orbitA += rnd(rng, minStep * (extreme ? .78 : 1), maxStep * (extreme ? 1.38 : 1));
    }
    plan.push(orbitA);
  }
  return { baseOrbit, plan };
}

function stablePlanetOrbits(star, companion, orbitPlan) {
  const stableMaxOrbit = stableOrbitCeiling(star, companion);
  const usable = [];
  for (const orbit of orbitPlan) {
    if (star.heatRadius > 0 && orbit < star.heatRadius * .45 && star.luminosity > 50) continue;
    if (orbit > stableMaxOrbit) continue;
    usable.push(orbit);
  }
  return usable;
}

function addPlanetsOnOrbits(star, orbits, baseOrbit, rng, extreme = false) {
  const planets = [];
  for (let i = 0; i < orbits.length; i++) {
    const orbit = orbits[i];
    const inner = i > 0 ? orbits[i - 1] : Math.min(baseOrbit, orbit - 80);
    const outer = i + 1 < orbits.length ? orbits[i + 1] : orbit + (orbit - inner);
    const hardCap = star.family === 'redgiant' ? .18 : (extreme ? .17 : .13);
    const eCap = localEccentricityCap(orbit, inner, outer, hardCap);
    planets.push(addPlanet(star, orbit, rng() * TAU, rng, false, { maxEcc: eCap }));
  }
  return planets;
}

function populateSystemBodies(star, companion, rng, options = {}) {
  const canHavePlanets = star.family !== 'neutron' && star.family !== 'whitedwarf';
  const extreme = options.extreme ?? (rng() < .035 && star.family === 'main');
  const maxPlanets = options.maxPlanets || (star.family === 'brown' ? 3 : (extreme ? 6 : 5));
  const minPlanets = options.minPlanets || (canHavePlanets ? 1 : 0);
  const rawCount = canHavePlanets
    ? minPlanets + Math.floor(rng() * Math.max(1, maxPlanets - minPlanets + 1))
    : Math.floor(rng() * 2);
  const { baseOrbit, plan } = buildPlanetOrbitPlan(star, rng, rawCount, extreme);
  const usableOrbits = stablePlanetOrbits(star, companion, plan);
  if (!usableOrbits.length && companion && canHavePlanets) {
    const compactMin = star.scan + 70;
    const compactMax = stableOrbitCeiling(star, companion) * .92;
    if (compactMax > compactMin) usableOrbits.push(rnd(rng, compactMin, compactMax));
  }
  const planets = addPlanetsOnOrbits(star, usableOrbits, baseOrbit, rng, extreme);
  const outerAnchor = usableOrbits.length ? usableOrbits[usableOrbits.length - 1] : (baseOrbit + rnd(rng, 220, 420));

  if ((options.allowBelts !== false) && rng() < (extreme ? .58 : .45) && star.family !== 'neutron') {
    const beltR = outerAnchor + rnd(rng, 120, extreme ? 420 : 300);
    const n = 3 + Math.floor(rng() * (extreme ? 11 : 8));
    for (let i = 0; i < n; i++) addAsteroid(star, beltR + rnd(rng, -72, 82), rng() * TAU, rng);
  }
  if ((options.allowComets !== false) && rng() < (extreme ? .24 : .18) && star.family === 'main') {
    const n = rng() < (extreme ? .48 : .35) ? 2 : 1;
    const cometMin = Math.max(outerAnchor + 260, 760);
    const cometMax = Math.max(cometMin + 260, outerAnchor + (extreme ? 1320 : 960));
    for (let i = 0; i < n; i++) addComet(star, rnd(rng, cometMin, cometMax), rng() * TAU, rng);
  }
  return { planets, outerAnchor, extreme };
}

function starStats(profile, rng) {
  if (profile.family === 'main') {
    const d = MAIN_SEQUENCE[profile.class];
    const mass = d.mass * rnd(rng, .88, 1.12);
    const radiusSolar = d.radius * rnd(rng, .88, 1.14);
    const luminosity = d.lum * rnd(rng, .82, 1.22);
    return {
      family: 'main', class: profile.class, label: profile.class + 'V', name: d.name,
      mass, radiusSolar, luminosity, temperature: d.temp, hue: d.hue, reward: d.reward,
      visualR: 17 + Math.sqrt(radiusSolar) * 18,
      fieldBoost: 1,
      scanBoost: 1,
      compact: false
    };
  }
  if (profile.family === 'brown') {
    const mass = rnd(rng, .045, .075);
    return {
      family: 'brown', class: 'BD', label: 'BD', name: 'brown dwarf',
      mass, radiusSolar: rnd(rng, .08, .14), luminosity: rnd(rng, .0004, .004), temperature: Math.floor(rnd(rng, 900, 1900)), hue: 12, reward: 3,
      visualR: 18 + rng() * 4, fieldBoost: .75, scanBoost: .8, compact: false
    };
  }
  if (profile.family === 'redgiant') {
    const mass = rnd(rng, .85, 2.4);
    const radiusSolar = rnd(rng, 18, 72);
    const luminosity = rnd(rng, 90, 900);
    return {
      family: 'redgiant', class: 'RG', label: 'RG', name: 'red giant',
      mass, radiusSolar, luminosity, temperature: Math.floor(rnd(rng, 3300, 4700)), hue: 7, reward: 9,
      visualR: 42 + Math.sqrt(radiusSolar) * 7.2, fieldBoost: .96, scanBoost: 1.15, compact: false
    };
  }
  if (profile.family === 'whitedwarf') {
    const mass = rnd(rng, .58, 1.18);
    return {
      family: 'whitedwarf', class: 'WD', label: 'WD', name: 'white dwarf',
      mass, radiusSolar: rnd(rng, .012, .028), luminosity: rnd(rng, .012, .12), temperature: Math.floor(rnd(rng, 7000, 22000)), hue: 206, reward: 8,
      visualR: 13 + rng() * 3, fieldBoost: 1.42, scanBoost: .55, compact: true
    };
  }
  const mass = rnd(rng, 1.32, 2.05);
  return {
    family: 'neutron', class: 'NS', label: 'NS', name: 'neutron star',
    mass, radiusSolar: .00003, luminosity: rnd(rng, .04, .35), temperature: Math.floor(rnd(rng, 400000, 950000)), hue: 252, reward: 14,
    visualR: 11 + rng() * 3, fieldBoost: 2.25, scanBoost: .42, compact: true
  };
}

function addStar(profile, x, y, rng) {
  const s = starStats(profile, rng);
  const mu = G * s.mass;
  const body = {
    id: nextBodyId++,
    kind: 'star',
    family: s.family,
    class: s.class,
    label: s.label,
    name: s.name,
    x, y,
    vx: 0, vy: 0,
    mass: s.mass,
    radiusSolar: s.radiusSolar,
    luminosity: s.luminosity,
    temperature: s.temperature,
    mu,
    r: s.visualR,
    field: clamp((3000 + Math.sqrt(s.mass) * 4200 + Math.pow(Math.max(s.luminosity, .001), .06) * 520) * s.fieldBoost, 2600, FIELD_CUTOFF),
    scan: clamp((s.visualR + 108 + Math.sqrt(s.mass) * 58 + Math.pow(Math.max(s.luminosity, .001), .08) * 34) * s.scanBoost, s.visualR + 58, 430),
    scanWidth: s.compact ? 18 : 30 + Math.sqrt(s.radiusSolar) * 2.2,
    heatRadius: s.family === 'brown' ? 95 : 150 + Math.pow(Math.max(s.luminosity, .001), .25) * 420 + s.visualR * 2.6,
    hue: s.hue,
    reward: s.reward,
    visited: false,
    target: false,
    home: false,
    phase: rng() * TAU,
    spin: rnd(rng, -.18, .18),
    system: true,
    scanCooldown: 0,
    ring: false,
    gravitates: true,
    densityCode: s.mass / Math.max(s.radiusSolar * s.radiusSolar * s.radiusSolar, .000001)
  };
  bodies.push(body);
  return body;
}

function addCompanionStar(parent, profile, orbitR, angle, rng) {
  const comp = addStar(profile, parent.x + Math.cos(angle) * orbitR, parent.y + Math.sin(angle) * orbitR, rng);
  comp.parentId = parent.id;
  comp.orbitA = orbitR;
  comp.orbitE = rnd(rng, .02, .16);
  comp.orbitArg = rng() * TAU;
  comp.orbitAngle = angle;
  comp.orbitSpeed = orbitSpeedAround(parent.mu + comp.mu, orbitR, rng, .965, 1.035);
  comp.label = (comp.label || comp.class || 'ST') + '·B';
  comp.scan *= .88;
  comp.field = Math.min(comp.field, Math.max(2600, orbitR * 3.25));
  comp.binary = true;
  parent.binary = true;
  parent.binaryCompanionId = comp.id;
  parent.binaryOrbitA = orbitR;
  parent.binaryOrbitE = comp.orbitE;
  parent.binaryCompanionMass = comp.mass;
  comp.binaryPrimaryId = parent.id;
  comp.binaryOrbitA = orbitR;
  comp.binaryOrbitE = comp.orbitE;
  comp.binaryCompanionMass = parent.mass;
  return comp;
}

function choosePlanetType(rng, parent) {
  let pool = PLANET_TYPES.map(p => ({ v: p, w: 1 }));
  if (parent && (parent.class === 'O' || parent.class === 'B' || parent.family === 'redgiant')) {
    pool = pool.map(it => ({ v: it.v, w: it.v.key === 'ice' || it.v.key === 'ocean' ? .25 : it.w }));
  }
  if (parent && parent.family === 'brown') {
    pool = pool.map(it => ({ v: it.v, w: it.v.key === 'gas' || it.v.key === 'helium' ? .25 : it.w }));
  }
  return chooseWeighted(pool, rng);
}

function addPlanet(parent, orbitR, angle, rng, home = false, orbitTuning = null) {
  const t = home ? PLANET_TYPES[3] : choosePlanetType(rng, parent);
  const mass = rnd(rng, t.mass[0], t.mass[1]) * (home ? 1.25 : 1);
  const radius = rnd(rng, t.radius[0], t.radius[1]) * (home ? 1.12 : 1);
  const hue = rnd(rng, t.hue[0], t.hue[1]);
  const defaultEmax = parent && parent.family === 'redgiant' ? .20 : .12;
  const tunedEmax = orbitTuning && Number.isFinite(orbitTuning.maxEcc)
    ? clamp(orbitTuning.maxEcc, .01, defaultEmax)
    : defaultEmax;
  const e = home ? .02 : rnd(rng, 0, tunedEmax);
  const arg = rng() * TAU;
  const mu = G * mass;
  const body = {
    id: nextBodyId++,
    kind: 'planet',
    planetType: t.key,
    name: t.name,
    label: home ? 'HOME' : t.label,
    x: parent ? parent.x + Math.cos(angle) * orbitR : 0,
    y: parent ? parent.y + Math.sin(angle) * orbitR : 0,
    vx: 0, vy: 0,
    mass,
    earthMass: mass * 120,
    radiusSolar: 0,
    luminosity: 0,
    temperature: 0,
    mu,
    r: radius,
    field: clamp(1250 + Math.sqrt(mass) * 3550, 1100, 4200),
    scan: radius + 76 + Math.sqrt(mass) * 18,
    scanWidth: 24 + radius * .15,
    heatRadius: 0,
    hue,
    reward: home ? 0 : t.reward,
    visited: home,
    target: false,
    home,
    phase: rng() * TAU,
    parentId: parent ? parent.id : 0,
    orbitA: parent ? orbitR : 0,
    orbitE: e,
    orbitArg: arg,
    orbitAngle: angle,
    orbitSpeed: parent ? orbitSpeedAround(parent.mu, orbitR, rng, .96, 1.045) : 0,
    soi: parent ? clamp(orbitR * Math.pow(mass / Math.max(parent.mass * 3, .001), 1 / 3) * 5.8, radius * 14.0, 3600) : 2400,
    ring: rng() < t.ring || home,
    scanCooldown: 0,
    gravitates: true,
    densityCode: mass / Math.max(radius * radius * radius, 1)
  };
  bodies.push(body);
  return body;
}

function addAsteroid(parent, orbitR, angle, rng) {
  const mass = rnd(rng, .003, .014);
  const r = rnd(rng, 7, 15);
  const body = {
    id: nextBodyId++,
    kind: 'asteroid',
    name: 'carbon shard',
    label: 'AST',
    x: parent ? parent.x + Math.cos(angle) * orbitR : 0,
    y: parent ? parent.y + Math.sin(angle) * orbitR : 0,
    vx: 0, vy: 0,
    mass,
    mu: G * mass * .9,
    r,
    field: 390 + Math.sqrt(mass) * 720,
    scan: r + 40,
    scanWidth: 17,
    luminosity: 0,
    heatRadius: 0,
    hue: rnd(rng, 32, 62),
    reward: 1,
    visited: false,
    target: false,
    home: false,
    phase: rng() * TAU,
    spin: rnd(rng, -.75, .75),
    sides: 5 + Math.floor(rng() * 4),
    parentId: parent ? parent.id : 0,
    orbitA: parent ? orbitR : 0,
    orbitE: rnd(rng, .02, .14),
    orbitArg: rng() * TAU,
    orbitAngle: angle,
    orbitSpeed: parent ? orbitSpeedAround(parent.mu, orbitR, rng, .95, 1.08) : 0,
    soi: parent ? clamp(orbitR * Math.pow(mass / Math.max(parent.mass * 3, .001), 1 / 3) * 3.1, r * 7.5, 620) : 430,
    scanCooldown: 0,
    gravitates: true
  };
  bodies.push(body);
  return body;
}

function addComet(parent, orbitA, angle, rng) {
  const mass = rnd(rng, .004, .016);
  const body = {
    id: nextBodyId++,
    kind: 'comet',
    name: 'icy comet',
    label: 'CMT',
    x: parent ? parent.x + Math.cos(angle) * orbitA : 0,
    y: parent ? parent.y + Math.sin(angle) * orbitA : 0,
    vx: 0, vy: 0,
    mass,
    mu: G * mass * .7,
    r: rnd(rng, 7, 12),
    field: 460 + Math.sqrt(mass) * 880,
    scan: 55,
    scanWidth: 16,
    luminosity: 0,
    heatRadius: 0,
    hue: rnd(rng, 178, 212),
    reward: 4,
    visited: false,
    target: false,
    home: false,
    phase: rng() * TAU,
    spin: rnd(rng, -.5, .5),
    parentId: parent ? parent.id : 0,
    orbitA,
    orbitE: rnd(rng, .46, .72),
    orbitArg: rng() * TAU,
    orbitAngle: angle,
    orbitSpeed: parent ? orbitSpeedAround(parent.mu, orbitA, rng, .92, 1.08) : 0,
    soi: parent ? clamp(orbitA * Math.pow(mass / Math.max(parent.mass * 3, .001), 1 / 3) * 3.0, 96, 680) : 460,
    scanCooldown: 0,
    gravitates: true
  };
  bodies.push(body);
  return body;
}

function addBlackHole(x, y, rng) {
  const mass = rnd(rng, 4.0, 13.0);
  const body = {
    id: nextBodyId++,
    kind: 'blackhole',
    family: 'blackhole',
    class: 'BH',
    label: 'BH',
    name: 'stellar black hole',
    x, y,
    vx: 0, vy: 0,
    mass,
    radiusSolar: 0,
    luminosity: 0,
    temperature: 0,
    mu: G * mass * 2.35,
    r: 15 + Math.sqrt(mass) * 4.6,
    field: clamp(4200 + Math.sqrt(mass) * 3600, 3800, FIELD_CUTOFF),
    scan: 0,
    scanWidth: 0,
    heatRadius: 0,
    hue: 272,
    reward: 0,
    visited: true,
    target: false,
    home: false,
    phase: rng() * TAU,
    spin: rnd(rng, .35, .95),
    event: 42 + mass * 6.5,
    scanCooldown: 0,
    gravitates: true
  };
  bodies.push(body);
  return body;
}

function tooCloseToExisting(x, y, minD) {
  for (const b of bodies) if (hypot(b.x - x, b.y - y) < minD) return true;
  return false;
}

function ensureChunk(cx, cy) {
  const key = cx + ',' + cy;
  if (generated.has(key)) return;
  generated.add(key);

  const rng = mulberry32(hash2(cx, cy));
  const centerX = cx * CHUNK + CHUNK / 2;
  const centerY = cy * CHUNK + CHUNK / 2;
  const originDistance = hypot(centerX, centerY);
  if (originDistance < CHUNK * .62) return;

  if (rng() < .86) {
    const x = cx * CHUNK + rnd(rng, 290, CHUNK - 290);
    const y = cy * CHUNK + rnd(rng, 290, CHUNK - 290);
    if (!tooCloseToExisting(x, y, 720)) {
      const depth = Math.floor(originDistance / CHUNK);
      const environment = stellarEnvironmentBias(cx, cy);
      const star = addStar(chooseStellarProfile(rng, depth, environment), x, y, rng);
      let companion = null;
      if (rng() < .22 && star.family === 'main' && star.mass < 2.8) {
        const companionEnv = clamp(environment + rnd(rng, -.22, .22), -1, 1);
        const companionProfile = rng() < .82
          ? { family: 'main', class: chooseMainClass(rng, depth + 4, companionEnv) }
          : chooseStellarProfile(rng, depth + 4, companionEnv);
        if (companionProfile.family !== 'neutron') {
          companion = addCompanionStar(star, companionProfile, rnd(rng, 520, 980), rng() * TAU, rng);
        }
      }

      populateSystemBodies(star, companion, rng);
    }
  }

  if (score > 18 && rng() < .055) {
    const x = cx * CHUNK + rnd(rng, 340, CHUNK - 340);
    const y = cy * CHUNK + rnd(rng, 340, CHUNK - 340);
    if (!tooCloseToExisting(x, y, 1050)) addBlackHole(x, y, rng);
  }

  if (rng() < .14) {
    const x = cx * CHUNK + rnd(rng, 260, CHUNK - 260);
    const y = cy * CHUNK + rnd(rng, 260, CHUNK - 260);
    if (!tooCloseToExisting(x, y, 560)) {
      const rogue = addPlanet(null, 0, 0, rng);
      rogue.x = x;
      rogue.y = y;
      rogue.field *= .8;
      rogue.hue = 188 + rng() * 62;
      rogue.label = 'ROG';
      rogue.name = 'rogue planet';
      rogue.reward += 1;
    }
  }
}

function ensureChunksAround(x, y, range = 3) {
  const cx = Math.floor(x / CHUNK);
  const cy = Math.floor(y / CHUNK);
  for (let ix = cx - range; ix <= cx + range; ix++) {
    for (let iy = cy - range; iy <= cy + range; iy++) ensureChunk(ix, iy);
  }
}

function cleanupFarBodies() {
  if (!player || bodies.length < (lowPower ? 58 : 82)) return;
  const keepDistance = lowPower ? 5200 : 7000;
  let write = 0;
  for (let read = 0; read < bodies.length; read++) {
    const b = bodies[read];
    const keep = b.home
      || b.target
      || b.id === (target && target.id)
      || hypot(b.x - player.x, b.y - player.y) < keepDistance;
    if (keep) bodies[write++] = b;
  }
  bodies.length = write;
}

function newWorldSeed() {
  return ((Date.now() ^ Math.floor(Math.random() * 0xFFFFFFFF) ^ ((performance.now() * 1000) | 0)) >>> 0) || BASE_WORLD_SEED;
}
