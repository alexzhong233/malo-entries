/* SOLARA BAY - corner minimap with roads, water, player and objective pulse. */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});
  const C = SB.C, U = SB.U;

  const Minimap = {
    zoom: false,
    size: 196,

    toggle: function () { this.zoom = !this.zoom; },

    draw: function (ctx, W, H, time) {
      const size = this.size;
      const x0 = 22, y0 = H - size - 34;
      const cx = x0 + size / 2, cy = y0 + size / 2;
      const scale = this.zoom ? 0.105 : 0.052;
      const p = SB.Player.state;
      const px = p.inCar ? p.inCar.x : p.x;
      const py = p.inCar ? p.inCar.y : p.y;
      const left = px - size / 2 / scale, right = px + size / 2 / scale;
      const top = py - size / 2 / scale, bottom = py + size / 2 / scale;

      ctx.save();
      ctx.fillStyle = 'rgba(20,24,34,0.84)';
      ctx.fillRect(x0 - 5, y0 - 5, size + 10, size + 10);
      ctx.beginPath(); ctx.rect(x0, y0, size, size); ctx.clip();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.translate(-px, -py);

      // Ocean and shoreline.
      ctx.fillStyle = '#0e9fb4';
      ctx.fillRect(left, top, right - left, bottom - top);
      ctx.fillStyle = '#e7cd94';
      ctx.beginPath();
      ctx.moveTo(C.WORLD + 50, top);
      for (let y = top; y <= bottom + 40; y += 40) ctx.lineTo(SB.World.shore(y), y);
      ctx.lineTo(C.WORLD + 50, bottom + 40);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#0e9fb4';
      ctx.fillRect(left, C.INLET_Y0, C.INLET_X - left, C.INLET_Y1 - C.INLET_Y0);
      ctx.fillStyle = 'rgba(255,255,240,0.55)';
      ctx.fillRect(C.INLET_X, C.INLET_Y0, 5, C.INLET_Y1 - C.INLET_Y0);

      // Park and ponds.
      const pk = SB.World.city.park;
      ctx.fillStyle = '#4f914b'; ctx.fillRect(pk.x, pk.y, pk.w, pk.h);
      ctx.fillStyle = '#2aa9bd';
      SB.World.city.ponds.forEach(function (pond) {
        ctx.beginPath(); ctx.ellipse(pond.x, pond.y, pond.rx, pond.ry, 0, 0, U.TAU); ctx.fill();
      });

      // Sidewalk blocks, then road ribbons.
      ctx.fillStyle = 'rgba(220,205,175,0.55)';
      for (let i = 0; i < C.ROAD_X.length - 1; i++) {
        for (let j = 0; j < C.ROAD_Y.length - 1; j++) {
          const bx = C.ROAD_X[i] + C.HALF, by = C.ROAD_Y[j] + C.HALF;
          if (bx > right || by > bottom || bx + C.GRID < left || by + C.GRID < top) continue;
          ctx.fillRect(bx, by, C.GRID - C.ROAD_W, C.GRID - C.ROAD_W);
        }
      }
      ctx.strokeStyle = '#4d5560'; ctx.lineWidth = C.ROAD_W;
      for (let i = 0; i < C.ROAD_X.length; i++) {
        const x = C.ROAD_X[i];
        if (x < left - 50 || x > right + 50) continue;
        ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
      }
      for (let j = 0; j < C.ROAD_Y.length; j++) {
        const y = C.ROAD_Y[j];
        if (y < top - 50 || y > bottom + 50) continue;
        ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,225,140,0.55)'; ctx.lineWidth = 1.5;
      ctx.setLineDash([9, 13]);
      for (let i = 0; i < C.ROAD_X.length; i++) {
        const x = C.ROAD_X[i];
        if (x < left || x > right) continue;
        ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
      }
      ctx.setLineDash([]);

      // Vehicles and police.
      const cars = SB.Vehicles.list;
      for (let i = 0; i < cars.length; i++) {
        const v = cars[i];
        if (v.x < left || v.x > right || v.y < top || v.y > bottom) continue;
        ctx.fillStyle = v.kind === 'police' ? '#4aa8ff' : '#fff1cc';
        ctx.fillRect(v.x - 3, v.y - 2, 6, 4);
      }

      // Objective, clamped to the rim when off-map.
      const obj = SB.Missions.objective();
      if (obj) {
        const ox = U.clamp(obj.x, left + 12, right - 12);
        const oy = U.clamp(obj.y, top + 12, bottom - 12);
        const pulse = 8 + Math.sin(time * 5) * 2.5;
        ctx.fillStyle = 'rgba(255,205,70,0.35)';
        ctx.beginPath(); ctx.arc(ox, oy, pulse * 2, 0, U.TAU); ctx.fill();
        ctx.fillStyle = '#ffd34f';
        ctx.beginPath();
        ctx.moveTo(ox, oy - pulse); ctx.lineTo(ox + pulse, oy);
        ctx.lineTo(ox, oy + pulse); ctx.lineTo(ox - pulse, oy);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();

      // Frame, north marker and player arrow (screen space).
      ctx.strokeStyle = '#ffe0a0'; ctx.lineWidth = 2;
      ctx.strokeRect(x0 - 4, y0 - 4, size + 8, size + 8);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(p.inCar ? p.inCar.a : p.aim);
      ctx.fillStyle = '#fff6df';
      ctx.strokeStyle = '#25303a'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(9, 0); ctx.lineTo(-7, -7); ctx.lineTo(-4, 0); ctx.lineTo(-7, 7);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      ctx.font = 'bold 10px Arial'; ctx.fillStyle = '#ffe0a0'; ctx.textAlign = 'center';
      ctx.fillText('N', cx, y0 + 11);
      ctx.fillText(this.zoom ? 'MAP +' : 'MAP', cx, y0 + size - 6);
    }
  };

  SB.Minimap = Minimap;
})();
