// ---------------------------------------------------------------------------
// Auto-walk: click a nav button (About / Education / Projects / Contact) and
// the bear walks itself to the matching object.
//
// Routing strategy:
//   1. Classify the bear's CURRENT position and the destination by nearest
//      "row" (TOP z=-1.9, MIDDLE z=1.4, BOTTOM z=5).
//   2. If they're on the SAME row, walk directly: no detour to any edge
//      node at all — just straight to (target.x, rowZ), then straight into
//      the object. This is the common case now that all four objects sit
//      on the MIDDLE row.
//   3. If they're on DIFFERENT rows, transit via whichever edge COLUMN
//      (x=-8.5 or x=8.8) is closer to the bear's current x, moving along
//      that column between rows before proceeding along the destination's
//      row. This avoids the "always detour to one far corner" problem.
//   4. The final straight-in segment naturally turns the bear to face the
//      object, since normal movement already turns the bear to face
//      wherever it's walking. Some objects (currently just the gas range)
//      are rotated the opposite way, so they get an explicit extra
//      turn-in-place step after arriving (see `finalFacing` below).
// ---------------------------------------------------------------------------

const ROW_Z = { TOP: -1.9, MIDDLE: 1.4, BOTTOM: 5 };
const EDGE_LEFT_X = -8.50;
const EDGE_RIGHT_X = 8.8;

export const autoWalkDestinations = {
  about: { label: 'Introduction', target: { x: -4.875, z: 2 }, row: 'MIDDLE' },              // FRIDGE
  education: { label: 'Education', target: { x: 1, z: 2 }, row: 'MIDDLE' },                  // Microwave
  projects: {                                                                                 // GAS_RANGE
    label: 'Projects',
    target: { x: 3, z: 2 },
    row: 'MIDDLE',
    // Rotated the opposite way from the other three appliances, so the
    // natural "face the direction you just walked" result is backwards —
    // explicitly turn to face back toward -Z after arriving.
    finalFacing: { x: 0, z: -1 },
  },
  contact: { label: 'Contact Me', target: { x: 7, z: 2 }, row: 'MIDDLE' },                    // Trash
};

function nearestRow(z) {
  let best = null;
  let bestDist = Infinity;
  for (const [name, rowZ] of Object.entries(ROW_Z)) {
    const d = Math.abs(z - rowZ);
    if (d < bestDist) { bestDist = d; best = name; }
  }
  return best;
}

/** Builds the full waypoint list for a walk from `fromPos` to `dest`. */
function buildWaypoints(fromPos, dest) {
  const startRow = nearestRow(fromPos.z);
  const destRow = dest.row;
  const waypoints = [];

  if (startRow !== destRow) {
    // Only detour to an edge column when actually changing rows — and pick
    // whichever column is closer to the bear's current x, not a fixed one.
    const transitX = Math.abs(fromPos.x - EDGE_LEFT_X) <= Math.abs(fromPos.x - EDGE_RIGHT_X)
      ? EDGE_LEFT_X
      : EDGE_RIGHT_X;
    waypoints.push({ x: transitX, z: ROW_Z[startRow] });
    waypoints.push({ x: transitX, z: ROW_Z[destRow] });
  }

  // Align x on the destination's row, then walk straight into the object.
  waypoints.push({ x: dest.target.x, z: ROW_Z[destRow] });
  waypoints.push({ x: dest.target.x, z: dest.target.z });

  return waypoints;
}

const ARRIVE_THRESHOLD = 0.2; // meters — how close counts as "reached this waypoint"
const FACING_DONE_DOT = 0.995; // how precisely the final turn-in-place must align before finishing

export class AutoWalkController {
  /** @param {import('./PlayerController.js').PlayerController} playerController */
  constructor(playerController) {
    this.playerController = playerController;
    this.queue = [];
    this.active = false;
    this.pendingFinalFacing = null; // {x,z} direction to explicitly face after arriving, or null
    this.turningToFace = null;      // set once we're in the post-arrival turn-in-place phase
  }

  /** @param {keyof typeof autoWalkDestinations} key */
  goTo(key) {
    const dest = autoWalkDestinations[key];
    if (!dest) {
      console.warn(`[AutoWalk] Unknown destination "${key}"`);
      return;
    }
    this.queue = buildWaypoints(this.playerController.root.position, dest);
    this.pendingFinalFacing = dest.finalFacing ?? null;
    this.turningToFace = null;
    this.active = true;
  }

  cancel() {
    this.active = false;
    this.queue = [];
    this.pendingFinalFacing = null;
    this.turningToFace = null;
  }

  /**
   * Call once per frame. Advances toward the current waypoint, pops it once
   * reached, and — after the last waypoint — performs an explicit
   * turn-in-place if the destination specified one. Returns true if it
   * drove the bear this frame (caller should skip normal WASD handling).
   */
  update(dt) {
    if (!this.active) return false;

    // If the player takes manual control mid-walk (or mid-turn), back off immediately.
    if (this.playerController.hasManualMovementInput()) {
      this.cancel();
      return false;
    }

    // Post-arrival turn-in-place phase (only for destinations with finalFacing).
    if (this.turningToFace) {
      const done = this.playerController.faceDirection(dt, this.turningToFace.x, this.turningToFace.z, FACING_DONE_DOT);
      if (done) {
        this.active = false;
        this.turningToFace = null;
      }
      return true;
    }

    if (this.queue.length === 0) {
      if (this.pendingFinalFacing) {
        this.turningToFace = this.pendingFinalFacing;
        this.pendingFinalFacing = null;
        return this.update(dt);
      }
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
        if (this.pendingFinalFacing) {
          this.turningToFace = this.pendingFinalFacing;
          this.pendingFinalFacing = null;
        } else {
          this.active = false;
          return false;
        }
      }
      return this.update(dt); // immediately continue this same frame
    }

    this.playerController.updateAutoWalk(dt, dx, dz);
    return true;
  }
}
