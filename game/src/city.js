// Procedural Solara Bay: a deterministic road grid, sidewalks, buildings, beach, water and park.
// Data and its one-time painting live here; moving things live in world.js and the modules after it.
(function (SB) {
  'use strict';
  const u = SB.u, P = SB.PALETTE, G = SB.GRID, R = SB.ROAD, S = SB.SIDEWALK, W = SB.WORLD;

  const WALL_COLORS = ['#d9a97b', '#c98f6d', '#e2c39a', '#b97f66', '#d6b48c', '#a98f7d', '#e0b075', '#c4a08e'];
  const ROOF_COLORS = ['#b9825f', '#a87357', '#c4a17e', '#9d7059', '#bd9370'];
  const SHOPS = ['Sunset Market', 'Palm Diner', 'Bay Laundry', 'Coral Cafe', 'Rico\'s Auto', 'Marina Pawn', 'Granada Motel', 'Tiny\'s Reef'];

  function gridDistance(v) {
    let m = v % G;
    if (m < 0) m += G;
    return Math.min(m, G - m);
  }

  function makeBuilding(rng, x, y, w, h, shop) {
    const tall = rng() < 0.32;
    const cols = Math.max(2, Math.floor(w / 26));
    const rows = Math.max(2, Math.floor(h / 28));
    const windows = [];
    for (let i = 0; i < rows * cols; i += 1) windows.push(rng() < (tall ? 0.32 : 0.46) ? 1 : 0);
    return {
      x, y, w, h,
      height: tall ? u.rand(rng, 26, 48) : u.rand(rng, 9, 24),
      color: u.pick(rng, WALL_COLORS), roof: u.pick(rng, ROOF_COLORS),
      cols, rows, windows, shop: shop ? u.pick(rng, SHOPS) : '',
      vents: Math.floor(rng() * 3)
    };
  }

  SB.createCity = function (seed) {
    const rng = SB.rng(seed ^ 0x5ba1a5);
    const buildings = [], palms = [], props = [];
    const park = { x: 2 * G + 62, y: 3 * G + 62, w: G - 124, h: G - 124 };

    for (let cy = 0; cy < SB.NODES - 1; cy += 1) {
      for (let cx = 0; cx < SB.NODES - 1; cx += 1) {
        const x0 = cx * G + R / 2 + S, y0 = cy * G + R / 2 + S;
        const size = G - R - S * 2;
        if (cx === 2 && cy === 3) continue;                 // the park
        const split = rng() < 0.62;
        if (split && size > 150) {
          const vertical = rng() < 0.5;
          const cut = u.rand(rng, 0.40, 0.60) * size;
          const gap = u.rand(rng, 7, 13);
          if (vertical) {
            buildings.push(makeBuilding(rng, x0, y0, cut, size, rng() < 0.4));
            buildings.push(makeBuilding(rng, x0 + cut + gap, y0, size - cut - gap, size, rng() < 0.4));
          } else {
            buildings.push(makeBuilding(rng, x0, y0, size, cut, rng() < 0.4));
            buildings.push(makeBuilding(rng, x0, y0 + cut + gap, size, size - cut - gap, rng() < 0.4));
          }
        } else {
          const inset = u.rand(rng, 3, 12);
          buildings.push(makeBuilding(rng, x0 + inset, y0 + inset, size - inset * 2, size - inset * 2, rng() < 0.55));
        }
        // A couple of street trees per parcel, on the sidewalk band.
        for (let k = 0; k < 2; k += 1) {
          const onVertical = rng() < 0.5;
          const px = onVertical ? cx * G + (rng() < 0.5 ? R / 2 + S / 2 : -R / 2 - S / 2) : x0 + rng() * size;
          const py = onVertical ? y0 + rng() * size : cy * G + (rng() < 0.5 ? R / 2 + S / 2 : -R / 2 - S / 2);
          palms.push({ x: px, y: py, s: u.rand(rng, 0.8, 1.15), lean: u.rand(rng, -0.35, 0.35) });
        }
      }
    }
    for (let i = 0; i < 13; i += 1) palms.push({ x: u.rand(rng, -178, -78), y: u.rand(rng, 40, 1480), s: u.rand(rng, 0.95, 1.4), lean: u.rand(rng, -0.3, 0.3) });
    for (let i = 0; i < 9; i += 1) palms.push({ x: park.x + 14 + rng() * (park.w - 28), y: park.y + 14 + rng() * (park.h - 28), s: u.rand(rng, 0.8, 1.1), lean: u.rand(rng, -0.2, 0.2) });
    for (let i = 0; i < 26; i += 1) props.push({ x: u.rand(rng, W.waterX, -R / 2), y: u.rand(rng, 0, 1500), r: u.rand(rng, 1, 3) });

    const city = {
      seed, buildings, palms, props, park,
      pond: { x: park.x + 40, y: park.y + 46, rx: 46, ry: 32 },
      waves: Array.from({ length: 60 }, () => ({ x: u.rand(rng, W.minX, W.waterX), y: u.rand(rng, W.minY, W.maxY), w: u.rand(rng, 12, 38) })),
      isRoad(x, y) { return gridDistance(x) <= R / 2 || gridDistance(y) <= R / 2; },
      isSidewalk(x, y) {
        const dx = gridDistance(x), dy = gridDistance(y);
        return (dx >= R / 2 && dx <= R / 2 + S) || (dy >= R / 2 && dy <= R / 2 + S);
      },
      isWater(x) { return x < W.waterX; },
      isSand(x) { return x >= W.waterX && x < -R / 2; },
      node(x, y) {
        const i = u.clamp(Math.round(x / G), 0, SB.NODES - 1);
        const j = u.clamp(Math.round(y / G), 0, SB.NODES - 1);
        return { x: i * G, y: j * G, i, j };
      },
      district(x, y) {
        const j = u.clamp(Math.floor(y / G), 0, SB.DISTRICTS.length - 1);
        const i = u.clamp(Math.floor(x / G), 0, SB.DISTRICTS.length - 1);
        return SB.DISTRICTS[(j + (i >> 1)) % SB.DISTRICTS.length];
      },
      street(x, y) {
        const n = city.node(x, y);
        return Math.abs(x - n.x) < Math.abs(y - n.y) ? SB.STREETS_V[n.i] : SB.STREETS_H[n.j];
      },
      buildingAt(x, y) {
        for (let k = 0; k < buildings.length; k += 1) {
          const b = buildings[k];
          if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
        }
        return null;
      },
      resolveCircle(x, y, r) {
        let hit = false, nx = 0, ny = 0;
        for (let pass = 0; pass < 2; pass += 1) {
          for (let k = 0; k < buildings.length; k += 1) {
            const b = buildings[k];
            if (x + r < b.x || x - r > b.x + b.w || y + r < b.y || y - r > b.y + b.h) continue;
            const left = x - (b.x - r), right = (b.x + b.w + r) - x;
            const top = y - (b.y - r), bottom = (b.y + b.h + r) - y;
            const min = Math.min(left, right, top, bottom);
            if (min === left) { x = b.x - r; nx = -1; ny = 0; }
            else if (min === right) { x = b.x + b.w + r; nx = 1; ny = 0; }
            else if (min === top) { y = b.y - r; nx = 0; ny = -1; }
            else { y = b.y + b.h + r; nx = 0; ny = 1; }
            hit = true;
          }
        }
        if (x < W.waterX + 10) { x = W.waterX + 10; nx = 1; ny = 0; hit = true; }
        if (x > W.maxX - r) { x = W.maxX - r; nx = -1; ny = 0; hit = true; }
        if (y < W.minY + r) { y = W.minY + r; nx = 0; ny = 1; hit = true; }
        if (y > W.maxY - r) { y = W.maxY - r; nx = 0; ny = -1; hit = true; }
        return { x, y, nx, ny, hit };
      },
      randomSidewalkPoint(r) {
        for (let attempt = 0; attempt < 40; attempt += 1) {
          const x = u.rand(r, -30, 1500), y = u.rand(r, 0, 1500);
          if (city.isSidewalk(x, y)) return { x, y };
        }
        return { x: 60, y: 60 };
      }
    };
    return city;
  };

  // Static painting, called once into an offscreen canvas by render.js.
  SB.drawCityStatic = function (ctx, city) {
    const r = SB.rng(city.seed ^ 0xc17c);
    ctx.fillStyle = P.sand;
    ctx.fillRect(W.minX, W.minY, W.maxX - W.minX, W.maxY - W.minY);

    // Water, surf and beach.
    const grad = ctx.createLinearGradient(W.minX, 0, W.waterX, 0);
    grad.addColorStop(0, P.waterDeep); grad.addColorStop(1, P.water);
    ctx.fillStyle = grad;
    ctx.fillRect(W.minX, W.minY, W.waterX - W.minX, W.maxY - W.minY);
    ctx.strokeStyle = 'rgba(215,243,232,0.32)'; ctx.lineWidth = 3;
    for (const wave of city.waves) {
      ctx.beginPath();
      ctx.moveTo(wave.x, wave.y);
      ctx.quadraticCurveTo(wave.x + wave.w / 2, wave.y + 6, wave.x + wave.w, wave.y);
      ctx.stroke();
    }
    ctx.strokeStyle = P.foam; ctx.lineWidth = 5; ctx.beginPath();
    for (let y = W.minY; y <= W.maxY; y += 12) {
      const x = W.waterX + Math.sin(y * 0.037) * 5;
      if (y === W.minY) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // Damp sand just above the tide line reads as a soft band instead of a hard colour change.
    const wet = ctx.createLinearGradient(W.waterX, 0, W.waterX + 28, 0);
    wet.addColorStop(0, 'rgba(96,150,140,0.30)');
    wet.addColorStop(1, 'rgba(96,150,140,0)');
    ctx.fillStyle = wet;
    ctx.fillRect(W.waterX, W.minY, 28, W.maxY - W.minY);
    ctx.fillStyle = P.sandDark;
    for (const prop of city.props) ctx.fillRect(prop.x, prop.y, prop.r + 1, prop.r);

    // Sidewalk bands, then roads over the middle of them.
    ctx.fillStyle = P.sidewalk;
    for (let i = 0; i < SB.NODES; i += 1) {
      const c = i * G;
      ctx.fillRect(c - R / 2 - S, W.minY, R + S * 2, W.maxY - W.minY);
      ctx.fillRect(W.minX, c - R / 2 - S, W.maxX - W.minX, R + S * 2);
    }
    ctx.fillStyle = P.asphalt;
    for (let i = 0; i < SB.NODES; i += 1) {
      const c = i * G;
      ctx.fillRect(c - R / 2, W.minY, R, W.maxY - W.minY);
      ctx.fillRect(W.minX, c - R / 2, W.maxX - W.minX, R);
    }
    ctx.fillStyle = 'rgba(90,63,42,0.10)';
    for (let i = 0; i < 180; i += 1) {
      const x = u.rand(r, -30, 1520), y = u.rand(r, 0, 1520);
      if (city.isRoad(x, y)) ctx.fillRect(x, y, u.rand(r, 2, 8), u.rand(r, 2, 5));
    }
    ctx.strokeStyle = P.roadLine; ctx.lineWidth = 2;
    ctx.setLineDash([22, 20]);
    for (let i = 0; i < SB.NODES; i += 1) {
      const c = i * G;
      ctx.beginPath(); ctx.moveTo(c, W.minY); ctx.lineTo(c, W.maxY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W.minX, c); ctx.lineTo(W.maxX, c); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,245,220,0.62)';
    for (let i = 0; i < SB.NODES; i += 1) {
      for (let j = 0; j < SB.NODES; j += 1) {
        const x = i * G, y = j * G;
        for (let k = 0; k < 4; k += 1) {
          ctx.fillRect(x - R / 2 + 3 + k * 9, y - R / 2 - 12, 6, 9);
          ctx.fillRect(x - R / 2 + 3 + k * 9, y + R / 2 + 3, 6, 9);
          ctx.fillRect(x - R / 2 - 12, y - R / 2 + 3 + k * 9, 9, 6);
          ctx.fillRect(x + R / 2 + 3, y - R / 2 + 3 + k * 9, 9, 6);
        }
      }
    }

    // Park: grass, crossing paths, pond, benches.
    const pk = city.park;
    ctx.fillStyle = P.grass; ctx.fillRect(pk.x, pk.y, pk.w, pk.h);
    ctx.fillStyle = 'rgba(255,247,215,0.34)';
    ctx.fillRect(pk.x + pk.w / 2 - 9, pk.y, 18, pk.h);
    ctx.fillRect(pk.x, pk.y + pk.h / 2 - 9, pk.w, 18);
    const pond = city.pond;
    ctx.fillStyle = P.water;
    ctx.beginPath(); ctx.ellipse(pond.x, pond.y, pond.rx, pond.ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(215,243,232,0.55)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(pond.x, pond.y, pond.rx - 6, pond.ry - 5, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#8b6a48';
    for (let i = 0; i < 4; i += 1) ctx.fillRect(pk.x + 18 + i * 42, pk.y + 30, 24, 6);

    // Buildings: drop shadow, shaded side, sunlit roof, windows and shop awnings.
    for (const b of city.buildings) {
      const d = b.height * 0.34;
      ctx.fillStyle = P.shadow;
      ctx.fillRect(b.x + d + 3, b.y + d + 5, b.w, b.h);
      ctx.fillStyle = '#6f523f';
      ctx.fillRect(b.x + d, b.y + d, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = 'rgba(255,245,215,0.28)';
      ctx.fillRect(b.x, b.y, b.w, 5);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
      const cw = b.w / b.cols, ch = b.h / b.rows;
      for (let row = 0; row < b.rows; row += 1) {
        for (let col = 0; col < b.cols; col += 1) {
          const lit = b.windows[row * b.cols + col];
          ctx.fillStyle = lit ? '#ffe3a0' : 'rgba(31,55,62,0.62)';
          ctx.fillRect(b.x + col * cw + 5, b.y + row * ch + 5, Math.max(4, cw - 11), Math.max(4, ch - 12));
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.fillRect(b.x + col * cw + 5, b.y + row * ch + 5, Math.max(4, cw - 11), 2);
        }
      }
      ctx.fillStyle = '#6a4c3b';
      for (let v = 0; v < b.vents; v += 1) ctx.fillRect(b.x + 12 + v * 18, b.y + 10, 10, 8);
      if (b.shop && b.w > 70) {
        ctx.fillStyle = '#e0654d';
        ctx.fillRect(b.x + 4, b.y + b.h - 16, Math.min(b.w - 8, 76), 8);
        ctx.fillStyle = '#fff5da'; ctx.font = '9px ' + SB.FONT; ctx.textBaseline = 'alphabetic';
        ctx.fillText(b.shop.slice(0, 13), b.x + 8, b.y + b.h - 20);
      }
    }

    // Palms last so their fronds shade the road and the sand.
    for (const p of city.palms) {
      ctx.fillStyle = P.shadow;
      ctx.beginPath(); ctx.ellipse(p.x + 7 * p.s, p.y + 6 * p.s, 13 * p.s, 7 * p.s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#7a5a3e'; ctx.lineWidth = 3 * p.s;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.lean * 8 * p.s, p.y - 13 * p.s); ctx.stroke();
      const fx = p.x + p.lean * 8 * p.s, fy = p.y - 13 * p.s;
      for (let k = 0; k < 7; k += 1) {
        const a = k * Math.PI * 2 / 7 + 0.3;
        ctx.strokeStyle = k % 2 ? '#2c7a49' : '#3f9b5b';
        ctx.lineWidth = 3.4 * p.s;
        ctx.beginPath(); ctx.moveTo(fx, fy);
        ctx.quadraticCurveTo(fx + Math.cos(a) * 9 * p.s, fy + Math.sin(a) * 9 * p.s - 4 * p.s,
          fx + Math.cos(a) * 16 * p.s, fy + Math.sin(a) * 13 * p.s + 3 * p.s);
        ctx.stroke();
      }
      ctx.fillStyle = '#8a633b';
      ctx.beginPath(); ctx.arc(fx, fy, 2.5 * p.s, 0, Math.PI * 2); ctx.fill();
    }
  };
})(window.SB = window.SB || {});
