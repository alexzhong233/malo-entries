// The in-play HUD: money, health, wanted stars, clock, objective, weapon, car damage, hotwire
// progress and the dialog/status banner. Everything is screen-space and readable at small sizes.
(function (SB) {
  'use strict';
  const F = SB.FIELD, P = SB.PALETTE, u = SB.u;

  function label(ctx, text, x, y, size, color, align, weight) {
    ctx.font = (weight || '') + ' ' + size + 'px ' + SB.FONT;
    ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x, y);
  }
  function bar(ctx, x, y, w, h, ratio, color) {
    ctx.fillStyle = 'rgba(8,16,20,0.65)'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color; ctx.fillRect(x, y, Math.max(0, w * u.clamp(ratio, 0, 1)), h);
  }

  SB.hud = {
    draw: function (ctx, w) {
      const p = w.player;
      ctx.fillStyle = P.panel; ctx.fillRect(18, 18, 286, 104);
      ctx.strokeStyle = 'rgba(255,236,200,0.22)'; ctx.lineWidth = 1; ctx.strokeRect(18.5, 18.5, 285, 103);
      label(ctx, u.money(w.money), 32, 58, 30, P.gold, 'left', 'bold');
      label(ctx, u.clock(w.clock), 290, 43, 15, P.muted, 'right');
      label(ctx, w.wanted ? 'WANTED' : 'CLEAN', 290, 62, 12, w.wanted ? P.red : P.muted, 'right', 'bold');
      const hpColor = p.health < 35 ? P.red : p.health < 65 ? P.gold : P.green;
      bar(ctx, 32, 70, 174, 11, p.health / SB.PLAYER.maxHealth, hpColor);
      label(ctx, 'HP ' + Math.max(0, Math.ceil(p.health)), 216, 81, 13, hpColor, 'left');
      let stars = '';
      for (let i = 0; i < 5; i += 1) stars += i < w.wanted ? '★' : '☆';
      if (w.wanted) { ctx.shadowColor = P.gold; ctx.shadowBlur = 8; }
      label(ctx, stars, 32, 110, 19, P.gold, 'left');
      ctx.shadowBlur = 0;

      // Objective strip.
      ctx.fillStyle = 'rgba(15,26,33,0.68)';
      ctx.fillRect(F.width / 2 - 330, 18, 660, 38);
      label(ctx, w.objective || '', F.width / 2, 43, 18, P.text, 'center', 'bold');

      // Dialog / status banner.
      if (w.banner.time > 0) {
        const alpha = u.clamp(w.banner.time, 0, 1);
        ctx.globalAlpha = alpha;
        const width = Math.min(760, Math.max(340, w.banner.text.length * 9.4 + 40));
        ctx.fillStyle = P.panelLight;
        ctx.fillRect(F.width / 2 - width / 2, 150, width, w.banner.sub ? 66 : 46);
        ctx.fillStyle = P.gold; ctx.fillRect(F.width / 2 - width / 2, 150, 5, w.banner.sub ? 66 : 46);
        label(ctx, w.banner.text.slice(0, 82), F.width / 2, 178, 18, P.text, 'center');
        if (w.banner.sub) label(ctx, w.banner.sub.slice(0, 90), F.width / 2, 202, 14, P.muted, 'center');
        ctx.globalAlpha = 1;
      }

      // Bottom-left: weapon and vehicle state.
      ctx.fillStyle = P.panel; ctx.fillRect(18, F.height - 86, 286, 68);
      label(ctx, p.inCar ? p.inCar.type.toUpperCase() : (p.gun ? 'PISTOL' : 'FISTS'),
        32, F.height - 58, 20, P.text, 'left', 'bold');
      const hint = p.inCar ? 'SPACE handbrake  ·  E exit'
        : p.gun ? p.ammo + ' rounds  ·  G holster' : 'Right-click to punch  ·  G pistol';
      label(ctx, hint, 32, F.height - 36, 13,
        !p.inCar && p.gun && p.ammo <= 6 ? P.red : P.muted, 'left'); // low ammo warns at a glance
      if (p.inCar) {
        bar(ctx, 196, F.height - 62, 94, 8, p.inCar.health / p.inCar.maxHealth, P.teal);
        label(ctx, 'CAR', 196, F.height - 72, 12, P.muted, 'left');
      }
      if (p.hotwire > 0) {
        const bw = 230, bx = F.width / 2 - bw / 2, by = F.height - 120;
        label(ctx, 'HOTWIRING — HOLD E', F.width / 2, by - 10, 16, P.gold, 'center', 'bold');
        bar(ctx, bx, by, bw, 13, p.hotwire, P.gold);
      }
      if (w.unseen > 0 && w.wanted > 0) {
        label(ctx, 'LOSING THEM ' + Math.ceil(SB.POLICE.decayTime - w.unseen) + 's',
          F.width - 232, F.height - 34, 14, P.muted, 'right');
      }
    }
  };
})(window.SB = window.SB || {});
