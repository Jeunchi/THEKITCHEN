import * as THREE from 'three';
import { interactiveContent } from './content.js';
import { findGroupObjects } from './nameMatch.js';

const DEFAULT_RADIUS = 3.0; // bear's own collision radius (~1.5m) needs real headroom to ever reach anything
const HIGHLIGHT_COLOR = new THREE.Color(0xC1440E); // tomato accent, matches the UI panel
const HIGHLIGHT_INTENSITY = 1.1; // emissive strength when a material supports it
const HIGHLIGHT_COLOR_MIX = 0.55; // how much to blend toward HIGHLIGHT_COLOR as a fallback (0-1)
// How directly the bear must be facing an object for it to trigger, as a
// dot-product threshold: 1 = dead-on, 0 = 90° off to the side. 0.35 gives a
// generous ~140° total cone in front of the bear — forgiving enough that
// players don't have to aim precisely, while still requiring "roughly facing
// it" rather than triggering from any angle (e.g. with the bear's back turned).
const FACING_DOT_THRESHOLD = 0.35;

/**
 * Clones the materials on every mesh under `objects` so we can safely tweak
 * them for highlighting without affecting any other object in the scene that
 * might happen to share the same material.
 *
 * Two highlight strategies, depending on what the material supports:
 *   - 'emissive': preferred — adds a glow on top of the material's normal
 *     appearance without altering its base color. Works for MeshStandardMaterial
 *     and similar (what glTF normally exports).
 *   - 'color': fallback for materials with no emissive property (e.g. an
 *     "Unlit" material from Blender exports as MeshBasicMaterial) — blends
 *     the material's own color toward the highlight color instead. Every
 *     THREE material with a visible color has a `.color` property, so this
 *     guarantees SOME visible change even on material types we didn't
 *     specifically plan for.
 */
function collectHighlightEntries(objects) {
  const entries = [];
  for (const root of objects) {
    root.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const isArray = Array.isArray(child.material);
      const mats = isArray ? child.material : [child.material];
      const cloned = mats.map((mat) => {
        const clone = mat.clone();
        if ('emissive' in clone) {
          entries.push({
            material: clone,
            mode: 'emissive',
            original: clone.emissive.clone(),
            originalIntensity: clone.emissiveIntensity ?? 1,
          });
        } else if (clone.color) {
          entries.push({
            material: clone,
            mode: 'color',
            original: clone.color.clone(),
          });
        }
        // If neither exists, this material is left as-is (rare — most THREE
        // materials have at least .color).
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
      const highlightEntries = collectHighlightEntries(objects);
      if (highlightEntries.length === 0) {
        console.warn(
          `[InteractionManager] "${name}" has no highlightable materials — it will still ` +
          `respond to proximity/E, but won't visually glow. This is unusual; check its material type.`
        );
      }
      this.targets.push({
        objects,
        centers: objects.map((obj) => new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3())),
        name,
        radius: interactiveContent[name].radius ?? DEFAULT_RADIUS,
        data: interactiveContent[name],
        highlightEntries,
      });
    }
    console.log('[InteractionManager] Registered targets:', this.targets.map((t) => t.name));

    this.nearest = null; // currently-in-range target, or null

    // DOM refs
    this.promptEl = document.getElementById('prompt');
    this.promptTextBubble = document.getElementById('prompt-text-bubble');
    this.promptTextEl = document.getElementById('prompt-text');
    this.promptSignEl = document.getElementById('prompt-sign');
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
      if (entry.mode === 'emissive') {
        if (active) {
          entry.material.emissive.set(HIGHLIGHT_COLOR);
          entry.material.emissiveIntensity = HIGHLIGHT_INTENSITY;
        } else {
          entry.material.emissive.copy(entry.original);
          entry.material.emissiveIntensity = entry.originalIntensity;
        }
      } else if (entry.mode === 'color') {
        if (active) {
          entry.material.color.copy(entry.original).lerp(HIGHLIGHT_COLOR, HIGHLIGHT_COLOR_MIX);
        } else {
          entry.material.color.copy(entry.original);
        }
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
        // Horizontal (XZ) distance only — deliberately ignoring height.
        // Small props sit noticeably higher than the bear's own pivot (they're
        // on top of a counter), and a full 3D distance would penalize them for
        // that height difference even when the bear is standing right next to
        // the counter below them. A walking character's proximity to
        // something should be about how far it has to walk, not how tall the
        // object sits.
        const dx = center.x - this.player.position.x;
        const dz = center.z - this.player.position.z;
        const d = Math.hypot(dx, dz);
        if (d < minDist) {
          minDist = d;
          if (d > 0.001) {
            this._toTarget.set(dx, 0, dz).normalize();
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
      if (closest.data.signImage) {
        this.promptSignEl.src = closest.data.signImage;
        this.promptSignEl.classList.remove('hidden');
        this.promptTextBubble.classList.add('hidden');
      } else {
        this.promptTextEl.textContent = `Press E to view ${closest.data.eyebrow}`;
        this.promptTextBubble.classList.remove('hidden');
        this.promptSignEl.classList.add('hidden');
      }
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
