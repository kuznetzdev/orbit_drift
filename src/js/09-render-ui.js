/*
 * Orbit Drift — 09-render-ui
 * HUD, navigation panel, difficulty controls, zoom controls, menu/death overlays.
 * Keep this file loaded after all earlier numbered files.
 */

'use strict';

function uiMargin() {
  return W < 520 ? 12 : 22;
}

function drawSoftPanel(x, y, w, h, radius = 16, alpha = .58) {
  const grd = ctx.createLinearGradient(x, y, x + w, y + h);
  grd.addColorStop(0, `rgba(6, 16, 34, ${alpha})`);
  grd.addColorStop(1, `rgba(1, 6, 16, ${Math.max(.25, alpha - .18)})`);
  ctx.fillStyle = grd;
  roundRect(x, y, w, h, radius);
  ctx.fill();
  ctx.strokeStyle = 'rgba(148,226,255,.13)';
  ctx.lineWidth = 1;
  roundRect(x, y, w, h, radius);
  ctx.stroke();
}

function drawPill(text, x, y, hue = 205, active = true) {
  const pad = 9;
  ctx.save();
  ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const w = ctx.measureText(text).width + pad * 2;
  const h = 20;
  ctx.fillStyle = active ? `hsla(${hue}, 70%, 42%, .18)` : 'rgba(238,246,255,.055)';
  roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = active ? `hsla(${hue}, 92%, 72%, .28)` : 'rgba(238,246,255,.11)';
  roundRect(x, y, w, h, 10);
  ctx.stroke();
  ctx.fillStyle = active ? `hsla(${hue}, 92%, 82%, .82)` : 'rgba(238,246,255,.38)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, y + h / 2 + .5);
  ctx.restore();
  return w;
}

function drawWrappedText(text, x, y, maxW, lineH, maxLines = 2) {
  const words = String(text || '').split(/\s+/);
  let line = '';
  let lines = [];
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
      if (lines.length >= maxLines) break;
    } else {
      line = test;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], x, y + i * lineH);
  return lines.length * lineH;
}

function drawMetricBar(x, y, w, label, value, hue, valueText = '') {
  const h = 6;
  value = clamp(value, 0, 1);
  ctx.save();
  ctx.font = '10px ui-sans-serif, system-ui';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(238,246,255,.42)';
  ctx.fillText(label, x, y);
  if (valueText) {
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(238,246,255,.50)';
    ctx.fillText(valueText, x + w, y);
  }
  const by = y + 15;
  ctx.fillStyle = 'rgba(238,246,255,.075)';
  roundRect(x, by, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = `hsla(${hue}, 95%, 68%, .74)`;
  roundRect(x, by, w * value, h, h / 2);
  ctx.fill();
  ctx.restore();
}

function objectiveVerb(obj) {
  if (!obj) return 'выбери цель';
  if (obj.type === 'orbit') return 'держи ровную орбиту';
  if (obj.type === 'sling') return 'разгонись в поле';
  if (obj.type === 'skim') return 'быстро пройди у звезды';
  if (obj.type === 'rendezvous') return 'догоняй и выравнивай скорость';
  if (obj.type === 'tide') return 'подойди близко, но не сорвись';
  if (obj.type === 'silent') return 'пройди кольцо без тяги';
  return 'пролети через кольцо';
}

function objectiveMetaText(obj) {
  if (!obj) return '';
  return `риск: ${obj.risk || 'обычный'} · награда: ${obj.reward || '+' + (obj.bonus || 0)}`;
}

function objectiveSuccessText(obj) {
  if (!obj) return 'достигни цели';
  if (obj.type === 'orbit') return 'успех: ровная дуга у цели';
  if (obj.type === 'sling') return 'успех: близкий проход без тяги';
  if (obj.type === 'skim') return 'успех: быстрый выход из жара';
  if (obj.type === 'rendezvous') return 'успех: сближение и равная скорость';
  if (obj.type === 'tide') return 'успех: близко без перегруза';
  if (obj.type === 'silent') return 'успех: кольцо на инерции';
  return 'успех: пролёт через кольцо';
}

function routeText() {
  return routeOptions.length > 1 ? `маршрут ${routeChoice + 1}/${routeOptions.length}` : 'маршрут 1/1';
}

function drawScorePanel(x, y, compact) {
  const w = compact ? 176 : 228;
  const h = compact ? 88 : 104;
  drawSoftPanel(x, y, w, h, 16, .52);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(149,228,255,.70)';
  ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  ctx.fillText('ORBIT DRIFT', x + 14, y + 12);
  ctx.fillStyle = 'rgba(244,249,255,.94)';
  ctx.font = compact ? '700 28px ui-sans-serif, system-ui' : '700 34px ui-sans-serif, system-ui';
  ctx.fillText(String(score), x + 14, y + (compact ? 29 : 31));
  ctx.fillStyle = 'rgba(238,246,255,.42)';
  ctx.font = '11px ui-sans-serif, system-ui';
  ctx.fillText(`рекорд ${best}`, x + 14, y + h - 31);
  ctx.fillText(`серия ${chain}`, x + 14, y + h - 16);
  drawPill(difficulty.label || difficulty.name, x + w - (compact ? 86 : 96), y + 13, 205, true);
  return { x, y, w, h };
}

function drawObjectivePanel(x, y, compact) {
  if (!objective || !target) return { x, y, w: 0, h: 0 };
  const margin = uiMargin();
  const shipW = compact ? 136 : 172;
  const shipX = W - shipW - margin;
  const maxByShip = shipX >= (compact ? 198 : 270) ? shipX - x - 10 : W - x * 2;
  const w = Math.min(compact ? maxByShip : 420, W - x * 2);
  const h = compact ? 104 : 126;
  drawSoftPanel(x, y, w, h, 16, .56);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  drawPill(objective.code, x + 14, y + 13, target.hue, true);
  ctx.fillStyle = 'rgba(244,249,255,.93)';
  ctx.font = compact ? '600 13px ui-sans-serif, system-ui' : '600 15px ui-sans-serif, system-ui';
  ctx.fillText(objective.title, x + 88, y + 14);

  ctx.fillStyle = 'rgba(238,246,255,.72)';
  ctx.font = compact ? '11px ui-sans-serif, system-ui' : '12px ui-sans-serif, system-ui';
  drawWrappedText(`Действие: ${objective.hint}`, x + 14, y + (compact ? 40 : 43), w - 28, compact ? 13 : 15, 1);

  ctx.fillStyle = 'rgba(170,228,255,.72)';
  ctx.font = '10px ui-sans-serif, system-ui';
  ctx.fillText(objectiveSuccessText(objective), x + 14, y + (compact ? 58 : 66));

  ctx.fillStyle = 'rgba(255,214,145,.70)';
  ctx.font = '10px ui-sans-serif, system-ui';
  ctx.fillText(objectiveMetaText(objective), x + 14, y + (compact ? 74 : 83));

  const d = worldDistanceToTarget();
  ctx.fillStyle = `hsla(${target.hue}, 94%, 78%, .66)`;
  ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  ctx.fillText(`${routeText()} · ${labelOf(target)} · ${Math.round(d)} м · ${objectiveVerb(objective)}`, x + 14, y + h - 18);
  return { x, y, w, h };
}

function drawShipPanel(compact) {
  const margin = uiMargin();
  const w = compact ? 136 : 172;
  const h = compact ? 118 : 132;
  const x = W - w - margin;
  const y = margin;
  if (x < (compact ? 198 : 270)) return null;
  drawSoftPanel(x, y, w, h, 16, .44);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(149,228,255,.58)';
  ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  ctx.fillText('КОРАБЛЬ', x + 12, y + 11);
  const bw = w - 24;
  drawMetricBar(x + 12, y + 30, bw, 'топливо', player.fuel / player.maxFuel, 196, `${Math.round(player.fuel)}%`);
  drawMetricBar(x + 12, y + 56, bw, 'нагрев', player.heat, 18, `${Math.round(player.heat * 100)}%`);
  drawMetricBar(x + 12, y + 82, bw, 'нагрузка', player.stress || 0, 270, `${Math.round((player.stress || 0) * 100)}%`);
  if (!compact) drawMetricBar(x + 12, y + 108, bw, 'инерция', player.driftCharge / 10, 255, `${Math.round(player.driftCharge * 10)}%`);
  return { x, y, w, h };
}

function drawPlayHud() {
  const compact = W < 640 || H < 540;
  const margin = uiMargin();
  const scoreBox = drawScorePanel(margin, margin, compact);
  const objY = scoreBox.y + scoreBox.h + (compact ? 8 : 10);
  if (!compact || H > 520) drawObjectivePanel(margin, objY, compact);
  drawShipPanel(compact);
  drawQuickButtons();
  if (navLayer) drawNavPanel();

  if (gravityAdviceTime > 0 && gravityAdvice) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(238,246,255,.50)';
    ctx.font = '600 12px ui-sans-serif, system-ui';
    ctx.fillText(gravityAdvice, W / 2, H - (W < 560 ? 78 : 70));
  }

  if (tutorialHintTime > 0 && tutorialHint) {
    const hintW = Math.min(260, W - 36);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(238,246,255,.62)';
    ctx.font = '600 12px ui-sans-serif, system-ui';
    drawWrappedText(tutorialHint, W / 2 - hintW / 2, H - (W < 560 ? 108 : 100), hintW, 15, 2);
  }
}

function drawHud() {
  ctx.save();
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  if (state === 'play' && player) drawPlayHud();

  if (state === 'play' && message && messageTime > 0) {
    const a = clamp(messageTime, 0, 1);
    ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(238,246,255,${.20 + a * .62})`;
    ctx.font = '600 17px ui-sans-serif, system-ui';
    ctx.fillText(message, W / 2, 20);
  }

  if (state === 'menu') drawOverlay('ORBIT DRIFT', 'Лети от звезды к звезде. Гравитация меняет курс.', 'В полёт');
  if (state === 'dead') drawOverlay('Миссия провалена', message || 'Связь потеряна', 'Начать заново');
  ctx.restore();
}

function drawNavPanel() {
  const compact = W < 760 || H < 560;
  if (compact && W < 520) return;
  const g = gravityAt(player.x, player.y, true);
  const rad = radiationAt(player.x, player.y);
  const wind = stellarWindAt(player.x, player.y);
  const tide = tidalStressAt(player.x, player.y);
  const dom = g.body;
  const orb = orbitalElements(dom);
  const speed = hypot(player.vx, player.vy);
  const panelW = compact ? 252 : 318;
  const panelH = compact ? 156 : 226;
  const bottomReserve = state === 'play' ? (W < 560 ? 58 : 66) : 18;
  const x = W - panelW - uiMargin();
  const topClear = compact ? 142 : 164;
  const y = compact ? Math.max(topClear, H - panelH - bottomReserve) : Math.min(topClear, H - panelH - bottomReserve);

  ctx.save();
  ctx.globalAlpha = .96;
  const grd = ctx.createLinearGradient(x, y, x + panelW, y + panelH);
  grd.addColorStop(0, 'rgba(4, 11, 24, .58)');
  grd.addColorStop(1, 'rgba(2, 7, 18, .36)');
  ctx.fillStyle = grd;
  roundRect(x, y, panelW, panelH, 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(146,221,255,.13)';
  ctx.lineWidth = 1;
  roundRect(x, y, panelW, panelH, 14);
  ctx.stroke();

  ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let yy = y + 13;
  const line = (k, v, hue = null) => {
    ctx.fillStyle = 'rgba(238,246,255,.34)';
    ctx.fillText(k, x + 14, yy);
    ctx.fillStyle = hue == null ? 'rgba(238,246,255,.78)' : `hsla(${hue},92%,78%,.82)`;
    ctx.fillText(v, x + (compact ? 88 : 106), yy);
    yy += compact ? 15 : 17;
  };
  ctx.fillStyle = 'rgba(149,228,255,.82)';
  ctx.fillText('НАВИГАЦИЯ · ПОЛЁТ', x + 14, yy);
  yy += compact ? 17 : 20;
  if (objective && target) {
    line('ЦЕЛЬ', compact ? `${objective.code}  ${objective.risk || 'риск'}` : `${objective.code}  ${labelOf(target)}  ${objective.risk || 'риск'} / ${objective.reward || '+'}`, target.hue);
  }
  line('ПОЗИЦИЯ', `X ${fmtSigned(player.x / 1000, 2)}  Y ${fmtSigned(player.y / 1000, 2)}`);
  line('СКОРОСТЬ', `${fmtSigned(player.vx, 0)} ${fmtSigned(player.vy, 0)}  |v| ${fmtNum(speed, 0)}`);
  line('ПРИТЯЖ.', `${fmtNum(hypot(g.ax, g.ay), 2)} g*  ${dom ? labelOf(dom) : 'нет'}  карта ${gravityLayer ? 'вкл' : 'выкл'}`, dom ? dom.hue : null);
  if (!compact) {
    line('ПОЛЕ', `усиление +${Math.round((player.gravBoost || 0) * 100)}%  радиус ${dom ? fmtNum(dom.field || 0, 0) : '0'}м`, dom ? dom.hue : null);
    line('СИСТЕМА', `${fmtNum(perf.fps, 0)} кадр/с  тел ${bodies.length}  G ${perf.gravSources}  линий ${perf.fieldLines}`, 205);
    line('КАРТА', `${mapCode}  масштаб ${fmtNum(userZoom, 2)}x  DPR ${fmtNum(DPR, 1)}`, 205);
    line('ИЗЛУЧЕНИЕ', `${fmtNum(rad.flux, 2)}  ветер ${fmtNum(wind.mag, 2)}  нагрев ${fmtNum(player.heat, 2)}`, rad.body ? rad.body.hue : null);
    line('НАГРУЗКА', `${fmtNum(tide.stress, 3)}  риск ${fmtNum(player.stress || 0, 2)}  топливо ${fmtNum(player.fuel / player.maxFuel, 2)}`, tide.body ? tide.body.hue : null);
  }
  if (dom && orb) {
    line('ТЕЛО', `${labelOf(dom)}  M ${fmtNum(dom.mass || 0, 2)}  μ ${fmtNum(dom.mu / 1000, 1)}`, dom.hue);
    if (!compact && dom.soi) line('СФЕРА', `${fmtNum(dom.soi, 0)}м  плотн ${fmtNum(dom.densityCode || 0, 4)}`);
    const apo = isFinite(orb.apo) ? fmtNum(orb.apo, 0) : 'escape';
    line('ОРБИТА', `e ${fmtNum(orb.ecc, 2)}  pe ${fmtNum(orb.peri, 0)}  ap ${apo}`);
    if (!compact) line('ЗАХВАТ', `vc ${fmtNum(orb.circular, 0)}  ve ${fmtNum(orb.escape, 0)}  q ${fmtNum(orb.quality, 2)}`);
  }
  if (target) {
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const d = hypot(dx, dy);
    const bearing = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
    const closing = -((player.vx - (target.vx || 0)) * dx + (player.vy - (target.vy || 0)) * dy) / Math.max(d, 1);
    const eta = closing > 8 ? d / closing : Infinity;
    line('ЦЕЛЬ', `${labelOf(target)}  ${fmtNum(d, 0)}м  курс ${fmtNum(bearing, 0)}°`, target.hue);
    if (!compact) line('ДО СБЛИЖ.', isFinite(eta) ? `${fmtNum(eta, 1)}с  сближ ${fmtNum(closing, 0)}` : `не рассчитано`);
  }
  ctx.restore();
}

function labelOf(b) {
  if (!b) return 'нет';
  if (b.kind === 'star') return b.label || b.class || 'STAR';
  if (b.kind === 'blackhole') return 'BH';
  return b.label || b.kind.toUpperCase();
}

function drawBar(x, y, w, h, value, hue, label) {
  value = clamp(value, 0, 1);
  ctx.save();
  ctx.fillStyle = 'rgba(238,246,255,.08)';
  roundRect(x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = `hsla(${hue}, 95%, 68%, .76)`;
  roundRect(x, y, w * value, h, h / 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(238,246,255,.42)';
  ctx.font = '10px ui-sans-serif, system-ui';
  ctx.textAlign = 'left';
  ctx.fillText(label, x, y + 8);
  ctx.restore();
}

function setDifficultyIndex(index) {
  difficultyIndex = ((index % DIFFICULTIES.length) + DIFFICULTIES.length) % DIFFICULTIES.length;
  difficulty = DIFFICULTIES[difficultyIndex];
  gravityFieldCache.frame = -999;
  predictionCache.frame = -999;
  writeSettings();
  soundCue('select', null, difficultyIndex + 1);
}

function cycleDifficulty(dir = 1) {
  setDifficultyIndex(difficultyIndex + dir);
}

function setViewZoom(value, silent = false) {
  const next = clamp(Number(value) || 1, ZOOM_MIN, ZOOM_MAX);
  if (Math.abs(next - userZoom) < .002) return;
  userZoom = next;
  gravityFieldCache.frame = -999;
  predictionCache.frame = -999;
  writeSettings();
  if (!silent) soundCue('select', null, 1 + Math.round((userZoom - ZOOM_MIN) * 6));
}

function adjustViewZoom(dir, silent = false) {
  const factor = dir > 0 ? 1.075 : .93;
  setViewZoom(userZoom * factor, silent);
}

function hitRect(x, y, r) {
  return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function quickButtonRects() {
  if (state !== 'play') return [];
  const short = W < 560;
  const w = short ? 36 : 58;
  const h = 28;
  const gap = short ? 6 : 8;
  const y = H - h - (short ? 14 : 18);
  const labels = short
    ? [ ['−', 'zoomOut'], ['+', 'zoomIn'], ['зв', 'sound'], ['нав', 'nav'], ['G', 'gravity'], ['ц', 'route'], ['меню', 'menu'] ]
    : [ ['−', 'zoomOut'], ['+', 'zoomIn'], [soundOn ? 'звук' : 'тихо', 'sound'], [navLayer ? 'нав' : 'нав-', 'nav'], [gravityLayer ? 'поле' : 'поле-', 'gravity'], ['цель', 'route'], ['меню', 'menu'] ];
  const total = labels.length * w + (labels.length - 1) * gap;
  let x = W - total - (short ? 12 : 18);
  return labels.map(([label, action]) => {
    const rect = { x, y, w, h, label, action };
    x += w + gap;
    return rect;
  });
}

function drawQuickButtons() {
  const buttons = quickButtonRects();
  if (!buttons.length) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  for (const b of buttons) {
    const active = b.action === 'sound' ? soundOn : b.action === 'nav' ? navLayer : b.action === 'gravity' ? gravityLayer : true;
    ctx.fillStyle = active ? 'rgba(7,17,34,.42)' : 'rgba(7,17,34,.20)';
    roundRect(b.x, b.y, b.w, b.h, 12);
    ctx.fill();
    ctx.strokeStyle = active ? 'rgba(148,226,255,.20)' : 'rgba(148,226,255,.08)';
    ctx.lineWidth = 1;
    roundRect(b.x, b.y, b.w, b.h, 12);
    ctx.stroke();
    ctx.fillStyle = active ? 'rgba(224,244,255,.72)' : 'rgba(224,244,255,.32)';
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + .5);
  }
  ctx.restore();
}

function overlayMetrics(menu = state === 'menu') {
  const narrow = W < 540;
  const boxW = Math.min(menu ? (narrow ? W - 28 : 660) : (narrow ? W - 30 : 540), W - 28);
  const desiredH = menu ? (narrow ? 468 : 430) : (narrow ? 312 : 286);
  const boxH = Math.min(desiredH, H - 28);
  return { boxW, boxH, x: W / 2 - boxW / 2, y: H / 2 - boxH / 2 };
}

function menuDifficultyRects() {
  const m = overlayMetrics(true);
  const cols = W < 540 ? 1 : 3;
  const gap = W < 540 ? 8 : 10;
  const pad = W < 540 ? 18 : 24;
  const usable = m.boxW - pad * 2;
  const w = (usable - gap * (cols - 1)) / cols;
  const h = W < 540 ? 56 : 82;
  const startY = m.y + (W < 540 ? 126 : 140);
  return DIFFICULTIES.map((d, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return { x: m.x + pad + col * (w + gap), y: startY + row * (h + gap), w, h, index: i, d };
  });
}

function menuSoundRect() {
  const isMenu = state === 'menu';
  const m = overlayMetrics(isMenu);
  const w = Math.min(isMenu ? 184 : 174, m.boxW - 48);
  const h = 34;
  return { x: W / 2 - w / 2, y: m.y + m.boxH - (isMenu ? (W < 540 ? 128 : 120) : 88), w, h };
}

function menuStartRect() {
  const isMenu = state === 'menu';
  const m = overlayMetrics(isMenu);
  const w = Math.min(230, m.boxW - 56);
  const h = 40;
  return { x: W / 2 - w / 2, y: m.y + m.boxH - (isMenu ? (W < 540 ? 82 : 74) : 48), w, h };
}

function handleUiTap(x, y) {
  if (state === 'play') {
    for (const b of quickButtonRects()) {
      if (!hitRect(x, y, b)) continue;
      if (b.action === 'sound') toggleSound();
      else if (b.action === 'zoomOut') adjustViewZoom(-1);
      else if (b.action === 'zoomIn') adjustViewZoom(1);
      else if (b.action === 'nav') { navLayer = !navLayer; writeSettings(); soundCue('select', null, 1); }
      else if (b.action === 'gravity') { gravityLayer = !gravityLayer; writeSettings(); soundCue('select', null, 2); }
      else if (b.action === 'route') cycleTarget();
      else if (b.action === 'menu') {
        if (typeof returnToDifficultyMenu === 'function') returnToDifficultyMenu();
        else { setupWorld(true); soundCue('select', null, 3); }
      }
      return true;
    }
    return false;
  }

  if (state === 'menu' || state === 'dead') {
    if (state === 'menu') {
      for (const r of menuDifficultyRects()) {
        if (hitRect(x, y, r)) {
          setDifficultyIndex(r.index);
          setupWorld(true);
          return true;
        }
      }
    }
    if (hitRect(x, y, menuSoundRect())) {
      toggleSound();
      return true;
    }
    if (hitRect(x, y, menuStartRect())) {
      startGame();
      return true;
    }
    if (state === 'dead') {
      startGame();
      return true;
    }
  }
  return false;
}

function drawOverlay(title, subtitle, action) {
  const menu = state === 'menu';
  const m = overlayMetrics(menu);
  const { boxW, boxH, x, y } = m;
  const narrow = W < 540;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const grd = ctx.createLinearGradient(x, y, x + boxW, y + boxH);
  grd.addColorStop(0, menu ? 'rgba(8, 20, 42, .92)' : 'rgba(7, 16, 34, .80)');
  grd.addColorStop(1, menu ? 'rgba(1, 6, 18, .86)' : 'rgba(1, 5, 15, .58)');
  ctx.fillStyle = grd;
  roundRect(x, y, boxW, boxH, 24);
  ctx.fill();
  ctx.strokeStyle = menu ? 'rgba(158,229,255,.34)' : 'rgba(148,218,255,.15)';
  ctx.lineWidth = menu ? 1.35 : 1;
  roundRect(x, y, boxW, boxH, 24);
  ctx.stroke();

  ctx.fillStyle = 'rgba(248,252,255,.98)';
  ctx.font = menu ? `${Math.round((narrow ? 28 : 34) * uiScale)}px ui-sans-serif, system-ui` : `${Math.round((narrow ? 26 : 32) * uiScale)}px ui-sans-serif, system-ui`;
  ctx.fillText(title, W / 2, y + (menu ? 42 : 44));
  ctx.fillStyle = menu ? 'rgba(238,246,255,.80)' : 'rgba(238,246,255,.64)';
  ctx.font = `${narrow ? 12 : 13}px ui-sans-serif, system-ui`;
  ctx.fillText(subtitle, W / 2, y + (menu ? 74 : 76));

  if (menu) {
    ctx.fillStyle = 'rgba(169,222,255,.72)';
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx.fillText('3 режима · сила поля / дальность / контроль', W / 2, y + 104);

    for (const r of menuDifficultyRects()) {
      const active = r.index === difficultyIndex;
      const d = r.d;
      ctx.fillStyle = active ? 'rgba(18, 48, 90, .78)' : 'rgba(6, 18, 38, .62)';
      roundRect(r.x, r.y, r.w, r.h, 15);
      ctx.fill();
      ctx.strokeStyle = active ? 'rgba(154,235,255,.72)' : 'rgba(139,230,255,.24)';
      ctx.lineWidth = active ? 1.5 : 1;
      roundRect(r.x, r.y, r.w, r.h, 15);
      ctx.stroke();

      ctx.textAlign = narrow ? 'left' : 'center';
      const tx = narrow ? r.x + 14 : r.x + r.w / 2;
      ctx.fillStyle = active ? 'rgba(248,252,255,.98)' : 'rgba(238,248,255,.86)';
      ctx.font = '700 13px ui-sans-serif, system-ui';
      ctx.fillText(`${d.label || d.name}`, tx, r.y + (narrow ? 17 : 18));
      ctx.fillStyle = active ? 'rgba(158,235,255,.92)' : 'rgba(132,226,255,.68)';
      ctx.font = '10px ui-sans-serif, system-ui';
      ctx.fillText(d.title, tx, r.y + (narrow ? 34 : 38));
      if (!narrow) {
        ctx.fillStyle = 'rgba(238,246,255,.54)';
        ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
        ctx.fillText(`поле ${fmtNum(d.gravity, 2)} · дальн. ${fmtNum(d.targetMax, 2)}`, tx, r.y + r.h - 15);
        ctx.fillStyle = 'rgba(255,214,145,.68)';
        ctx.font = '9px ui-sans-serif, system-ui';
        ctx.fillText(`${d.riskText} · ${d.rewardText}`, tx, r.y + r.h - 30);
      } else {
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(238,246,255,.58)';
        ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
        ctx.fillText(`${d.name}`, r.x + r.w - 14, r.y + 17);
      }
    }

    ctx.textAlign = 'center';
    const sr = menuSoundRect();
    ctx.fillStyle = soundOn ? 'rgba(8, 30, 52, .70)' : 'rgba(8, 12, 22, .58)';
    roundRect(sr.x, sr.y, sr.w, sr.h, 17);
    ctx.fill();
    ctx.strokeStyle = soundOn ? 'rgba(132,226,255,.44)' : 'rgba(132,226,255,.18)';
    roundRect(sr.x, sr.y, sr.w, sr.h, 17);
    ctx.stroke();
    ctx.fillStyle = soundOn ? 'rgba(232,248,255,.92)' : 'rgba(232,248,255,.54)';
    ctx.font = '11px ui-sans-serif, system-ui';
    ctx.fillText(soundOn ? 'Звук включён' : 'Звук выключен', sr.x + sr.w / 2, sr.y + sr.h / 2 + .5);

    const st = menuStartRect();
    ctx.fillStyle = 'rgba(132,226,255,.18)';
    roundRect(st.x, st.y, st.w, st.h, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(132,226,255,.58)';
    roundRect(st.x, st.y, st.w, st.h, 18);
    ctx.stroke();
    ctx.fillStyle = 'rgba(186,242,255,.98)';
    ctx.font = '700 13px ui-sans-serif, system-ui';
    ctx.fillText(action, st.x + st.w / 2, st.y + st.h / 2 + .5);

    ctx.fillStyle = 'rgba(238,246,255,.56)';
    ctx.font = '10px ui-sans-serif, system-ui';
    const controls = narrow ? 'удерживай экран: двигатель · двумя пальцами меняй масштаб' : 'удерживай мышь или экран: двигатель · отпусти: полёт по инерции · R смена цели · G поле гравитации · N навигация';
    ctx.textAlign = 'left';
    drawWrappedText(controls, x + 24, y + boxH - (narrow ? 28 : 24), boxW - 48, 12, 1);
  } else {
    const summaryY = y + 108;
    ctx.fillStyle = 'rgba(238,246,255,.88)';
    ctx.font = `${narrow ? 28 : 34}px ui-sans-serif, system-ui`;
    ctx.fillText(String(score), W / 2, summaryY);
    ctx.fillStyle = 'rgba(238,246,255,.42)';
    ctx.font = '11px ui-sans-serif, system-ui';
    ctx.fillText(`очков · рекорд ${best}`, W / 2, summaryY + 34);
    ctx.fillStyle = 'rgba(169,222,255,.46)';
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx.fillText(`${difficulty.label || difficulty.name} · карта ${mapCode}`, W / 2, summaryY + 55);

    const sr = menuSoundRect();
    ctx.fillStyle = soundOn ? 'rgba(8, 26, 44, .46)' : 'rgba(8, 12, 22, .32)';
    roundRect(sr.x, sr.y, sr.w, sr.h, 17);
    ctx.fill();
    ctx.strokeStyle = soundOn ? 'rgba(132,226,255,.22)' : 'rgba(132,226,255,.09)';
    roundRect(sr.x, sr.y, sr.w, sr.h, 17);
    ctx.stroke();
    ctx.fillStyle = soundOn ? 'rgba(232,248,255,.76)' : 'rgba(232,248,255,.36)';
    ctx.font = '11px ui-sans-serif, system-ui';
    ctx.fillText(soundOn ? 'Звук включён' : 'Звук выключен', sr.x + sr.w / 2, sr.y + sr.h / 2 + .5);

    const st = menuStartRect();
    ctx.fillStyle = 'rgba(132,226,255,.10)';
    roundRect(st.x, st.y, st.w, st.h, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(132,226,255,.30)';
    roundRect(st.x, st.y, st.w, st.h, 18);
    ctx.stroke();
    ctx.fillStyle = 'rgba(132,226,255,.9)';
    ctx.font = '700 13px ui-sans-serif, system-ui';
    ctx.fillText(action, st.x + st.w / 2, st.y + st.h / 2 + .5);
  }
  ctx.restore();
}
