// Front-end screens: title with Start / Continue / Controls, pause menu, controls help, and the
// BUSTED / WASTED overlays. Screens only report a menu action; main.js applies it.
(function (SB) {
  'use strict';
  const F = SB.FIELD, P = SB.PALETTE, u = SB.u;

  const SC = SB.screens = { hit: [], selected: 0, hover: -1, prev: 'start' };

  function text(ctx, value, x, y, size, color, align, weight) {
    ctx.font = (weight || '') + ' ' + size + 'px ' + SB.FONT;
    ctx.fillStyle = color; ctx.textAlign = align || 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }
  function shade(ctx, alpha, color) {
    ctx.fillStyle = color || 'rgba(8,14,19,' + alpha + ')';
    ctx.fillRect(0, 0, F.width, F.height);
  }
  function items(w) {
    if (w.screen === 'start') {
      const list = [{ label: 'START NEW GAME', action: 'new' }];
      if (SC.hasSave()) list.push({ label: 'CONTINUE', action: 'continue' });
      list.push({ label: 'CONTROLS', action: 'controls' });
      return list;
    }
    if (w.screen === 'pause') return [
      { label: 'RESUME', action: 'resume' },
      { label: 'CONTROLS', action: 'controls' },
      { label: 'RESTART GAME', action: 'restart' },
      { label: 'QUIT TO TITLE', action: 'title' }
    ];
    return [];
  }
  function menu(ctx, w) {
    const list = items(w);
    SC.selected = u.clamp(SC.selected, 0, list.length - 1);
    SC.hit = [];
    const top = w.screen === 'pause' ? 330 : 388;
    for (let i = 0; i < list.length; i += 1) {
      const y = top + i * 54;
      const box = { x: F.width / 2 - 190, y: y - 32, w: 380, h: 46, action: list[i].action };
      SC.hit.push(box);
      const on = i === SC.selected, hovered = i === SC.hover && !on;
      ctx.fillStyle = on ? 'rgba(255,200,87,0.94)' : hovered ? 'rgba(255,200,87,0.55)' : 'rgba(18,32,39,0.78)';
      ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.strokeStyle = on || hovered ? '#fff0c9' : 'rgba(255,240,210,0.28)';
      ctx.lineWidth = 1.5; ctx.strokeRect(box.x + 1, box.y + 1, box.w - 2, box.h - 2);
      text(ctx, list[i].label, F.width / 2, y - 2, 21, on || hovered ? '#1a2529' : P.text, 'center', 'bold');
    }
  }

  SC.hasSave = function () { return SB.save.has(); };
  SC.clearSave = function () { SB.save.clear(); };

  SC.update = function (w, input) {
    const screen = w.screen;
    SC.hover = -1;
    if (screen === 'busted' || screen === 'wasted') {
      if (input.consume('Enter') || input.consume('Space') || input.mouse.click) return 'respawn';
      return null;
    }
    if (screen === 'controls') {
      if (input.consume('Escape') || input.consume('Enter') || input.consume('KeyC') || input.mouse.click) return 'back';
      return null;
    }
    const list = items(w);
    // One hit test per frame drives both the hover highlight and the click action.
    for (let i = 0; i < SC.hit.length; i += 1) {
      const box = SC.hit[i];
      if (input.mouse.x >= box.x && input.mouse.x <= box.x + box.w &&
        input.mouse.y >= box.y && input.mouse.y <= box.y + box.h) { SC.hover = i; break; }
    }
    // Consume both bindings even when one already matched, so no press leaks into the next frame.
    const upArrow = input.consume('ArrowUp'), upKey = input.consume('KeyW');
    const downArrow = input.consume('ArrowDown'), downKey = input.consume('KeyS');
    if (upArrow || upKey) SC.selected = (SC.selected + list.length - 1) % list.length;
    if (downArrow || downKey) SC.selected = (SC.selected + 1) % list.length;
    if (input.mouse.click && SC.hover >= 0) {
      SC.selected = SC.hover;
      return list[SC.hover].action;
    }
    if (input.consume('Enter') || input.consume('Space')) return list[SC.selected].action;
    return null;
  };

  SC.draw = function (ctx, w) {
    if (w.screen === 'play') return;
    SC.hit = [];
    if (w.screen === 'start') {
      shade(ctx, 0.42);
      const g = ctx.createLinearGradient(0, 0, 0, F.height);
      g.addColorStop(0, 'rgba(14,30,38,0.72)'); g.addColorStop(0.6, 'rgba(12,24,30,0.22)'); g.addColorStop(1, 'rgba(10,18,24,0.75)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, F.width, F.height);
      ctx.fillStyle = 'rgba(255,196,92,0.90)';
      ctx.beginPath(); ctx.arc(F.width - 190, 170, 62, 0, Math.PI * 2); ctx.fill();
      text(ctx, 'SOLARA BAY', F.width / 2, 216, 96, '#fff3d2', 'center', 'bold');
      ctx.fillStyle = P.gold; ctx.fillRect(F.width / 2 - 230, 240, 460, 3);
      text(ctx, 'A SUN-SOAKED OPEN WORLD.  NO RULES AFTER DARK.', F.width / 2, 275, 19, P.text, 'center');
      menu(ctx, w);
      text(ctx, '↑↓ choose   ·   ENTER confirm   ·   ESC pause in game', F.width / 2, 620, 15, P.muted, 'center');
      text(ctx, 'WASD walk & drive  ·  MOUSE aim & shoot  ·  E steal cars', F.width / 2, 650, 14, 'rgba(200,214,208,0.7)', 'center');
    } else if (w.screen === 'pause') {
      shade(ctx, 0.66);
      text(ctx, 'PAUSED', F.width / 2, 240, 70, '#fff3d2', 'center', 'bold');
      text(ctx, w.city.district(w.player.x, w.player.y) + '  ·  ' + u.money(w.money), F.width / 2, 278, 18, P.gold, 'center');
      menu(ctx, w);
      text(ctx, 'The city waits for you.', F.width / 2, 570, 16, P.muted, 'center');
    } else if (w.screen === 'controls') {
      shade(ctx, 0.90);
      text(ctx, 'CONTROLS', F.width / 2, 130, 58, '#fff3d2', 'center', 'bold');
      const lines = [
        ['W A S D / ARROWS', 'Walk and drive'],
        ['MOUSE', 'Aim and shoot (hold for repeat)'],
        ['RIGHT CLICK / F', 'Fists'],
        ['G', 'Holster or draw pistol'],
        ['E (HOLD)', 'Enter and hotwire the nearest car'],
        ['SPACE', 'Handbrake / drift'],
        ['SHIFT', 'Sprint on foot'],
        ['TAB', 'Start / skip the next job'],
        ['C', 'Show this help again'],
        ['M', 'Mute audio'],
        ['ESC', 'Pause']
      ];
      for (let i = 0; i < lines.length; i += 1) {
        const y = 186 + i * 42;
        text(ctx, lines[i][0], F.width / 2 - 50, y, 19, P.gold, 'right', 'bold');
        text(ctx, lines[i][1], F.width / 2 + 30, y, 18, P.text, 'left');
      }
      text(ctx, 'ENTER / ESC — back', F.width / 2, 662, 17, P.muted, 'center');
    } else if (w.screen === 'busted' || w.screen === 'wasted') {
      const busted = w.screen === 'busted';
      shade(ctx, 0.74, busted ? 'rgba(12,28,48,0.78)' : 'rgba(48,12,14,0.80)');
      text(ctx, busted ? 'BUSTED' : 'WASTED', F.width / 2, 302, 96, busted ? '#8fc4ff' : '#ff8b72', 'center', 'bold');
      text(ctx, busted ? 'The cops booked you.' : 'The street gave you back.', F.width / 2, 348, 22, P.text, 'center');
      text(ctx, 'BOOKING FEE  −' + u.money(w.lastLoss || 0), F.width / 2, 396, 20, P.gold, 'center', 'bold');
      text(ctx, 'Cash left  ' + u.money(w.money), F.width / 2, 428, 17, P.muted, 'center');
      text(ctx, 'PRESS ENTER TO RESPAWN', F.width / 2, 510, 22, '#fff3d2', 'center', 'bold');
    }
  };
})(window.SB = window.SB || {});
