/*
 * Orbit Drift — 04-world-generation
 * Astrophysical body factories and deterministic procedural map/chunk generation.
 * Keep this file loaded after all earlier numbered files.
 */

'use strict';

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
  comp.orbitE = rnd(rng, .015, .18);
  comp.orbitArg = rng() * TAU;
  comp.orbitAngle = angle;
  comp.orbitSpeed = Math.sqrt((parent.mu + comp.mu) / Math.max(orbitR * orbitR * orbitR, 1)) * rnd(rng, .72, 1.06) * (rng() < .5 ? -1 : 1);
  comp.label = (comp.label || comp.class || 'ST') + '·B';
  comp.scan *= .88;
  comp.field = Math.min(comp.field, Math.max(2600, orbitR * 3.25));
  comp.binary = true;
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

function addPlanet(parent, orbitR, angle, rng, home = false) {
  const t = home ? PLANET_TYPES[3] : choosePlanetType(rng, parent);
  const mass = rnd(rng, t.mass[0], t.mass[1]) * (home ? 1.25 : 1);
  const radius = rnd(rng, t.radius[0], t.radius[1]) * (home ? 1.12 : 1);
  const hue = rnd(rng, t.hue[0], t.hue[1]);
  const e = home ? .02 : rnd(rng, 0, parent && parent.family === 'redgiant' ? .20 : .12);
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
    orbitSpeed: parent ? Math.sqrt(parent.mu / Math.max(orbitR * orbitR * orbitR, 1)) * rnd(rng, .82, 1.08) * (rng() < .5 ? -1 : 1) : 0,
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
    orbitE: rnd(rng, .02, .22),
    orbitArg: rng() * TAU,
    orbitAngle: angle,
    orbitSpeed: parent ? Math.sqrt(parent.mu / Math.max(orbitR * orbitR * orbitR, 1)) * rnd(rng, .9, 1.3) * (rng() < .5 ? -1 : 1) : 0,
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
    orbitE: rnd(rng, .48, .78),
    orbitArg: rng() * TAU,
    orbitAngle: angle,
    orbitSpeed: parent ? Math.sqrt(parent.mu / Math.max(orbitA * orbitA * orbitA, 1)) * rnd(rng, .65, 1.12) * (rng() < .5 ? -1 : 1) : 0,
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
      const star = addStar(chooseStellarProfile(rng, depth), x, y, rng);
      if (rng() < .22 && star.family === 'main' && star.mass < 2.8) {
        const companionProfile = rng() < .82 ? { family: 'main', class: chooseMainClass(rng, depth + 4) } : chooseStellarProfile(rng, depth + 4);
        if (companionProfile.family !== 'neutron') addCompanionStar(star, companionProfile, rnd(rng, 520, 980), rng() * TAU, rng);
      }
      const canHavePlanets = star.family !== 'neutron' && star.family !== 'whitedwarf';
      const planetCount = canHavePlanets ? 1 + Math.floor(rng() * (star.family === 'brown' ? 3 : 5)) : Math.floor(rng() * 2);
      const baseOrbit = star.scan + (star.family === 'redgiant' ? 280 : 150) + rng() * 150;
      for (let p = 0; p < planetCount; p++) {
        const orbit = baseOrbit + p * rnd(rng, 170, 300) + rng() * 90;
        if (star.heatRadius > 0 && orbit < star.heatRadius * .45 && star.luminosity > 50) continue;
        addPlanet(star, orbit, rng() * TAU, rng);
      }
      if (rng() < .45 && star.family !== 'neutron') {
        const beltR = baseOrbit + planetCount * rnd(rng, 170, 260) + rnd(rng, 40, 220);
        const n = 3 + Math.floor(rng() * 8);
        for (let i = 0; i < n; i++) addAsteroid(star, beltR + rnd(rng, -80, 90), rng() * TAU, rng);
      }
      if (rng() < .18 && star.family === 'main') {
        const n = rng() < .35 ? 2 : 1;
        for (let i = 0; i < n; i++) addComet(star, rnd(rng, 800, 1400), rng() * TAU, rng);
      }
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
  bodies = bodies.filter(b => {
    if (b.home || b.target || b.id === (target && target.id)) return true;
    return hypot(b.x - player.x, b.y - player.y) < keepDistance;
  });
}

function newWorldSeed() {
  return ((Date.now() ^ Math.floor(Math.random() * 0xFFFFFFFF) ^ ((performance.now() * 1000) | 0)) >>> 0) || BASE_WORLD_SEED;
}
