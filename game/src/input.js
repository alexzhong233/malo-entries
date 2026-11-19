/* SOLARA BAY - keyboard and mouse state with edge-triggered helpers. */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});

  const down = {};
  const pressed = {};
  const mouse = { x: 0, y: 0, down: false, clicked: false, right: false };
  let canvas = null;

  const BLOCKED = {
    Tab: 1, Space: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1
  };

  function keyEvent(e, isDown) {
    const code = e.code || e.key;
    if (BLOCKED[code]) e.preventDefault();
    if (isDown && !down[code]) pressed[code] = true;
    down[code] = isDown;
    if (isDown && SB.Audio) SB.Audio.init();
  }

  const Input = {
    mouse: mouse,

    init: function (cv) {
      if (canvas) return;
      canvas = cv;
      window.addEventListener('keydown', function (e) { keyEvent(e, true); }, { passive: false });
      window.addEventListener('keyup', function (e) { keyEvent(e, false); }, { passive: false });
      window.addEventListener('blur', function () {
        for (const k in down) down[k] = false;
        mouse.down = false;
      });
      cv.addEventListener('mousemove', function (e) {
        const r = cv.getBoundingClientRect();
        mouse.x = e.clientX - r.left;
        mouse.y = e.clientY - r.top;
      });
      cv.addEventListener('mousedown', function (e) {
        if (SB.Audio) SB.Audio.init();
        if (e.button === 0) { mouse.down = true; mouse.clicked = true; }
        if (e.button === 2) mouse.right = true;
        e.preventDefault();
      });
      window.addEventListener('mouseup', function (e) {
        if (e.button === 0) mouse.down = false;
        if (e.button === 2) mouse.right = false;
      });
      cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    },

    down: function (code) { return !!down[code]; },
    pressed: function (code) {
      if (!pressed[code]) return false;
      delete pressed[code];
      return true;
    },
    // Non-consuming peek, used by menus that need several checks per frame.
    peek: function (code) { return !!pressed[code]; },
    anyDown: function () {
      for (const k in down) if (down[k]) return true;
      return false;
    },
    endFrame: function () {
      for (const k in pressed) delete pressed[k];
      mouse.clicked = false;
    }
  };

  SB.Input = Input;
})();
