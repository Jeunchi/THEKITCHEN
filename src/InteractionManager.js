import * as THREE from 'three';
import { interactiveContent } from './content.js';
import { findGroupObjects } from './nameMatch.js';

const DEFAULT_RADIUS = 2.2;
const HIGHLIGHT_COLOR = new THREE.Color(0xC1440E); // tomato accent, matches the UI panel
const HIGHLIGHT_INTENSITY = 0.55;
// How directly the bear must be facing an object for it to trigger, as a
// dot-product threshold: 1 = dead-on, 0 = 90° off to the side. 0.35 gives a
// generous ~140° total cone in front of the bear — forgiving enough that
// players don't have to aim precisely, while still requiring "roughly facing
// it" rather than triggering from any angle (e.g. with the bear's back turned).
const FACING_DOT_THRESHOLD = 0.35;

/**
 * Clones the materials on every mesh under `objects` so we can safely tweak
 * emissive color for highlighting without affecting any other object in the
 * scene that might happen to share the same material.
 * Returns a flat list of { material, originalEmissive, originalIntensity }.
 */
function collectHighlightEntries(objects) {
  const entries = [];
  for (const root of objects) {
    root.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const isArray = Array.isArray(child.material);
      const mats = isArray ? child.material : [child.material];
      const cloned = mats.map((mat) => {
        if (!('emissive' in mat)) return mat; // e.g. a Basic material — skip highlighting it
        const clone = mat.clone();
        entries.push({
          material: clone,
          originalEmissive: clone.emissive.clone(),
          originalIntensity: clone.emissiveIntensity ?? 1,
        });
        return clone;
      });
      child.material = isArray ? cloned : cloned[0];
    });
  }
  return entries;
}

export class InteractionManager {
  /**
   * @param {THREE.Scene} scene - the loaded kitchen scene
   * @param {THREE.Object3D} player - the object whose position we test proximity against
   */
  constructor(scene, player) {
    this.player = player;
    this.targets = []; // { objects, name, radius, data, highlightEntries }
    this._forward = new THREE.Vector3();
    this._toTarget = new THREE.Vector3();

    for (const name of Object.keys(interactiveContent)) {
      const objects = findGroupObjects(scene, name);
      if (objects.length === 0) {
        console.warn(
          `[InteractionManager] No object(s) found for "${name}" (looked for an exact ` +
          `match and any object named "${name}-01", "${name}-02", ...). Check the exact ` +
          `name(s) in your exported .glb.`
        );
        continue;
      }
      this.targets.push({
        objects,
        centers: objects.map((obj) => new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3())),
        name,
        radius: interactiveContent[name].radius ?? DEFAULT_RADIUS,
        data: interactiveContent[name],
        highlightEntries: collectHighlightEntries(objects),
      });
    }
    console.log('[InteractionManager] Registered targets:', this.targets.map((t) => t.name));

    this.nearest = null; // currently-in-range target, or null

    // DOM refs
    this.promptEl = document.getElementById('prompt');
    this.promptTextEl = document.getElementById('prompt-text');
    this.panelEl = document.getElementById('panel');
    this.panelEyebrow = document.getElementById('panel-eyebrow');
    this.panelTitle = document.getElementById('panel-title');
    this.panelBody = document.getElementById('panel-body');
    this.panelCloseBtn = document.getElementById('panel-close');

    this.isPanelOpen = false;

    this.panelCloseBtn.addEventListener('click', () => this.closePanel());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') this.closePanel();
      if (e.code === 'KeyE') this.tryOpenNearest();
    });

    // Mobile touch "Interact" button — also gated by proximity, never a raw click/tap on the object
    const touchBtn = document.getElementById('touch-interact');
    touchBtn.addEventListener('click', () => this.tryOpenNearest());
  }

  setCamera(camera) {
    this._camera = camera; // kept for potential future use (e.g. screen-space prompt placement)
  }

  _setHighlight(target, active) {
    if (!target) return;
    for (const entry of target.highlightEntries) {
      if (active) {
        entry.material.emissive.set(HIGHLIGHT_COLOR);
        entry.material.emissiveIntensity = HIGHLIGHT_INTENSITY;
      } else {
        entry.material.emissive.copy(entry.originalEmissive);
        entry.material.emissiveIntensity = entry.originalIntensity;
      }
    }
  }

  /** Call once per frame from the render loop. */
  update() {
    if (this.isPanelOpen) return;

    // The bear's local "forward" is -Z by convention (same axis THREE's
    // lookAt-based rotation code points at the movement target), so rotate
    // that into world space using its current orientation.
    this._forward.set(0, 0, -1).applyQuaternion(this.player.quaternion);

    let closest = null;
    let closestDist = Infinity;

    // Diagnostic only: the single nearest object BY DISTANCE ALONE, regardless
    // of whether it passes the radius/facing checks. Exposed as this.debugNearest
    // so the on-screen HUD can show exactly why something isn't triggering.
    let debugName = null;
    let debugDist = Infinity;
    let debugRadius = null;
    let debugDot = null;

    for (const t of this.targets) {
      let minDist = Infinity;
      let minDistFacingOk = false;
      let minDistDot = null;

      for (const center of t.centers) {
        const d = center.distanceTo(this.player.position);
        if (d < minDist) {
          minDist = d;
          if (d > 0.001) {
            this._toTarget.copy(center).sub(this.player.position).normalize();
            minDistDot = this._forward.dot(this._toTarget);
            minDistFacingOk = minDistDot >= FACING_DOT_THRESHOLD;
          } else {
            minDistDot = 1;
            minDistFacingOk = true; // standing right on top of it — don't block on facing
          }
        }
      }

      if (minDist < debugDist) {
        debugDist = minDist;
        debugName = t.name;
        debugRadius = t.radius;
        debugDot = minDistDot;
      }

      if (minDist <= t.radius && minDistFacingOk && minDist < closestDist) {
        closest = t;
        closestDist = minDist;
      }
    }

    this.debugNearest = debugName
      ? { name: debugName, dist: debugDist, radius: debugRadius, dot: debugDot }
      : null;

    if (closest !== this.nearest) {
      this._setHighlight(this.nearest, false);
      this._setHighlight(closest, true);
      this.nearest = closest;
    }

    if (closest) {
      this.promptTextEl.textContent = `Press E to view ${closest.data.eyebrow}`;
      this.promptEl.classList.remove('hidden');
    } else {
      this.promptEl.classList.add('hidden');
    }
  }

  tryOpenNearest() {
    if (this.isPanelOpen || !this.nearest) return;
    this.openPanel(this.nearest);
  }

  openPanel(target) {
    this.isPanelOpen = true;
    this._setHighlight(target, false);
    this.promptEl.classList.add('hidden');
    this.panelEyebrow.textContent = target.data.eyebrow;
    this.panelTitle.textContent = target.data.title;
    this.panelBody.innerHTML = target.data.html;
    this.panelEl.classList.remove('hidden');
  }

  closePanel() {
    this.isPanelOpen = false;
    this.panelEl.classList.add('hidden');
    this.nearest = null; // forces a fresh proximity check (and re-highlight) next frame
  }
}
