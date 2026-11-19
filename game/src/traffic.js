(function (SB) {
  'use strict';

  var CFG = SB.CFG, U = SB.U, CITY = SB.City;
  var LANE = CFG.ROAD_W * 0.27;

  function nearestIndex(list, v) {
    var best = 0, bd = Infinity;
    for (var i = 0; i < list.length; i++) {
      var d = Math.abs(list[i] - v);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  function nextIntersection(city, car, x, y) {
    var list, coord, lane, dir = car.dir;
    if (car.axis === 'h') {
      list = city.roadXs; coord = y; lane = car.lane;
      for (var i = 0; i < list.length; i++) {
        var px = list[i] + lane;
        if ((px - x) * dir > 24 && !CITY.isWater(px, coord, city)) {
          return { x: px, y: coord, index: i };
        }
      }
    } else {
      list = city.roadYs; coord = x; lane = car.lane;
      for (var j = 0; j < list.length; j++) {
        var py = list[j] + lane;
        if ((py - y) * dir > 24 && !CITY.isWater(coord, py, city)) {
          return { x: coord, y: py, index: j };
        }
      }
    }
    return null;
  }

  function spawn(world, rng) {
    var city = world.city, road = CITY.randomRoadPoint(city, rng);
    var axis = road.vertical ? 'v' : 'h';
    var dir = rng() > 0.5 ? 1 : -1;
    var lane = dir * LANE;
    var x = axis === 'v' ? road.x + lane : road.x;
    var y = axis === 'v' ? road.y : road.y + lane;
    var angle = axis === 'v' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    var type = rng() > 0.86 ? 'truck' : (rng() > 0.68 ? 'sport' : 'sedan');
    var car = SB.Vehicles.create(x, y, angle, {
      type: type, ai: true, maxSpeed: U.range(rng, 155, 235)
    });
    car.axis = axis;
    car.dir = dir;
    car.lane = lane;
    car.rng = rng;
    car.speed = U.range(rng, 50, 110);
    car.vx = Math.cos(angle) * car.speed;
    car.vy = Math.sin(angle) * car.speed;
    if (rng() > 0.82) { car.color = '#f2c33d'; car.type = 'taxi'; }
    var next = nextIntersection(city, car, x, y);
    if (next) { car.tx = next.x; car.ty = next.y; car.targetIndex = next.index; }
    else { car.tx = x + Math.cos(angle) * 400; car.ty = y + Math.sin(angle) * 400; }
    return car;
  }

  function turnAtIntersection(world, car) {
    var city = world.city, rng = car.rng;
    var straight = car.axis;
    var nextAxis = rng() < 0.24 ? (straight === 'h' ? 'v' : 'h') : straight;
    if (nextAxis !== straight) {
      // Turning swaps which street is the lane and which road we follow.
      var roadList = nextAxis === 'h' ? city.roadYs : city.roadXs;
      var roadCoord = nearestIndex(roadList, nextAxis === 'h' ? car.y : car.x);
      var newDir = rng() > 0.5 ? 1 : -1;
      car.axis = nextAxis;
      car.dir = newDir;
      car.lane = newDir * LANE;
      if (nextAxis === 'h') {
        car.y = roadList[roadCoord] + car.lane;
        car.x += newDir * 6;
      } else {
        car.x = roadList[roadCoord] + car.lane;
        car.y += newDir * 6;
      }
      car.angle = nextAxis === 'h' ? (newDir > 0 ? 0 : Math.PI) : (newDir > 0 ? Math.PI / 2 : -Math.PI / 2);
    } else {
      var list = straight === 'h' ? city.roadXs : city.roadYs;
      var roadIdx = nearestIndex(list, straight === 'h' ? car.x : car.y);
      var ahead = list[roadIdx] + (straight === 'h' ? car.lane : car.lane);
      // Find the first road centre beyond our current position.
      for (var i = 0; i < list.length; i++) {
        if ((list[i] - (straight === 'h' ? car.x : car.y)) * car.dir > 20) { roadIdx = i; break; }
      }
      if (straight === 'h') { car.x = list[roadIdx] + car.lane; }
      else { car.y = list[roadIdx] + car.lane; }
      ahead = straight === 'h' ? car.x : car.y;
    }
    var next = nextIntersection(city, car, car.x, car.y);
    if (next) { car.tx = next.x; car.ty = next.y; car.targetIndex = next.index; }
    else {
      car.dir *= -1;
      car.lane = car.dir * LANE;
      next = nextIntersection(city, car, car.x, car.y);
      if (next) { car.tx = next.x; car.ty = next.y; car.targetIndex = next.index; }
      else { car.tx = car.x + Math.cos(car.angle) * 300; car.ty = car.y + Math.sin(car.angle) * 300; }
    }
  }

  function obstruction(world, car) {
    var fx = Math.cos(car.angle), fy = Math.sin(car.angle);
    var others = world.traffic;
    for (var i = 0; i < others.length; i++) {
      var o = others[i];
      if (o === car || o.wrecked) continue;
      var dx = o.x - car.x, dy = o.y - car.y;
      var forward = dx * fx + dy * fy;
      if (forward < 6 || forward > 105) continue;
      var side = Math.abs(-dx * fy + dy * fx);
      if (side < 22) return true;
    }
    var pc = world.player.car;
    if (pc && pc !== car && !pc.wrecked) {
      var px = pc.x - car.x, py = pc.y - car.y;
      var pf = px * fx + py * fy;
      if (pf > 4 && pf < 125 && Math.abs(-px * fy + py * fx) < 26) return true;
    }
    return false;
  }

  function init(world) {
    world.traffic.length = 0;
    var rng = world.rng;
    for (var i = 0; i < 42; i++) world.traffic.push(spawn(world, rng));
  }

  function update(world, dt) {
    var cam = world.camera;
    for (var i = 0; i < world.traffic.length; i++) {
      var car = world.traffic[i];
      if (car.stolen || car.parked) continue;
      if (U.dist2(car.x, car.y, cam.x, cam.y) > 2300 * 2300) {
        var rp = CITY.randomRoadPoint(world.city, car.rng);
        if (U.dist2(rp.x, rp.y, cam.x, cam.y) < 1400 * 1400) {
          car.x = rp.x; car.y = rp.y;
          car.axis = rp.vertical ? 'v' : 'h';
          car.dir = car.rng() > 0.5 ? 1 : -1;
          car.lane = car.dir * LANE;
          car.angle = car.axis === 'v' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
          var n = nextIntersection(world.city, car, car.x, car.y);
          if (n) { car.tx = n.x; car.ty = n.y; car.targetIndex = n.index; }
        }
        continue;
      }
      if (car.wrecked) {
        SB.Vehicles.integrate(world, car, 0, 0, true, false, dt);
        continue;
      }
      var d = U.dist(car.x, car.y, car.tx, car.ty);
      if (d < 17) turnAtIntersection(world, car);
      d = U.dist(car.x, car.y, car.tx, car.ty);
      var speed = car.maxSpeed * 0.58;
      // A simple two-phase signal keeps the grid from flowing all at once.
      var phase = Math.floor(world.elapsed / 6 + (car.targetIndex || 0)) % 2;
      var redLight = car.axis === 'h' ? phase === 0 : phase === 1;
      if (redLight && d < 92) speed = 0;
      if (obstruction(world, car)) speed = 0;
      if (car.health < 40) speed *= 0.6;
      SB.Vehicles.driveAI(world, car, car.tx, car.ty, dt, { speed: speed, stopAt: 0 });
    }
  }

  SB.Traffic = { init: init, update: update, spawn: spawn };
})(window.SB = window.SB || {});
