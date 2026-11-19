// Keyboard and pointer state. Held keys are polled; one-shot presses are queued until consume(),
// so a press between two fixed steps is never lost or counted twice.
(function (SB) {
  'use strict';
  const F = SB.FIELD;

  SB.createInput = function (canvas) {
    const held = Object.create(null);
    const pressed = Object.create(null);
    const mouse = { x: F.width / 2, y: F.height / 2, down: false, right: false, click: false };
    const swallow = { ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Space: 1, Tab: 1, Escape: 1 };

    function locate(event) {
      const rect = canvas.getBoundingClientRect();
      // A collapsed (hidden) canvas must not turn the aim point into NaN.
      mouse.x = (event.clientX - rect.left) / (rect.width || 1) * F.width;
      mouse.y = (event.clientY - rect.top) / (rect.height || 1) * F.height;
    }
    window.addEventListener('keydown', function (event) {
      if (swallow[event.code]) event.preventDefault();
      held[event.code] = true;
      if (!event.repeat) pressed[event.code] = true;
    });
    window.addEventListener('keyup', function (event) { held[event.code] = false; });
    window.addEventListener('blur', function () {
      for (const code in held) held[code] = false;
      // Queued one-shots would otherwise fire on the first frame after focus returns.
      for (const code in pressed) pressed[code] = false;
      mouse.down = false; mouse.right = false; mouse.click = false;
    });
    canvas.addEventListener('pointermove', locate);
    canvas.addEventListener('pointerdown', function (event) {
      locate(event);
      if (event.button === 0) { mouse.down = true; pressed.Mouse0 = true; mouse.click = true; }
      if (event.button === 2) { mouse.right = true; pressed.Mouse2 = true; }
      event.preventDefault();
    });
    window.addEventListener('pointerup', function (event) {
      if (event.button === 0) mouse.down = false;
      if (event.button === 2) mouse.right = false;
    });
    canvas.addEventListener('contextmenu', function (event) { event.preventDefault(); });

    return {
      mouse,
      isDown: function (code) { return !!held[code]; },
      axis: function (negative, positive) { return (held[positive] ? 1 : 0) - (held[negative] ? 1 : 0); },
      consume: function (code) {
        if (!pressed[code]) return false;
        pressed[code] = false;
        return true;
      },
      clear: function () {
        for (const code in pressed) pressed[code] = false;
        mouse.click = false;
      },
      aim: function (cam) { return SB.camera.toWorld(cam, mouse.x, mouse.y); },
      // Clear both the click flag and its queued key so a synthetic first gesture cannot leak into a menu.
      firstGesture: function () { mouse.click = false; pressed.Mouse0 = false; return true; }
    };
  };
})(window.SB = window.SB || {});
