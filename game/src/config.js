(function (SB) {
  'use strict';

  // Every tunable number in the game lives here so the world stays consistent.
  var CFG = {
    WORLD_W: 6000,
    WORLD_H: 6000,
    ROAD_STEP: 330,
    ROAD_W: 54,
    SIDEWALK: 16,
    BLOCK_CELL: 330,
    WATER_BASE: 175,

    DAY_LENGTH: 420,          // real seconds for a whole day/night cycle
    START_HOUR: 9.4,

    PLAYER: {
      SPEED: 218,
      ACCEL: 1500,
      FRICTION: 9,
      RADIUS: 12,
      MAX_HEALTH: 100,
      SHOOT_DELAY: 0.135,
      BULLET_SPEED: 1150,
      BULLET_LIFE: 0.72
    },

    CAR: {
      ACCEL: 260,
      BOOST: 1.55,
      BRAKE: 470,
      REVERSE: 130,
      MAX_SPEED: 405,
      DRAG: 0.42,
      ROLL: 38,
      TURN: 2.45,
      SIDE_GRIP: 8.5,
      DRIFT_GRIP: 1.45,
      RADIUS: 21,
      MAX_HEALTH: 100
    },

    POLICE: {
      SIGHT: 920,
      DESPAWN: 1900,
      LOSE_TIME: 14,
      OFFICER_SIGHT: 620,
      OFFICER_RANGE: 390,
      MAX_CARS: 8
    },

    CAMERA: {
      FOLLOW: 5.4,
      LOOK_AHEAD: 0.42,
      ZOOM: 1,
      ZOOM_DRIVE: 0.88,
      LERP_ZOOM: 3.2
    },

    COLORS: {
      waterDeep: '#0b8ba3',
      waterShallow: '#36cfd0',
      foam: '#e9fffa',
      sand: '#f2d9a2',
      sandDark: '#d9b97f',
      asphalt: '#555962',
      asphaltLight: '#646872',
      lane: '#f4e6b4',
      sidewalk: '#c9c2ae',
      lot: '#b7ad9b',
      grass: '#79ad5d',
      grassDark: '#5c9349',
      parkPath: '#d8c79a',
      shadow: 'rgba(48,35,28,0.24)',
      ink: '#20262e',
      sun: '#ffd58a',
      police: '#e8f2ff',
      policeBlue: '#2c64c8',
      hud: '#f7f3e8',
      gold: '#ffd45e',
      danger: '#ff5d55'
    },

    BUILDING_PALETTES: [
      ['#e8cfae', '#c9a77e', '#a88262'],
      ['#f0d9bb', '#d3b391', '#ab8c6d'],
      ['#e4c9bd', '#c6a297', '#9d7d74'],
      ['#e9d7a6', '#cbb87f', '#a39463'],
      ['#d9cfc4', '#b3a89c', '#8f857b'],
      ['#f1cfa4', '#d0a878', '#a67e55'],
      ['#d8d6cb', '#b4b2a6', '#8c8b81']
    ],

    CAR_COLORS: [
      '#e94f43', '#f3b431', '#3fa9d8', '#e9e9e2', '#313944',
      '#8d5fc4', '#43b887', '#ef7f3e', '#c9d3dc', '#b03a5b'
    ],

    LANDMARKS: {
      spawn: { x: 965, y: 1120 },
      beach: { x: 275, y: 1180 },
      boardwalk: { x: 390, y: 1650 },
      marina: { x: 545, y: 4310 },
      docks: { x: 520, y: 4750 },
      park: { x: 4540, y: 1840 },
      courthouse: { x: 3600, y: 3430 },
      sunset: { x: 5320, y: 5280 },
      highway: { x: 5520, y: 930 },
      vault: { x: 2940, y: 2600 },
      chopshop: { x: 1295, y: 4020 }
    }
  };

  SB.CFG = CFG;
})(window.SB = window.SB || {});
