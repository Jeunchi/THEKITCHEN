// Lights up the on-screen WASD/Shift/E key icons in real time as the
// corresponding physical key is held down. Purely visual — movement itself
// is handled entirely by PlayerController; this just listens independently.

const KEY_CODE_TO_DATA_KEY = {
  KeyW: 'w',
  KeyA: 'a',
  KeyS: 's',
  KeyD: 'd',
  KeyE: 'e',
};

export function initControlsLegend() {
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (isTouchDevice) {
    document.getElementById('controls-legend')?.classList.add('hidden');
    return;
  }

  const slots = {};
  document.querySelectorAll('#controls-legend .key-icon').forEach((el) => {
    slots[el.dataset.key] = el;
  });

  function setActive(dataKey, active) {
    const el = slots[dataKey];
    if (!el) return;
    el.classList.toggle('active', active);
  }

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

  // Mobile: light up the E icon while the touch "Interact" button is held.
  const touchBtn = document.getElementById('touch-interact');
  if (touchBtn) {
    touchBtn.addEventListener('touchstart', () => setActive('e', true), { passive: true });
    touchBtn.addEventListener('touchend', () => setActive('e', false));
  }
}
