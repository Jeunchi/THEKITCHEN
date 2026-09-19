// The WASD/Shift/E legend serves two roles:
//   1. On any device with a keyboard, it lights up in real time as the
//      corresponding physical key is held down (purely visual — movement
//      itself is handled by PlayerController's own keyboard listeners).
//   2. On top of that, every icon is also a real pressable control (via the
//      Pointer Events API, which unifies mouse/touch/pen) — so on phones and
//      tablets, where there's no physical keyboard, the legend itself IS the
//      control scheme: press-and-hold W/A/S/D to move, hold Shift to run,
//      tap E to interact. This replaces the old separate joystick UI.

const KEY_CODE_TO_DATA_KEY = {
  KeyW: 'w',
  KeyA: 'a',
  KeyS: 's',
  KeyD: 'd',
  KeyE: 'e',
};

let slots = {};

function setActive(dataKey, active) {
  const el = slots[dataKey];
  if (!el) return;
  el.classList.toggle('active', active);
}

/** Sets up keyboard-driven highlighting. Safe to call even without a physical keyboard present. */
export function initControlsLegend() {
  document.querySelectorAll('#controls-legend .key-icon').forEach((el) => {
    slots[el.dataset.key] = el;
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Shift') {
      setActive('shift', true);
      return;
    }
    const dataKey = KEY_CODE_TO_DATA_KEY[e.code];
    if (dataKey) setActive(dataKey, true);
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') {
      setActive('shift', false);
      return;
    }
    const dataKey = KEY_CODE_TO_DATA_KEY[e.code];
    if (dataKey) setActive(dataKey, false);
  });

  // If the window/tab loses focus while a key is held, the matching keyup
  // never fires — clear everything so an icon doesn't get stuck lit.
  window.addEventListener('blur', () => {
    Object.keys(slots).forEach((k) => setActive(k, false));
  });
}

const MOVE_KEY_TO_CODE = { w: 'KeyW', a: 'KeyA', s: 'KeyS', d: 'KeyD' };

/**
 * Makes every legend icon an actual pressable control, not just a visual
 * indicator. Call once playerController and interactionManager exist (they
 * don't yet when initControlsLegend() runs at startup, since the model is
 * still loading).
 */
export function enableLegendTouchControls(playerController, interactionManager) {
  for (const [dataKey, code] of Object.entries(MOVE_KEY_TO_CODE)) {
    const el = slots[dataKey];
    if (!el) continue;
    bindPressable(
      el,
      () => playerController.keys.add(code),
      () => playerController.keys.delete(code)
    );
  }

  const shiftEl = slots.shift;
  if (shiftEl) {
    bindPressable(
      shiftEl,
      () => { playerController.shiftHeld = true; },
      () => { playerController.shiftHeld = false; }
    );
  }

  const eEl = slots.e;
  if (eEl) {
    bindPressable(
      eEl,
      () => interactionManager.tryOpenNearest(),
      () => {} // tap-to-trigger; nothing to do on release
    );
  }
}

/**
 * Wires an element to call onPress on pointerdown and onRelease on
 * pointerup/pointercancel, using Pointer Events so mouse, touch, and pen all
 * work identically (including multi-touch — each finger gets its own
 * pointerId, so pressing two icons at once, e.g. W and D, works correctly).
 * setPointerCapture keeps the release tied to this element even if the
 * finger drifts slightly during a long press.
 */
function bindPressable(el, onPress, onRelease) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.setPointerCapture?.(e.pointerId);
    el.classList.add('active');
    onPress();
  });
  const release = (e) => {
    el.classList.remove('active');
    onRelease();
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
}
