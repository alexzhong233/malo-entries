// SOLARA BAY story chain: seven original jobs from Marisol Vega's first approach to the marina
// finale. One file owns mission targets, markers, dialogue, payouts and completion state; the
// rest of the game only calls begin/restart/update/marker/objective.
(function (SB) {
  'use strict';
  const u = SB.u, C = SB.CHARACTERS;

  const JOBS = SB.missions = {};

  // Every job is data first: intro lines, the states it walks through and its payout.
  JOBS.list = [
    {
      title: 'First Contact', client: C.fixer.name, reward: 600,
      intro: [
        [C.fixer.name, 'You are the one Rico told me about. Walk with me, no funny business.'],
        [C.fixer.name, 'Solara Bay pays well if you keep your hands steady and your mouth shut.']
      ],
      objectives: [
        'Meet Marisol Vega on Ocean Boulevard',
        'Follow Marisol to the Sunset Strand lookout'
      ]
    },
    {
      title: 'Keys to the Cargo', client: C.fixer.name, reward: 1100,
      intro: [
        [C.fixer.name, 'Kestrel keeps a delivery van parked near the marina. Bring it to his office.'],
        [C.driver.name, 'Hotwire it, then lose the plates before you get there.']
      ],
      objectives: [
        'Steal Kestrel\'s delivery van (hold E)',
        'Deliver the van to the marina office'
      ]
    },
    {
      title: 'Beach Package', client: C.driver.name, reward: 1500,
      intro: [
        [C.driver.name, 'A package washed up on Sunset Strand. Nobody is supposed to know it exists.'],
        [C.fixer.name, 'Pick it up and bring it to my bench in the park. No sirens.']
      ],
      objectives: [
        'Pick up the package on Sunset Strand',
        'Bring the package to Marisol in the park'
      ]
    },
    {
      title: 'Dock Heist', client: C.fixer.name, reward: 2400,
      intro: [
        [C.fixer.name, 'Kestrel moves dirty cash through the dock at night. That van is ours.'],
        [C.driver.name, 'Once you hotwire it every cruiser in town will know. Drive!']
      ],
      objectives: [
        'Steal the marked dock van (hold E)',
        'Lose the heat and reach the Old Harbor safehouse'
      ]
    },
    {
      title: 'Getaway Chase', client: C.driver.name, reward: 3200,
      intro: [
        [C.driver.name, 'Nightjar put a price on your head. His crew is coming up Granada Avenue!'],
        [C.fixer.name, 'Get to the north safehouse. Do not stop for anything.']
      ],
      objectives: [
        'Outrun Nightjar\'s crew to the north safehouse'
      ]
    },
    {
      title: 'Nightjar\'s Crew', client: C.rival.name, reward: 4200,
      intro: [
        [C.rival.name, 'You stole from Kestrel. That means you stole from me, sunshine.'],
        [C.fixer.name, 'Three of his crew are waiting on Neon Mile. End the argument.']
      ],
      objectives: [
        'Reach Neon Mile',
        'Take down Nightjar\'s three crew members'
      ]
    },
    {
      title: 'Kestrel\'s Reckoning', client: C.fixer.name, reward: 7500,
      intro: [
        [C.fixer.name, 'This ends at the marina office. Kestrel is waiting, and he brought a gun.'],
        [C.marina.name, 'You want the ledger? Come and take it, kid.']
      ],
      objectives: [
        'Confront Dorian Kestrel at the marina office',
        'Take down Kestrel',
        'Escape the five-star heat to the safehouse'
      ]
    }
  ];

  const FREE_ROAM = 'SOLARA BAY CLEARED  ·  Free roam  ·  TAB replays the chain';
  const PARK = { x: 662, y: 962, w: 176, h: 176 };
  const SPOTS = {
    marisol: { x: 600, y: 540 },
    lookout: { x: 600, y: 900 },
    van: { x: 720, y: 619 },
    office: { x: 1500, y: 919 },
    beach: { x: -120, y: 900 },
    rico: { x: 900, y: 1218 },
    dock: { x: 1500, y: 1218 },
    harbor: { x: 300, y: 1500 },
    north: { x: 300, y: 300 },
    neon: { x: 1200, y: 1500 },
    officeDoor: { x: 1500, y: 900 },
    finalEscape: { x: 600, y: 300 }
  };

  function copy(p) { return { x: p.x, y: p.y }; }

  function freshState(m) {
    m.stage = 0;
    m.car = null;
    m.counter = 0;
    m.done = false;
    m.gap = 0;
    m.extra = '';
    m.target = copy(SPOTS.marisol);
    m.rivals = [];
    m.rivalCars = [];
    m.boss = null;
    m.chaseTime = 0;
  }

  function targetFor(index, stage) {
    if (index === 0) return copy(stage === 0 ? SPOTS.marisol : SPOTS.lookout);
    if (index === 1) return copy(SPOTS.van);
    if (index === 2) return copy(stage === 0 ? SPOTS.beach : SPOTS.rico);
    if (index === 3) return copy(stage === 0 ? SPOTS.dock : SPOTS.harbor);
    if (index === 4) return copy(SPOTS.north);
    if (index === 5) return copy(SPOTS.neon); // both stages share the Neon Mile arena
    if (index === 6) return copy(stage === 0 ? SPOTS.officeDoor : SPOTS.finalEscape);
    return copy(SPOTS.marisol);
  }

  JOBS.objective = function (w) {
    const m = w.mission;
    if (m.done) {
      w.objective = FREE_ROAM;
      return;
    }
    const job = JOBS.list[m.index];
    const lines = job.objectives;
    w.objective = lines[Math.min(m.stage, lines.length - 1)] + '  ·  ' + u.money(job.reward);
    if (m.extra) w.objective += '  ·  ' + m.extra;
  };

  function showLine(w) {
    const d = w.dialog;
    if (!d || d.index >= d.lines.length) { w.dialog = null; return; }
    const line = d.lines[d.index];
    d.index += 1;
    d.t = 3.6;
    SB.say(w, line[0] + ':  "' + line[1] + '"', d.hint || 'Follow the golden marker', 3.6);
  }

  JOBS.talk = function (w, lines, hint) {
    if (!lines || !lines.length) return;
    w.dialog = { lines: lines.slice(), index: 0, t: 0, hint: hint };
    showLine(w);
  };

  JOBS.begin = function (w, resumed) {
    const m = w.mission;
    m.index = u.clamp(m.index | 0, 0, JOBS.list.length - 1);
    freshState(m);
    m.target = targetFor(m.index, 0);
    const job = JOBS.list[m.index];
    JOBS.objective(w);
    JOBS.talk(w, job.intro, resumed ? 'Save loaded · follow the golden marker' : 'TAB to skip ahead');
    SB.audio.play(w.audioRef, 'mission');
    if (resumed) SB.save.write(w);
  };

  // A saved index must survive builds with a shorter or longer chain.
  JOBS.resume = function (w, index, done) {
    const m = w.mission;
    m.index = u.clamp(Math.floor(index) || 0, 0, JOBS.list.length - 1);
    JOBS.begin(w, true);
    if (done) {
      m.done = true;
      w.objective = FREE_ROAM;
      SB.say(w, 'Chain complete — save restored', 'TAB to replay the story.', 3.6);
    }
  };

  JOBS.restart = function (w) {
    const m = w.mission;
    if (m.done) { m.index = 0; }
    else { m.index = (m.index + 1) % JOBS.list.length; }
    SB.missions.cleanup(w);
    JOBS.begin(w);
  };
  JOBS.next = JOBS.restart;

  JOBS.marker = function (w) {
    const m = w.mission;
    if (m.done || !w.dialog && m.gap > 0) return null;
    const i = m.index, s = m.stage;
    if (i === 1 && s === 1 && m.car && !m.car.dead) return { x: m.car.x, y: m.car.y, label: 'VAN' };
    if (i === 3 && s === 1 && m.car && !m.car.dead) return { x: m.car.x, y: m.car.y, label: 'DOCK VAN' };
    if (i === 5 && s === 1) {
      for (const ped of m.rivals) if (ped.alive) return { x: ped.x, y: ped.y, label: 'RIVAL' };
    }
    if (i === 6 && s === 1 && m.boss && m.boss.alive) return { x: m.boss.x, y: m.boss.y, label: 'KESTREL' };
    const label = i === 4 || (i === 3 && s === 1) || (i === 6 && s === 2) ? 'ESCAPE'
      : i === 5 && s === 1 ? 'CREW' : i === 6 && s === 0 ? 'FACE' : 'JOB';
    return { x: m.target.x, y: m.target.y, label: label };
  };

  JOBS.pay = function (w, text) {
    const m = w.mission, job = JOBS.list[m.index];
    w.money += job.reward;
    w.stats.missions += 1;
    m.extra = '';
    SB.say(w, 'JOB COMPLETE   +' + u.money(job.reward), text || job.client + ' comes through.', 4.6);
    SB.audio.play(w.audioRef, 'pickup');
    for (let i = 0; i < 12; i += 1) SB.effects.burst(w, w.player.x, w.player.y - 16, 'spark', 2);
    SB.save.write(w);
  };

  function advance(w) {
    const m = w.mission;
    m.stage += 1;
    m.target = targetFor(m.index, m.stage);
    m.extra = '';
  }

  function cleanupCars(w) {
    const m = w.mission;
    for (const car of m.rivalCars || []) {
      if (!car.dead) SB.removeCar(w, car);
    }
    m.rivalCars = [];
    for (const ped of m.rivals || []) {
      if (ped.alive) { ped.alive = false; ped.corpse = 0; }
    }
    m.rivals = [];
    m.boss = null;
  }
  JOBS.cleanup = cleanupCars;

  function arrive(w, radius, needCar) {
    const p = w.player;
    if (needCar && !p.inCar) return false;
    if (!needCar && p.inCar) return false;
    const x = p.inCar ? p.inCar.x : p.x, y = p.inCar ? p.inCar.y : p.y;
    return u.dist(x, y, w.mission.target.x, w.mission.target.y) < radius;
  }

  function findCar(w, spot, type) {
    let car = SB.nearestCar(w, spot.x, spot.y, 120, function (c) {
      return !c.dead && !c.isCop && (!type || c.type === type);
    });
    if (!car) {
      car = SB.makeCar(w, spot.x + 19, spot.y + 19, 0, type || 'delivery', '#d0b06a');
    }
    return car;
  }

  function spawnRivalCar(w, x, y, angle) {
    const car = SB.makeCar(w, x, y, angle, 'sports', '#612c55', {
      ai: { rival: true, hit: 0 }, health: 130
    });
    w.mission.rivalCars.push(car);
    return car;
  }

  function spawnCrew(w, count, center, boss) {
    const list = w.mission.rivals;
    for (let i = 0; i < count; i += 1) {
      const a = i / count * Math.PI * 2 + 0.5;
      const ped = SB.spawnPed(w, center.x + Math.cos(a) * 52, center.y + Math.sin(a) * 52, { rival: true });
      ped.health = boss ? 165 : 68;
      ped.speed = boss ? 112 : 88;
      ped.rival = true;
      ped.fire = 1.2 + i * 0.4;
      ped.name = boss ? C.marina.name : C.rival.name + "'s crew";
      list.push(ped);
      if (boss) w.mission.boss = ped;
    }
  }

  function fightBack(w, ped, dt, damage, range) {
    if (!ped.alive) return;
    const p = w.player;
    const x = p.inCar ? p.inCar.x : p.x, y = p.inCar ? p.inCar.y : p.y;
    const d = u.dist(ped.x, ped.y, x, y);
    if (d > range || d < 24) return;
    ped.fire -= dt;
    if (ped.fire > 0) return;
    ped.fire = (ped.boss ? 1.25 : 1.9) + w.rng() * 0.7;
    ped.angle = Math.atan2(y - ped.y, x - ped.x);
    const a = ped.angle + u.rand(w.rng, -0.1, 0.1);
    SB.addBullet(w, ped.x, ped.y, a, 'cop', damage, 0.12);
    SB.audio.play(w.audioRef, 'gun');
  }

  function updateRivalCars(w, dt) {
    const m = w.mission, p = w.player;
    if (!p.inCar) return;
    const car = p.inCar;
    for (const rival of m.rivalCars) {
      if (rival.dead) continue;
      const dx = car.x - rival.x, dy = car.y - rival.y;
      const d = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      const steer = u.clamp(u.angleDiff(a, rival.angle) * 2.8, -1, 1);
      SB.driveCar(w, rival, d > 48 ? 0.94 : 0.45, steer, false, dt);
      rival.ai.hit -= dt;
      if (d < 46 && rival.ai.hit <= 0) {
        rival.ai.hit = 1.3;
        SB.damageCar(w, car, 9, car.x, car.y);
        SB.hurtPlayer(w, 6, 'ram');
        SB.effects.kick(w, 5);
      }
    }
  }

  JOBS.update = function (w, dt) {
    const m = w.mission;
    if (w.dialog) {
      w.dialog.t -= dt;
      if (w.dialog.t <= 0) showLine(w);
    }
    if (m.gap > 0) {
      m.gap -= dt;
      if (m.gap <= 0) {
        if (m.index + 1 < JOBS.list.length) {
          m.index += 1;
          cleanupCars(w);
          JOBS.begin(w);
          SB.save.write(w); // persist the new job, not the one that just paid out
        } else {
          m.done = true;
          SB.say(w, 'THE SOLARA BAY CHAIN IS CLOSED', 'Marisol: "We are even. For now."  ·  TAB to replay.', 5.5);
          SB.audio.play(w.audioRef, 'mission');
          SB.save.write(w);
        }
      }
      JOBS.objective(w);
      return;
    }
    if (m.done) return;

    switch (m.index) {
      case 0: // First Contact — two short walks with the fixer.
        if (m.stage === 0 && arrive(w, 60, false)) {
          advance(w);
          JOBS.talk(w, [[C.fixer.name, 'Good. The lookout is north. Walk with me where I can see you.']],
            'Follow Marisol to the lookout');
        } else if (m.stage === 1 && arrive(w, 62, false)) {
          JOBS.pay(w, C.fixer.name + ': "You listen. That is rare. Next job is yours."');
          m.stage = 0; m.gap = 4.5;
        }
        break;

      case 1: // Keys to the Cargo — hotwire and deliver.
        if (m.stage === 0 && arrive(w, 70, false)) {
          m.car = findCar(w, SPOTS.van, 'delivery');
          advance(w);
          m.target = copy(SPOTS.office);
          JOBS.talk(w, [[C.driver.name, 'There she is. Hold E by the van, then floor it to Kestrel\'s office.']],
            'Hold E beside the marked van');
        } else if (m.stage === 1) {
          if (!m.car || m.car.dead) m.car = findCar(w, SPOTS.office, 'delivery');
          if (m.car && w.player.inCar === m.car && arrive(w, 92, true)) {
            JOBS.pay(w, C.marina.name + ': "Fresh paint. I will pretend I did not notice."');
            m.stage = 0; m.gap = 4.5;
          }
        }
        break;

      case 2: // Beach Package — pick up and hand off on foot.
        if (m.stage === 0 && arrive(w, 62, false)) {
          advance(w);
          m.target = copy(SPOTS.rico);
          SB.addPickup(w, w.player.x, w.player.y, 'cash', 80);
          JOBS.talk(w, [[C.driver.name, 'Got it. Bring the package to Marisol\'s bench in the park.']],
            'Carry the package to the park');
        } else if (m.stage === 1 && arrive(w, 64, false)) {
          JOBS.pay(w, C.fixer.name + ': "Package is safe. You are proving useful."');
          m.stage = 0; m.gap = 4.5;
        }
        break;

      case 3: // Dock Heist — steal the van, then lose the heat.
        if (m.stage === 0 && arrive(w, 70, false)) {
          m.car = SB.makeCar(w, SPOTS.dock.x + 18, SPOTS.dock.y + 18, -Math.PI / 2, 'delivery', '#2e8f95');
          advance(w);
          SB.raiseWanted(w, 2, 'dock heist in progress');
          JOBS.talk(w, [[C.driver.name, 'Van is hot, and so are we. Get to Old Harbor before they box you in!']],
            'Hold E, then drive to the safehouse');
        } else if (m.stage === 1) {
          if (!m.car || m.car.dead) m.car = findCar(w, SPOTS.dock, 'delivery');
          if (m.car && w.player.inCar === m.car && arrive(w, 96, true)) {
            JOBS.pay(w, C.fixer.name + ': "The cash is counted. Nice driving, amigo."');
            m.stage = 0; m.gap = 5;
          }
        }
        break;

      case 4: // Getaway Chase — enemies and police behind you.
        if (m.stage === 0) {
          if (m.chaseTime === 0) {
            spawnRivalCar(w, 900, 318, -Math.PI / 2);
            spawnRivalCar(w, 600, 318, Math.PI);
            SB.raiseWanted(w, 2, 'Nightjar put a hit on you');
            JOBS.talk(w, [[C.driver.name, 'Nightjar\'s cars are on your tail! Keep moving north!']],
              'Reach the north safehouse');
          }
          m.chaseTime += dt;
          m.extra = Math.max(0, Math.ceil(45 - m.chaseTime)) + 's';
          updateRivalCars(w, dt);
          if (arrive(w, 96, true)) {
            cleanupCars(w);
            JOBS.pay(w, C.driver.name + ': "We lost them. Barely."');
            m.stage = 0; m.gap = 5; m.extra = ''; m.chaseTime = 0;
          }
        }
        break;

      case 5: // Nightjar's Crew — clear the three rivals on Neon Mile.
        if (m.stage === 0 && arrive(w, 78, false)) {
          advance(w);
          spawnCrew(w, 3, SPOTS.neon, false);
          SB.raiseWanted(w, 1, 'shots reported on Neon Mile');
          JOBS.talk(w, [[C.rival.name, 'Three against one. Make it interesting.']],
            'Take down Nightjar\'s crew');
        } else if (m.stage === 1) {
          for (const ped of m.rivals) fightBack(w, ped, dt, 7, 520);
          const left = m.rivals.filter(function (ped) { return ped.alive; }).length;
          m.extra = left + ' crew left';
          if (left === 0) {
            cleanupCars(w);
            JOBS.pay(w, C.fixer.name + ': "Nightjar will notice. Good."');
            m.stage = 0; m.gap = 5; m.extra = '';
          }
        }
        break;

      case 6: // Finale — confront Kestrel, then escape the heat.
        if (m.stage === 0 && arrive(w, 74, false)) {
          advance(w);
          spawnCrew(w, 1, SPOTS.officeDoor, true);
          m.boss.boss = true;
          JOBS.talk(w, [[C.marina.name, 'You are too late for the ledger, and too early for the ambulance.']],
            'Take down Dorian Kestrel');
        } else if (m.stage === 1) {
          if (m.boss) fightBack(w, m.boss, dt, 11, 540);
          m.extra = m.boss && m.boss.alive ? 'Kestrel: ' + Math.max(0, Math.ceil(m.boss.health)) + ' HP' : '';
          if (m.boss && !m.boss.alive) {
            advance(w);
            m.target = copy(SPOTS.finalEscape);
            SB.raiseWanted(w, 3, 'Kestrel is down');
            JOBS.talk(w, [
              [C.fixer.name, 'The ledger is ours. Now get out of here — every cop in the bay is coming.'],
              [C.driver.name, 'Safehouse, north side. GO!']
            ], 'Escape with the heat');
          }
        } else if (m.stage === 2 && arrive(w, 100, true)) {
          cleanupCars(w);
          JOBS.pay(w, C.fixer.name + ': "Kestrel is finished. Solara Bay belongs to the bold."');
          m.stage = 0; m.gap = 5; m.extra = '';
        }
        break;
    }
    JOBS.objective(w);
  };
})(window.SB = window.SB || {});
