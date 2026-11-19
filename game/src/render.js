(function (SB) {
  'use strict';

  var CFG = SB.CFG, U = SB.U, C = CFG.COLORS;

  function updateCamera(world, dt) {
    var cam = world.camera, p = world.player;
    var vx = p.car ? p.car.vx : p.vx, vy = p.car ? p.car.vy : p.vy;
    var lead = p.car ? CFG.CAMERA.LOOK_AHEAD : 0.2;
    var tx = p.x + vx * lead, ty = p.y + vy * lead;
    cam.x = U.damp(cam.x, tx, CFG.CAMERA.FOLLOW, dt);
    cam.y = U.damp(cam.y, ty, CFG.CAMERA.FOLLOW, dt);
    var targetZoom = p.car ? CFG.CAMERA.ZOOM_DRIVE : CFG.CAMERA.ZOOM;
    cam.zoom = U.damp(cam.zoom, targetZoom, CFG.CAMERA.LERP_ZOOM, dt);
    var amp = cam.shake;
    cam.shakeX = (Math.random() * 2 - 1) * amp;
    cam.shakeY = (Math.random() * 2 - 1) * amp;
    var I = SB.Input;
    I.worldX = cam.x + (I.mouse.x - SB.view.w * 0.5) / cam.zoom;
    I.worldY = cam.y + (I.mouse.y - SB.view.h * 0.5) / cam.zoom;
  }

  function landPath(ctx, y0, y1, right) {
    ctx.beginPath();
    ctx.moveTo(SB.City.shorelineAt(y0), y0);
    for (var y = y0; y <= y1 + 30; y += 30) ctx.lineTo(SB.City.shorelineAt(y), y);
    ctx.lineTo(right, y1);
    ctx.lineTo(right, y0);
    ctx.closePath();
  }

  function drawWater(ctx, world, v) {
    ctx.fillStyle = C.waterDeep;
    ctx.fillRect(v.left - 40, v.top - 40, v.right - v.left + 80, v.bottom - v.top + 80);
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = '#b9fff2';
    ctx.lineWidth = 2;
    var t = world.elapsed;
    for (var y = Math.floor(v.top / 34) * 34; y < v.bottom; y += 34) {
      var shore = SB.City.shorelineAt(y) - 12;
      if (shore < v.left) continue;
      ctx.beginPath();
      for (var x = v.left - 20; x < shore; x += 46) {
        var yy = y + Math.sin(x * 0.014 + t * 1.7 + y * 0.01) * 2.6;
        if (x === v.left - 20) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawLand(ctx, world, v) {
    ctx.save();
    landPath(ctx, v.top - 60, v.bottom + 60, v.right + 60);
    ctx.fillStyle = C.sand;
    ctx.fill();
    ctx.clip();

    // Dune speckles and beach texture.
    ctx.fillStyle = 'rgba(190,150,100,0.24)';
    for (var y = Math.floor(v.top / 30) * 30; y < v.bottom; y += 30) {
      for (var x = Math.floor(v.left / 30) * 30; x < v.right; x += 30) {
        var h = U.hash2(x, y);
        if (h > 0.72) ctx.fillRect(x + h * 18, y + (1 - h) * 20, 2.2, 2.2);
      }
    }
    // Darker wet-sand band, then bright animated foam.
    ctx.strokeStyle = C.sandDark;
    ctx.lineWidth = 48;
    ctx.beginPath();
    for (y = v.top - 40; y <= v.bottom + 40; y += 24) {
      var sx = SB.City.shorelineAt(y) + 20;
      if (y === v.top - 40) ctx.moveTo(sx, y); else ctx.lineTo(sx, y);
    }
    ctx.stroke();
    ctx.strokeStyle = C.foam;
    ctx.lineWidth = 5;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    for (y = v.top - 40; y <= v.bottom + 40; y += 16) {
      var fx = SB.City.shorelineAt(y) + Math.sin(y * 0.06 + world.elapsed * 2.3) * 5;
      if (y === v.top - 40) ctx.moveTo(fx, y); else ctx.lineTo(fx, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // City blocks: sidewalk ring with a slightly darker lot inside.
    var city = world.city;
    for (var i = 0; i < city.roadXs.length - 1; i++) {
      var bx0 = city.roadXs[i] + CFG.ROAD_W * 0.5, bx1 = city.roadXs[i + 1] - CFG.ROAD_W * 0.5;
      if (bx1 < v.left || bx0 > v.right) continue;
      for (var j = 0; j < city.roadYs.length - 1; j++) {
        var by0 = city.roadYs[j] + CFG.ROAD_W * 0.5, by1 = city.roadYs[j + 1] - CFG.ROAD_W * 0.5;
        if (by1 < v.top || by0 > v.bottom) continue;
        ctx.fillStyle = C.sidewalk;
        ctx.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
        ctx.fillStyle = C.lot;
        ctx.fillRect(bx0 + CFG.SIDEWALK, by0 + CFG.SIDEWALK,
          bx1 - bx0 - CFG.SIDEWALK * 2, by1 - by0 - CFG.SIDEWALK * 2);
      }
    }
    ctx.restore();
  }

  function drawPark(ctx, world, v) {
    var p = world.city.park;
    if (p.x > v.right || p.x + p.w < v.left || p.y > v.bottom || p.y + p.h < v.top) return;
    ctx.save();
    landPath(ctx, v.top - 60, v.bottom + 60, v.right + 60); ctx.clip();
    ctx.fillStyle = C.grass;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = 'rgba(60,120,60,0.18)';
    for (var x = p.x; x < p.x + p.w; x += 42) ctx.fillRect(x, p.y, 18, p.h);
    ctx.strokeStyle = C.parkPath; ctx.lineWidth = 16;
    ctx.beginPath(); ctx.moveTo(p.x, p.y + p.h * 0.5); ctx.lineTo(p.x + p.w, p.y + p.h * 0.5);
    ctx.moveTo(p.x + p.w * 0.5, p.y); ctx.lineTo(p.x + p.w * 0.5, p.y + p.h); ctx.stroke();
    for (var i = 0; i < world.city.ponds.length; i++) {
      var pond = world.city.ponds[i];
      ctx.fillStyle = C.waterShallow;
      ctx.beginPath(); ctx.ellipse(pond.x, pond.y, pond.r, pond.r * 0.78, 0, 0, U.TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,240,0.55)'; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.restore();
  }

  function drawRoads(ctx, world, v) {
    var city = world.city, i, j;
    ctx.save();
    landPath(ctx, v.top - 60, v.bottom + 60, v.right + 60); ctx.clip();
    var half = CFG.ROAD_W * 0.5;
    ctx.fillStyle = C.asphalt;
    for (i = 0; i < city.roadXs.length; i++) {
      var rx = city.roadXs[i];
      if (rx < v.left - 60 || rx > v.right + 60) continue;
      ctx.fillRect(rx - half, v.top - 60, CFG.ROAD_W, v.bottom - v.top + 120);
    }
    for (j = 0; j < city.roadYs.length; j++) {
      var ry = city.roadYs[j];
      if (ry < v.top - 60 || ry > v.bottom + 60) continue;
      ctx.fillRect(v.left - 60, ry - half, v.right - v.left + 120, CFG.ROAD_W);
    }
    ctx.strokeStyle = C.lane;
    ctx.globalAlpha = 0.62;
    ctx.lineWidth = 2;
    ctx.setLineDash([24, 22]);
    ctx.beginPath();
    for (i = 0; i < city.roadXs.length; i++) {
      rx = city.roadXs[i];
      if (rx < v.left - 60 || rx > v.right + 60) continue;
      ctx.moveTo(rx, v.top - 60); ctx.lineTo(rx, v.bottom + 60);
    }
    for (j = 0; j < city.roadYs.length; j++) {
      ry = city.roadYs[j];
      if (ry < v.top - 60 || ry > v.bottom + 60) continue;
      ctx.moveTo(v.left - 60, ry); ctx.lineTo(v.right + 60, ry);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = '#f9f6e8';
    for (i = 0; i < city.roadXs.length; i++) {
      rx = city.roadXs[i];
      if (rx < v.left - 60 || rx > v.right + 60) continue;
      for (j = 0; j < city.roadYs.length; j++) {
        ry = city.roadYs[j];
        if (ry < v.top - 60 || ry > v.bottom + 60) continue;
        for (var k = 0; k < 4; k++) {
          ctx.fillRect(rx - half + 5 + k * 11, ry - half - 9, 7, 7);
          ctx.fillRect(rx - half + 5 + k * 11, ry + half + 2, 7, 7);
          ctx.fillRect(rx - half - 9, ry - half + 5 + k * 11, 7, 7);
          ctx.fillRect(rx + half + 2, ry - half + 5 + k * 11, 7, 7);
        }
        var phase = Math.floor(world.elapsed / 6 + j) % 2;
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = phase ? '#4ad97c' : '#ff5d55';
        ctx.fillRect(rx - half - 7, ry - half - 7, 5, 5);
        ctx.fillStyle = phase ? '#ff5d55' : '#4ad97c';
        ctx.fillRect(rx + half + 2, ry + half + 2, 5, 5);
        ctx.globalAlpha = 0.42;
      }
    }
    ctx.restore();
  }

  function visibleBuildings(world, v) {
    var all = world.city.buildings, out = [];
    for (var i = 0; i < all.length; i++) {
      var b = all[i];
      if (b.x + b.w < v.left - 70 || b.x > v.right + 70 || b.y + b.h < v.top - 90 || b.y > v.bottom + 70) continue;
      out.push(b);
    }
    return out;
  }

  function drawBuildings(ctx, world, list, night) {
    var i, b;
    ctx.save();
    ctx.fillStyle = 'rgba(52,39,31,0.26)';
    for (i = 0; i < list.length; i++) {
      b = list[i];
      var ox = b.height * 0.45, oy = b.height * 0.62;
      ctx.fillRect(b.x + ox, b.y + oy, b.w, b.h);
    }
    list.sort(function (a, c) { return a.y - c.y; });
    for (i = 0; i < list.length; i++) {
      b = list[i];
      ox = b.height * 0.45; oy = b.height * 0.62;
      ctx.fillStyle = b.edge;
      ctx.beginPath(); ctx.moveTo(b.x + b.w, b.y); ctx.lineTo(b.x + b.w + ox, b.y + oy);
      ctx.lineTo(b.x + b.w + ox, b.y + b.h + oy); ctx.lineTo(b.x + b.w, b.y + b.h); ctx.closePath(); ctx.fill();
      ctx.fillStyle = b.side;
      ctx.beginPath(); ctx.moveTo(b.x, b.y + b.h); ctx.lineTo(b.x + ox, b.y + b.h + oy);
      ctx.lineTo(b.x + b.w + ox, b.y + b.h + oy); ctx.lineTo(b.x + b.w, b.y + b.h); ctx.closePath(); ctx.fill();
      ctx.fillStyle = b.top;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = 'rgba(60,50,40,0.28)'; ctx.lineWidth = 1;
      ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
      // Roof kit: vents, stripes and a bright parapet line.
      ctx.fillStyle = U.shade(b.top, -0.13);
      if (b.roof === 0) ctx.fillRect(b.x + 8, b.y + 8, Math.max(5, b.w * 0.3), Math.max(5, b.h * 0.2));
      else if (b.roof === 1) ctx.fillRect(b.x + b.w * 0.55, b.y + b.h * 0.55, Math.max(6, b.w * 0.26), Math.max(6, b.h * 0.22));
      else if (b.roof === 2) {
        ctx.strokeStyle = U.shade(b.top, -0.16); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(b.x + 6, b.y + b.h - 7); ctx.lineTo(b.x + b.w - 7, b.y + 6); ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(70,80,90,0.3)';
        ctx.beginPath(); ctx.arc(b.x + b.w * 0.5, b.y + b.h * 0.5, Math.min(b.w, b.h) * 0.17, 0, U.TAU); ctx.fill();
      }
      if (night > 0.42 && b.windows) {
        ctx.fillStyle = 'rgba(255,222,140,' + (night * 0.55).toFixed(2) + ')';
        var cols = Math.max(1, Math.floor(b.w / 18)), rows = Math.max(1, Math.floor(b.h / 18));
        for (var c = 0; c < cols; c++) {
          for (var r = 0; r < rows; r++) {
            if (U.hash2(b.seed * 1000 + c, r) > 0.72) ctx.fillRect(b.x + 5 + c * 18, b.y + 5 + r * 18, 5, 4);
          }
        }
      }
    }
    ctx.restore();
  }

  function drawTree(ctx, t, night) {
    var s = t.scale || 1;
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(45,38,32,0.25)';
    if (t.kind === 'palm') {
      ctx.beginPath(); ctx.ellipse(18, 8, 24, 9, -0.2, 0, U.TAU); ctx.fill();
      ctx.strokeStyle = '#8a6541'; ctx.lineWidth = 4.2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(t.lean * 12, -14, t.lean * 17, -30); ctx.stroke();
      ctx.translate(t.lean * 17, -30);
      for (var i = 0; i < 7; i++) {
        var a = i / 7 * U.TAU + t.lean;
        ctx.strokeStyle = i % 2 ? '#35743e' : '#4a9150';
        ctx.lineWidth = 4.4;
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(Math.cos(a) * 16, Math.sin(a) * 16 - 8, Math.cos(a) * 30, Math.sin(a) * 25 + 5);
        ctx.stroke();
      }
      ctx.fillStyle = '#d5b26a';
      ctx.beginPath(); ctx.arc(0, 0, 3, 0, U.TAU); ctx.fill();
    } else {
      ctx.beginPath(); ctx.ellipse(13, 12, 22, 11, 0, 0, U.TAU); ctx.fill();
      ctx.strokeStyle = '#79583d'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -16); ctx.stroke();
      ctx.fillStyle = night > 0.5 ? '#3d7345' : '#579353';
      ctx.beginPath(); ctx.arc(-8, -24, 14, 0, U.TAU); ctx.arc(9, -26, 15, 0, U.TAU); ctx.arc(0, -37, 14, 0, U.TAU); ctx.fill();
      ctx.fillStyle = 'rgba(150,205,120,0.35)';
      ctx.beginPath(); ctx.arc(-6, -30, 9, 0, U.TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawPiers(ctx, world, v) {
    var piers = world.city.piers;
    ctx.save();
    for (var i = 0; i < piers.length; i++) {
      var p = piers[i];
      if (p.y < v.top - 50 || p.y > v.bottom + 50) continue;
      ctx.fillStyle = '#9a7854'; ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.strokeStyle = '#6d5239'; ctx.lineWidth = 1;
      for (var x = p.x + 6; x < p.x + p.w; x += 14) {
        ctx.beginPath(); ctx.moveTo(x, p.y); ctx.lineTo(x, p.y + p.h); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(30,35,40,0.6)';
      ctx.fillRect(p.x + 18, p.y + 8, 6, 14);
    }
    ctx.restore();
  }

  function drawProps(ctx, world, v) {
    var props = world.city.props;
    ctx.save();
    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      if (p.y < v.top - 40 || p.y > v.bottom + 40 || p.x < v.left - 40 || p.x > v.right + 40) continue;
      ctx.fillStyle = 'rgba(60,50,40,0.18)';
      ctx.beginPath(); ctx.ellipse(p.x + 5, p.y + 4, 12, 5, 0, 0, U.TAU); ctx.fill();
      if (p.kind === 'umbrella') {
        ctx.strokeStyle = '#8c7359'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - 16); ctx.stroke();
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y - 17, 14, Math.PI, 0); ctx.fill();
      } else {
        ctx.fillStyle = p.color; ctx.fillRect(p.x - 5, p.y - 3, 11, 6);
      }
    }
    ctx.restore();
  }

  function drawPed(ctx, ped) {
    ctx.save(); ctx.translate(ped.x, ped.y);
    ctx.fillStyle = 'rgba(40,32,28,0.28)';
    ctx.beginPath(); ctx.ellipse(3, 5, 8, 4, 0, 0, U.TAU); ctx.fill();
    ctx.rotate(ped.angle);
    var bob = Math.sin(ped.phase) * 1.4;
    ctx.fillStyle = '#41485a'; ctx.fillRect(-4, -4 + bob, 5, 3); ctx.fillRect(-4, 1 - bob, 5, 3);
    ctx.fillStyle = ped.shirt;
    U.roundRect(ctx, -4, -4, 9, 8, 3); ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath(); ctx.arc(1, 0, 4, 0, U.TAU); ctx.fill();
    ctx.restore();
  }

  function drawBullets(ctx, world, v) {
    ctx.save(); ctx.strokeStyle = '#fff0a8'; ctx.lineWidth = 2;
    for (var i = 0; i < world.bullets.length; i++) {
      var b = world.bullets[i];
      if (b.x < v.left || b.x > v.right || b.y < v.top || b.y > v.bottom) continue;
      ctx.beginPath(); ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012); ctx.stroke();
    }
    ctx.restore();
  }

  function draw(ctx, world) {
    var view = SB.view, W = view.w, H = view.h;
    var cam = world.camera;
    var halfW = W * 0.5 / cam.zoom, halfH = H * 0.5 / cam.zoom;
    var v = world.view = {
      left: cam.x - halfW - 80, right: cam.x + halfW + 80,
      top: cam.y - halfH - 120, bottom: cam.y + halfH + 80
    };
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = '#0b8ba3'; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W * 0.5 + cam.shakeX, H * 0.5 + cam.shakeY);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    var sun = SB.World.sunLevel(world), night = 1 - sun;
    drawWater(ctx, world, v);
    drawLand(ctx, world, v);
    drawPark(ctx, world, v);
    drawPiers(ctx, world, v);
    drawRoads(ctx, world, v);
    var buildings = visibleBuildings(world, v);
    drawBuildings(ctx, world, buildings, night);
    var trees = world.city.trees, i;
    for (i = 0; i < trees.length; i++) {
      var t = trees[i];
      if (t.x < v.left - 50 || t.x > v.right + 50 || t.y < v.top - 80 || t.y > v.bottom + 50) continue;
      drawTree(ctx, t, night);
    }
    drawProps(ctx, world, v);

    if (night > 0.08) {
      ctx.fillStyle = 'rgba(12,22,58,' + (night * 0.48).toFixed(3) + ')';
      ctx.fillRect(v.left, v.top, v.right - v.left, v.bottom - v.top);
    } else {
      ctx.fillStyle = 'rgba(255,199,116,' + ((1 - night) * 0.045).toFixed(3) + ')';
      ctx.fillRect(v.left, v.top, v.right - v.left, v.bottom - v.top);
    }

    SB.FX.drawMarks(ctx, world);
    SB.Missions.drawTargets(ctx, world);
    for (i = 0; i < world.traffic.length; i++) {
      var tr = world.traffic[i];
      if (tr.x < v.left - 60 || tr.x > v.right + 60 || tr.y < v.top - 60 || tr.y > v.bottom + 60) continue;
      SB.Vehicles.draw(ctx, world, tr);
    }
    for (i = 0; i < world.police.length; i++) {
      var cop = world.police[i];
      if (cop.x < v.left - 60 || cop.x > v.right + 60 || cop.y < v.top - 60 || cop.y > v.bottom + 60) continue;
      SB.Vehicles.draw(ctx, world, cop);
    }
    for (i = 0; i < world.peds.length; i++) {
      var ped = world.peds[i];
      if (ped.x < v.left - 20 || ped.x > v.right + 20 || ped.y < v.top - 20 || ped.y > v.bottom + 20) continue;
      drawPed(ctx, ped);
    }
    SB.Police.drawOfficers(ctx, world);
    SB.Player.draw(ctx, world, world.player);
    drawBullets(ctx, world, v);
    SB.FX.drawWorld(ctx, world);
    SB.Missions.drawMarker(ctx, world);
    ctx.restore();

    // Screen-space vignette keeps the eye on the centre of the action.
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    var grad = ctx.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.32,
      W * 0.5, H * 0.5, Math.max(W, H) * 0.78);
    grad.addColorStop(0, 'rgba(20,15,10,0)');
    grad.addColorStop(1, 'rgba(20,15,10,0.34)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    SB.FX.drawScreen(ctx);
  }

  SB.Render = { draw: draw, updateCamera: updateCamera };
})(window.SB = window.SB || {});
