// Paint one frame: the cached city, every moving thing, night tint and headlights, then the HUD,
// minimap and any overlay screen. The canvas keeps a fixed 1280x720 logical size.
(function (SB) {
  'use strict';
  const F = SB.FIELD, W = SB.WORLD, P = SB.PALETTE;

  SB.createRenderer = function (canvas) {
    const ctx = canvas.getContext('2d');
    let dpr = 1, cache = null, cachedCity = null, vignette = null;

    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(F.width * dpr);
      canvas.height = Math.round(F.height * dpr);
      const scale = Math.min(window.innerWidth / F.width, window.innerHeight / F.height);
      canvas.style.width = Math.round(F.width * scale) + 'px';
      canvas.style.height = Math.round(F.height * scale) + 'px';
      // Screen-space, so the playfield edges settle into shadow without dimming the HUD.
      vignette = ctx.createRadialGradient(F.width / 2, F.height / 2, F.height * 0.34,
        F.width / 2, F.height / 2, F.height * 0.92);
      vignette.addColorStop(0, 'rgba(10,18,24,0)');
      vignette.addColorStop(1, 'rgba(10,18,24,0.26)'); // lighter corners than the original grade
    }

    function cityCache(city) {
      if (cache && cachedCity === city) return cache;
      const c = document.createElement('canvas');
      c.width = Math.ceil(W.maxX - W.minX); c.height = Math.ceil(W.maxY - W.minY);
      const cc = c.getContext('2d');
      cc.translate(-W.minX, -W.minY);
      SB.drawCityStatic(cc, city);
      cache = c; cachedCity = city;
      return c;
    }

    function drawPickups(c) {
      for (const item of c.pickups) {
        const bob = Math.sin(c.time * 5 + item.bob) * 3;
        ctx.fillStyle = P.shadow;
        ctx.beginPath(); ctx.ellipse(item.x + 2, item.y + 6, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.save(); ctx.translate(item.x, item.y + bob);
        if (item.kind === 'cash') {
          ctx.fillStyle = P.green; ctx.fillRect(-9, -7, 18, 14);
          ctx.fillStyle = '#124b2b'; ctx.font = 'bold 13px ' + SB.FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('$', 0, 0);
        } else if (item.kind === 'health') {
          ctx.fillStyle = '#f4ece0'; ctx.fillRect(-8, -8, 16, 16);
          ctx.fillStyle = P.red; ctx.fillRect(-2, -6, 4, 12); ctx.fillRect(-6, -2, 12, 4);
        } else {
          ctx.fillStyle = P.gold; ctx.fillRect(-8, -5, 16, 10);
          ctx.fillStyle = '#5b452a'; ctx.fillRect(-5, -3, 3, 6); ctx.fillRect(0, -3, 3, 6); ctx.fillRect(5, -3, 3, 6);
        }
        ctx.restore();
      }
    }

    function drawMarker(c) {
      const m = SB.missions.marker(c);
      if (!m) return;
      const pulse = 1 + Math.sin(c.time * 4) * 0.12;
      ctx.save(); ctx.translate(m.x, m.y);
      ctx.strokeStyle = 'rgba(255,200,87,0.85)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(0, 12, 26 * pulse, 11 * pulse, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -18, 9 * pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = P.gold;
      ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(7, -16); ctx.lineTo(-7, -16); ctx.closePath(); ctx.fill();
      ctx.font = 'bold 11px ' + SB.FONT; ctx.textAlign = 'center'; ctx.fillText(m.label, 0, -32);
      ctx.restore();
    }

    function drawPlayer(c) {
      const p = c.player;
      if (p.inCar) return;
      ctx.save(); ctx.translate(p.x, p.y);
      ctx.fillStyle = P.shadow;
      ctx.beginPath(); ctx.ellipse(3, 5, 12, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.rotate(p.angle + Math.PI / 2);
      const step = Math.sin(p.walk) * 4;
      ctx.strokeStyle = '#26323a'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(-4, 4); ctx.lineTo(-5 + step, 12); ctx.moveTo(4, 4); ctx.lineTo(5 - step, 12); ctx.stroke();
      ctx.fillStyle = '#2a5e70'; ctx.fillRect(-8, -7, 16, 14);
      ctx.fillStyle = '#397e93'; ctx.fillRect(-8, -7, 16, 4);
      ctx.strokeStyle = '#d6a57c'; ctx.lineWidth = 4;
      const arm = p.fist > 0 ? 12 : 4;
      ctx.beginPath(); ctx.moveTo(-8, -4); ctx.lineTo(-11 - step, 2); ctx.moveTo(8, -4); ctx.lineTo(11, -arm); ctx.stroke();
      if (p.gun && p.ammo > 0) {
        ctx.fillStyle = '#303a3e'; ctx.fillRect(7, -arm - 4, 5, 12);
      }
      ctx.fillStyle = '#d6a57c';
      ctx.beginPath(); ctx.arc(0, -11, 6.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3b2a22';
      ctx.beginPath(); ctx.arc(0, -12, 6.5, Math.PI, Math.PI * 2); ctx.fill();
      if (p.hurt > 0) { ctx.fillStyle = 'rgba(220,60,50,0.5)'; ctx.fillRect(-12, -18, 24, 32); }
      ctx.restore();
    }

    function draw(c) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#0b1118';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      SB.camera.begin(ctx, c.camera, c, dpr);
      ctx.drawImage(cityCache(c.city), W.minX, W.minY);
      SB.effects.drawGround(ctx, c);
      drawMarker(c);
      drawPickups(c);
      for (const ped of c.peds) SB.drawPed(ctx, ped, c);
      for (const car of c.cars) SB.drawCar(ctx, car, c);
      drawPlayer(c);
      SB.effects.drawMuzzle(ctx, c);
      for (const b of c.bullets) {
        ctx.strokeStyle = b.team === 'cop' ? '#ff9b6b' : '#fff0a6';
        ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.moveTo(b.px, b.py); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      SB.effects.drawNight(ctx, c);
      SB.effects.drawAir(ctx, c);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, F.width, F.height);
      if (c.screen !== 'start') { SB.hud.draw(ctx, c); SB.minimap.draw(ctx, c); }
      SB.screens.draw(ctx, c);
    }

    resize();
    window.addEventListener('resize', resize);
    return { draw, resize };
  };
})(window.SB = window.SB || {});
