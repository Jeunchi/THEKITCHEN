// ---------------------------------------------------------------------------
// Auto-walk: click a nav button (About / Education / Projects / Contact) and
// the bear walks itself to the matching object.
//
// Path strategy per destination (matches how you described it): route
// through a shared "corner" point first, then travel along a consistent
// z-lane to line up with the target's x position, then make one final
// straight approach into the target's exact (x, z). That last straight-in
// segment is what naturally turns the bear to face the object — no special
// rotation logic needed beyond the movement code that already turns the bear
// to face wherever it's currently walking.
//
// Coordinates below are what you measured in-scene. Tweak freely — this file
// is the only place they live.
// ---------------------------------------------------------------------------

const CORNER = { x: -8.01, z: -1.95 }; // shared point where the bear turns from the open floor into the counter lane
const LANE_Z = -1.95; // consistent z used for the "walk along the counter" leg

export const autoWalkDestinations = {
  about: { label: 'Introduction', target: { x: -4.91, z: -2.27 } },  // FRIDGE
  education: { label: 'Education', target: { x: 0.74, z: -2.38 } },  // Microwave
  projects: { label: 'Projects', target: { x: 2.66, z: 2.27 } },     // GAS_RANGE
  contact: { label: 'Contact Me', target: { x: 6.82, z: -2.64 } },   // Trash
};

function buildWaypoints(target) {
  return [
    { x: CORNER.x, z: CORNER.z },
    { x: target.x, z: LANE_Z },
    { x: target.x, z: target.z },
  ];
}

const ARRIVE_THRESHOLD = 0.2; // meters — how close counts as "reached this waypoint"

export class AutoWalkController {
  /** @param {import('./PlayerController.js').PlayerController} playerController */
  constructor(playerController) {
    this.playerController = playerController;
    this.queue = [];
    this.active = false;
  }

  /** @param {keyof typeof autoWalkDestinations} key */
  goTo(key) {
    const dest = autoWalkDestinations[key];
    if (!dest) {
      console.warn(`[AutoWalk] Unknown destination "${key}"`);
      return;
    }
    this.queue = buildWaypoints(dest.target);
    this.active = true;
  }

  cancel() {
    this.active = false;
    this.queue = [];
  }

  /**
   * Call once per frame. Advances toward the current waypoint and pops it
   * once reached. Returns true if it drove movement this frame (caller
   * should skip normal WASD handling in that case).
   */
  update(dt) {
    if (!this.active) return false;

    // If the player takes manual control mid-walk, back off immediately.
    if (this.playerController.hasManualMovementInput()) {
      this.cancel();
      return false;
    }

    if (this.queue.length === 0) {
      this.active = false;
      return false;
    }

    const wp = this.queue[0];
    const pos = this.playerController.root.position;
    const dx = wp.x - pos.x;
    const dz = wp.z - pos.z;
    const dist = Math.hypot(dx, dz);

    if (dist < ARRIVE_THRESHOLD) {
      this.queue.shift();
      if (this.queue.length === 0) {
        this.active = false;
        return false;
      }
      return this.update(dt); // immediately start toward the next waypoint this same frame
    }

    this.playerController.updateAutoWalk(dt, dx, dz);
    return true;
  }
}
