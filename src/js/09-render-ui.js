/*
 * Orbit Drift — 09-render-ui
 * HUD, navigation panel, difficulty controls, zoom controls, menu/death overlays.
 * Keep this file loaded after all earlier numbered files.
 */

'use strict';

function uiMargin() {
  return W < 520 ? 12 : 22;
}

function isMiniHudViewport() {
  return W <= 360 && H <= 480;
}

function uiSafeArea() {
  const margin = uiMargin();
  const compact = W < 640 || H < 540;
  const safe = {
    left: margin,
    top: margin,
    right: W - margin,
    bottom: H - margin,
    margin,
    compact,
    miniHud: isMiniHudViewport(),
    topClearY: margin,
    bottomControlsTop: H - margin,
    width: Math.max(0, W - margin * 2),
    height: Math.max(0, H - margin * 2)
  };

  if (state !== 'play') return safe;

  const scoreH = compact ? 94 : 108;
  const shipW = compact ? (W < 460 ? 132 : 148) : 176;
  const shipVisible = safe.miniHud || (W - shipW - margin >= (compact ? 202 : 280));
  const shipH = safe.miniHud ? 74 : (compact ? 122 : 136);
  safe.topClearY = margin + Math.max(scoreH, shipVisible ? shipH : 0);

  if (objective && target && (!compact || H > 500)) {
    const objY = safe.topClearY + (compact ? 8 : 10);
    const objH = compact ? (W < 430 ? 116 : 110) : 128;
    if (objY < H - (W < 560 ? 126 : 138)) safe.topClearY = objY + objH;
  }

  const buttonH = W < 560 ? 32 : 34;
  const buttonBottom = W < 560 ? 14 : 18;
  safe.bottomControlsTop = H - buttonH - buttonBottom - 8;
  safe.top = Math.min(H - margin, safe.topClearY + 8);
  safe.bottom = Math.max(safe.top + 28, safe.bottomControlsTop);
  safe.width = Math.max(0, safe.right - safe.left);
  safe.height = Math.max(0, safe.bottom - safe.top);
  return safe;
}

function drawSoftPanel(x, y, w, h, radius = 16, alpha = .58) {
  ctx.save();
  const grd = ctx.createLinearGradient(x, y, x + w, y + h);
  grd.addColorStop(0, `rgba(9, 24, 49, ${alpha})`);
  grd.addColorStop(.62, `rgba(4, 13, 31, ${Math.max(.30, alpha - .12)})`);
  grd.addColorStop(1, `rgba(1, 5, 15, ${Math.max(.24, alpha - .20)})`);
  ctx.fillStyle = grd;
  roundRect(x, y, w, h, radius);
  ctx.fill();
  ctx.strokeStyle = 'rgba(151,229,255,.18)';
  ctx.lineWidth = 1;
  roundRect(x, y, w, h, radius);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.055)';
  ctx.beginPath();
  ctx.moveTo(x + radius, y + 1);
  ctx.lineTo(x + w - radius, y + 1);
  ctx.stroke();
  ctx.restore();
}

function pillWidth(text) {
  ctx.save();
  ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const w = ctx.measureText(String(text || '')).width + 18;
  ctx.restore();
  return w;
}

function drawPill(text, x, y, hue = 205, active = true) {
  const pad = 9;
  text = String(text || '');
  ctx.save();
  ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const w = ctx.measureText(text).width + pad * 2;
  const h = 20;
  ctx.fillStyle = active ? `hsla(${hue}, 70%, 42%, .22)` : 'rgba(238,246,255,.06)';
  roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = active ? `hsla(${hue}, 92%, 74%, .36)` : 'rgba(238,246,255,.13)';
  roundRect(x, y, w, h, 10);
  ctx.stroke();
  ctx.fillStyle = active ? `hsla(${hue}, 92%, 84%, .88)` : 'rgba(238,246,255,.42)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, y + h / 2 + .5);
  ctx.restore();
  return w;
}

function fitText(text, maxW) {
  text = String(text || '');
  if (ctx.measureText(text).width <= maxW) return text;
  const suffix = '...';
  let value = text;
  while (value.length > 1 && ctx.measureText(value + suffix).width > maxW) value = value.slice(0, -1);
  return value.length > 1 ? value + suffix : suffix;
}

function fillFittedText(text, x, y, maxW) {
  ctx.fillText(fitText(text, maxW), x, y);
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
  for (let i = 0; i < lines.length; i++) fillFittedText(lines[i], x, y + i * lineH, maxW);
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
    ctx.fillText(fitText(valueText, 48), x + w, y);
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

function drawMiniMetric(x, y, w, label, value, hue) {
  value = clamp(value, 0, 1);
  ctx.save();
  ctx.font = '700 9px ui-sans-serif, system-ui';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(238,246,255,.54)';
  ctx.fillText(label, x, y);
  ctx.fillStyle = 'rgba(238,246,255,.08)';
  roundRect(x + 48, y + 3, w - 48, 5, 3);
  ctx.fill();
  ctx.fillStyle = `hsla(${hue}, 95%, 68%, .78)`;
  roundRect(x + 48, y + 3, (w - 48) * value, 5, 3);
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
  const w = compact ? (W < 380 ? 164 : 184) : 232;
  const h = compact ? 94 : 108;
  drawSoftPanel(x, y, w, h, 16, .58);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(151,231,255,.76)';
  ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  ctx.fillText('ORBIT DRIFT', x + 14, y + 12);
  ctx.fillStyle = 'rgba(247,252,255,.98)';
  ctx.font = compact ? '800 30px ui-sans-serif, system-ui' : '800 36px ui-sans-serif, system-ui';
  ctx.fillText(String(score), x + 14, y + (compact ? 29 : 31));
  ctx.fillStyle = 'rgba(238,246,255,.48)';
  ctx.font = '11px ui-sans-serif, system-ui';
  ctx.fillText(`рекорд ${best}`, x + 14, y + h - 34);
  ctx.fillStyle = chain > 0 ? 'rgba(255,218,148,.78)' : 'rgba(238,246,255,.38)';
  ctx.fillText(`серия ${chain}`, x + 14, y + h - 18);
  const label = difficulty.label || difficulty.name;
  drawPill(label, x + w - pillWidth(label) - 12, y + 12, 205, true);
  return { x, y, w, h };
}

function drawObjectivePanel(x, y, compact, avoidShip = true) {
  if (!objective || !target) return { x, y, w: 0, h: 0 };
  const margin = uiMargin();
  const shipW = compact ? (W < 460 ? 132 : 148) : 176;
  const shipX = W - shipW - margin;
  const maxByShip = avoidShip && shipX >= (compact ? 202 : 280) ? shipX - x - 10 : W - x * 2;
  const w = Math.max(0, Math.min(compact ? maxByShip : 424, W - x * 2));
  const h = compact ? (W < 430 ? 116 : 110) : 128;
  if (w < 184) return { x, y, w: 0, h: 0 };
  drawSoftPanel(x, y, w, h, 16, .60);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const codeW = drawPill(objective.code, x + 14, y + 13, target.hue, true);
  const titleX = x + 14 + codeW + 10;
  ctx.fillStyle = 'rgba(244,249,255,.93)';
  ctx.font = compact ? '600 13px ui-sans-serif, system-ui' : '600 15px ui-sans-serif, system-ui';
  fillFittedText(objective.title, titleX, y + 15, w - (titleX - x) - 14);

  ctx.fillStyle = 'rgba(238,246,255,.72)';
  ctx.font = compact ? '11px ui-sans-serif, system-ui' : '12px ui-sans-serif, system-ui';
  drawWrappedText(`Действие: ${objective.hint}`, x + 14, y + (compact ? 43 : 46), w - 28, compact ? 14 : 15, compact && W < 430 ? 2 : 1);

  ctx.fillStyle = 'rgba(170,228,255,.72)';
  ctx.font = '10px ui-sans-serif, system-ui';
  fillFittedText(objectiveSuccessText(objective), x + 14, y + (compact ? 68 : 68), w - 28);

  ctx.fillStyle = 'rgba(255,214,145,.70)';
  ctx.font = '10px ui-sans-serif, system-ui';
  fillFittedText(objectiveMetaText(objective), x + 14, y + (compact ? 84 : 86), w - 28);

  const d = worldDistanceToTarget();
  ctx.fillStyle = `hsla(${target.hue}, 94%, 78%, .66)`;
  ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  fillFittedText(`${routeText()} · ${labelOf(target)} · ${Math.round(d)} м · ${objectiveVerb(objective)}`, x + 14, y + h - 18, w - 28);
  return { x, y, w, h };
}

function drawShipPanel(compact) {
  const margin = uiMargin();
  const w = compact ? (W < 460 ? 132 : 148) : 176;
  const h = compact ? 122 : 136;
  const x = W - w - margin;
  const y = margin;
  if (x < (compact ? 202 : 280)) {
    if (!isMiniHudViewport()) return null;
    const miniW = Math.max(118, W - (margin * 2 + (W < 340 ? 172 : 184)));
    const miniX = W - margin - miniW;
    const miniH = 74;
    drawSoftPanel(miniX, y, miniW, miniH, 14, .48);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(149,228,255,.68)';
    ctx.font = '700 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx.fillText('КОРАБЛЬ', miniX + 10, y + 9);
    drawMiniMetric(miniX + 10, y + 25, miniW - 20, 'топл', player.fuel / player.maxFuel, 196);
    drawMiniMetric(miniX + 10, y + 41, miniW - 20, 'нагрев', player.heat, 18);
    drawMiniMetric(miniX + 10, y + 57, miniW - 20, 'нагр', player.stress || 0, 270);
    return { x: miniX, y, w: miniW, h: miniH };
  }
  drawSoftPanel(x, y, w, h, 16, .50);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(149,228,255,.68)';
  ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  ctx.fillText('КОРАБЛЬ', x + 12, y + 11);
  const bw = w - 24;
  drawMetricBar(x + 12, y + 30, bw, 'топливо', player.fuel / player.maxFuel, 196, `${Math.round(player.fuel)}%`);
  drawMetricBar(x + 12, y + 56, bw, 'нагрев', player.heat, 18, `${Math.round(player.heat * 100)}%`);
  drawMetricBar(x + 12, y + 82, bw, 'нагрузка', player.stress || 0, 270, `${Math.round((player.stress || 0) * 100)}%`);
  if (!compact) drawMetricBar(x + 12, y + 108, bw, 'инерция', player.driftCharge / 10, 255, `${Math.round(player.driftCharge * 10)}%`);
  return { x, y, w, h };
}

function drawStackedHint(text, bottom, panelW, panelH, alpha = .40) {
  const x = W / 2 - panelW / 2;
  const y = bottom - panelH;
  drawSoftPanel(x, y, panelW, panelH, 14, alpha);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(238,246,255,.72)';
  ctx.font = '600 12px ui-sans-serif, system-ui';
  drawWrappedText(text, x + 12, y + 9, panelW - 24, 15, panelH > 34 ? 2 : 1);
  return y;
}

function isCompactObjectiveMessage(text) {
  if (!objective || !text) return false;
  const normalized = String(text).trim().toLowerCase();
  const title = String(objective.title || '').trim().toLowerCase();
  const condition = String(objective.condition || '').trim().toLowerCase();
  return (title && normalized.startsWith(title)) || (condition && normalized.includes(condition));
}

function drawPlayHud() {
  const compact = W < 640 || H < 540;
  const safe = uiSafeArea();
  const margin = safe.margin;
  const scoreBox = drawScorePanel(margin, margin, compact);
  const shipBox = drawShipPanel(compact);
  const stackedMobile = compact && W < 520;
  const objY = stackedMobile
    ? Math.max(scoreBox.y + scoreBox.h, shipBox ? shipBox.y + shipBox.h : 0) + 8
    : scoreBox.y + scoreBox.h + (compact ? 8 : 10);
  let topClearY = Math.max(scoreBox.y + scoreBox.h, shipBox ? shipBox.y + shipBox.h : 0);
  if ((!compact || H > 500) && objY < H - (W < 560 ? 126 : 138)) {
    const objectiveBox = drawObjectivePanel(margin, objY, compact, !stackedMobile);
    if (objectiveBox && objectiveBox.w > 0) topClearY = Math.max(topClearY, objectiveBox.y + objectiveBox.h);
  }

  const quickButtons = quickButtonRects();
  const quickTop = quickButtons.length ? quickButtons[0].y - 6 : H;
  drawQuickButtons();
  if (navLayer) drawNavPanel();

  let hintBottom = quickTop - (W < 560 ? 16 : 18);
  if (gravityAdviceTime > 0 && gravityAdvice) {
    const w = Math.min(360, W - 36);
    hintBottom = drawStackedHint(gravityAdvice, hintBottom, w, 30, .38) - 8;
  }

  if (tutorialHintTime > 0 && tutorialHint) {
    const hintW = Math.min(W < 560 ? 286 : 340, W - 36);
    drawStackedHint(tutorialHint, hintBottom, hintW + 16, 46, .40);
  }

  return { topClearY: Math.max(topClearY, safe.topClearY), quickTop, safe };
}

function drawHud() {
  ctx.save();
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  const playHudLayout = state === 'play' && player ? drawPlayHud() : null;

  if (state === 'play' && message && messageTime > 0) {
    const a = clamp(messageTime, 0, 1);
    const narrow = W < 560;
    const shortMobile = narrow && H < 700;
    if (shortMobile && isCompactObjectiveMessage(message)) {
      ctx.restore();
      return;
    }
    const bannerH = narrow ? 30 : 36;
    const gap = narrow ? 12 : 18;
    const w = Math.min(narrow ? W - 32 : 520, W - 36);
    const y = narrow && playHudLayout ? playHudLayout.topClearY + 8 : 14;
    if (!playHudLayout || y + bannerH <= playHudLayout.quickTop - gap) {
      drawSoftPanel(W / 2 - w / 2, y, w, bannerH, 14, .35 + a * .14);
      ctx.textAlign = 'left';
      ctx.fillStyle = `rgba(238,246,255,${.34 + a * .58})`;
      ctx.font = `700 ${narrow ? 12 : 15}px ui-sans-serif, system-ui`;
      fillFittedText(message, W / 2 - w / 2 + 14, y + (narrow ? 8 : 10), w - 28);
    }
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
  const panelW = compact ? 258 : 326;
  const panelH = compact ? 164 : 232;
  const bottomReserve = state === 'play' ? (W < 560 ? 58 : 66) : 18;
  const x = W - panelW - uiMargin();
  const topClear = compact ? 142 : 164;
  const y = compact ? Math.max(topClear, H - panelH - bottomReserve) : Math.min(topClear, H - panelH - bottomReserve);

  ctx.save();
  ctx.globalAlpha = .98;
  drawSoftPanel(x, y, panelW, panelH, 14, .54);

  ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let yy = y + 13;
  const line = (k, v, hue = null) => {
    ctx.fillStyle = 'rgba(238,246,255,.34)';
    ctx.fillText(k, x + 14, yy);
    ctx.fillStyle = hue == null ? 'rgba(238,246,255,.78)' : `hsla(${hue},92%,78%,.82)`;
    fillFittedText(v, x + (compact ? 88 : 108), yy, panelW - (compact ? 104 : 124));
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
  const gap = short ? 6 : 8;
  const labels = short
    ? [ ['−', 'zoomOut'], ['+', 'zoomIn'], [soundOn ? 'зв' : 'тих', 'sound'], ['нав', 'nav'], ['G', 'gravity'], ['ц', 'route'], ['меню', 'menu'] ]
    : [ ['−', 'zoomOut'], ['+', 'zoomIn'], [soundOn ? 'звук' : 'тихо', 'sound'], [navLayer ? 'нав' : 'нав-', 'nav'], [gravityLayer ? 'поле' : 'поле-', 'gravity'], ['цель', 'route'], ['меню', 'menu'] ];
  const side = short ? 12 : 18;
  const w = short ? clamp(Math.floor((W - side * 2 - gap * (labels.length - 1)) / labels.length), 34, 40) : 60;
  const h = short ? 32 : 34;
  const y = H - h - (short ? 14 : 18);
  const total = labels.length * w + (labels.length - 1) * gap;
  let x = W - total - side;
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
  const first = buttons[0];
  const last = buttons[buttons.length - 1];
  drawSoftPanel(first.x - 6, first.y - 6, last.x + last.w - first.x + 12, first.h + 12, 17, .40);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const b of buttons) {
    const active = b.action === 'sound' ? soundOn : b.action === 'nav' ? navLayer : b.action === 'gravity' ? gravityLayer : true;
    const primary = b.action === 'zoomIn' || b.action === 'zoomOut' || b.action === 'route';
    const hue = b.action === 'gravity' ? 210 : (b.action === 'route' ? 48 : 196);
    ctx.fillStyle = active
      ? (primary ? `hsla(${hue},72%,44%,.18)` : 'rgba(9,24,45,.58)')
      : 'rgba(7,13,24,.42)';
    roundRect(b.x, b.y, b.w, b.h, 12);
    ctx.fill();
    ctx.strokeStyle = active ? `hsla(${hue},92%,74%,.34)` : 'rgba(148,226,255,.12)';
    ctx.lineWidth = 1;
    roundRect(b.x, b.y, b.w, b.h, 12);
    ctx.stroke();
    if (active && (b.action === 'sound' || b.action === 'nav' || b.action === 'gravity')) {
      ctx.fillStyle = `hsla(${hue},94%,72%,.76)`;
      roundRect(b.x + 8, b.y + b.h - 5, b.w - 16, 2, 1);
      ctx.fill();
    }
    ctx.fillStyle = active ? 'rgba(232,248,255,.88)' : 'rgba(224,244,255,.42)';
    ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx.fillText(fitText(b.label, b.w - 8), b.x + b.w / 2, b.y + b.h / 2 + .5);
  }
  ctx.restore();
}

function overlayMetrics(menu = state === 'menu') {
  const denseMenu = menu && W <= 568 && H <= 360;
  const narrow = W < 540;
  const maxH = Math.max(denseMenu ? 280 : 260, H - (denseMenu ? 16 : 24));
  const desiredH = menu ? (denseMenu ? H - 16 : (narrow ? 496 : 430)) : (narrow ? 326 : 292);
  const minH = menu ? (denseMenu ? 280 : (narrow ? 392 : 380)) : (narrow ? 286 : 264);
  const boxW = Math.min(menu ? (denseMenu ? W - 16 : (narrow ? W - 24 : 680)) : (narrow ? W - 28 : 540), W - (denseMenu ? 16 : 24));
  const boxH = clamp(desiredH, Math.min(minH, maxH), maxH);
  return { boxW, boxH, x: W / 2 - boxW / 2, y: H / 2 - boxH / 2 };
}

function menuLayout() {
  const m = overlayMetrics(true);
  const dense = W <= 568 && H <= 360;
  const narrow = W < 540 && !dense;
  const tight = dense || (narrow && m.boxH < 430);
  const pad = dense ? 16 : (narrow ? 18 : 24);
  const gap = dense ? 8 : (narrow ? 7 : 10);
  const rows = narrow ? DIFFICULTIES.length : 1;
  const cols = narrow ? 1 : DIFFICULTIES.length;
  const titleY = m.y + (dense ? 27 : (tight ? 30 : (narrow ? 38 : 42)));
  const subtitleY = m.y + (dense ? 51 : (tight ? 56 : (narrow ? 68 : 72)));
  const metaY = m.y + (dense ? 72 : (tight ? 82 : (narrow ? 98 : 104)));
  const cardsY = m.y + (dense ? 91 : (tight ? 104 : (narrow ? 124 : 140)));
  const controlsY = m.y + m.boxH - (dense ? 24 : (tight ? 24 : (narrow ? 28 : 24)));
  const startY = dense ? m.y + m.boxH - 43 : controlsY - (tight ? 50 : (narrow ? 56 : 54));
  const soundY = dense ? startY : startY - (tight ? 40 : (narrow ? 44 : 48));
  const cardMaxBottom = dense ? startY - 12 : soundY - (tight ? 8 : (narrow ? 12 : 18));
  const usable = m.boxW - pad * 2;
  const cardW = (usable - gap * (cols - 1)) / cols;
  const cardH = narrow
    ? clamp((cardMaxBottom - cardsY - gap * (rows - 1)) / rows, tight ? 30 : 42, 62)
    : clamp(cardMaxBottom - cardsY, dense ? 58 : 74, dense ? 70 : 88);
  return { ...m, narrow, dense, tight, pad, gap, rows, cols, titleY, subtitleY, metaY, cardsY, controlsY, startY, soundY, cardW, cardH };
}

function menuDifficultyRects() {
  const m = menuLayout();
  return DIFFICULTIES.map((d, i) => {
    const col = i % m.cols;
    const row = Math.floor(i / m.cols);
    return { x: m.x + m.pad + col * (m.cardW + m.gap), y: m.cardsY + row * (m.cardH + m.gap), w: m.cardW, h: m.cardH, index: i, d };
  });
}

function menuSoundRect() {
  const isMenu = state === 'menu';
  const m = isMenu ? menuLayout() : overlayMetrics(false);
  if (isMenu && m.dense) {
    const w = Math.min(148, (m.boxW - 56) * .42);
    const h = 32;
    return { x: W / 2 - w - 8, y: m.soundY, w, h };
  }
  const w = Math.min(isMenu ? 184 : 174, m.boxW - 48);
  const h = 34;
  return { x: W / 2 - w / 2, y: isMenu ? m.soundY : m.y + m.boxH - 88, w, h };
}

function menuStartRect() {
  const isMenu = state === 'menu';
  const m = isMenu ? menuLayout() : overlayMetrics(false);
  if (isMenu && m.dense) {
    const w = Math.min(172, (m.boxW - 56) * .48);
    const h = 34;
    return { x: W / 2 + 8, y: m.startY, w, h };
  }
  const w = Math.min(230, m.boxW - 56);
  const h = isMenu ? 42 : 40;
  return { x: W / 2 - w / 2, y: isMenu ? m.startY : m.y + m.boxH - 48, w, h };
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

function drawOverlayButton(r, label, primary = false, active = true) {
  const hue = primary ? 190 : 205;
  const grd = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
  grd.addColorStop(0, primary ? 'rgba(91, 224, 255, .24)' : (active ? 'rgba(22, 54, 86, .60)' : 'rgba(9, 14, 24, .58)'));
  grd.addColorStop(1, primary ? 'rgba(24, 116, 164, .20)' : (active ? 'rgba(8, 22, 40, .52)' : 'rgba(5, 8, 16, .44)'));
  ctx.fillStyle = grd;
  roundRect(r.x, r.y, r.w, r.h, Math.min(18, r.h / 2));
  ctx.fill();
  ctx.strokeStyle = primary ? 'rgba(151,235,255,.64)' : (active ? 'rgba(132,226,255,.34)' : 'rgba(132,226,255,.14)');
  ctx.lineWidth = primary ? 1.35 : 1;
  roundRect(r.x, r.y, r.w, r.h, Math.min(18, r.h / 2));
  ctx.stroke();
  ctx.fillStyle = primary ? `hsla(${hue}, 96%, 88%, .98)` : (active ? 'rgba(232,248,255,.88)' : 'rgba(232,248,255,.46)');
  ctx.font = primary ? '800 13px ui-sans-serif, system-ui' : '700 11px ui-sans-serif, system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fitText(label, r.w - 22), r.x + r.w / 2, r.y + r.h / 2 + .5);
}

function drawMenuControlChips(layout) {
  if (layout.dense) return;
  const labels = layout.narrow
    ? ['держи экран: тяга', 'два пальца: масштаб']
    : ['мышь/экран: тяга', 'R цель', 'G поле', 'N навигация'];
  const gap = layout.narrow ? 6 : 8;
  const h = 24;
  ctx.save();
  ctx.font = '700 10px ui-sans-serif, system-ui';
  const widths = labels.map(label => Math.min(layout.narrow ? 138 : 132, ctx.measureText(label).width + 22));
  const total = widths.reduce((sum, w) => sum + w, 0) + gap * (labels.length - 1);
  let x = W / 2 - total / 2;
  const y = layout.controlsY - (layout.narrow ? 4 : 2);
  for (let i = 0; i < labels.length; i++) {
    ctx.fillStyle = 'rgba(238,246,255,.055)';
    roundRect(x, y, widths[i], h, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(132,226,255,.16)';
    roundRect(x, y, widths[i], h, 12);
    ctx.stroke();
    ctx.fillStyle = 'rgba(238,246,255,.62)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fitText(labels[i], widths[i] - 14), x + widths[i] / 2, y + h / 2 + .5);
    x += widths[i] + gap;
  }
  ctx.restore();
}

function drawOverlay(title, subtitle, action) {
  const menu = state === 'menu';
  const m = menu ? menuLayout() : overlayMetrics(false);
  const { boxW, boxH, x, y } = m;
  const narrow = W < 540 && !m.dense;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const grd = ctx.createLinearGradient(x, y, x + boxW, y + boxH);
  grd.addColorStop(0, menu ? 'rgba(11, 28, 56, .94)' : 'rgba(18, 20, 35, .88)');
  grd.addColorStop(.58, menu ? 'rgba(4, 14, 32, .90)' : 'rgba(9, 13, 27, .80)');
  grd.addColorStop(1, menu ? 'rgba(1, 5, 15, .88)' : 'rgba(4, 6, 15, .72)');
  ctx.fillStyle = grd;
  roundRect(x, y, boxW, boxH, 22);
  ctx.fill();
  ctx.strokeStyle = menu ? 'rgba(158,229,255,.42)' : 'rgba(255,128,128,.22)';
  ctx.lineWidth = 1.25;
  roundRect(x, y, boxW, boxH, 22);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.055)';
  ctx.beginPath();
  ctx.moveTo(x + 22, y + 1);
  ctx.lineTo(x + boxW - 22, y + 1);
  ctx.stroke();

  ctx.fillStyle = 'rgba(248,252,255,.98)';
  ctx.font = menu ? `${Math.round((m.dense ? 24 : (narrow ? 30 : 36)) * uiScale)}px ui-sans-serif, system-ui` : `${Math.round((narrow ? 27 : 32) * uiScale)}px ui-sans-serif, system-ui`;
  ctx.fillText(fitText(title, boxW - 44), W / 2, menu ? m.titleY : y + 45);
  ctx.fillStyle = menu ? 'rgba(238,246,255,.80)' : 'rgba(238,246,255,.64)';
  ctx.font = `${m.dense ? 11 : (narrow ? 12 : 13)}px ui-sans-serif, system-ui`;
  ctx.fillText(fitText(subtitle, boxW - 48), W / 2, menu ? m.subtitleY : y + 76);

  if (menu) {
    ctx.fillStyle = 'rgba(169,222,255,.72)';
    ctx.font = `${m.dense ? 9 : 10}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.fillText('3 режима · поле / дальность / контроль', W / 2, m.metaY);

    for (const r of menuDifficultyRects()) {
      const active = r.index === difficultyIndex;
      const d = r.d;
      const card = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
      card.addColorStop(0, active ? 'rgba(30, 72, 118, .84)' : 'rgba(8, 23, 45, .66)');
      card.addColorStop(1, active ? 'rgba(8, 28, 56, .76)' : 'rgba(4, 12, 27, .56)');
      ctx.fillStyle = card;
      roundRect(r.x, r.y, r.w, r.h, m.dense ? 11 : 14);
      ctx.fill();
      ctx.strokeStyle = active ? 'rgba(154,235,255,.82)' : 'rgba(139,230,255,.22)';
      ctx.lineWidth = active ? 1.5 : 1;
      roundRect(r.x, r.y, r.w, r.h, m.dense ? 11 : 14);
      ctx.stroke();
      ctx.fillStyle = active ? 'rgba(132,226,255,.84)' : 'rgba(132,226,255,.28)';
      roundRect(r.x + 9, r.y + 9, 3, r.h - 18, 2);
      ctx.fill();

      ctx.textAlign = (narrow || m.dense) ? 'left' : 'center';
      const tx = (narrow || m.dense) ? r.x + 20 : r.x + r.w / 2;
      ctx.fillStyle = active ? 'rgba(248,252,255,.98)' : 'rgba(238,248,255,.86)';
      ctx.font = `${m.dense ? 12 : 13}px ui-sans-serif, system-ui`;
      ctx.fillText(fitText(`${d.label || d.name}`, (narrow || m.dense) ? r.w - 42 : r.w - 22), tx, r.y + (narrow ? (r.h < 38 ? 14 : 15) : (m.dense ? 17 : 18)));
      if (r.h >= 38) {
        ctx.fillStyle = active ? 'rgba(158,235,255,.92)' : 'rgba(132,226,255,.68)';
        ctx.font = '10px ui-sans-serif, system-ui';
        ctx.fillText(fitText(d.title, (narrow || m.dense) ? r.w - 40 : r.w - 22), tx, r.y + (narrow ? 31 : (m.dense ? 34 : 37)));
      }
      if (!narrow && !m.dense) {
        ctx.fillStyle = 'rgba(255,214,145,.68)';
        ctx.font = '9px ui-sans-serif, system-ui';
        ctx.fillText(fitText(`${d.riskText} · ${d.rewardText}`, r.w - 18), tx, r.y + r.h - 32);
        ctx.fillStyle = 'rgba(238,246,255,.54)';
        ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
        ctx.fillText(`поле ${fmtNum(d.gravity, 2)} · дальн. ${fmtNum(d.targetMax, 2)}`, tx, r.y + r.h - 16);
      } else if (narrow) {
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(238,246,255,.58)';
        ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
        ctx.fillText(`${d.name}`, r.x + r.w - 14, r.y + 15);
        if (r.h > 52) {
          ctx.fillStyle = 'rgba(255,214,145,.60)';
          ctx.font = '9px ui-sans-serif, system-ui';
          ctx.fillText(fitText(d.riskText, 90), r.x + r.w - 14, r.y + r.h - 14);
        }
      }
    }

    drawOverlayButton(menuSoundRect(), soundOn ? 'Звук включён' : 'Звук выключен', false, soundOn);
    drawOverlayButton(menuStartRect(), action, true, true);
    drawMenuControlChips(m);
  } else {
    const summaryY = y + (narrow ? 130 : 124);
    const scoreBoxW = Math.min(220, boxW - 72);
    drawSoftPanel(W / 2 - scoreBoxW / 2, summaryY - 36, scoreBoxW, 86, 16, .42);
    ctx.fillStyle = 'rgba(248,252,255,.94)';
    ctx.font = `${narrow ? 30 : 36}px ui-sans-serif, system-ui`;
    ctx.fillText(String(score), W / 2, summaryY);
    ctx.fillStyle = 'rgba(238,246,255,.50)';
    ctx.font = '11px ui-sans-serif, system-ui';
    ctx.fillText(`очков · рекорд ${best}`, W / 2, summaryY + 34);
    ctx.fillStyle = 'rgba(169,222,255,.58)';
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx.fillText(fitText(`${difficulty.label || difficulty.name} · карта ${mapCode}`, boxW - 64), W / 2, summaryY + 58);

    drawOverlayButton(menuSoundRect(), soundOn ? 'Звук включён' : 'Звук выключен', false, soundOn);
    drawOverlayButton(menuStartRect(), action, true, true);
  }
  ctx.restore();
}
