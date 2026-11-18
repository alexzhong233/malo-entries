// Keyboard and pointer input. Movement keys are polled each frame; confirm/pause are queued.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape', 'KeyR']);
const REPEL = new Set(['ShiftLeft', 'ShiftRight']);

export function createInput(target) {
  const keys = new Set();
  let actions = 0;
  let pointerX = 0;
  let pointerY = 0;
  let attract = false;
  let repel = false;

  function updatePointer(event) {
    const rect = target.getBoundingClientRect();
    pointerX = event.clientX - rect.left;
    pointerY = event.clientY - rect.top;
  }

  window.addEventListener('keydown', (event) => {
    keys.add(event.code);
    if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    }
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code) || CONFIRM.has(event.code) || PAUSE.has(event.code)) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });
  window.addEventListener('blur', () => {
    keys.clear();
    attract = false;
    repel = false;
  });

  target.addEventListener('pointermove', updatePointer);
  target.addEventListener('pointerdown', (event) => {
    updatePointer(event);
    if (event.button === 0) attract = true;
    if (event.button === 2) repel = true;
  });
  window.addEventListener('pointerup', (event) => {
    if (event.button === 0) attract = false;
    if (event.button === 2) repel = false;
  });
  target.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    move() {
      const x = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
      const y = (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0);
      const len = Math.hypot(x, y) || 1;
      return { x: x / len, y: y / len };
    },
    pointer() {
      return { x: pointerX, y: pointerY };
    },
    fieldMode() {
      const keyRepel = [...REPEL].some((code) => keys.has(code));
      return { attract, repel: repel || keyRepel };
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
