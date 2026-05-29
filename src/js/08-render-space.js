/*
 * Orbit Drift — 08-render-space
 * Scene rendering: background, grid, gravity map, trajectory prediction, bodies, ship, particles.
 * Keep this file loaded after all earlier numbered files.
 */

'use strict';

const visibleBodiesScratch = [];
const visibleBodyScoresScratch = [];

function renderSafeArea() {
  if (typeof uiSafeArea === 'function') return uiSafeArea();
  const margin = W < 520 ? 12 : 22;
  return {
    left: margin,
    top: margin,
    right: W - margin,
    bottom: H - margin,
    width: Math.max(0, W - margin * 2),
    height: Math.max(0, H - margin * 2),
    margin
  };
}

function clampToRenderSafeArea(x, y, pad = 0) {
  const safe = renderSafeArea();
  const left = safe.left + pad;
  const right = safe.right - pad;
  const top = safe.top + pad;
  const bottom = safe.bottom - pad;
  return {
    x: clamp(x, left, Math.max(left, right)),
    y: clamp(y, top, Math.max(top, bottom)),
    safe
  };
}

function draw() {
  drawBackground();
  let sx = 0;
  let sy = 0;
  if (camera.shake > 0) {
    sx = rnd(Math.random, -camera.shake, camera.shake) * .5;
    sy = rnd(Math.random, -camera.shake, camera.shake) * .5;
  }
  ctx.save();
  ctx.translate(sx, sy);
  if (navLayer) drawCoordinateGrid();
  if (gravityLayer) drawGravityField();
  drawPredictedPath();
  drawOrbitGuide();
  drawRoute();
  drawLagrangeNodes();
  drawBodies();
  drawParticles();
  drawPlayer();
  drawGravityCompass();
  drawTexts();
  ctx.restore();
  drawHud();
}

function drawBackground() {
  const grd = ctx.createRadialGradient(W * .52, H * .42, 0, W * .5, H * .5, Math.max(W, H) * .82);
  grd.addColorStop(0, '#061027');
  grd.addColorStop(.56, '#020713');
  grd.addColorStop(1, '#01040b');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);

  for (const s of backgroundStars) {
    const x = ((s.x - camera.x * s.layer) % W + W) % W;
    const y = ((s.y - camera.y * s.layer) % H + H) % H;
    const a = s.a * (.66 + Math.sin(time * .75 + s.p) * .22);
    ctx.fillStyle = `rgba(230,242,255,${a})`;
    ctx.beginPath();
    ctx.arc(x, y, s.r, 0, TAU);
    ctx.fill();
  }

  const neb = ctx.createRadialGradient(W * .78, H * .08, 0, W * .78, H * .08, Math.max(W, H) * .72);
  neb.addColorStop(0, 'rgba(68, 103, 255, .055)');
  neb.addColorStop(.55, 'rgba(95, 42, 190, .03)');
  neb.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = neb;
  ctx.fillRect(0, 0, W, H);
}

function drawCoordinateGrid() {
  const spacing = 600;
  const minor = 150;
  const left = camera.x - W / (2 * camera.zoom) - spacing;
  const right = camera.x + W / (2 * camera.zoom) + spacing;
  const top = camera.y - H / (2 * camera.zoom) - spacing;
  const bottom = camera.y + H / (2 * camera.zoom) + spacing;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  for (let x = Math.floor(left / minor) * minor; x < right; x += minor) {
    const sp0 = worldToScreen(x, top);
    const sp1 = worldToScreen(x, bottom);
    const major = Math.abs(Math.round(x / spacing) * spacing - x) < 1;
    ctx.strokeStyle = major ? 'rgba(145,210,255,.045)' : 'rgba(145,210,255,.018)';
    ctx.beginPath();
    ctx.moveTo(sp0.x, sp0.y);
    ctx.lineTo(sp1.x, sp1.y);
    ctx.stroke();
    if (major && W > 680) {
      ctx.fillStyle = 'rgba(180,220,255,.14)';
      ctx.fillText(fmtSigned(x / 1000, 1), sp0.x + 4, 96);
    }
  }
  for (let y = Math.floor(top / minor) * minor; y < bottom; y += minor) {
    const sp0 = worldToScreen(left, y);
    const sp1 = worldToScreen(right, y);
    const major = Math.abs(Math.round(y / spacing) * spacing - y) < 1;
    ctx.strokeStyle = major ? 'rgba(145,210,255,.045)' : 'rgba(145,210,255,.018)';
    ctx.beginPath();
    ctx.moveTo(sp0.x, sp0.y);
    ctx.lineTo(sp1.x, sp1.y);
    ctx.stroke();
    if (major && W > 680) {
      ctx.fillStyle = 'rgba(180,220,255,.14)';
      ctx.fillText(fmtSigned(y / 1000, 1), 10, sp0.y + 4);
    }
  }
  ctx.restore();
}

function insertVisibleBody(out, scores, body, score, limit) {
  let insertAt = out.length;
  while (insertAt > 0 && score < scores[insertAt - 1]) insertAt--;
  if (insertAt >= limit) return;
  const nextLength = Math.min(out.length + 1, limit);
  for (let i = nextLength - 1; i > insertAt; i--) {
    out[i] = out[i - 1];
    scores[i] = scores[i - 1];
  }
  out[insertAt] = body;
  scores[insertAt] = score;
  out.length = nextLength;
  scores.length = nextLength;
}

function visibleBodyScore(b) {
  const dx = b.x - camera.x;
  const dy = b.y - camera.y;
  let score = dx * dx + dy * dy;
  if (b.target) score -= 1000000000;
  if (b.home) score -= 250000000;
  if (b.kind === 'star' || b.kind === 'blackhole') score -= 70000000;
  if (b.kind === 'comet') score -= 18000000;
  return score;
}

function collectVisibleBodies(extra, out, limit = Infinity) {
  const left = camera.x - W / (2 * camera.zoom) - extra;
  const right = camera.x + W / (2 * camera.zoom) + extra;
  const top = camera.y - H / (2 * camera.zoom) - extra;
  const bottom = camera.y + H / (2 * camera.zoom) + extra;
  out.length = 0;
  const scores = visibleBodyScoresScratch;
  scores.length = 0;
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (!bodyIntersectsView(b, left, right, top, bottom)) continue;
    if (Number.isFinite(limit)) insertVisibleBody(out, scores, b, visibleBodyScore(b), limit);
    else out.push(b);
  }
  return out;
}

function visibleBodies(extra = 360) {
  return collectVisibleBodies(extra, []);
}

function rebuildGravityFieldCache() {
  const quality = renderQuality();
  const spacing = W < 740 ? quality.fieldSpacingSmall : quality.fieldSpacing;
  const left = camera.x - W / (2 * camera.zoom) - spacing * 1.5;
  const right = camera.x + W / (2 * camera.zoom) + spacing * 1.5;
  const top = camera.y - H / (2 * camera.zoom) - spacing * 1.5;
  const bottom = camera.y + H / (2 * camera.zoom) + spacing * 1.5;
  const sourceLimit = W < 760 ? quality.fieldSourceLimitSmall : quality.fieldSourceLimit;
  const sources = strongestGravitySources(lowPower ? 2600 : 3600, sourceLimit);
  const lines = [];

  for (let x = Math.floor(left / spacing) * spacing; x < right; x += spacing) {
    for (let y = Math.floor(top / spacing) * spacing; y < bottom; y += spacing) {
      if (lines.length >= quality.fieldMaxLines) break;
      const jitter = Math.sin(x * .011 + y * .017 + time * .55) * 5;
      const sx = x + jitter;
      const sy = y - jitter;
      const g = gravityAtFrom(sources, sx, sy, true);
      const mag = hypot(g.ax, g.ay);
      if (mag < .045) continue;
      let px = sx;
      let py = sy;
      let prevX = px;
      let prevY = py;
      const pts = [{ x: px, y: py }];
      const steps = Math.max(2, 3 + quality.fieldStepBias + Math.floor(clamp(Math.log1p(mag) / 2.2, 0, 4)));
      for (let step = 0; step < steps; step++) {
        const gg = gravityAtFrom(sources, px, py, false);
        const m = hypot(gg.ax, gg.ay) || 1;
        const len = clamp(13 + Math.log1p(m) * 5.8, 11, 52);
        prevX = px;
        prevY = py;
        px += (gg.ax / m) * len;
        py += (gg.ay / m) * len;
        pts.push({ x: px, y: py });
      }
      const hue = g.body ? g.body.hue : 205;
      const alpha = clamp(.065 + Math.log1p(mag) / 6.4, .055, .62);
      lines.push({ pts, hue, alpha, mag, ax: px - prevX, ay: py - prevY });
    }
    if (lines.length >= quality.fieldMaxLines) break;
  }

  gravityFieldCache = {
    frame,
    camX: camera.x,
    camY: camera.y,
    zoom: camera.zoom,
    width: W,
    height: H,
    lines
  };
  perf.fieldLines = lines.length;
}

function drawGravityField() {
  if (!gravityLayer) return;
  const quality = renderQuality();
  const moved = !isFinite(gravityFieldCache.camX)
    || hypot(camera.x - gravityFieldCache.camX, camera.y - gravityFieldCache.camY) > quality.fieldMovePx / Math.max(camera.zoom, .2)
    || Math.abs(camera.zoom - gravityFieldCache.zoom) > .04
    || gravityFieldCache.width !== W
    || gravityFieldCache.height !== H;
  if (moved || frame - gravityFieldCache.frame > quality.fieldCacheFrames) rebuildGravityFieldCache();

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1;
  for (let i = 0; i < gravityFieldCache.lines.length; i++) {
    const line = gravityFieldCache.lines[i];
    const pulse = .86 + Math.sin(time * 1.8 + i * .37) * .14;
    ctx.strokeStyle = `hsla(${line.hue}, 96%, 74%, ${line.alpha * pulse})`;
    ctx.beginPath();
    const first = worldToScreen(line.pts[0].x, line.pts[0].y);
    ctx.moveTo(first.x, first.y);
    for (let p = 1; p < line.pts.length; p++) {
      const sp = worldToScreen(line.pts[p].x, line.pts[p].y);
      ctx.lineTo(sp.x, sp.y);
    }
    ctx.stroke();
    if ((i + frame) % quality.fieldArrowStride === 0 && line.pts.length > 1) {
      const last = line.pts[line.pts.length - 1];
      const tip = worldToScreen(last.x, last.y);
      const a = Math.atan2(line.ay, line.ax);
      const size = clamp(4.2 + Math.log1p(line.mag) * .9, 4.2, 9.5);
      ctx.fillStyle = `hsla(${line.hue}, 96%, 78%, ${line.alpha * .95})`;
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(tip.x - Math.cos(a - .55) * size, tip.y - Math.sin(a - .55) * size);
      ctx.lineTo(tip.x - Math.cos(a + .55) * size, tip.y - Math.sin(a + .55) * size);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawOrbitGuide() {
  if (!player || state !== 'play') return;
  const g = gravityAt(player.x, player.y, true);
  const b = g.body;
  if (!b || g.mag < .8) return;
  const orb = orbitalElements(b);
  if (!orb || orb.r > Math.max(b.field || 0, b.scan + 600)) return;
  const center = worldToScreen(b.x, b.y);
  const r = orb.r * camera.zoom;
  if (r < 38 || r > Math.max(W, H) * 1.35) return;
  const q = orb.bound ? orb.quality : 0;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 13]);
  ctx.lineDashOffset = -time * 20;
  ctx.strokeStyle = `hsla(${b.hue}, 95%, 74%, ${.05 + q * .19})`;
  ctx.beginPath();
  ctx.arc(center.x, center.y, r, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);

  const rx = player.x - b.x;
  const ry = player.y - b.y;
  const radial = Math.atan2(ry, rx);
  const tangentDir = radial + (orb.tangent >= 0 ? Math.PI / 2 : -Math.PI / 2);
  const ps = worldToScreen(player.x, player.y);
  const len = clamp(orb.circular * .12, 26, 92);
  ctx.strokeStyle = `hsla(${b.hue}, 95%, 78%, ${.14 + q * .32})`;
  ctx.beginPath();
  ctx.moveTo(ps.x, ps.y);
  ctx.lineTo(ps.x + Math.cos(tangentDir) * len, ps.y + Math.sin(tangentDir) * len);
  ctx.stroke();
  ctx.fillStyle = `hsla(${b.hue},95%,78%,${.45 + q * .3})`;
  ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(q > .74 ? 'можно удержать орбиту' : (orb.bound ? 'корабль в поле' : 'курс на выход'), ps.x, ps.y - 30);
  ctx.restore();
}

function drawLagrangeNodes() {
  if (!player || state === 'menu' || !gravityLayer) return;
  const nodes = lagrangeNodesNearby(W < 760 ? 5 : 9);
  ctx.save();
  ctx.lineWidth = 1;
  ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const n of nodes) {
    const s = worldToScreen(n.x, n.y);
    if (s.x < -60 || s.x > W + 60 || s.y < -60 || s.y > H + 60) continue;
    const taken = visitedNodes.has(n.key);
    const pulse = 1 + Math.sin(time * 2.4 + n.body.id) * .15;
    const a = taken ? .045 : clamp(.32 - n.d / 7600, .08, .28);
    ctx.strokeStyle = `hsla(${n.hue}, 94%, 76%, ${a})`;
    ctx.fillStyle = `hsla(${n.hue}, 94%, 78%, ${taken ? .11 : .55})`;
    const r = (taken ? 8 : 12) * pulse;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y - r);
    ctx.lineTo(s.x + r * .86, s.y + r * .5);
    ctx.lineTo(s.x - r * .86, s.y + r * .5);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(s.x, s.y, 2.2, 0, TAU);
    ctx.fill();
    if (!taken && n.d < 980) {
      ctx.fillStyle = `hsla(${n.hue},94%,80%,.62)`;
      ctx.fillText(n.label, s.x, s.y - 20);
    }
  }
  ctx.restore();
}

function drawGravityCompass() {
  if (!player || state !== 'play' || !gravityLayer) return;
  const g = gravityAt(player.x, player.y, true);
  const mag = hypot(g.ax, g.ay);
  if (mag < .012) return;
  const ps = worldToScreen(player.x, player.y);
  const angle = Math.atan2(g.ay, g.ax);
  const len = clamp(28 + Math.log1p(mag) * 28, 34, 168);
  const hue = g.body ? g.body.hue : 205;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = `hsla(${hue}, 96%, 78%, ${clamp(.38 + mag / 86, .42, .9)})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(ps.x, ps.y);
  ctx.lineTo(ps.x + Math.cos(angle) * len, ps.y + Math.sin(angle) * len);
  ctx.stroke();
  const tipX = ps.x + Math.cos(angle) * len;
  const tipY = ps.y + Math.sin(angle) * len;
  ctx.fillStyle = `hsla(${hue}, 96%, 80%, .86)`;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - Math.cos(angle - .55) * 8, tipY - Math.sin(angle - .55) * 8);
  ctx.lineTo(tipX - Math.cos(angle + .55) * 8, tipY - Math.sin(angle + .55) * 8);
  ctx.closePath();
  ctx.fill();
  ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = `hsla(${hue}, 96%, 82%, .72)`;
  ctx.fillText(`G ${fmtNum(mag, 1)} · ${g.body ? labelOf(g.body) : 'поле'}`, tipX + 8, tipY - 5);
  if ((player.gravBoost || 0) > .08) {
    ctx.fillStyle = `hsla(${hue}, 96%, 82%, .72)`;
    ctx.fillText(`поле помогает +${Math.round((player.gravBoost || 0) * 100)}%`, ps.x + 13, ps.y + 18);
  }
  ctx.restore();
}

function rebuildPredictionCache() {
  if (!player) return;
  const quality = renderQuality();
  const sourceLimit = W < 760 ? quality.predictionSourceLimitSmall : quality.predictionSourceLimit;
  const sources = strongestGravitySources(quality.predictionSourceExtra, sourceLimit);
  let x = player.x;
  let y = player.y;
  let vx = player.vx;
  let vy = player.vy;
  const dt = quality.predictionDt;
  const points = [{ x, y }];
  const predictSteps = clamp(
    Math.round(quality.predictionBaseSteps * difficultyNumber('predictionStepsMul', 1)),
    quality.predictionMinSteps,
    quality.predictionMaxSteps
  );
  for (let i = 0; i < predictSteps; i++) {
    const g0 = gravityAtFrom(sources, x, y, false);
    const w0 = stellarWindAt(x, y);
    const ax0 = g0.ax + w0.ax;
    const ay0 = g0.ay + w0.ay;
    const hvx = vx + ax0 * dt * .5;
    const hvy = vy + ay0 * dt * .5;
    x += hvx * dt;
    y += hvy * dt;
    const g1 = gravityAtFrom(sources, x, y, false);
    const w1 = stellarWindAt(x, y);
    const ax1 = g1.ax + w1.ax;
    const ay1 = g1.ay + w1.ay;
    vx = hvx + ax1 * dt * .5;
    vy = hvy + ay1 * dt * .5;
    if (i % 2 === 0) points.push({ x, y });
  }
  predictionCache = { frame, x: player.x, y: player.y, vx: player.vx, vy: player.vy, points };
}

function drawPredictedPath() {
  if (!player || state === 'menu') return;
  const quality = renderQuality();
  const stale = frame - predictionCache.frame > quality.predictionFrameTtl
    || hypot(player.x - predictionCache.x, player.y - predictionCache.y) > quality.predictionMove
    || hypot(player.vx - predictionCache.vx, player.vy - predictionCache.vy) > quality.predictionVelocity;
  if (stale) rebuildPredictionCache();
  const pts = predictionCache.points || [];
  if (pts.length < 2) return;

  ctx.save();
  ctx.lineWidth = 1.15;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(236, 247, 255, .25)';
  ctx.setLineDash([2, 8]);
  ctx.beginPath();
  const start = worldToScreen(pts[0].x, pts[0].y);
  ctx.moveTo(start.x, start.y);
  for (let i = 1; i < pts.length; i++) {
    const p = worldToScreen(pts[i].x, pts[i].y);
    ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawRoute() {
  if (!target || !player || state === 'menu') return;
  const a = worldToScreen(player.x, player.y);

  ctx.save();
  ctx.lineWidth = 1;
  ctx.lineCap = 'round';

  for (const opt of routeOptions) {
    if (!opt || opt.id === target.id || opt.visited) continue;
    const os = worldToScreen(opt.x, opt.y);
    ctx.setLineDash([2, 18]);
    ctx.lineDashOffset = -time * 18;
    ctx.strokeStyle = `hsla(${opt.hue}, 82%, 72%, .075)`;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(os.x, os.y);
    ctx.stroke();
    if (os.x > -40 && os.x < W + 40 && os.y > -40 && os.y < H + 40) {
      ctx.setLineDash([]);
      ctx.strokeStyle = `hsla(${opt.hue}, 92%, 76%, .18)`;
      ctx.beginPath();
      ctx.arc(os.x, os.y, 10 + Math.sin(time * 2 + opt.id) * 2, 0, TAU);
      ctx.stroke();
    }
  }

  const b = worldToScreen(target.x, target.y);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = hypot(dx, dy) || 1;
  ctx.setLineDash([6, 14]);
  ctx.lineDashOffset = -time * 34;
  ctx.strokeStyle = `hsla(${target.hue}, 92%, 72%, .20)`;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);

  if (objective && b.x > -90 && b.x < W + 90 && b.y > -90 && b.y < H + 90) {
    const label = clampToRenderSafeArea(b.x, b.y - target.r * camera.zoom - 26, 8);
    ctx.fillStyle = `hsla(${target.hue}, 96%, 78%, .82)`;
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(objective.code, label.x, label.y);
  }

  if (b.x < -70 || b.x > W + 70 || b.y < -70 || b.y > H + 70) {
    const nx = dx / d;
    const ny = dy / d;
    const safePoint = clampToRenderSafeArea(W / 2, H / 2, 18);
    const safe = safePoint.safe;
    const left = safe.left + 18;
    const right = safe.right - 18;
    const top = safe.top + 18;
    const bottom = safe.bottom - 18;
    const cx = clamp((left + right) / 2, left, Math.max(left, right));
    const cy = clamp((top + bottom) / 2, top, Math.max(top, bottom));
    const scaleX = nx > 0 ? (right - cx) / nx : (nx < 0 ? (left - cx) / nx : Infinity);
    const scaleY = ny > 0 ? (bottom - cy) / ny : (ny < 0 ? (top - cy) / ny : Infinity);
    const scale = Math.max(0, Math.min(scaleX, scaleY));
    const ex = clamp(cx + nx * scale, left, Math.max(left, right));
    const ey = clamp(cy + ny * scale, top, Math.max(top, bottom));
    const angle = Math.atan2(ny, nx);
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(angle);
    ctx.fillStyle = `hsla(${target.hue}, 94%, 76%, .9)`;
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-9, -7);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-9, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(238,246,255,.45)';
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx.textAlign = 'center';
    const labelY = clamp(ey + (ey > cy ? -18 : 24), top + 8, bottom - 4);
    ctx.fillText(`${objective ? objective.code + ' ' : ''}${Math.round(worldDistanceToTarget())}`, ex, labelY);
  }
  ctx.restore();
}

function drawBodies() {
  const quality = renderQuality();
  const list = collectVisibleBodies(450, visibleBodiesScratch, quality.visibleBodyLimit);
  for (let i = 0; i < list.length; i++) drawBodyFields(list[i], quality);
  for (let i = 0; i < list.length; i++) drawBodyCore(list[i]);
}

function drawBodyFields(b, quality = renderQuality()) {
  const s = worldToScreen(b.x, b.y);
  ctx.save();
  ctx.lineWidth = 1;

  const compactLevels = b.kind === 'blackhole' || b.family === 'neutron';
  const lowDetail = quality === QUALITY_LOW && !b.target;
  const levels = compactLevels
    ? (lowDetail ? [1.8, 7, 32, 120] : [1.2, 2.8, 6.4, 14, 32, 72, 160])
    : (lowDetail ? [1.4, 6, 28] : [1, 2.6, 7, 18, 48]);
  for (let i = 0; i < levels.length; i++) {
    const rr = Math.sqrt(Math.max(b.mu || 0, 1) / levels[i]);
    if (!isFinite(rr) || rr < b.r * 1.4 || rr > b.field * .96) continue;
    const alpha = clamp(.025 + i * .012, .025, .12);
    ctx.strokeStyle = `hsla(${b.hue}, 92%, 70%, ${alpha})`;
    ctx.setLineDash(i % 2 ? [2, 10] : []);
    ctx.lineDashOffset = -time * (12 + i * 3);
    ctx.beginPath();
    ctx.arc(s.x, s.y, rr * camera.zoom, 0, TAU);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  if (b.kind === 'star') {
    const heatR = b.heatRadius * camera.zoom;
    const heatPulse = Math.sin(time * .9 + b.phase) * 4;
    ctx.strokeStyle = `hsla(${b.hue}, 96%, 70%, .062)`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, heatR + heatPulse, 0, TAU);
    ctx.stroke();
  }

  for (let i = 0; i < quality.bodyFieldPulseCount; i++) {
    const k = .38 + i * .30;
    const r = b.field * k * camera.zoom + Math.sin(time * (.7 + i * .12) + b.phase) * 3;
    ctx.strokeStyle = `hsla(${b.hue}, 90%, 70%, ${.024 + i * .015})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, TAU);
    ctx.stroke();
  }

  if (b.soi && b.parentId && (!lowDetail || b.target)) {
    ctx.strokeStyle = `hsla(${b.hue}, 88%, 74%, .045)`;
    ctx.setLineDash([1, 16]);
    ctx.lineDashOffset = time * 10;
    ctx.beginPath();
    ctx.arc(s.x, s.y, b.soi * camera.zoom, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (b.kind !== 'blackhole') {
    const scanR = b.scan * camera.zoom;
    const a = b.target ? .46 : (b.visited ? .028 : .11);
    ctx.setLineDash(b.target ? [3, 8] : []);
    ctx.lineDashOffset = -time * 25;
    ctx.strokeStyle = `hsla(${b.hue}, 96%, 76%, ${a})`;
    ctx.lineWidth = b.target ? 1.8 : 1;
    ctx.beginPath();
    ctx.arc(s.x, s.y, scanR, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (b.target) {
    for (let i = 0; i < 3; i++) {
      const r = (b.scan + i * 22 + ((time * 22 + i * 9) % 22)) * camera.zoom;
      ctx.strokeStyle = `hsla(${b.hue}, 95%, 78%, ${.24 - i * .055})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, TAU);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function isHazardBody(b) {
  return b.kind === 'star'
    || b.kind === 'blackhole'
    || b.kind === 'comet'
    || b.family === 'neutron'
    || b.family === 'whitedwarf';
}

function hazardScreenRadius(b, r) {
  if (!isHazardBody(b)) return r;
  if (b.kind === 'blackhole') return Math.max(r, 7.5);
  if (b.kind === 'comet') return Math.max(r, 5.5);
  return Math.max(r, b.family === 'neutron' || b.family === 'whitedwarf' ? 6.5 : 6);
}

function drawHazardContour(b, s, r) {
  if (!isHazardBody(b)) return;
  const pulse = Math.sin(time * 3 + b.phase) * .5;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate((b.spin || .12) * time + b.phase);
  ctx.lineWidth = b.kind === 'blackhole' ? 1.35 : 1;
  ctx.strokeStyle = b.kind === 'blackhole'
    ? 'rgba(246,250,255,.70)'
    : `hsla(${b.hue}, 96%, 86%, .64)`;
  ctx.setLineDash(b.kind === 'comet' ? [6, 4] : [2, 4]);
  ctx.lineDashOffset = -time * (b.kind === 'blackhole' ? 20 : 14);
  ctx.beginPath();
  ctx.arc(0, 0, r + (b.kind === 'blackhole' ? 4.5 : 3.5) + pulse, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);

  if (b.kind === 'star') {
    const ticks = b.family === 'neutron' ? 4 : 8;
    ctx.strokeStyle = `hsla(${b.hue + 35}, 100%, 88%, .55)`;
    for (let i = 0; i < ticks; i++) {
      const a = i / ticks * TAU;
      const inner = r + 5;
      const outer = r + (i % 2 ? 10 : 13);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
      ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
      ctx.stroke();
    }
  } else if (b.kind === 'blackhole') {
    ctx.strokeStyle = 'rgba(246,250,255,.42)';
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(-r * 2.3, i * 5 - r * .25);
      ctx.lineTo(r * 2.3, i * 5 + r * .25);
      ctx.stroke();
    }
  } else if (b.kind === 'comet') {
    ctx.strokeStyle = `hsla(${b.hue + 28}, 96%, 88%, .55)`;
    ctx.beginPath();
    ctx.moveTo(-r - 4, -r - 4);
    ctx.lineTo(r + 4, r + 4);
    ctx.moveTo(-r - 4, r + 4);
    ctx.lineTo(r + 4, -r - 4);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBodyCore(b) {
  const s = worldToScreen(b.x, b.y);
  const r = hazardScreenRadius(b, b.r * camera.zoom);
  const pulse = 1 + Math.sin(time * 1.1 + b.phase) * .035;

  ctx.save();
  if (b.kind === 'star') drawStarBody(b, s, r, pulse);
  else if (b.kind === 'blackhole') drawBlackHole(b, s, r);
  else if (b.kind === 'asteroid') drawAsteroidBody(b, s, r);
  else if (b.kind === 'comet') drawCometBody(b, s, r);
  else drawPlanetBody(b, s, r, pulse);
  drawHazardContour(b, s, r);

  if ((b.kind === 'star' || b.target || b.kind === 'comet') && r > 7) {
    ctx.fillStyle = `hsla(${b.hue}, 92%, 80%, ${b.target ? .78 : .34})`;
    ctx.font = `${b.target ? 12 : 10}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.label || b.class || b.kind, s.x, s.y + r + 16);
  }
  ctx.restore();
}

function drawStarBody(b, s, r, pulse) {
  const compactGlow = b.family === 'whitedwarf' || b.family === 'neutron';
  const glowR = r * (compactGlow ? 7.8 : 6.0 + Math.sqrt(Math.max(b.luminosity, .02)) * .055);
  const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, glowR);
  glow.addColorStop(0, `hsla(${b.hue}, 98%, 78%, ${compactGlow ? .72 : .52})`);
  glow.addColorStop(.22, `hsla(${b.hue}, 96%, 60%, .20)`);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(s.x, s.y, glowR, 0, TAU);
  ctx.fill();

  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(time * (b.spin || .08) + b.phase);
  const rayCount = b.family === 'neutron' ? 4 : (b.class === 'O' || b.class === 'B' ? 14 : 10);
  ctx.strokeStyle = `hsla(${b.hue}, 100%, 78%, ${compactGlow ? .22 : .10})`;
  ctx.lineWidth = b.family === 'neutron' ? 1.6 : 1;
  for (let i = 0; i < rayCount; i++) {
    ctx.rotate(TAU / rayCount);
    ctx.beginPath();
    ctx.moveTo(r * 1.28, 0);
    ctx.lineTo(r * (compactGlow ? 3.6 : 2.15 + Math.sin(time + i) * .14), 0);
    ctx.stroke();
  }
  ctx.restore();

  const core = ctx.createRadialGradient(s.x - r * .25, s.y - r * .28, 0, s.x, s.y, r * 1.22);
  if (b.family === 'whitedwarf' || b.family === 'neutron' || b.class === 'O' || b.class === 'B' || b.class === 'A') {
    core.addColorStop(0, '#ffffff');
    core.addColorStop(.52, `hsl(${b.hue}, 92%, 76%)`);
    core.addColorStop(1, `hsl(${b.hue}, 80%, 48%)`);
  } else if (b.family === 'redgiant') {
    core.addColorStop(0, '#fff0c4');
    core.addColorStop(.50, `hsl(${b.hue}, 92%, 58%)`);
    core.addColorStop(1, `hsl(${b.hue - 5}, 72%, 34%)`);
  } else {
    core.addColorStop(0, '#fff6d4');
    core.addColorStop(.55, `hsl(${b.hue}, 92%, 65%)`);
    core.addColorStop(1, `hsl(${b.hue - 8}, 78%, 39%)`);
  }
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(s.x, s.y, r * pulse, 0, TAU);
  ctx.fill();

  if (compactGlow) {
    ctx.strokeStyle = `hsla(${b.hue + 42}, 100%, 86%, .42)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r * 1.8, 0, TAU);
    ctx.stroke();
  }
}

function drawPlanetBody(b, s, r, pulse) {
  const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 4.2);
  glow.addColorStop(0, `hsla(${b.hue}, 88%, 65%, .2)`);
  glow.addColorStop(.6, `hsla(${b.hue}, 72%, 46%, .07)`);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(s.x, s.y, r * 4.2, 0, TAU);
  ctx.fill();

  if (b.ring) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(.22 + b.phase * .08);
    ctx.strokeStyle = `hsla(${b.hue}, 88%, 76%, .26)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.9, r * .52, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  ctx.fillStyle = `hsl(${b.hue}, 70%, 44%)`;
  ctx.beginPath();
  ctx.arc(s.x, s.y, r * pulse, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = `hsla(${b.hue + 24}, 90%, 78%, .54)`;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(s.x, s.y, r * .82, -1, 2.2);
  ctx.stroke();
}

function drawAsteroidBody(b, s, r) {
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(b.phase);
  ctx.fillStyle = `hsla(${b.hue}, 48%, 45%, .9)`;
  ctx.strokeStyle = `hsla(${b.hue + 20}, 82%, 72%, .42)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const n = b.sides || 6;
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU;
    const rr = r * (.72 + .34 * Math.sin(i * 1.7 + b.id));
    if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawCometBody(b, s, r) {
  const tailA = Math.atan2(b.vy, b.vx) + Math.PI;
  const len = clamp(hypot(b.vx, b.vy) * .08, 24, 92) * camera.zoom;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(tailA);
  const grad = ctx.createLinearGradient(0, 0, len, 0);
  grad.addColorStop(0, `hsla(${b.hue}, 90%, 76%, .46)`);
  grad.addColorStop(1, `hsla(${b.hue}, 90%, 76%, 0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, -r * .6);
  ctx.lineTo(len, -r * 1.9);
  ctx.lineTo(len * .86, 0);
  ctx.lineTo(len, r * 1.9);
  ctx.lineTo(0, r * .6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = `hsl(${b.hue}, 92%, 72%)`;
  ctx.beginPath();
  ctx.arc(s.x, s.y, r, 0, TAU);
  ctx.fill();
}

function drawBlackHole(b, s, r) {
  const glow = ctx.createRadialGradient(s.x, s.y, r * .3, s.x, s.y, r * 8);
  glow.addColorStop(0, 'rgba(0,0,0,.98)');
  glow.addColorStop(.18, `hsla(${b.hue}, 90%, 52%, .42)`);
  glow.addColorStop(.33, `hsla(${b.hue + 40}, 100%, 64%, .13)`);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(s.x, s.y, r * 8, 0, TAU);
  ctx.fill();

  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(time * b.spin + b.phase);
  ctx.strokeStyle = `hsla(${b.hue + 22}, 95%, 74%, .66)`;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 2.35, r * .62, 0, .15, Math.PI * 1.86);
  ctx.stroke();
  ctx.strokeStyle = `hsla(${b.hue + 58}, 96%, 78%, .22)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 3.05, r * .9, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(s.x, s.y, r * 1.05, 0, TAU);
  ctx.fill();
}

function drawParticles() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of particles) {
    const s = worldToScreen(p.x, p.y);
    if (s.x < -80 || s.x > W + 80 || s.y < -80 || s.y > H + 80) continue;
    const a = clamp(p.life / p.max, 0, 1);
    ctx.fillStyle = `hsla(${p.hue}, 96%, 72%, ${a * .62})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, p.size * (.55 + a) * camera.zoom, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawPlayer() {
  if (!player) return;
  ctx.save();
  if (player.trail.length > 2) {
    ctx.lineCap = 'round';
    for (let i = 1; i < player.trail.length; i++) {
      const a = i / player.trail.length;
      const p0 = worldToScreen(player.trail[i - 1].x, player.trail[i - 1].y);
      const p1 = worldToScreen(player.trail[i].x, player.trail[i].y);
      const speed = player.trail[i].speed;
      const heat = player.trail[i].heat;
      const hue = heat > .45 ? 18 : 190 + clamp(speed / 1200, 0, 1) * 44;
      ctx.strokeStyle = `hsla(${hue}, 96%, 72%, ${a * .31})`;
      ctx.lineWidth = (1 + a * 4.2) * camera.zoom;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
  }

  const s = worldToScreen(player.x, player.y);
  const scale = camera.zoom;
  const heatFx = clamp((player.heat - .72) / .28, 0, 1);
  const stressFx = clamp(((player.stress || 0) - .72) / .36, 0, 1);
  ctx.translate(s.x, s.y);
  if (stressFx > 0) ctx.translate(rnd(Math.random, -1.8, 1.8) * stressFx * scale, rnd(Math.random, -1.8, 1.8) * stressFx * scale);
  ctx.rotate(player.angle);

  if (player.thrusting) {
    const flame = (10 + Math.sin(time * 45) * 2 + Math.random() * 3) * scale;
    ctx.fillStyle = 'rgba(115, 224, 255, .74)';
    ctx.beginPath();
    ctx.moveTo(-12 * scale, 0);
    ctx.lineTo(-12 * scale - flame, -4.6 * scale);
    ctx.lineTo(-12 * scale - flame * .72, 0);
    ctx.lineTo(-12 * scale - flame, 4.6 * scale);
    ctx.closePath();
    ctx.fill();
  }

  if (heatFx > 0) {
    const flicker = .68 + Math.sin(time * 18) * .18 + Math.random() * .14;
    ctx.strokeStyle = `hsla(28, 100%, 66%, ${(.20 + heatFx * .30) * flicker})`;
    ctx.lineWidth = 1 + heatFx * 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, (18 + heatFx * 8) * scale, 0, TAU);
    ctx.stroke();
  }

  if (stressFx > 0) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.setLineDash([3 * scale, 5 * scale]);
    ctx.lineDashOffset = -time * 28;
    for (let i = 0; i < 3; i++) {
      const arcPhase = time * (1.8 + i * .25) + i * 2.1;
      const r = (19 + i * 4 + stressFx * 4) * scale;
      ctx.strokeStyle = `hsla(${242 + i * 16}, 98%, ${70 + i * 4}%, ${(.12 + stressFx * .20) * (1 - i * .18)})`;
      ctx.lineWidth = (1 + stressFx * .9) * scale;
      ctx.beginPath();
      ctx.arc(0, 0, r, arcPhase, arcPhase + .9 + stressFx * .7);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  ctx.strokeStyle = `rgba(160, 232, 255, ${player.heat > .65 ? .18 + Math.sin(time * 11) * .08 : .08})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, 18 * scale, 0, TAU);
  ctx.stroke();

  ctx.fillStyle = 'rgba(242, 248, 255, .96)';
  ctx.strokeStyle = 'rgba(116, 224, 255, .72)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(15 * scale, 0);
  ctx.lineTo(-9 * scale, -7.6 * scale);
  ctx.lineTo(-5 * scale, 0);
  ctx.lineTo(-9 * scale, 7.6 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = 'rgba(4, 18, 32, .95)';
  ctx.beginPath();
  ctx.arc(3 * scale, 0, 2.7 * scale, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawTexts() {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 17px ui-sans-serif, system-ui';
  for (const f of texts) {
    const s = worldToScreen(f.x, f.y);
    const a = clamp(f.life / f.max, 0, 1);
    ctx.lineWidth = 4;
    ctx.strokeStyle = `rgba(1, 5, 13, ${a * .88})`;
    ctx.shadowColor = 'rgba(0,0,0,0)';
    ctx.shadowBlur = 0;
    ctx.strokeText(f.text, s.x, s.y);
    ctx.fillStyle = `hsla(${f.hue}, 95%, 77%, ${a})`;
    ctx.shadowColor = `hsla(${f.hue}, 95%, 56%, ${a})`;
    ctx.shadowBlur = 16;
    ctx.fillText(f.text, s.x, s.y);
  }
  ctx.restore();
}
