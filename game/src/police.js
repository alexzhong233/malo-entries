/* SOLARA BAY - wanted levels, patrols, pursuit cars and officers on foot. */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});
  const C = SB.C, U = SB.U;

  const rng = U.makeRng(C.SEED + 7717);

  const Police = {
    wanted: 0,
    evade: 0,
    cars: [],
    officers: [],
    spawnTimer: 0,
    officerTimer: 0,
    ramCooldown: 0,

    init: function (player) {
      this.reset();
      for (let i = 0; i < 4; i++) {
        const a = rng() * U.TAU;
        const px = U.clamp(player.x + Math.cos(a) * (700 + rng() * 900), 200, C.WORLD - 200);
        const py = U.clamp(player.y + Math.sin(a) * (700 + rng() * 900), 200, C.WORLD - 200);
        const v = SB.Traffic.makePatrol(px, py);
        this.cars.push(v);
        SB.Traffic.cars.push(v);
      }
    },

    reset: function () {
      const carSet = new Set(this.cars);
      const list = SB.Vehicles.list;
      for (let i = list.length - 1; i >= 0; i--) if (carSet.has(list[i])) list.splice(i, 1);
      this.cars.length = 0;
      this.officers.length = 0;
      this.wanted = 0; this.evade = 0;
      this.spawnTimer = 0; this.officerTimer = 0;
      SB.Audio.setSiren(0, false);
    },

    setWanted: function (n) {
      const next = U.clamp(Math.floor(n), 0, 5);
      if (next > this.wanted) { this.evade = 0; SB.Audio.blip(220, 0.2); }
      this.wanted = next;
      if (next === 0) {
        for (let i = 0; i < this.officers.length; i++) this.officers[i].dead = true;
      }
    },

    addWanted: function (n) { this.setWanted(this.wanted + (n || 1)); },

    spawnChaser: function (player) {
      for (let attempt = 0; attempt < 12; attempt++) {
        const a = rng() * U.TAU;
        const d = 820 + rng() * 480;
        const px = U.clamp(player.x + Math.cos(a) * d, 120, C.WORLD - 120);
        const py = U.clamp(player.y + Math.sin(a) * d, 120, C.WORLD - 120);
        const nr = SB.World.nearestRoad(px, py);
        const x = nr.axis === 'v' ? nr.x : px;
        const y = nr.axis === 'h' ? nr.y : py;
        if (SB.World.solid(x, y, 26)) continue;
        const v = SB.Vehicles.spawn(x, y, Math.atan2(player.y - y, player.x - x),
          { kind: 'police', maxSpeed: 350 + this.wanted * 8, accel: 310 });
        v.ai = null;
        this.cars.push(v);
        return v;
      }
      return null;
    },

    spawnOfficer: function (player) {
      for (let attempt = 0; attempt < 14; attempt++) {
        const a = rng() * U.TAU, d = 330 + rng() * 170;
        const x = player.x + Math.cos(a) * d, y = player.y + Math.sin(a) * d;
        if (SB.World.solid(x, y, 14) || SB.World.isWater(x, y)) continue;
        this.officers.push({
          x: x, y: y, a: a, health: 45, dead: false,
          cooldown: 0.7 + rng(), life: 95
        });
        return;
      }
    },

    update: function (dt, player) {
      this.ramCooldown = Math.max(0, this.ramCooldown - dt);
      const w = this.wanted;
      if (w > 0) {
        this.spawnTimer -= dt;
        const targetCars = Math.min(2 + w, 9);
        const liveCars = this.cars.filter(function (c) { return !c.wrecked && !c.occupied; }).length;
        if (liveCars < targetCars && this.spawnTimer <= 0) {
          this.spawnChaser(player);
          this.spawnTimer = 3.4 - w * 0.28;
        }
        this.officerTimer -= dt;
        const targetOfficers = w >= 2 ? Math.min(1 + w, 7) : 0;
        if (this.officers.length < targetOfficers && this.officerTimer <= 0) {
          this.spawnOfficer(player);
          this.officerTimer = 4.5;
        }
      }

      let seesPlayer = false;
      for (let i = 0; i < this.cars.length; i++) {
        const v = this.cars[i];
        if (v.wrecked || v.occupied) continue;
        const d = U.dist(v.x, v.y, player.x, player.y);
        if (w > 0 && d < 900 && SB.World.lineClear(v.x, v.y, player.x, player.y)) seesPlayer = true;
        if (w > 0) {
          v.ai = null;
          const desired = Math.atan2(player.y - v.y, player.x - v.x);
          const diff = U.normAngle(desired - v.a);
          v.controls.steer = U.clamp(diff * 2.35, -1, 1);
          v.controls.throttle = d > 80 ? (Math.abs(diff) > 1.5 ? 0.45 : 1) : 0.2;
          v.controls.brake = d < 55 && v.speed() > 185 ? 0.6 : 0;
          if (d < 58 && v.speed() > 80 && this.ramCooldown <= 0 && SB.World.lineClear(v.x, v.y, player.x, player.y)) {
            this.ramCooldown = 0.75;
            SB.Effects.spark(player.x, player.y, 8);
            sbRam(player, v, w);
            SB.Effects.shake(6);
          }
        }
      }

      for (let i = this.officers.length - 1; i >= 0; i--) {
        const o = this.officers[i];
        o.life -= dt;
        if (o.dead || o.life <= 0) { this.officers.splice(i, 1); continue; }
        const d = U.dist(o.x, o.y, player.x, player.y);
        if (w > 0 && d < 550 && SB.World.lineClear(o.x, o.y, player.x, player.y)) seesPlayer = true;
        o.a = Math.atan2(player.y - o.y, player.x - o.x);
        if (d > 190 && w > 0) {
          const sp = 108 * dt;
          SB.World.move(o, Math.cos(o.a) * sp, Math.sin(o.a) * sp, 12);
        }
        o.cooldown -= dt;
        if (w > 0 && d < 460 && o.cooldown <= 0 && SB.World.lineClear(o.x, o.y, player.x, player.y)) {
          o.cooldown = 0.7 + rng() * 0.7 - w * 0.045;
          const a = o.a + (rng() - 0.5) * (0.26 - w * 0.025);
          SB.Combat.spawn(o.x + Math.cos(a) * 14, o.y + Math.sin(a) * 14, a, 'police', 6 + w);
          SB.Effects.muzzle(o.x, o.y, a);
          SB.Audio.shot(0.42);
        }
      }

      if (w > 0) {
        if (seesPlayer) this.evade = Math.max(0, this.evade - dt * 2.5);
        else this.evade += dt;
        const limit = 9 + w * 6;
        if (this.evade > limit) {
          this.setWanted(w - 1);
          this.evade = 0;
          if (this.wanted === 0) {
            for (let i = 0; i < this.cars.length; i++) {
              const v = this.cars[i];
              if (!v.wrecked && !v.occupied && v.ai === null) SB.Traffic.reassign(v);
            }
          }
        }
      }
      SB.Audio.setSiren(this.wanted, this.wanted > 0);
    },

    draw: function (ctx) {
      for (let i = 0; i < this.officers.length; i++) {
        const o = this.officers[i];
        if (o.dead) continue;
        ctx.save();
        ctx.translate(o.x, o.y);
        ctx.fillStyle = 'rgba(30,25,20,0.3)';
        ctx.beginPath(); ctx.ellipse(2, 5, 11, 6, 0, 0, U.TAU); ctx.fill();
        ctx.rotate(o.a);
        ctx.fillStyle = '#23345a';
        ctx.beginPath(); ctx.arc(0, 0, 9, 0, U.TAU); ctx.fill();
        ctx.fillStyle = '#e9b98f';
        ctx.beginPath(); ctx.arc(2, 0, 5.5, 0, U.TAU); ctx.fill();
        ctx.fillStyle = '#162747';
        ctx.beginPath(); ctx.arc(4, 0, 3.5, 0, U.TAU); ctx.fill();
        ctx.strokeStyle = '#2c3038'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(18, 0); ctx.stroke();
        ctx.restore();
      }
    }
  };

  function sbRam(player, v, w) {
    if (player.inCar) {
      player.inCar.damage(14 + w * 3.5);
      const a = Math.atan2(player.inCar.y - v.y, player.inCar.x - v.x);
      player.inCar.vx += Math.cos(a) * 95;
      player.inCar.vy += Math.sin(a) * 95;
      // PIT: a glancing blow kicked across the target's heading spins it out.
      const rel = U.normAngle(a - v.a);
      if (Math.abs(rel) > 0.35) {
        const side = Math.sin(rel) > 0 ? 1 : -1;
        player.inCar.vx += -Math.sin(v.a) * 78 * side;
        player.inCar.vy += Math.cos(v.a) * 78 * side;
        player.inCar.a += side * 0.09;
        SB.Effects.tire(player.inCar.x, player.inCar.y, player.inCar.a, 1);
      }
    } else if (SB.Combat) {
      SB.Combat.hurtPlayer(6 + w * 2);
    }
  }

  SB.Police = Police;
})();
