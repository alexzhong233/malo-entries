(function (SB) {
  'use strict';

  var CFG = SB.CFG, U = SB.U, C = SB.CFG.COLORS;
  var sessionWorld = null, sessionStart = 0;

  function sessionLabel(world) {
    if (sessionWorld !== world) { sessionWorld = world; sessionStart = 0; }
    if (!sessionStart && world.state === 'playing') sessionStart = Date.now();
    var secs = sessionStart ? Math.max(0, Math.floor((Date.now() - sessionStart) / 1000)) : 0;
    var mm = Math.floor(secs / 60), ss = secs % 60;
    return (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
  }

  function panel(ctx, x, y, w, h, alpha) {
    ctx.fillStyle = 'rgba(15,22,32,' + (alpha === undefined ? 0.72 : alpha) + ')';
    U.roundRect(ctx, x, y, w, h, 9); ctx.fill();
    ctx.strokeStyle = 'rgba(255,226,160,0.28)'; ctx.lineWidth = 1;
    U.roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 9); ctx.stroke();
  }

  function text(ctx, str, x, y, size, color, weight, align) {
    ctx.font = (weight || 'bold') + ' ' + size + 'px "Trebuchet MS", Arial, sans-serif';
    ctx.fillStyle = color || C.hud;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(str, x, y);
  }

  function star(ctx, x, y, r, lit) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5;
      var rr = i % 2 ? r * 0.46 : r;
      var px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    if (lit) {
      ctx.fillStyle = '#ffd45e'; ctx.fill();
      ctx.strokeStyle = '#8b5c1d'; ctx.lineWidth = 1.4; ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(255,230,170,0.34)'; ctx.lineWidth = 1.4; ctx.stroke();
    }
  }

  function wanted(ctx, world, W) {
    var x = W - 214, y = 22;
    panel(ctx, x, y, 194, 34, 0.68);
    for (var i = 0; i < 5; i++) star(ctx, x + 22 + i * 34, y + 17, 11, i < world.wanted);
    if (world.heat > 0 && world.wanted > 0) {
      ctx.fillStyle = 'rgba(255,212,94,0.85)';
      ctx.fillRect(x + 16, y + 29, 162 * (world.heat / 100), 2);
    }
  }

  function missionPanel(ctx, world) {
    var m = world.mission, d = world.dialog;
    if (m || d || world.missionPrompt) panel(ctx, 20, 20, 395, 104, 0.74);
    if (m && d) {
      var def = SB.Missions.JOBS[m.index], st = def.stages[m.stage];
      text(ctx, def.name, 36, 32, 16, C.gold);
      text(ctx, st.text, 36, 55, 14, C.hud, 'normal');
      var extra = '';
      if (st.type === 'wait') extra = 'HOLD POSITION  ' + Math.max(0, st.time - m.stageElapsed).toFixed(1) + 's';
      else if (st.type === 'shoot') extra = 'TARGETS  ' + m.hits + ' / ' + st.count;
      else if (st.type === 'escape') extra = 'LOSS PROGRESS  ' + Math.min(100, Math.floor(m.escapeTimer / 4 * 100)) + '%';
      else if (st.type === 'drive') extra = 'STAY IN THE CAR';
      if (extra) text(ctx, extra, 36, 82, 12, '#9cf0c0');
    } else if (d) {
      text(ctx, d.speaker.toUpperCase(), 36, 32, 15, C.gold);
      text(ctx, d.text, 36, 55, 13, C.hud, 'normal');
    } else if (world.missionPrompt && !m) {
      text(ctx, 'NEW JOB AVAILABLE', 36, 32, 15, C.gold);
      text(ctx, SB.Missions.JOBS[world.missionIndex].name, 36, 56, 18, C.hud);
      text(ctx, 'Press F to accept', 36, 83, 13, '#9cf0c0', 'normal');
    }
  }

  function vitals(ctx, world, W, H) {
    var p = world.player;
    panel(ctx, 20, H - 98, 260, 78, 0.72);
    text(ctx, 'HEALTH', 36, H - 88, 11, 'rgba(255,255,255,0.65)');
    text(ctx, 'SESSION ' + sessionLabel(world), 258, H - 88, 10, 'rgba(255,255,255,0.65)', 'bold', 'right');
    var hp = U.clamp(p.health / CFG.PLAYER.MAX_HEALTH, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    U.roundRect(ctx, 36, H - 70, 222, 13, 6); ctx.fill();
    ctx.fillStyle = hp > 0.5 ? '#68d391' : (hp > 0.25 ? '#f6c85f' : '#ff5d55');
    U.roundRect(ctx, 36, H - 70, Math.max(3, 222 * hp), 13, 6); ctx.fill();
    text(ctx, U.cash(world.cash), 36, H - 48, 22, C.gold);
    text(ctx, 'CASH', 164, H - 43, 11, 'rgba(255,255,255,0.6)');
    if (SB.Audio.isMuted()) text(ctx, 'MUTED', 216, H - 43, 10, '#ff9b90');
  }

  function speedo(ctx, world, W, H) {
    var p = world.player;
    if (!p.car) return;
    var car = p.car, x = W - 214, y = H - 130;
    panel(ctx, x, y, 194, 110, 0.7);
    var kmh = Math.round(Math.abs(car.speed) * 0.62);
    text(ctx, String(kmh), x + 96, y + 18, 42, C.hud, 'bold', 'center');
    text(ctx, 'KM/H', x + 96, y + 66, 11, 'rgba(255,255,255,0.65)', 'bold', 'center');
    var ratio = U.clamp(Math.abs(car.speed) / car.maxSpeed, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    U.roundRect(ctx, x + 18, y + 84, 158, 8, 4); ctx.fill();
    ctx.fillStyle = ratio > 0.85 ? '#ff7b62' : '#6bd3e6';
    U.roundRect(ctx, x + 18, y + 84, Math.max(2, 158 * ratio), 8, 4); ctx.fill();
    text(ctx, car.health < 60 ? 'DAMAGED ' + Math.floor(car.health) + '%' : car.type.toUpperCase(),
      x + 96, y + 96, 10, car.health < 60 ? '#ff7b62' : 'rgba(255,255,255,0.6)', 'bold', 'center');
  }

  function clockPanel(ctx, world, W) {
    var x = W * 0.5 - 78;
    panel(ctx, x, 20, 156, 32, 0.58);
    text(ctx, U.clock(world.clock), x + 78, 28, 15, C.hud, 'bold', 'center');
  }

  function notices(ctx, world, W, H) {
    for (var i = 0; i < world.notifications.length; i++) {
      var n = world.notifications[i];
      var a = Math.min(1, (n.life - n.t) * 2, n.t * 5);
      ctx.globalAlpha = U.clamp(a, 0, 1);
      text(ctx, n.text, W * 0.5, H - 168 - i * 26, 14, n.color, 'bold', 'center');
      ctx.globalAlpha = 1;
    }
    if (world.banner) {
      var b = world.banner;
      var bi = Math.min(1, b.t * 3), bo = Math.min(1, (b.life - b.t) * 2);
      ctx.globalAlpha = Math.min(bi, bo);
      panel(ctx, W * 0.5 - 235, 96, 470, 88, 0.86);
      text(ctx, b.title, W * 0.5, 112, 28, C.gold, 'bold', 'center');
      text(ctx, b.sub, W * 0.5, 150, 15, C.hud, 'bold', 'center');
      ctx.globalAlpha = 1;
    }
  }

  function draw(ctx, world) {
    var W = SB.view.w, H = SB.view.h;
    if (world.state === 'start') return;
    ctx.save();
    ctx.setTransform(SB.view.dpr, 0, 0, SB.view.dpr, 0, 0);
    clockPanel(ctx, world, W);
    missionPanel(ctx, world);
    wanted(ctx, world, W);
    vitals(ctx, world, W, H);
    speedo(ctx, world, W, H);
    notices(ctx, world, W, H);
    text(ctx, 'WASD MOVE   E CAR   CLICK SHOOT   TAB MAP   C CONTROLS   ESC PAUSE',
      W * 0.5, H - 24, 10, 'rgba(255,255,255,0.5)', 'normal', 'center');
    ctx.restore();
  }

  SB.HUD = { draw: draw, panel: panel, text: text, star: star };
})(window.SB = window.SB || {});
