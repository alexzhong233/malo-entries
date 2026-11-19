/* SOLARA BAY - health, money, wanted stars, objective and speedometer. */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});
  const U = SB.U;

  function panel(ctx, x, y, w, h, alpha) {
    ctx.fillStyle = 'rgba(24,26,38,' + (alpha === undefined ? 0.62 : alpha) + ')';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, 10) : ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,225,160,0.18)';
    ctx.lineWidth = 1; ctx.stroke();
  }
  function bar(ctx, x, y, w, h, pct, color) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color; ctx.fillRect(x + 1, y + 1, Math.max(0, (w - 2) * pct), h - 2);
    ctx.strokeStyle = 'rgba(255,245,220,0.3)'; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  const HUD = {
    draw: function (ctx, W, H, game) {
      const p = SB.Player.state;
      ctx.save();
      ctx.textBaseline = 'middle';

      panel(ctx, 22, 20, 246, 76);
      ctx.font = 'bold 11px Arial'; ctx.fillStyle = '#ffe0a0'; ctx.textAlign = 'left';
      ctx.fillText('HEALTH', 38, 39);
      bar(ctx, 38, 49, 148, 12, p.health / 100, p.health > 45 ? '#62d47a' : (p.health > 20 ? '#ffc14d' : '#ff5151'));
      ctx.font = 'bold 22px Arial'; ctx.fillStyle = '#ffe08a';
      ctx.fillText(U.money(game.cash), 38, 79);
      if (p.inCar) {
        const hp = Math.max(0, p.inCar.hp / p.inCar.maxHp);
        ctx.font = '10px Arial'; ctx.fillStyle = '#d8d4c8'; ctx.fillText('CAR', 197, 39);
        bar(ctx, 197, 49, 56, 12, hp, hp > 0.4 ? '#6ec7e8' : '#ff6b4d');
      }

      // Session timer, tucked in beside the cash readout.
      const secs = Math.max(0, Math.floor(game.elapsed || 0));
      const stamp = String(Math.floor(secs / 60)).padStart(2, '0') + ':' + String(secs % 60).padStart(2, '0');
      ctx.textAlign = 'right'; ctx.font = 'bold 11px Arial'; ctx.fillStyle = '#c9c3b2';
      ctx.fillText('TIME ' + stamp, 254, 79);

      // Wanted level.
      const wr = 5 * 26 + 34;
      panel(ctx, W - wr - 22, 20, wr, 52);
      ctx.textAlign = 'right'; ctx.font = 'bold 10px Arial'; ctx.fillStyle = '#ffe0a0';
      ctx.fillText('WANTED', W - 40, 33);
      for (let i = 0; i < 5; i++) {
        const x = W - wr - 4 + 26 * (i + 1) - 8, y = 55;
        U.starPath(ctx, x, y, 8.5, 3.8);
        ctx.fillStyle = i < SB.Police.wanted ? '#ffcb3c' : 'rgba(255,255,255,0.16)';
        ctx.fill();
        if (i < SB.Police.wanted) {
          ctx.strokeStyle = '#8b5714'; ctx.lineWidth = 1; ctx.stroke();
        }
      }
      if (SB.Police.wanted > 0 && SB.Police.evade > 3) {
        ctx.textAlign = 'center'; ctx.font = '11px Arial'; ctx.fillStyle = '#ffd87a';
        ctx.fillText('LOSING THEM...', W - wr / 2 - 22, 86);
      }

      // Objective card.
      const obj = SB.Missions.objective();
      const ow = 360;
      panel(ctx, (W - ow) / 2, 20, ow, obj ? 72 : 48, 0.7);
      ctx.textAlign = 'center';
      if (obj) {
        ctx.font = 'bold 12px Arial'; ctx.fillStyle = '#ffcf62';
        ctx.fillText('JOB ' + (SB.Missions.active.job + 1) + '/7  ·  ' + obj.job.toUpperCase(), W / 2, 37);
        ctx.font = 'bold 15px Arial'; ctx.fillStyle = '#fff6e2';
        ctx.fillText(obj.label, W / 2, 58);
        if (obj.timeLeft) {
          ctx.font = '12px Arial'; ctx.fillStyle = obj.timeLeft < 15 ? '#ff6b6b' : '#ffd78a';
          ctx.fillText(obj.timeLeft.toFixed(1) + 's LEFT', W / 2, 78);
        } else if (obj.hold > 0 || obj.stay > 0) {
          bar(ctx, W / 2 - 90, 76, 180, 8, obj.hold || obj.stay, '#ffc94d');
        }
      } else if (SB.Missions.index < 7) {
        ctx.font = 'bold 14px Arial'; ctx.fillStyle = '#fff1c9';
        ctx.fillText('PRESS J TO START: ' + SB.Missions.jobs[SB.Missions.index].name.toUpperCase(), W / 2, 38);
        ctx.font = '11px Arial'; ctx.fillStyle = '#c9bda2';
        ctx.fillText('Keys 1-7 choose any job · free roam the sun-soaked bay', W / 2, 56);
      } else {
        ctx.font = 'bold 14px Arial'; ctx.fillStyle = '#ffe08a';
        ctx.fillText('ALL SEVEN JOBS COMPLETE — THE SOLARA SCORE IS YOURS', W / 2, 44);
      }

      if (p.inCar) this.speedometer(ctx, W - 118, H - 128, p.inCar);

      // Bottom hint strip.
      ctx.textAlign = 'center'; ctx.font = '11px Arial'; ctx.fillStyle = 'rgba(255,246,226,0.68)';
      ctx.fillText('WASD drive/walk   E enter/exit   LMB shoot   TAB map zoom   C controls   ESC pause   M mute', W / 2, H - 18);

      if (p.health < 30) {
        const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.24, W / 2, H / 2, H * 0.75);
        g.addColorStop(0, 'rgba(180,0,0,0)'); g.addColorStop(1, 'rgba(170,0,0,0.32)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }

      // Crosshair.
      const mx = SB.Input.mouse.x, my = SB.Input.mouse.y;
      ctx.strokeStyle = 'rgba(255,245,210,0.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(mx - 10, my); ctx.lineTo(mx - 3, my);
      ctx.moveTo(mx + 3, my); ctx.lineTo(mx + 10, my);
      ctx.moveTo(mx, my - 10); ctx.lineTo(mx, my - 3);
      ctx.moveTo(mx, my + 3); ctx.lineTo(mx, my + 10);
      ctx.stroke();
      ctx.restore();
    },

    speedometer: function (ctx, cx, cy, car) {
      const mph = Math.round(Math.abs(car.vx * Math.cos(car.a) + car.vy * Math.sin(car.a)) * 0.42);
      ctx.save();
      ctx.fillStyle = 'rgba(20,23,34,0.68)';
      ctx.beginPath(); ctx.arc(cx, cy, 60, 0, U.TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,225,160,0.28)'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(cx, cy, 50, Math.PI * 0.75, Math.PI * 2.25); ctx.stroke();
      ctx.strokeStyle = '#ffcf57'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(cx, cy, 50, Math.PI * 0.75,
        Math.PI * 0.75 + Math.PI * 1.5 * U.clamp(mph / 145, 0, 1)); ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff4d6'; ctx.font = 'bold 30px Arial';
      ctx.fillText(String(mph), cx, cy - 5);
      ctx.font = 'bold 10px Arial'; ctx.fillStyle = '#d5c9ac';
      ctx.fillText('MPH', cx, cy + 19);
      ctx.restore();
    }
  };

  SB.HUD = HUD;
})();
