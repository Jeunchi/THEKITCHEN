import * as THREE from 'three';
import { findGroupObjects } from './nameMatch.js';

// Which named objects/groups block the bear. Add or remove names to match
// what you actually want solid — small decorative items sitting ON TOP of a
// counter (Plate, Fork, Strawberry, etc.) don't need their own entry, since
// blocking the counter beneath them already stops the bear from walking
// through that whole footprint.
export const colliderObjectNames = [
  'FRIDGE',
  'GAS_RANGE',   // matches "GAS RANGE" too — see normalizeForMatch in nameMatch.js
  'Counter',
  'Cabinet',
  'Countertop',
  'Trash',
  'Exhaust',
];

/**
 * Builds a flat list of world-space AABBs (as plain {minX,maxX,minZ,maxZ}
 * objects — we only care about the floor footprint, not height) for every
 * object matching the given names.
 */
export function buildColliders(scene, names = colliderObjectNames) {
  const boxes = [];
  for (const name of names) {
    const objects = findGroupObjects(scene, name);
    if (objects.length === 0) {
      console.warn(`[Colliders] No object(s) found for "${name}" — it won't block the bear.`);
      continue;
    }
    for (const obj of objects) {
      const box = new THREE.Box3().setFromObject(obj);
      if (box.isEmpty()) continue;
      boxes.push({
        minX: box.min.x,
        maxX: box.max.x,
        minZ: box.min.z,
        maxZ: box.max.z,
        name: obj.name,
      });
    }
  }
  return boxes;
}

/**
 * True if a circle of the given radius centered at (x, z) does NOT overlap
 * any collider box (checked in the XZ / floor plane only).
 */
export function isPositionFree(x, z, colliders, radius) {
  for (const box of colliders) {
    const closestX = THREE.MathUtils.clamp(x, box.minX, box.maxX);
    const closestZ = THREE.MathUtils.clamp(z, box.minZ, box.maxZ);
    const dx = x - closestX;
    const dz = z - closestZ;
    if (dx * dx + dz * dz < radius * radius) return false;
  }
  return true;
}
