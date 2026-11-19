(function (SB) {
  'use strict';

  var keys = Object.create(null);
  var fresh = Object.create(null);
  var mouse = { x: 640, y: 360, down: false, justDown: false, justUp: false, wheel: 0 };
  var block = { Tab: 1, Space: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Escape: 1, KeyC: 1, KeyE: 1, KeyF: 1 };

  function init(canvas) {
    window.addEventListener('keydown', function (e) {
      if (block[e.code]) e.preventDefault();
      if (!e.repeat) fresh[e.code] = true;
      keys[e.code] = true;
      SB.Audio.init(); SB.Audio.resume();
    }, { passive: false });

    window.addEventListener('keyup', function (e) {
      keys[e.code] = false;
    });

    canvas.addEventListener('mousemove', function (e) {
      var r = canvas.getBoundingClientRect();
      mouse.x = (e.clientX - r.left) * (canvas.clientWidth / Math.max(1, r.width));
      mouse.y = (e.clientY - r.top) * (canvas.clientHeight / Math.max(1, r.height));
    });

    canvas.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      mouse.down = true; mouse.justDown = true;
      SB.Audio.init(); SB.Audio.resume();
      e.preventDefault();
    });
    window.addEventListener('mouseup', function (e) {
      if (e.button !== 0) return;
      mouse.down = false; mouse.justUp = true;
    });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    canvas.addEventListener('wheel', function (e) { mouse.wheel += e.deltaY; e.preventDefault(); }, { passive: false });
    window.addEventListener('blur', function () {
      keys = Object.create(null); mouse.down = false;
    });
  }

  function down(code) { return !!keys[code]; }
  function just(code) { return !!fresh[code]; }
  function shift() { return !!(keys.ShiftLeft || keys.ShiftRight); }
  function anyMove() {
    return down('KeyW') || down('KeyA') || down('KeyS') || down('KeyD') ||
      down('ArrowUp') || down('ArrowLeft') || down('ArrowDown') || down('ArrowRight');
  }
  function consume(code) { fresh[code] = false; }

  function endFrame() {
    fresh = Object.create(null);
    mouse.justDown = false;
    mouse.justUp = false;
    mouse.wheel = 0;
  }

  SB.Input = {
    keys: keys, mouse: mouse, init: init, down: down, just: just, consume: consume,
    shift: shift, anyMove: anyMove, endFrame: endFrame,
    worldX: 0, worldY: 0
  };
})(window.SB = window.SB || {});
