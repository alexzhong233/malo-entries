(function (SB) {
  'use strict';

  var U = SB.U, HUD = SB.HUD;
  var activeButtons = [];

  function setMenu(world, count) {
    var I = SB.Input;
    if (I.just('ArrowUp') || I.just('KeyW')) world.menuIndex = (world.menuIndex + count - 1) % count;
    if (I.just('ArrowDown') || I.just('KeyS')) world.menuIndex = (world.menuIndex + 1) % count;
    return world.menuIndex;
  }

  function button(ctx, world, label, x, y, w, h, index, disabled, action) {
    var I = SB.Input;
    var hover = I.mouse.x >= x && I.mouse.x <= x + w && I.mouse.y >= y && I.mouse.y <= y + h;
    var selected = world.menuIndex === index || hover;
    activeButtons.push({ x: x, y: y, w: w, h: h, action: action, disabled: disabled });
    ctx.fillStyle = disabled ? 'rgba(40,48,58,0.6)' :
      (selected ? 'rgba(255,212,94,0.94)' : 'rgba(16,26,38,0.82)');
    U.roundRect(ctx, x, y, w, h, 6); ctx.fill();
    ctx.strokeStyle = selected ? '#fff3d2' : 'rgba(255,226,160,0.45)';
    ctx.lineWidth = selected ? 2 : 1;
    U.roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 6); ctx.stroke();
    HUD.text(ctx, label, x + w * 0.5, y + h * 0.5 - 9, 17,
      disabled ? 'rgba(255,255,255,0.35)' : (selected ? '#1c2430' : '#fff0d0'), 'bold', 'center');
    if (selected && !disabled && I.just('Enter')) { action(); return true; }
    return false;
  }

  function handleClicks() {
    var I = SB.Input;
    if (!I.mouse.justDown) return;
    for (var i = 0; i < activeButtons.length; i++) {
      var b = activeButtons[i];
      if (b.disabled) continue;
      if (I.mouse.x >= b.x && I.mouse.x <= b.x + b.w && I.mouse.y >= b.y && I.mouse.y <= b.y + b.h) {
        b.action(); return;
      }
    }
  }

  function backdrop(ctx, W, H, alpha) {
    ctx.fillStyle = 'rgba(5,12,22,' + (alpha === undefined ? 0.72 : alpha) + ')';
    ctx.fillRect(0, 0, W, H);
  }

  function drawTitle(ctx, W, H) {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(8,22,42,0.82)');
    g.addColorStop(0.5, 'rgba(12,32,52,0.5)');
    g.addColorStop(1, 'rgba(4,10,20,0.92)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    var sunX = W * 0.72, sunY = H * 0.3;
    var sg = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 240);
    sg.addColorStop(0, 'rgba(255,214,130,0.4)');
    sg.addColorStop(1, 'rgba(255,174,90,0)');
    ctx.fillStyle = sg; ctx.fillRect(sunX - 250, sunY - 250, 500, 500);

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
    HUD.text(ctx, 'SOLARA', W * 0.5, H * 0.17, Math.min(96, W / 11), '#ffd45e', 'bold', 'center');
    HUD.text(ctx, 'BAY', W * 0.5, H * 0.17 + Math.min(96, W / 11) * 0.78,
      Math.min(116, W / 9.2), '#fff4dc', 'bold', 'center');
    ctx.restore();
    HUD.text(ctx, 'SUN. SPEED. SEVEN SCORES.', W * 0.5, H * 0.47, 16, '#bfe6e4', 'bold', 'center');
  }

  function start(ctx, world, W, H) {
    drawTitle(ctx, W, H);
    activeButtons = [];
    var sel = setMenu(world, 3);
    var bx = W * 0.5 - 135, by = H * 0.56;
    button(ctx, world, 'NEW GAME', bx, by, 270, 44, 0, false, function () { SB.Game.newGame(); });
    button(ctx, world, 'CONTINUE  ' + (SB.Save.has() ? '' : '(NO SAVE)'), bx, by + 54, 270, 44, 1, !SB.Save.has(), function () { SB.Game.continueGame(); });
    button(ctx, world, 'CONTROLS', bx, by + 108, 270, 44, 2, false, function () { SB.Game.showControls('start'); });
    HUD.text(ctx, SB.Save.describe(), W * 0.5, H - 84, 12, 'rgba(255,255,255,0.6)', 'normal', 'center');
    HUD.text(ctx, 'W / S SELECT     ENTER CONFIRM     CLICK TO CHOOSE', W * 0.5, H - 52,
      11, 'rgba(255,255,255,0.45)', 'normal', 'center');
    handleClicks();
    if (sel !== world.menuIndex && SB.Audio.isReady()) SB.Audio.ui();
  }

  function controls(ctx, world, W, H) {
    backdrop(ctx, W, H, 0.85);
    var pw = Math.min(680, W - 80), ph = 470, x = (W - pw) / 2, y = (H - ph) / 2;
    HUD.panel(ctx, x, y, pw, ph, 0.88);
    HUD.text(ctx, 'CONTROLS', x + 32, y + 28, 28, '#ffd45e');
    var lines = [
      ['W A S D', 'Walk on foot / accelerate and steer in a car'],
      ['MOUSE', 'Aim your pistol'],
      ['LEFT CLICK', 'Fire (drive-by shooting works too)'],
      ['E', 'Enter / exit the nearest car, interact with a job marker'],
      ['F', 'Accept a new job when standing on its gold marker'],
      ['SPACE', 'Handbrake — slide around corners'],
      ['SHIFT', 'Floor it'],
      ['TAB', 'Zoom the minimap in and out'],
      ['C', 'This controls sheet'],
      ['ESC', 'Pause / resume']
    ];
    for (var i = 0; i < lines.length; i++) {
      var ly = y + 82 + i * 34;
      HUD.text(ctx, lines[i][0], x + 34, ly, 14, '#8fe4d5');
      HUD.text(ctx, lines[i][1], x + 184, ly, 14, '#f4efe2', 'normal');
    }
    HUD.text(ctx, 'Press C or ESC to go back', x + pw * 0.5, y + ph - 36, 12,
      'rgba(255,255,255,0.6)', 'normal', 'center');
    if (SB.Input.just('KeyC') || SB.Input.just('Escape')) SB.Game.closeControls();
  }

  function pause(ctx, world, W, H) {
    backdrop(ctx, W, H, 0.66);
    activeButtons = [];
    HUD.text(ctx, 'PAUSED', W * 0.5, H * 0.24, 52, '#ffd45e', 'bold', 'center');
    HUD.text(ctx, 'SOLARA BAY  •  ' + U.cash(world.cash) + '  •  JOB ' +
      Math.min(7, world.missionIndex + 1) + ' / 7', W * 0.5, H * 0.34, 15, '#dfe9e6', 'normal', 'center');
    setMenu(world, 3);
    var bx = W * 0.5 - 130, by = H * 0.44;
    button(ctx, world, 'RESUME', bx, by, 260, 44, 0, false, function () { SB.Game.resume(); });
    button(ctx, world, 'SAVE GAME', bx, by + 54, 260, 44, 1, false, function () {
      SB.Save.write(world); SB.World.notify(world, 'GAME SAVED', '#9cf0c0', 2); SB.Audio.ui();
    });
    button(ctx, world, 'CONTROLS', bx, by + 108, 260, 44, 2, false, function () { SB.Game.showControls('pause'); });
    handleClicks();
  }

  function gameover(ctx, world, W, H) {
    backdrop(ctx, W, H, 0.76);
    activeButtons = [];
    HUD.text(ctx, 'BUSTED', W * 0.5, H * 0.25, 60, '#ff6b5e', 'bold', 'center');
    HUD.text(ctx, 'The city always finds you eventually.', W * 0.5, H * 0.36, 15, '#e8e2d6', 'normal', 'center');
    HUD.text(ctx, 'CARS JACKED ' + world.stats.stolen + '     JOBS DONE ' + world.stats.jobs +
      '     SHOTS ' + world.stats.shots, W * 0.5, H * 0.43, 13, '#a9c5c4', 'normal', 'center');
    setMenu(world, 2);
    var bx = W * 0.5 - 130, by = H * 0.53;
    button(ctx, world, 'RESPawn at boardwalk'.toUpperCase(), bx, by, 260, 44, 0, false, function () { SB.Game.respawn(); });
    button(ctx, world, 'NEW GAME', bx, by + 54, 260, 44, 1, false, function () { SB.Game.newGame(); });
    handleClicks();
  }

  function draw(ctx, world) {
    var W = SB.view.w, H = SB.view.h;
    ctx.save();
    ctx.setTransform(SB.view.dpr, 0, 0, SB.view.dpr, 0, 0);
    if (world.state === 'start') start(ctx, world, W, H);
    else if (world.state === 'controls') controls(ctx, world, W, H);
    else if (world.state === 'paused') pause(ctx, world, W, H);
    else if (world.state === 'gameover') gameover(ctx, world, W, H);
    else activeButtons = [];
    ctx.restore();
  }

  SB.Screens = { draw: draw };
})(window.SB = window.SB || {});
