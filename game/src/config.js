/* SOLARA BAY - tunable constants and palette. */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});

  const ROAD_X = [];
  const ROAD_Y = [];
  for (let i = 0; i < 17; i++) {
    ROAD_X.push(620 + i * 330);
    ROAD_Y.push(420 + i * 330);
  }

  SB.C = {
    WORLD: 6000,
    GRID: 330,
    ROAD_W: 46,
    HALF: 23,
    ROAD_X: ROAD_X,
    ROAD_Y: ROAD_Y,
    SHORE_BASE: 300,
    SAND_END: 560,
    INLET_Y0: 4420,
    INLET_Y1: 5000,
    INLET_X: 590,
    SEED: 20261119,
    DAY_LENGTH: 300,
    WALK_SPEED: 212,
    SPRINT_MULT: 1.45,
    PLAYER_R: 13,
    CAR_R: 19,
    CAR_ACCEL: 255,
    CAR_BRAKE: 430,
    CAR_DRAG: 0.62,
    CAR_MAX: 335,
    CAR_GRIP: 5.4,
    SHOT_SPEED: 1250,
    SHOT_LIFE: 0.85,
    SAVE_KEY: 'solarabay.save.v1',
    COL: {
      waterDeep: '#0a8fa8',
      water: '#16b9c6',
      waterLight: '#6ee3dd',
      foam: '#eafff8',
      sand: '#e8cd94',
      sandDark: '#d8b77a',
      grass: '#5f9d54',
      grassDark: '#41783e',
      road: '#454b55',
      roadLight: '#555d68',
      lane: '#f4dfa6',
      sidewalk: '#d8c8a9',
      lot: '#c9b592',
      building: '#d9a77c',
      roofA: '#e9bd90',
      roofB: '#d79b72',
      roofC: '#f0cf9e',
      wallA: '#a86d4f',
      wallB: '#8d5a43',
      ink: '#302a2b',
      gold: '#ffcc55',
      pink: '#ff6b81',
      cyan: '#63f0e6',
      danger: '#ff4d4d',
      white: '#fff6e2'
    }
  };
})();
