/* SOLARA BAY - on-foot player, car stealing, guns and projectile combat. */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});
  const C = SB.C, U = SB.U;

  const bullets = [];
  const player = {
    x: C.ROAD_X[0] + 100, y: C.ROAD_Y[4],
    aim: 0, health: 100, inCar: null,
    fireCooldown: 0, hitFlash: 0, moving: false,
    kills: 0
  };

  const Combat = {
    bullets: bullets,

    spawn: function (x, y, a, owner, damage) {
      if (bullets.length > 160) bullets.shift();
      const speed = C.SHOT_SPEED * (owner === 'police' ? 0.72 : 1);
      bullets.push({
        x: x, y: y, px: x, py: y,
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        life: C.SHOT_LIFE, owner: owner || 'player',
        damage: damage || (owner === 'police' ? 8 : 24)
      });
    },

    hurtPlayer: function (amount) {
      if (player.health <= 0) return;
      player.health -= amount;
      player.hitFlash = 0.2;
      SB.Effects.blood(player.x, player.y, 5);
      if (player.health <= 0) {
        player.health = 0;
        if (SB.Game && SB.Game.onDeath) SB.Game.onDeath();
      }
    },

    update: function (dt) {
      let i = bullets.length;
      while (i--) {
        const b = bullets[i];
        b.px = b.x; b.py = b.y;
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.life -= dt;
        let hit = false;
        if (SB.World.solid(b.x, b.y, 2)) {
          SB.Effects.spark(b.x, b.y, 3);
          hit = true;
        } else if (b.owner === 'police') {
          if (!player.inCar && U.dist2(b.x, b.y, player.x, player.y) < 15 * 15) {
            this.hurtPlayer(b.damage); hit = true;
          } else if (player.inCar && U.dist2(b.x, b.y, player.inCar.x, player.inCar.y) < 21 * 21) {
            player.inCar.damage(b.damage * 0.55);
            player.health -= b.damage * 0.12;
            hit = true;
          }
        } else {
          const officers = SB.Police ? SB.Police.officers : [];
          for (let k = 0; k < officers.length; k++) {
            const o = officers[k];
            if (o.dead) continue;
            if (U.dist2(b.x, b.y, o.x, o.y) < 16 * 16) {
              o.health -= b.damage;
              SB.Effects.blood(o.x, o.y, 8);
              if (o.health <= 0) { o.dead = true; player.kills++; SB.Effects.blood(o.x, o.y, 14); }
              hit = true; break;
            }
          }
          if (!hit) {
            const cars = SB.Vehicles.list;
            for (let k = 0; k < cars.length; k++) {
              const v = cars[k];
              if (U.dist2(b.x, b.y, v.x, v.y) < 20 * 20) {
                v.damage(b.damage * 0.32);
                SB.Effects.spark(b.x, b.y, 4);
                hit = true; break;
              }
            }
          }
        }
        if (hit || b.life <= 0) bullets.splice(i, 1);
      }
    },

    draw: function (ctx) {
      ctx.save();
      ctx.lineCap = 'round';
      for (let i = 0; i < bullets.length; i++) {
        const b = bullets[i];
        ctx.strokeStyle = b.owner === 'police' ? '#ffd166' : '#fff6c4';
        ctx.lineWidth = b.owner === 'police' ? 2 : 1.6;
        ctx.globalAlpha = Math.min(1, b.life * 3);
        ctx.beginPath(); ctx.moveTo(b.px, b.py); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.restore();
    },

    clear: function () { bullets.length = 0; }
  };

  function drawPerson(ctx, x, y, a, shirt, hit) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(40,25,20,0.3)';
    ctx.beginPath(); ctx.ellipse(3, 6, 12, 7, 0, 0, U.TAU); ctx.fill();
    ctx.rotate(a);
    ctx.fillStyle = hit ? '#ff9a9a' : '#3a3f52';
    ctx.fillRect(-5, -6, 10, 12);
    ctx.fillStyle = hit ? '#ff7777' : shirt;
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, U.TAU); ctx.fill();
    ctx.fillStyle = '#e4ac82';
    ctx.beginPath(); ctx.arc(2, 0, 6, 0, U.TAU); ctx.fill();
    ctx.fillStyle = '#3b2b25';
    ctx.beginPath(); ctx.arc(4, 0, 4, 0, U.TAU); ctx.fill();
    ctx.strokeStyle = '#454a55'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(19, 0); ctx.stroke();
    ctx.restore();
  }

  const Player = {
    state: player,

    reset: function (data) {
      const d = data || SB.Save.fresh();
      player.x = d.x; player.y = d.y;
      player.health = d.health || 100;
      player.aim = 0; player.inCar = null;
      player.fireCooldown = 0; player.hitFlash = 0; player.kills = 0;
      Combat.clear();
    },

    exitCar: function () {
      if (!player.inCar) return;
      const v = player.inCar;
      const sides = [[Math.cos(v.a + Math.PI / 2), Math.sin(v.a + Math.PI / 2)],
                     [Math.cos(v.a - Math.PI / 2), Math.sin(v.a - Math.PI / 2)]];
      for (let i = 0; i < sides.length; i++) {
        const px = v.x + sides[i][0] * 36, py = v.y + sides[i][1] * 36;
        if (!SB.World.solid(px, py, C.PLAYER_R)) {
          player.x = px; player.y = py; break;
        }
      }
      v.occupied = false;
      v.controls.throttle = 0; v.controls.brake = 0; v.controls.steer = 0;
      player.inCar = null;
    },

    update: function (dt, input) {
      player.hitFlash = Math.max(0, player.hitFlash - dt);
      player.fireCooldown = Math.max(0, player.fireCooldown - dt);
      if (input.pressed('KeyE')) {
        if (player.inCar) this.exitCar();
        else {
          const v = SB.Vehicles.nearest(player.x, player.y, 66, function (car) { return !car.occupied; });
          if (v) { v.occupied = true; player.inCar = v; SB.Audio.blip(340, 0.1); }
        }
      }
      if (player.inCar) {
        // Keep the logical player position on the car so map markers,
        // missions and audio all follow the vehicle.
        player.x = player.inCar.x;
        player.y = player.inCar.y;
        const ctl = player.inCar.controls;
        ctl.throttle = input.down('KeyW') || input.down('ArrowUp') ? 1 : 0;
        ctl.brake = input.down('KeyS') || input.down('ArrowDown') ? 1 : 0;
        ctl.steer = (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0) -
                    (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0);
        player.aim = player.inCar.a;
        player.moving = Math.abs(player.inCar.speed()) > 8;
        return;
      }
      let dx = (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0) -
               (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0);
      let dy = (input.down('KeyS') || input.down('ArrowDown') ? 1 : 0) -
               (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0);
      const len = Math.hypot(dx, dy);
      player.moving = len > 0;
      if (len > 0) {
        const sprint = input.down('ShiftLeft') || input.down('ShiftRight') ? C.SPRINT_MULT : 1;
        const surf = SB.World.surface(player.x, player.y);
        const slow = surf === 'sand' ? 0.78 : (surf === 'pier' ? 0.8 : 1);
        const speed = C.WALK_SPEED * sprint * slow * dt / len;
        SB.World.move(player, dx * speed, dy * speed, C.PLAYER_R);
      }
      if (SB.Render && SB.Render.screenToWorld) {
        const w = SB.Render.screenToWorld(input.mouse.x, input.mouse.y);
        player.aim = Math.atan2(w.y - player.y, w.x - player.x);
      }
      if (input.mouse.down && player.fireCooldown <= 0 && SB.Game.state === 'playing') {
        player.fireCooldown = 0.135;
        const muzzleX = player.x + Math.cos(player.aim) * 20;
        const muzzleY = player.y + Math.sin(player.aim) * 20;
        Combat.spawn(muzzleX, muzzleY, player.aim, 'player');
        SB.Effects.muzzle(muzzleX, muzzleY, player.aim);
        SB.Audio.shot(0.7);
        SB.Effects.shake(1.4);
      }
    },

    draw: function (ctx) {
      if (player.inCar) {
        const v = player.inCar;
        drawPerson(ctx, v.x + Math.cos(v.a) * 1, v.y + Math.sin(v.a) * 1, v.a, '#f4dfb0', false);
      } else {
        drawPerson(ctx, player.x, player.y, player.aim, '#f6c453', player.hitFlash > 0);
      }
    }
  };

  SB.Combat = Combat;
  SB.Player = Player;
})();
