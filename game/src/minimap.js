(function (SB) {
  'use strict';

  var U = SB.U, C = SB.CFG.COLORS, CFG = SB.CFG;

  function draw(ctx, world) {
    var W = SB.view.w, H = SB.view.h;
    if (world.state === 'start') return;
    var R = 88, cx = W - 120, cy = 158;
    var zoom = world.mapZoom || 1;
    var span = 1050 / zoom;
    var p = world.player;
    var mx = p.x, my = p.y;
    var sx = R / span;

    function tx(x) { return cx + (x - mx) * sx; }
    function ty(y) { return cy + (y - my) * sx; }

    ctx.save();
    ctx.setTransform(SB.view.dpr, 0, 0, SB.view.dpr, 0, 0);
    ctx.fillStyle = 'rgba(13,24,34,0.86)';
    ctx.beginPath(); ctx.arc(cx, cy, R + 9, 0, U.TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,226,160,0.55)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, R + 5, 0, U.TAU); ctx.stroke();

    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, U.TAU); ctx.clip();

    // Turquoise bay and the shoreline.
    ctx.fillStyle = C.waterDeep;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.fillStyle = '#3fc9c8';
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2 * 0.22);
    ctx.fillStyle = C.sand;
    ctx.beginPath();
    var y0 = my - span - 60, y1 = my + span + 60;
    ctx.moveTo(tx(SB.City.shorelineAt(y0)), ty(y0));
    for (var yy = y0; yy <= y1; yy += 22) ctx.lineTo(tx(SB.City.shorelineAt(yy)), ty(yy));
    ctx.lineTo(cx + R + 20, cy + R + 20);
    ctx.lineTo(tx(SB.City.shorelineAt(y1)), cy + R + 20);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (yy = y0; yy <= y1; yy += 22) {
      var px = tx(SB.City.shorelineAt(yy)), py = ty(yy);
      if (yy === y0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Park.
    var park = world.city.park;
    ctx.fillStyle = C.grassDark;
    ctx.fillRect(tx(park.x), ty(park.y), park.w * sx, park.h * sx);

    // Building footprints give the map its city texture.
    var list = SB.City.buildingsNear(world.city, mx, my, span + CFG.BLOCK_CELL);
    ctx.fillStyle = 'rgba(92,82,72,0.62)';
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (b.x + b.w < mx - span || b.x > mx + span || b.y + b.h < my - span || b.y > my + span) continue;
      ctx.fillRect(tx(b.x), ty(b.y), Math.max(1, b.w * sx), Math.max(1, b.h * sx));
    }

    // Street grid.
    ctx.strokeStyle = 'rgba(245,241,220,0.75)'; ctx.lineWidth = Math.max(1.4, CFG.ROAD_W * sx * 0.55);
    ctx.beginPath();
    for (i = 0; i < world.city.roadXs.length; i++) {
      var rx = world.city.roadXs[i];
      if (Math.abs(rx - mx) > span + 100) continue;
      ctx.moveTo(tx(rx), cy - R); ctx.lineTo(tx(rx), cy + R);
    }
    for (i = 0; i < world.city.roadYs.length; i++) {
      var ry = world.city.roadYs[i];
      if (Math.abs(ry - my) > span + 100) continue;
      ctx.moveTo(cx - R, ty(ry)); ctx.lineTo(cx + R, ty(ry));
    }
    ctx.stroke();

    // Traffic and police blips.
    for (i = 0; i < world.traffic.length; i++) {
      var tr = world.traffic[i];
      if (Math.abs(tr.x - mx) > span || Math.abs(tr.y - my) > span) continue;
      ctx.fillStyle = tr.parked ? 'rgba(255,255,255,0.45)' : '#fff8dc';
      ctx.fillRect(tx(tr.x) - 1.5, ty(tr.y) - 1.5, 3, 3);
    }
    for (i = 0; i < world.police.length; i++) {
      var cop = world.police[i];
      if (cop.wrecked || Math.abs(cop.x - mx) > span || Math.abs(cop.y - my) > span) continue;
      var flash = Math.floor(world.elapsed * 6) % 2;
      ctx.fillStyle = flash ? '#ff4d43' : '#4285ff';
      ctx.beginPath(); ctx.arc(tx(cop.x), ty(cop.y), 3.2, 0, U.TAU); ctx.fill();
    }

    // Objective, clamped to the edge of the map when it is far away.
    var mk = SB.Missions.marker(world);
    if (mk) {
      var dx = mk.x - mx, dy = mk.y - my, dm = Math.hypot(dx, dy);
      var scale = dm > span - 20 ? (span - 20) / dm : 1;
      var ox = cx + dx * sx * scale, oy = cy + dy * sx * scale;
      var pulse = 0.5 + 0.5 * Math.sin(world.elapsed * 4);
      ctx.strokeStyle = '#ffd45e'; ctx.fillStyle = 'rgba(255,212,94,' + (0.3 + pulse * 0.4) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ox, oy, 6 + pulse * 4, 0, U.TAU); ctx.fill(); ctx.stroke();
    }

    // Player arrow.
    var pa = p.car ? p.car.angle : p.angle;
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(pa + Math.PI / 2);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#20344c'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3); ctx.lineTo(-6, 7); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.restore();

    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = 'bold 10px Arial, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('N', cx, cy - R - 1);
    ctx.fillStyle = 'rgba(255,226,160,0.8)';
    ctx.fillText('TAB ' + (zoom > 1 ? 'OUT' : 'IN'), cx, cy + R + 18);
    ctx.restore();
  }

  SB.Minimap = { draw: draw };
})(window.SB = window.SB || {});
