// Top-right minimap: the road grid, park and water, a rotating player arrow, the job marker and
// live police blips. Drawn in screen space after the world.
(function (SB) {
  'use strict';
  const F = SB.FIELD, W = SB.WORLD, P = SB.PALETTE, u = SB.u, G = SB.GRID;

  SB.minimap = {
    draw: function (ctx, w) {
      const px = F.width - 218, py = 20, pw = 198, ph = 198;
      ctx.fillStyle = P.panel; ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = 'rgba(255,240,210,0.35)'; ctx.lineWidth = 2;
      ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);
      ctx.fillStyle = P.gold; ctx.font = 'bold 11px ' + SB.FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('SOLARA BAY', px + 10, py + 7);
      ctx.textAlign = 'right'; ctx.fillStyle = P.muted;
      ctx.fillText(w.city.district(w.player.x, w.player.y).toUpperCase(), px + pw - 10, py + 7);

      const mx = px + 9, my = py + 25, mw = pw - 18, mh = ph - 34;
      const sx = mw / (W.maxX - W.minX), sy = mh / (W.maxY - W.minY);
      const tx = function (x) { return mx + (x - W.minX) * sx; };
      const ty = function (y) { return my + (y - W.minY) * sy; };
      ctx.save();
      ctx.beginPath(); ctx.rect(mx, my, mw, mh); ctx.clip();
      ctx.fillStyle = P.sand; ctx.fillRect(mx, my, mw, mh); // same beach tone as the world map
      ctx.fillStyle = P.water; ctx.fillRect(mx, my, tx(W.waterX) - mx, mh);
      ctx.fillStyle = P.grass; ctx.fillRect(tx(w.city.park.x), ty(w.city.park.y), w.city.park.w * sx, w.city.park.h * sy);
      ctx.fillStyle = '#a98560';
      for (let i = 0; i < SB.NODES; i += 1) {
        ctx.fillRect(tx(i * G - SB.ROAD / 2), my, SB.ROAD * sx, mh);
        ctx.fillRect(mx, ty(i * G - SB.ROAD / 2), mw, SB.ROAD * sy);
      }
      ctx.fillStyle = 'rgba(80,60,45,0.42)';
      for (const b of w.city.buildings) ctx.fillRect(tx(b.x), ty(b.y), Math.max(1, b.w * sx), Math.max(1, b.h * sy));
      const marker = SB.missions.marker(w);
      if (marker) {
        const pulse = 3 + Math.sin(w.time * 4.5) * 1.5; // unhurried beat, like the world marker
        ctx.strokeStyle = P.gold; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(tx(marker.x), ty(marker.y), pulse + 3, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = P.gold;
        ctx.beginPath(); ctx.arc(tx(marker.x), ty(marker.y), 2.5, 0, Math.PI * 2); ctx.fill();
      }
      for (const car of w.cops) {
        ctx.fillStyle = Math.floor(w.time * 5) % 2 ? '#4a8dff' : '#ff5b52';
        ctx.beginPath(); ctx.arc(tx(car.x), ty(car.y), 3, 0, Math.PI * 2); ctx.fill();
      }
      for (const ped of w.peds) {
        if (!ped.cop || !ped.alive) continue;
        ctx.fillStyle = '#2f5fd0';
        ctx.beginPath(); ctx.arc(tx(ped.x), ty(ped.y), 2, 0, Math.PI * 2); ctx.fill();
      }
      const p = w.player, a = p.inCar ? p.inCar.angle : p.angle;
      ctx.save();
      ctx.translate(tx(p.inCar ? p.inCar.x : p.x), ty(p.inCar ? p.inCar.y : p.y));
      // A soft halo keeps the white arrow legible over pale roads and dark buildings alike.
      ctx.fillStyle = 'rgba(16,32,40,0.35)';
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
      ctx.rotate(a + Math.PI / 2);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-4.5, 5); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.restore();
    }
  };
})(window.SB = window.SB || {});
