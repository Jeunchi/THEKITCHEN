// ---------------------------------------------------------------------------
// Auto-walk: click a nav button (About / Education / Projects / Contact) and
// the bear walks itself to the matching object.
//
// The 8 points form a single closed loop (ring) around the room's central
// obstacle (the island counter) — think "square donut," walking only along
// the perimeter:
//
//   TOP_LEFT -> TOP_MIDDLE -> TOP_RIGHT -> MIDDLE_RIGHT -> BOTTOM_RIGHT
//   -> BOTTOM_MIDDLE -> BOTTOM_LEFT -> MIDDLE_LEFT -> (back to TOP_LEFT)
//
// Routing:
//   1. Project the bear's CURRENT position onto the ring (nearest point on
//      whichever edge it's closest to — this is usually a named node, but
//      doesn't have to be).
//   2. Project the destination onto the ring the same way.
//   3. Walk the shorter of the two directions around the loop between those
//      two projected points, passing through only the actual named nodes
//      that fall strictly in between.
//   4. The walk naturally stops exactly at the destination's projected
//      point on the ring — it never "overshoots" to the next named node,
//      because that projected point (not the node) is the actual waypoint.
//   5. One final short straight step off the ring into the object's exact
//      position. That final segment is also what turns the bear to face it.
//
// The gas range is rotated the opposite way from the other three, so it
// gets an explicit extra turn-in-place after arriving (see `finalFacing`).
// ---------------------------------------------------------------------------

const RING = [
  { name: 'TOP_LEFT', x: -8.50, z: -1.9 },
  { name: 'TOP_MIDDLE', x: 0, z: -1.9 },
  { name: 'TOP_RIGHT', x: 8.8, z: -1.9 },
  { name: 'MIDDLE_RIGHT', x: 8.8, z: 1.4 },
  { name: 'BOTTOM_RIGHT', x: 8.8, z: 5 },
  { name: 'BOTTOM_MIDDLE', x: 0, z: 5 },
  { name: 'BOTTOM_LEFT', x: -8.50, z: 5 },
  { name: 'MIDDLE_LEFT', x: -8.50, z: 1.4 },
];

// Cumulative arc-length ("s") of each node around the loop, and the total
// perimeter — lets us treat "where on the ring" as a single 1D number and
// find the shorter direction between any two points with simple subtraction.
const RING_S = [0];
for (let i = 1; i < RING.length; i++) {
  const a = RING[i - 1];
  const b = RING[i];
  RING_S.push(RING_S[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
}
const PERIMETER = RING_S[RING_S.length - 1] + Math.hypot(
  RING[0].x - RING[RING.length - 1].x,
  RING[0].z - RING[RING.length - 1].z
);

// NOTE: using z = -1.9 (matching the TOP edge) for all four, not the values
// as literally typed in the request — see the chat explanation for why.
// Double-check these against your actual scene.
//
// All four get an explicit finalFacing turn-in-place after arriving. This is
// necessary because these targets sit exactly ON the ring's edge z, so there
// is no leftover perpendicular "step into the object" for the normal
// movement-direction facing to derive an orientation from — without this,
// the bear would just stop mid-stride still facing sideways along the edge.
export const autoWalkDestinations = {
  about: { label: 'Introduction', target: { x: -4.875, z: -1.9 }, finalFacing: { x: 0, z: 1 } },   // FRIDGE
  education: { label: 'Education', target: { x: 1, z: -1.9 }, finalFacing: { x: 0, z: 1 } },        // Microwave
  projects: {                                                                                        // GAS_RANGE
    label: 'Projects',
    target: { x: 3, z: -1.9 },
    finalFacing: { x: 0, z: -1 }, // rotated opposite the other three
  },
  contact: { label: 'Contact Me', target: { x: 7, z: -1.9 }, finalFacing: { x: 0, z: 1 } },         // Trash
};

/** Nearest point on segment a->b to point p, as a fraction t (0..1) and coords. */
function closestPointOnSegment(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const lenSq = abx * abx + abz * abz;
  let t = lenSq > 0 ? ((px - ax) * abx + (pz - az) * abz) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  return { x: ax + abx * t, z: az + abz * t, t };
}

/** Projects (px, pz) onto the ring: returns the closest point, its arc-length position `s`, and distance. */
function projectToRing(px, pz) {
  let best = null;
  for (let i = 0; i < RING.length; i++) {
    const a = RING[i];
    const b = RING[(i + 1) % RING.length];
    const cp = closestPointOnSegment(px, pz, a.x, a.z, b.x, b.z);
    const d = Math.hypot(px - cp.x, pz - cp.z);
    if (!best || d < best.dist) {
      const edgeLen = Math.hypot(b.x - a.x, b.z - a.z);
      best = { s: RING_S[i] + cp.t * edgeLen, x: cp.x, z: cp.z, dist: d };
    }
  }
  return best;
}

/** Named ring nodes with arc-length position `s` strictly between s1 and s2, walking forward (increasing s, wrapping). */
function nodesBetweenForward(s1, s2) {
  const targetRel = (s2 - s1 + PERIMETER) % PERIMETER;
  const found = [];
  for (let i = 0; i < RING.length; i++) {
    const sRel = (RING_S[i] - s1 + PERIMETER) % PERIMETER;
    if (sRel > 1e-6 && sRel < targetRel - 1e-6) {
      found.push({ x: RING[i].x, z: RING[i].z, sRel });
    }
  }
  found.sort((a, b) => a.sRel - b.sRel);
  return found.map(({ x, z }) => ({ x, z }));
}

/** Builds the ring-following waypoint list (excluding the final off-ring approach) from one point to another. */
function ringPath(fromX, fromZ, toX, toZ) {
  const start = projectToRing(fromX, fromZ);
  const end = projectToRing(toX, toZ);

  const forwardDist = (end.s - start.s + PERIMETER) % PERIMETER;
  const backwardDist = (start.s - end.s + PERIMETER) % PERIMETER;

  const middleNodes = forwardDist <= backwardDist
    ? nodesBetweenForward(start.s, end.s)
    : nodesBetweenForward(end.s, start.s).reverse();

  return [
    { x: start.x, z: start.z },
    ...middleNodes,
    { x: end.x, z: end.z },
  ];
}

/** Builds the full waypoint list for a walk from `fromPos` to `dest`. */
function buildWaypoints(fromPos, dest) {
  const waypoints = ringPath(fromPos.x, fromPos.z, dest.target.x, dest.target.z);
  waypoints.push({ x: dest.target.x, z: dest.target.z }); // final short step off the ring into the object
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
