// Smooth follow camera: keeps the player near the middle, leans into movement and zooms out as
// speed rises. The same state converts mouse positions back into world coordinates.
(function (SB) {
  'use strict';
  const u = SB.u, F = SB.FIELD, W = SB.WORLD;

  const CAM = SB.camera = {};
  CAM.create = function () {
    return { x: SB.PLAYER.respawnX, y: SB.PLAYER.respawnY, zoom: 1.06, targetZoom: 1.06 };
  };

  CAM.update = function (cam, w, dt) {
    const p = w.player;
    const car = p.inCar;
    const x = car ? car.x : p.x, y = car ? car.y : p.y;
    const vx = car ? car.vx : 0, vy = car ? car.vy : 0;
    const tx = x + u.clamp(vx * 0.26, -90, 90);
    const ty = y + u.clamp(vy * 0.26, -90, 90);
    // A slightly firmer follow keeps the player centred when a chase suddenly changes direction.
    const k = 1 - Math.exp(-7 * dt);
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;
    const speed = car ? Math.hypot(vx, vy) : (p.moving ? (p.sprinting ? 200 : 140) : 0);
    cam.targetZoom = car ? u.clamp(1.10 - speed / 900, 0.74, 1.10) : 1.06;
    cam.zoom += (cam.targetZoom - cam.zoom) * (1 - Math.exp(-3 * dt));
    const halfW = F.width / (2 * cam.zoom), halfH = F.height / (2 * cam.zoom);
    if (W.maxX - W.minX > halfW * 2) cam.x = u.clamp(cam.x, W.minX + halfW, W.maxX - halfW);
    else cam.x = (W.minX + W.maxX) / 2;
    if (W.maxY - W.minY > halfH * 2) cam.y = u.clamp(cam.y, W.minY + halfH, W.maxY - halfH);
    else cam.y = (W.minY + W.maxY) / 2;
  };

  CAM.begin = function (ctx, cam, w, dpr) {
    const z = cam.zoom;
    const x = F.width / 2 - (cam.x + w.effects.shakeX) * z;
    const y = F.height / 2 - (cam.y + w.effects.shakeY) * z;
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * x, dpr * y);
  };

  CAM.toWorld = function (cam, sx, sy) {
    return { x: (sx - F.width / 2) / cam.zoom + cam.x, y: (sy - F.height / 2) / cam.zoom + cam.y };
  };
})(window.SB = window.SB || {});
