/*
 * Orbit Drift — 06-physics-orbits
 * Moving bodies, gravity field, radiation, stellar wind, tidal stress, orbital elements.
 * Keep this file loaded after all earlier numbered files.
 */

'use strict';

const bodyLookupCache = {
  source: null,
  length: -1,
  firstId: 0,
  lastId: 0,
  byId: new Map()
};

const gravitySourceScratch = [];
const gravitySourceStrengths = [];
const gravitySourceResult = [];

function getBodyByIdIndex() {
  const length = bodies.length;
  const firstId = length > 0 ? bodies[0].id : 0;
  const lastId = length > 0 ? bodies[length - 1].id : 0;
  if (
    bodyLookupCache.source === bodies
    && bodyLookupCache.length === length
    && bodyLookupCache.firstId === firstId
    && bodyLookupCache.lastId === lastId
  ) {
    return bodyLookupCache.byId;
  }

  bodyLookupCache.source = bodies;
  bodyLookupCache.length = length;
  bodyLookupCache.firstId = firstId;
  bodyLookupCache.lastId = lastId;
  bodyLookupCache.byId.clear();
  for (let i = 0; i < bodies.length; i++) bodyLookupCache.byId.set(bodies[i].id, bodies[i]);
  return bodyLookupCache.byId;
}

function bodyIntersectsView(b, left, right, top, bottom) {
  const radius = b.field || b.r || 0;
  return b.x + radius > left && b.x - radius < right && b.y + radius > top && b.y - radius < bottom;
}

function gravitySourceStrength(b, cx, cy) {
  const d = Math.max(80, hypot(b.x - cx, b.y - cy) - (b.r || 0));
  return (b.mu || 0) / (d * d);
}

function insertGravitySource(list, strengths, candidate, strength, limit) {
  let insertAt = list.length;
  while (insertAt > 0 && strength > strengths[insertAt - 1]) insertAt--;
  if (insertAt >= limit) return;
  const nextLength = Math.min(list.length + 1, limit);
  for (let i = nextLength - 1; i > insertAt; i--) {
    list[i] = list[i - 1];
    strengths[i] = strengths[i - 1];
  }
  list[insertAt] = candidate;
  strengths[insertAt] = strength;
  list.length = nextLength;
  strengths.length = nextLength;
}

function updateBodies(dt) {
  const byId = getBodyByIdIndex();
  for (const b of bodies) {
    if (b.scanCooldown > 0) b.scanCooldown -= dt;
    if (b.kind === 'asteroid' || b.kind === 'comet') b.phase += (b.spin || 0) * dt;
    if (b.parentId) {
      const parent = byId.get(b.parentId);
      if (!parent) continue;
      const oldX = b.x;
      const oldY = b.y;
      const e = b.orbitE || 0;
      const a = b.orbitA || b.orbitR || 1;
      const cosNu = Math.cos(b.orbitAngle);
      const denom = Math.max(1e-4, 1 - e * e);
      const keplerFactor = e > .01 ? Math.pow(1 + e * cosNu, 2) / Math.pow(denom, 1.5) : 1;
      b.orbitAngle += b.orbitSpeed * keplerFactor * dt;
      const nu = b.orbitAngle;
      const rr = e > .01 ? a * (1 - e * e) / Math.max(.08, 1 + e * Math.cos(nu)) : a;
      const arg = b.orbitArg || 0;
      const cx = Math.cos(arg) * rr * Math.cos(nu) - Math.sin(arg) * rr * Math.sin(nu);
      const cy = Math.sin(arg) * rr * Math.cos(nu) + Math.cos(arg) * rr * Math.sin(nu);
      b.x = parent.x + cx;
      b.y = parent.y + cy;
      if (dt > 0) {
        b.vx = (b.x - oldX) / dt;
        b.vy = (b.y - oldY) / dt;
      }
    }
  }
}

function gravityAt(x, y, includeDominant = true) {
  return gravityAtFrom(bodies, x, y, includeDominant);
}

function gravityAtFrom(sourceBodies, x, y, includeDominant = true) {
  // Newtonian game-space gravity: a = μ * r / |r|³.
  // Field radius is only an optimization boundary. Inside it we keep the inverse-square law
  // and apply a soft final fade near the cutoff so far sources do not pop in/out.
  let ax = 0;
  let ay = 0;
  let dominant = null;
  let dominantMag = 0;
  for (const b of sourceBodies) {
    if (!b.gravitates || !b.mu) continue;
    const dx = b.x - x;
    const dy = b.y - y;
    const d2raw = dx * dx + dy * dy;
    const baseField = b.field || 0;
    const field = Math.max(baseField, b.soi || 0, (b.scan || 0) + 900) * difficulty.bodyRange;
    if (d2raw > field * field) continue;
    const d = Math.sqrt(d2raw) || 1;
    const compact = b.kind === 'blackhole' || b.family === 'neutron' || b.family === 'whitedwarf';
    const soft = Math.max(SOFTENING, b.r * (compact ? .18 : .42), b.kind === 'blackhole' ? (b.event || 36) * .32 : 0);
    const r2 = d2raw + soft * soft;
    // Do not damp the core field. Only fade during the last 14% of the optimization range.
    const edge = d / Math.max(field, 1);
    const fade = edge > .86 ? (1 - smoothstep(.86, 1, edge)) : 1;
    if (fade <= 0) continue;
    const accel = ((b.mu * difficulty.gravity) / r2) * fade;
    ax += (dx / d) * accel;
    ay += (dy / d) * accel;
    if (includeDominant && accel > dominantMag) {
      dominantMag = accel;
      dominant = b;
    }
  }
  return { ax, ay, body: dominant, mag: dominantMag };
}

function strongestGravitySources(extra = 2600, limit = 22) {
  const out = gravitySourceResult;
  out.length = 0;
  if (!player && state !== 'menu') return out;
  const cx = player ? player.x : camera.x;
  const cy = player ? player.y : camera.y;
  const left = camera.x - W / (2 * camera.zoom) - extra;
  const right = camera.x + W / (2 * camera.zoom) + extra;
  const top = camera.y - H / (2 * camera.zoom) - extra;
  const bottom = camera.y + H / (2 * camera.zoom) + extra;
  const ranked = gravitySourceScratch;
  const strengths = gravitySourceStrengths;
  ranked.length = 0;
  strengths.length = 0;

  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (!b.gravitates || !bodyIntersectsView(b, left, right, top, bottom)) continue;
    insertGravitySource(ranked, strengths, b, gravitySourceStrength(b, cx, cy), limit);
  }

  for (let i = 0; i < ranked.length; i++) out.push(ranked[i]);
  perf.gravSources = out.length;
  return out;
}

function radiationAt(x, y) {
  let flux = 0;
  let dominant = null;
  let dominantFlux = 0;
  for (const b of bodies) {
    if (b.kind !== 'star') continue;
    const dx = x - b.x;
    const dy = y - b.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > b.heatRadius * b.heatRadius) continue;
    const safeD2 = Math.max(d2, sqr(b.r + 10));
    const f = (b.luminosity * 220000) / safeD2;
    flux += f;
    if (f > dominantFlux) { dominantFlux = f; dominant = b; }
  }
  return { flux, body: dominant, dominantFlux };
}

function stellarWindAt(x, y) {
  let ax = 0;
  let ay = 0;
  let body = null;
  let magMax = 0;
  for (const b of bodies) {
    if (b.kind !== 'star' || b.luminosity <= .05) continue;
    const dx = x - b.x;
    const dy = y - b.y;
    const d2raw = dx * dx + dy * dy;
    const range = Math.max(b.heatRadius, b.scan + 220);
    if (d2raw > range * range) continue;
    const d = Math.sqrt(d2raw) || 1;
    const safeD2 = Math.max(d2raw, sqr(b.r + 28));
    const pressure = clamp((Math.pow(b.luminosity, .55) * 1200) / safeD2, 0, b.class === 'O' || b.class === 'B' ? 18 : 9);
    const fade = 1 - smoothstep(.82, 1, d / range);
    const a = pressure * fade;
    ax += (dx / d) * a;
    ay += (dy / d) * a;
    if (a > magMax) { magMax = a; body = b; }
  }
  return { ax, ay, mag: magMax, body };
}

function tidalStressAt(x, y) {
  let stress = 0;
  let body = null;
  let maxS = 0;
  for (const b of bodies) {
    if (!b.gravitates) continue;
    const dx = x - b.x;
    const dy = y - b.y;
    const d = Math.max(hypot(dx, dy), (b.kind === 'blackhole' ? b.event : b.r) + 12);
    if (d > Math.max(b.scan + 420, b.field * .35)) continue;
    const compact = b.kind === 'blackhole' || b.family === 'neutron' || b.family === 'whitedwarf';
    const scale = compact ? 18 : (b.kind === 'star' ? 2.4 : .85);
    const s = (b.mu || 0) * scale / Math.pow(d, 3);
    stress += s;
    if (s > maxS) { maxS = s; body = b; }
  }
  return { stress, body };
}

function nearestBody() {
  if (!player) return { body: null, d: Infinity };
  let bestBody = null;
  let bestD = Infinity;
  for (const b of bodies) {
    const d = hypot(player.x - b.x, player.y - b.y);
    if (d < bestD) { bestD = d; bestBody = b; }
  }
  return { body: bestBody, d: bestD };
}

function orbitalElements(body) {
  if (!player || !body || !body.mu) return null;
  const rx = player.x - body.x;
  const ry = player.y - body.y;
  const r = hypot(rx, ry) || 1;
  const rvx = player.vx - (body.vx || 0);
  const rvy = player.vy - (body.vy || 0);
  const v2 = rvx * rvx + rvy * rvy;
  const rv = rx * rvx + ry * rvy;
  const mu = body.mu * difficulty.gravity;
  const h = rx * rvy - ry * rvx;
  const energy = .5 * v2 - mu / r;
  const evecx = ((v2 - mu / r) * rx - rv * rvx) / mu;
  const evecy = ((v2 - mu / r) * ry - rv * rvy) / mu;
  const ecc = hypot(evecx, evecy);
  const p = h * h / mu;
  const peri = p / Math.max(1 + ecc, .0001);
  const apo = ecc < .999 ? p / Math.max(1 - ecc, .0001) : Infinity;
  const a = Math.abs(energy) > 1e-6 ? -mu / (2 * energy) : Infinity;
  const circular = Math.sqrt(mu / Math.max(r, 1));
  const escape = Math.sqrt(2 * mu / Math.max(r, 1));
  const radial = rv / r;
  const tangent = h / r;
  const quality = clamp((1 - Math.abs(Math.abs(tangent) - circular) / Math.max(circular, 1)) * .65 + (1 - Math.abs(radial) / Math.max(circular * .65, 35)) * .35, 0, 1);
  return { r, v: Math.sqrt(v2), mu, h, energy, ecc, peri, apo, a, circular, escape, radial, tangent, quality, bound: energy < 0 && ecc < 1 };
}
