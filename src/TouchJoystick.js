import * as THREE from 'three';

/**
 * Minimal on-screen joystick. Writes a normalized -1..1 vector into
 * `output` (a THREE.Vector2) so PlayerController can merge it with keyboard input.
 */
export class TouchJoystick {
  constructor(output) {
    this.output = output;
    this.base = document.getElementById('joystick-base');
    this.knob = document.getElementById('joystick-knob');
    this.container = document.getElementById('touch-controls');

    this.active = false;
    this.origin = { x: 0, y: 0 };
    this.maxRadius = 40;

    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice) this.container.classList.remove('hidden');

    this.base.addEventListener('touchstart', (e) => this._start(e), { passive: false });
    window.addEventListener('touchmove', (e) => this._move(e), { passive: false });
    window.addEventListener('touchend', (e) => this._end(e));
  }

  _start(e) {
    e.preventDefault();
    this.active = true;
    const rect = this.base.getBoundingClientRect();
    this.origin.x = rect.left + rect.width / 2;
    this.origin.y = rect.top + rect.height / 2;
  }

  _move(e) {
    if (!this.active) return;
    e.preventDefault();
    const touch = e.touches[0];
    let dx = touch.clientX - this.origin.x;
    let dy = touch.clientY - this.origin.y;
    const dist = Math.min(Math.hypot(dx, dy), this.maxRadius);
    const angle = Math.atan2(dy, dx);
    dx = Math.cos(angle) * dist;
    dy = Math.sin(angle) * dist;

    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;

    // screen-down (positive dy) should mean "back", so invert y for forward/back
    this.output.set(dx / this.maxRadius, -dy / this.maxRadius);
  }

  _end() {
    this.active = false;
    this.output.set(0, 0);
    this.knob.style.transform = `translate(0px, 0px)`;
  }
}
