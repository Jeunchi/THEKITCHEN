// ---------------------------------------------------------------------------
// Auto-walk: click a nav button (About / Education / Projects / Contact) and
// the bear walks itself to the matching object.
//
// Routing strategy: the 8 points below form a small waypoint graph covering
// the open floor area. Each click finds the graph node NEAREST TO WHEREVER
// THE BEAR CURRENTLY IS, finds the shortest path (Dijkstra over this small
// graph) to the destination's assigned "gateway" node, then does one final
// straight approach from that gateway into the object's exact position. That
// last straight-in segment is what naturally turns the bear to face the
// object, since normal movement already turns the bear to face wherever
// it's walking — no special rotation logic needed.
//
// This means: if you're already near Education and click Introduction, it
// paths from your CURRENT nearest node toward the Introduction gateway
// directly, instead of always resetting to one fixed far corner first.
// ---------------------------------------------------------------------------

const NODES = {
  TOP_RIGHT: { x: -8.50, z: -1.9 },
  TOP_MIDDLE: { x: 0, z: -1.9 },
  TOP_LEFT: { x: 8.8, z: -1.9 },
  MIDDLE_RIGHT: { x: -8.50, z: 1.4 },
  MIDDLE_LEFT: { x: 8.8, z: 1.4 },
  BOTTOM_LEFT: { x: 8.8, z: 5 },
  BOTTOM_MIDDLE: { x: 0, z: 5 },
  BOTTOM_RIGHT: { x: -8.50, z: 5 },
};

// Bidirectional adjacency: connect nodes along the same row and the same
// column. The middle row has no center node, so TOP_MIDDLE <-> BOTTOM_MIDDLE
// gets a direct edge (assumed clear straight down the room's center).
const EDGES = {
  TOP_RIGHT: ['TOP_MIDDLE', 'MIDDLE_RIGHT'],
  TOP_MIDDLE: ['TOP_RIGHT', 'TOP_LEFT', 'BOTTOM_MIDDLE'],
  TOP_LEFT: ['TOP_MIDDLE', 'MIDDLE_LEFT'],
  MIDDLE_RIGHT: ['TOP_RIGHT', 'MIDDLE_LEFT', 'BOTTOM_RIGHT'],
  MIDDLE_LEFT: ['TOP_LEFT', 'MIDDLE_RIGHT', 'BOTTOM_LEFT'],
  BOTTOM_LEFT: ['MIDDLE_LEFT', 'BOTTOM_MIDDLE'],
  BOTTOM_MIDDLE: ['BOTTOM_LEFT', 'BOTTOM_RIGHT', 'TOP_MIDDLE'],
  BOTTOM_RIGHT: ['BOTTOM_MIDDLE', 'MIDDLE_RIGHT'],
};

// Each destination's "gateway" — the graph node closest to where you'd want
// to peel off toward the actual object. All four objects sit near the TOP
// row, so all gateways are TOP-row nodes, chosen by whichever is nearest in
// x to the object's actual position.
export const autoWalkDestinations = {
  about: { label: 'Introduction', target: { x: -4.91, z: -2.27 }, gateway: 'TOP_RIGHT' },   // FRIDGE
  education: { label: 'Education', target: { x: 0.74, z: -2.38 }, gateway: 'TOP_MIDDLE' },  // Microwave
  projects: { label: 'Projects', target: { x: 2.66, z: 2.27 }, gateway: 'TOP_MIDDLE' },      // GAS_RANGE
  contact: { label: 'Contact Me', target: { x: 6.82, z: -2.64 }, gateway: 'TOP_LEFT' },      // Trash
};

function nodeDist(a, b) {
  return Math.hypot(NODES[a].x - NODES[b].x, NODES[a].z - NODES[b].z);
}

function findNearestNode(x, z) {
  let best = null;
  let bestDist = Infinity;
  for (const name of Object.keys(NODES)) {
    const d = Math.hypot(NODES[name].x - x, NODES[name].z - z);
    if (d < bestDist) {
      bestDist = d;
      best = name;
    }
  }
  return best;
}

/** Simple Dijkstra over the small graph above. Returns an array of node names, or null if unreachable. */
function shortestPath(startName, goalName) {
  const dist = {};
  const prev = {};
  const remaining = new Set(Object.keys(NODES));
  Object.keys(NODES).forEach((n) => { dist[n] = Infinity; });
  dist[startName] = 0;

  while (remaining.size > 0) {
    let u = null;
    let best = Infinity;
    for (const n of remaining) {
      if (dist[n] < best) { best = dist[n]; u = n; }
    }
    if (u === null) break;
    remaining.delete(u);
    if (u === goalName) break;

    for (const v of EDGES[u] || []) {
      const alt = dist[u] + nodeDist(u, v);
      if (alt < dist[v]) {
        dist[v] = alt;
        prev[v] = u;
      }
    }
  }

  if (dist[goalName] === Infinity) return null;
  const path = [];
  let cur = goalName;
  while (cur !== undefined) {
    path.unshift(cur);
    cur = prev[cur];
  }
  return path;
}

/** Builds the full waypoint list for a walk from `fromPos` to `dest`. */
function buildWaypoints(fromPos, dest) {
  const startNode = findNearestNode(fromPos.x, fromPos.z);
  const path = shortestPath(startNode, dest.gateway) || [startNode, dest.gateway];

  const waypoints = path.map((name) => ({ x: NODES[name].x, z: NODES[name].z }));

  // Final approach: align x with the target while still on the gateway's
  // row/column, then move straight into the object's exact position. This
  // last straight segment is what turns the bear to face the object.
  const gatewayCoord = NODES[dest.gateway];
  waypoints.push({ x: dest.target.x, z: gatewayCoord.z });
  waypoints.push({ x: dest.target.x, z: dest.target.z });

  return waypoints;
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
    this.queue = buildWaypoints(this.playerController.root.position, dest);
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
