/* SOLARA BAY - camera, layered world drawing, lighting and screen overlays. */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});
  const C = SB.C, U = SB.U;
  const TAU = U.TAU;

  const cam = { x: C.ROAD_X[4], y: C.ROAD_Y[6], ready: false };

  function nightAmount() {
    const phase = (SB.World.time % C.DAY_LENGTH) / C.DAY_LENGTH;
    // Bright from roughly 08:00 to 19:00, deep blue after midnight.
    if (phase < 0.16) return U.lerp(0.62, 0.18, phase / 0.16);
    if (phase < 0.28) return U.lerp(0.18, 0, (phase - 0.16) / 0.12);
    if (phase < 0.72) return 0;
    if (phase < 0.86) return U.lerp(0, 0.4, (phase - 0.72) / 0.14);
    return U.lerp(0.4, 0.62, (phase - 0.86) / 0.14);
  }

  function drawPalm(ctx, t, time) {
    ctx.save();
    ctx.translate(t.x, t.y);
    const sway = Math.sin(time * 1.4 + t.x * 0.02) * 0.09;
    ctx.fillStyle = 'rgba(60,45,30,0.22)';
    ctx.beginPath(); ctx.ellipse(11, 13, t.r * 0.95, t.r * 0.42, 0.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#8a6241'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 5); ctx.quadraticCurveTo(sway * 26, -t.r * 0.6, sway * 38, -t.r); ctx.stroke();
    ctx.translate(sway * 38, -t.r);
    ctx.fillStyle = '#4b7d3a';
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * TAU + sway;
      ctx.save(); ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(t.r * 0.65, -t.r * 0.5, t.r * 1.2, -t.r * 0.06);
      ctx.quadraticCurveTo(t.r * 0.62, t.r * 0.12, 0, 0);
      ctx.fill(); ctx.restore();
    }
    ctx.fillStyle = '#7aa550';
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#6b4a32';
    ctx.beginPath(); ctx.arc(4, 3, 2.5, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawTree(ctx, t) {
    ctx.save();
    ctx.fillStyle = 'rgba(30,50,25,0.22)';
    ctx.beginPath(); ctx.ellipse(t.r * 0.4, t.r * 0.5, t.r, t.r * 0.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3d6f3a';
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#609d4b';
    ctx.beginPath(); ctx.arc(t.x - t.r * 0.2, t.y - t.r * 0.2, t.r * 0.75, 0, TAU); ctx.fill();
    ctx.fillStyle = '#86bc64';
    ctx.beginPath(); ctx.arc(t.x - t.r * 0.32, t.y - t.r * 0.3, t.r * 0.4, 0, TAU); ctx.fill();
    ctx.restore();
  }

  const Render = {
    cam: cam,
    canvas: null,
    ctx: null,

    init: function (canvas, ctx) { this.canvas = canvas; this.ctx = ctx; },

    screenToWorld: function (sx, sy) {
      return { x: cam.x + sx - this.canvas.width / 2, y: cam.y + sy - this.canvas.height / 2 };
    },

    updateCamera: function (dt, p) {
      const car = p.inCar;
      const vx = car ? car.vx : 0, vy = car ? car.vy : 0;
      const tx = (car ? car.x : p.x) + vx * 0.34;
      const ty = (car ? car.y : p.y) + vy * 0.34;
      if (!cam.ready) { cam.x = tx; cam.y = ty; cam.ready = true; }
      const k = 1 - Math.exp(-dt * 4.2);
      cam.x = U.lerp(cam.x, tx, k);
      cam.y = U.lerp(cam.y, ty, k);
      cam.x = U.clamp(cam.x, 260, C.WORLD - 260);
      cam.y = U.clamp(cam.y, 260, C.WORLD - 260);
    },

    draw: function (game) {
      const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
      const time = SB.World.time;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#d9c39a';
      ctx.fillRect(0, 0, W, H);
      const shake = SB.Effects.shakeOffset();
      ctx.save();
      ctx.translate(Math.round(W / 2 - cam.x + shake.x), Math.round(H / 2 - cam.y + shake.y));
      const l = cam.x - W / 2 - 100, r = cam.x + W / 2 + 100;
      const t = cam.y - H / 2 - 100, b = cam.y + H / 2 + 100;
      const vis = function (x, y, w, h) { return x + w > l && x < r && y + h > t && y < b; };

      this.drawWater(ctx, l, r, t, b, time);
      this.drawBlocks(ctx, vis);
      this.drawRoads(ctx, l, r, t, b, time);
      this.drawPark(ctx, time, vis);
      this.drawPiers(ctx, vis);
      SB.Effects.drawMarks(ctx);
      this.drawBuildings(ctx, vis);
      this.drawScenery(ctx, vis, time);
      const night = nightAmount();
      SB.Vehicles.draw(ctx, night > 0.22);
      SB.Police.draw(ctx);
      SB.Player.draw(ctx);
      SB.Combat.draw(ctx);
      SB.Missions.drawMarker(ctx, time);
      SB.Effects.drawParticles(ctx);
      ctx.restore();

      if (night > 0.01) {
        ctx.fillStyle = 'rgba(18,28,72,' + night * 0.72 + ')';
        ctx.fillRect(0, 0, W, H);
      }
      const phase = (time % C.DAY_LENGTH) / C.DAY_LENGTH;
      if (phase > 0.68 && phase < 0.86) {
        ctx.fillStyle = 'rgba(255,126,54,' + (0.13 * (1 - Math.abs(phase - 0.77) / 0.09)) + ')';
        ctx.fillRect(0, 0, W, H);
      }
      SB.HUD.draw(ctx, W, H, game);
      SB.Minimap.draw(ctx, W, H, time);
      SB.Screens.draw(ctx, W, H, game);
    },

    drawWater: function (ctx, l, r, t, b, time) {
      const g = ctx.createLinearGradient(l, 0, Math.min(r, 1000), 0);
      g.addColorStop(0, '#057f9b'); g.addColorStop(0.6, C.COL.water); g.addColorStop(1, '#71e2d7');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(l, t);
      for (let y = t; y <= b + 40; y += 30) ctx.lineTo(SB.World.shore(y), y);
      ctx.lineTo(l, b + 40); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#0ba6b6';
      ctx.fillRect(l, C.INLET_Y0, C.INLET_X - l, C.INLET_Y1 - C.INLET_Y0);
      ctx.strokeStyle = 'rgba(220,255,247,0.4)'; ctx.lineWidth = 2;
      for (let i = 0; i < 22; i++) {
        const y = t + ((i * 137 + Math.floor(time * 9)) % Math.max(1, b - t));
        if (y < t || y > b) continue;
        const x = 70 + (i % 5) * 48 + Math.sin(time + i) * 14;
        if (x < l || x > r) continue;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 34 + (i % 3) * 15, y); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(245,255,250,0.88)'; ctx.lineWidth = 5;
      ctx.beginPath();
      for (let y = t; y <= b + 20; y += 18) {
        const x = SB.World.shore(y) + Math.sin(time * 2.2 + y * 0.06) * 4;
        if (y === t) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      if (Math.random() < 0.35) {
        const fy = t + Math.random() * (b - t);
        SB.Effects.foam(SB.World.shore(fy), fy);
      }
    },

    drawBlocks: function (ctx, vis) {
      const RX = C.ROAD_X, RY = C.ROAD_Y;
      for (let i = 0; i < RX.length - 1; i++) {
        for (let j = 0; j < RY.length - 1; j++) {
          const x = RX[i] + C.HALF, y = RY[j] + C.HALF;
          const w = C.GRID - C.ROAD_W, h = C.GRID - C.ROAD_W;
          if (!vis(x, y, w, h)) continue;
          if (x < C.SAND_END && y < C.INLET_Y0) continue;
          ctx.fillStyle = C.COL.sidewalk;
          ctx.fillRect(x, y, w, h);
          ctx.fillStyle = C.COL.lot;
          ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
          // Tiny paved texture dashes.
          ctx.fillStyle = 'rgba(255,245,215,0.24)';
          ctx.fillRect(x + 11, y + 11, w - 22, 3);
        }
      }
    },

    drawRoads: function (ctx, l, r, t, b, time) {
      ctx.fillStyle = C.COL.road;
      for (let i = 0; i < C.ROAD_X.length; i++) {
        const x = C.ROAD_X[i];
        if (x < l - 50 || x > r + 50) continue;
        ctx.fillRect(x - C.HALF, t, C.ROAD_W, b - t);
      }
      for (let j = 0; j < C.ROAD_Y.length; j++) {
        const y = C.ROAD_Y[j];
        if (y < t - 50 || y > b + 50) continue;
        ctx.fillRect(l, y - C.HALF, r - l, C.ROAD_W);
      }
      ctx.strokeStyle = 'rgba(255,226,150,0.48)'; ctx.lineWidth = 2;
      ctx.setLineDash([16, 20]);
      for (let i = 0; i < C.ROAD_X.length; i++) {
        const x = C.ROAD_X[i];
        if (x < l || x > r) continue;
        ctx.beginPath(); ctx.moveTo(x, t); ctx.lineTo(x, b); ctx.stroke();
      }
      for (let j = 0; j < C.ROAD_Y.length; j++) {
        const y = C.ROAD_Y[j];
        if (y < t || y > b) continue;
        ctx.beginPath(); ctx.moveTo(l, y); ctx.lineTo(r, y); ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,246,220,0.38)';
      for (let i = 0; i < C.ROAD_X.length; i++) {
        if (C.ROAD_X[i] < l || C.ROAD_X[i] > r) continue;
        for (let j = 0; j < C.ROAD_Y.length; j++) {
          const y = C.ROAD_Y[j];
          if (y < t || y > b) continue;
          const x = C.ROAD_X[i];
          for (let k = 0; k < 4; k++) {
            ctx.fillRect(x - 20 + k * 11, y - C.HALF - 7, 7, 6);
            ctx.fillRect(x - 20 + k * 11, y + C.HALF + 1, 7, 6);
            ctx.fillRect(x - C.HALF - 7, y - 20 + k * 11, 6, 7);
            ctx.fillRect(x + C.HALF + 1, y - 20 + k * 11, 6, 7);
          }
          // Traffic signal heads at each corner.
          const phase = (time * 1.05 + U.hash(i * 31 + j * 17) * 12) % 20;
          const hGreen = phase < 9.2;
          ctx.fillStyle = hGreen ? '#5ade7c' : '#e2574f';
          ctx.fillRect(x + 25, y - 25, 5, 5);
          ctx.fillStyle = hGreen ? '#e2574f' : '#5ade7c';
          ctx.fillRect(x - 30, y + 20, 5, 5);
          ctx.fillStyle = 'rgba(255,246,220,0.38)';
        }
      }
    },

    drawPark: function (ctx, time, vis) {
      const pk = SB.World.city.park;
      if (!vis(pk.x, pk.y, pk.w, pk.h)) return;
      ctx.fillStyle = C.COL.grass; ctx.fillRect(pk.x, pk.y, pk.w, pk.h);
      ctx.strokeStyle = 'rgba(246,225,169,0.7)'; ctx.lineWidth = 20;
      ctx.beginPath();
      ctx.moveTo(pk.x + 20, pk.y + pk.h * 0.55);
      ctx.bezierCurveTo(pk.x + pk.w * 0.35, pk.y + 40, pk.x + pk.w * 0.6, pk.y + pk.h - 40, pk.x + pk.w - 20, pk.y + pk.h * 0.4);
      ctx.stroke();
      ctx.fillStyle = '#2ca6b8';
      SB.World.city.ponds.forEach(function (pond) {
        ctx.beginPath(); ctx.ellipse(pond.x, pond.y, pond.rx, pond.ry, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(220,255,245,0.5)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(pond.x, pond.y, pond.rx * 0.85, pond.ry * 0.8, 0, 0, TAU); ctx.stroke();
      });
    },

    drawPiers: function (ctx, vis) {
      SB.World.city.piers.forEach(function (p) {
        if (!vis(p.x, p.y, p.w, p.h)) return;
        ctx.fillStyle = '#8a6447'; ctx.fillRect(p.x - 2, p.y - 4, p.w + 4, p.h + 8);
        ctx.fillStyle = '#b98e63'; ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.strokeStyle = 'rgba(75,48,30,0.5)'; ctx.lineWidth = 1;
        for (let x = p.x + 12; x < p.x + p.w; x += 18) {
          ctx.beginPath(); ctx.moveTo(x, p.y); ctx.lineTo(x, p.y + p.h); ctx.stroke();
        }
        if (p.end) {
          ctx.fillStyle = '#efdfb5';
          for (let i = 0; i < 4; i++) ctx.fillRect(p.x + p.w - 12, p.y - 2 + i * 6, 7, 4);
        }
      });
    },

    drawBuildings: function (ctx, vis) {
      const list = SB.World.city.buildings;
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (!vis(b.x - 20, b.y - 30, b.w + 40, b.h + 60)) continue;
        const off = b.height * 0.34;
        const rx = b.x - off * 0.32, ry = b.y - off * 0.78;
        ctx.fillStyle = 'rgba(83,51,36,0.24)';
        ctx.fillRect(b.x + off * 0.55 + 10, b.y + off * 0.75 + 10, b.w + off * 0.3, b.h + off * 0.3);
        ctx.fillStyle = b.wall;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + b.w, b.y);
        ctx.lineTo(b.x + b.w + off * 0.4, b.y + b.h + off * 0.5);
        ctx.lineTo(b.x + off * 0.4, b.y + b.h + off * 0.5);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = U.shade(b.wall, -22);
        ctx.beginPath();
        ctx.moveTo(b.x + b.w, b.y); ctx.lineTo(rx + b.w, ry);
        ctx.lineTo(rx + b.w + off * 0.4, ry + b.h + off * 0.5);
        ctx.lineTo(b.x + b.w + off * 0.4, b.y + b.h + off * 0.5);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = b.roof;
        ctx.fillRect(rx, ry, b.w, b.h);
        ctx.strokeStyle = 'rgba(90,55,40,0.5)'; ctx.lineWidth = 2;
        ctx.strokeRect(rx + 1, ry + 1, b.w - 2, b.h - 2);
        ctx.fillStyle = 'rgba(255,250,220,0.22)';
        ctx.fillRect(rx + 4, ry + 4, b.w - 8, 5);
        for (let k = 0; k < b.details.length; k++) {
          const d = b.details[k];
          ctx.fillStyle = d.type === 'vent' ? 'rgba(120,110,100,0.6)' : 'rgba(245,238,220,0.8)';
          ctx.fillRect(rx + d.x, ry + d.y, d.w, d.h);
          ctx.strokeStyle = 'rgba(90,70,60,0.35)'; ctx.lineWidth = 1;
          ctx.strokeRect(rx + d.x, ry + d.y, d.w, d.h);
        }
        if (b.sign) {
          ctx.fillStyle = '#263f57';
          ctx.fillRect(rx + b.w * 0.18, ry + b.h * 0.42, b.w * 0.64, 16);
          ctx.fillStyle = '#ffd568'; ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center';
          ctx.fillText(b.sign, rx + b.w / 2, ry + b.h * 0.42 + 12);
        }
      }
    },

    drawScenery: function (ctx, vis, time) {
      const city = SB.World.city;
      for (let i = 0; i < city.trees.length; i++) {
        const t = city.trees[i];
        if (vis(t.x - t.r, t.y - t.r, t.r * 2, t.r * 2)) drawTree(ctx, t);
      }
      for (let i = 0; i < city.palms.length; i++) {
        const t = city.palms[i];
        if (vis(t.x - 50, t.y - 50, 100, 100)) drawPalm(ctx, t, time);
      }
      for (let i = 0; i < city.umbrellas.length; i++) {
        const u = city.umbrellas[i];
        if (!vis(u.x - 25, u.y - 25, 50, 50)) continue;
        ctx.save(); ctx.translate(u.x, u.y);
        ctx.fillStyle = 'rgba(80,60,40,0.22)';
        ctx.beginPath(); ctx.ellipse(8, 9, 18, 7, 0, 0, TAU); ctx.fill();
        if (u.hut) {
          ctx.fillStyle = '#d8894e'; ctx.fillRect(-14, -12, 28, 24);
          ctx.fillStyle = '#f4dda7'; ctx.fillRect(-17, -17, 34, 8);
          ctx.fillStyle = '#5d4434'; ctx.fillRect(-7, -2, 14, 14);
        } else {
          ctx.strokeStyle = '#9b7552'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 12); ctx.stroke();
          ctx.fillStyle = u.color;
          ctx.beginPath(); ctx.arc(0, 0, 17, Math.PI, 0); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.beginPath(); ctx.moveTo(0, -17); ctx.lineTo(u.rot * 8, 0); ctx.lineTo(0, 0); ctx.fill();
        }
        ctx.restore();
      }
    }
  };

  SB.Render = Render;
})();
