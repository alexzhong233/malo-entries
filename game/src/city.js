/* SOLARA BAY - deterministic generation of streets, blocks, buildings and scenery. */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});
  const C = SB.C, U = SB.U;

  const ROOFS = [C.COL.roofA, C.COL.roofB, C.COL.roofC, '#e6ad7a', '#f2c995', '#c98d6d'];
  const WALLS = [C.COL.wallA, C.COL.wallB, '#9c6349', '#b57a55'];
  const LABELS = ['SOLARA', 'PALM', 'SUN', 'BAY', 'ARMANDO', 'CORAL', 'OASIS', 'MIRAGE'];

  function generate(seed) {
    const rng = U.makeRng(seed || C.SEED);
    const buildings = [], palms = [], trees = [], umbrellas = [], ponds = [], piers = [];
    const park = { x: 1975, y: 2110, w: 915, h: 890 };
    const inPark = (x, y, w, h) => x < park.x + park.w && x + w > park.x && y < park.y + park.h && y + h > park.y;

    function addBuilding(x, y, w, h, kind) {
      if (w < 26 || h < 26) return;
      const height = kind === 'tower' ? 26 + rng() * 22 : 8 + rng() * 20;
      const b = {
        x: x, y: y, w: w, h: h, height: height,
        roof: U.pick(rng, ROOFS), wall: U.pick(rng, WALLS),
        details: [], kind: kind
      };
      const count = Math.floor(rng() * 4) + (kind === 'tower' ? 3 : 1);
      for (let i = 0; i < count; i++) {
        b.details.push({
          x: 8 + rng() * Math.max(2, w - 28),
          y: 8 + rng() * Math.max(2, h - 28),
          w: 9 + rng() * 18, h: 7 + rng() * 12,
          type: rng() < 0.22 ? 'vent' : 'ac'
        });
      }
      if (kind === 'tower' && w > 95 && h > 80 && rng() < 0.35) {
        b.sign = U.pick(rng, LABELS);
      }
      buildings.push(b);
    }

    for (let gx = 0; gx < 16; gx++) {
      for (let gy = 0; gy < 16; gy++) {
        const bx = C.ROAD_X[gx] + C.HALF + 7;
        const by = C.ROAD_Y[gy] + C.HALF + 7;
        const bw = C.GRID - C.ROAD_W - 14;
        const bh = C.GRID - C.ROAD_W - 14;
        if (inPark(bx, by, bw, bh)) continue;
        const marina = bx < C.INLET_X + 60 && by > C.INLET_Y0 - 60 && by < C.INLET_Y1 + 60;
        if (marina) continue;
        const layout = rng();
        const m = 10 + rng() * 12;
        if (layout < 0.22) {
          addBuilding(bx + m, by + m, bw - 2 * m, bh - 2 * m, 'tower');
        } else if (layout < 0.47) {
          const cut = bw * (0.42 + rng() * 0.2);
          addBuilding(bx + m, by + m, cut - m, bh - 2 * m, 'block');
          addBuilding(bx + cut + 4, by + m, bw - cut - m - 4, bh - 2 * m, 'block');
        } else if (layout < 0.68) {
          const cut = bh * (0.45 + rng() * 0.15);
          addBuilding(bx + m, by + m, bw - 2 * m, cut - m, 'block');
          addBuilding(bx + m, by + cut + 4, bw - 2 * m, bh - cut - m - 4, 'block');
        } else if (layout < 0.9) {
          const hw = (bw - 3 * m) / 2, hh = (bh - 3 * m) / 2;
          addBuilding(bx + m, by + m, hw, hh, 'block');
          addBuilding(bx + 2 * m + hw, by + m, hw, hh, 'block');
          addBuilding(bx + m, by + 2 * m + hh, hw, hh, 'block');
          addBuilding(bx + 2 * m + hw, by + 2 * m + hh, hw, hh, 'block');
        } else {
          addBuilding(bx + m, by + m, bw - 2 * m, 40 + rng() * 30, 'block');
          addBuilding(bx + m, by + bh - m - 48, bw - 2 * m, 40 + rng() * 20, 'block');
          trees.push({ x: bx + bw / 2 + (rng() - 0.5) * 30, y: by + bh / 2, r: 17 });
        }
      }
    }

    // Palm-lined waterfront boulevard and a few inland avenues.
    for (let y = 520; y < 5620; y += 132) {
      if (y > C.INLET_Y0 - 80 && y < C.INLET_Y1 + 80) continue;
      palms.push({ x: 553 + (rng() - 0.5) * 20, y: y + (rng() - 0.5) * 26, r: 15 + rng() * 6 });
      if (rng() < 0.72) palms.push({ x: 703 + (rng() - 0.5) * 12, y: y + 40, r: 13 + rng() * 5 });
    }
    for (let i = 1; i < 16; i += 3) {
      for (let j = 1; j < 16; j += 2) {
        palms.push({ x: C.ROAD_X[i] + 70, y: C.ROAD_Y[j] + 66, r: 12 + rng() * 5 });
      }
    }

    // Beach furniture: striped umbrellas, towels, lifeguard stands.
    for (let i = 0; i < 34; i++) {
      const y = 560 + rng() * 3800;
      if (y > C.INLET_Y0 - 100 && y < C.INLET_Y1 + 100) continue;
      umbrellas.push({
        x: 355 + rng() * 170, y: y,
        color: rng() < 0.5 ? '#ff6b6b' : '#fff1c9',
        rot: rng() < 0.5 ? 1 : -1
      });
    }
    umbrellas.push({ x: 470, y: 2900, hut: true });

    // Marina jetties reach into the inlet; they are walkable above water.
    [4520, 4700, 4880].forEach(function (y, i) {
      piers.push({ x: 318, y: y - 9, w: 292, h: 18, end: i === 1 });
    });

    // Park greenery, pond shapes and winding footpaths.
    for (let i = 0; i < 74; i++) {
      trees.push({
        x: park.x + 22 + rng() * (park.w - 44),
        y: park.y + 22 + rng() * (park.h - 44),
        r: 15 + rng() * 9
      });
    }
    ponds.push({ x: park.x + 200, y: park.y + 620, rx: 190, ry: 92 });
    ponds.push({ x: park.x + 640, y: park.y + 210, rx: 125, ry: 70 });

    return {
      buildings: buildings, palms: palms, trees: trees, umbrellas: umbrellas,
      ponds: ponds, piers: piers, park: park
    };
  }

  SB.City = { generate: generate };
})();
