import * as THREE from 'three';
import { isPositionFree } from './Colliders.js';

const MOVE_SPEED = 3.2;       // meters/second, walking
const RUN_SPEED = 6;          // meters/second, holding Shift
const TURN_SPEED = 10;        // rotation lerp speed
const KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
};

/**
 * Drives the CHEF bear: reads WASD (or a virtual joystick vector), moves the
 * root object relative to the camera's yaw, faces the direction of travel,
 * and crossfades between idle/walk animation clips. Also exposes
 * updateAutoWalk() for scripted movement (see AutoWalk.js) that shares the
 * exact same collision/rotation/animation logic as manual movement.
 */
export class PlayerController {
  /**
   * @param {THREE.Object3D} root - the CHEF object (already added to the scene)
   * @param {THREE.AnimationMixer} mixer
   * @param {Record<string, THREE.AnimationAction>} actions - keyed by lowercase clip name
   * @param {{minX:number,maxX:number,minZ:number,maxZ:number}} [bounds] - optional room bounds
   * @param {Array<{minX,maxX,minZ,maxZ}>} [colliders] - obstacle boxes the bear can't walk through
   * @param {number} [collisionRadius] - the bear's collision radius, in meters
   */
  constructor(root, mixer, actions, bounds = null, colliders = [], collisionRadius = 0.4) {
    this.root = root;
    this.mixer = mixer;
    this.actions = actions;
    this.bounds = bounds;
    this.colliders = colliders;
    this.collisionRadius = collisionRadius;

    this.keys = new Set();
    this.joystickVector = new THREE.Vector2(0, 0); // set externally by touch controls
    this.shiftHeld = false; // hold Shift to run — this is the ONLY thing Shift does now

    this.currentAction = null;
    this._setAction(this._findAction('idle'));

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Shift') { this.shiftHeld = true; return; }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') { this.shiftHeld = false; return; }
      this.keys.delete(e.code);
    });

    this._moveDir = new THREE.Vector3();
    this._camForward = new THREE.Vector3();
    this._camRight = new THREE.Vector3();
    this._targetQuat = new THREE.Quaternion();
  }

  _findAction(substr) {
    const key = Object.keys(this.actions).find((k) => k.includes(substr));
    return key ? this.actions[key] : null;
  }

  _setAction(next) {
    if (!next || next === this.currentAction) return;
    const prev = this.currentAction;
    next.reset().fadeIn(0.25).play();
    if (prev) prev.fadeOut(0.25);
    this.currentAction = next;
  }

  _isDown(codes) {
    return codes.some((c) => this.keys.has(c));
  }

  /** True if the player is actively pressing a movement key or touch joystick right now. */
  hasManualMovementInput() {
    return (
      this._isDown(KEYS.forward) ||
      this._isDown(KEYS.back) ||
      this._isDown(KEYS.left) ||
      this._isDown(KEYS.right) ||
      this.joystickVector.lengthSq() > 0.0001
    );
  }

  /**
   * Shared movement core: given a normalized world-space direction, applies
   * collision-tested translation, wall-sliding, room bounds, facing rotation,
   * and walk/run animation selection. Used by both manual WASD input
   * (update()) and scripted auto-walk (updateAutoWalk()).
   */
  _applyMovement(dt, dirX, dirZ, moveSpeed) {
    const len = Math.hypot(dirX, dirZ);
    if (len < 0.0001) {
      this._setAction(this._findAction('idle'));
      this.mixer.update(dt);
      return;
    }
    this._moveDir.set(dirX / len, 0, dirZ / len);

    const curX = this.root.position.x;
    const curZ = this.root.position.z;
    const desiredX = curX + this._moveDir.x * moveSpeed * dt;
    const desiredZ = curZ + this._moveDir.z * moveSpeed * dt;

    // Try moving on both axes at once first; if that's blocked, try each
    // axis independently so the bear slides along an obstacle's edge
    // instead of just stopping dead when approaching at an angle.
    if (isPositionFree(desiredX, desiredZ, this.colliders, this.collisionRadius)) {
      this.root.position.x = desiredX;
      this.root.position.z = desiredZ;
    } else {
      if (isPositionFree(desiredX, curZ, this.colliders, this.collisionRadius)) {
        this.root.position.x = desiredX;
      }
      if (isPositionFree(this.root.position.x, desiredZ, this.colliders, this.collisionRadius)) {
        this.root.position.z = desiredZ;
      }
    }

    if (this.bounds) {
      this.root.position.x = THREE.MathUtils.clamp(this.root.position.x, this.bounds.minX, this.bounds.maxX);
      this.root.position.z = THREE.MathUtils.clamp(this.root.position.z, this.bounds.minZ, this.bounds.maxZ);
    }

    // Face the intended direction of travel even if a collision partially
    // or fully blocked the actual movement this frame — turning to "push"
    // against an obstacle reads more naturally than freezing rotation too.
    const lookTarget = new THREE.Vector3().copy(this.root.position).add(this._moveDir);
    const m = new THREE.Matrix4().lookAt(this.root.position, lookTarget, THREE.Object3D.DEFAULT_UP);
    this._targetQuat.setFromRotationMatrix(m);
    this.root.quaternion.slerp(this._targetQuat, Math.min(1, TURN_SPEED * dt));

    this._setAction(this.shiftHeld ? (this._findAction('run') || this._findAction('walk')) : this._findAction('walk'));
    this.mixer.update(dt);
  }

  /**
   * @param {number} dt - seconds since last frame
   * @param {number} yaw - the camera rig's current horizontal orbit angle (radians)
   */
  update(dt, yaw) {
    let inputX = 0; // right (+) / left (-)
    let inputZ = 0; // forward (+) / back (-)

    if (this._isDown(KEYS.forward)) inputZ += 1;
    if (this._isDown(KEYS.back)) inputZ -= 1;
    if (this._isDown(KEYS.right)) inputX += 1;
    if (this._isDown(KEYS.left)) inputX -= 1;

    // merge in virtual joystick (mobile), already normalized -1..1
    inputX += this.joystickVector.x;
    inputZ += this.joystickVector.y;

    inputX = THREE.MathUtils.clamp(inputX, -1, 1);
    inputZ = THREE.MathUtils.clamp(inputZ, -1, 1);

    const speed = Math.hypot(inputX, inputZ);
    const moveSpeed = this.shiftHeld ? RUN_SPEED : MOVE_SPEED;

    if (speed < 0.001) {
      this._setAction(this._findAction('idle'));
      this.mixer.update(dt);
      return;
    }

    // Movement direction derived directly from the camera rig's yaw angle
    // (sin/cos of a plain number, always well-defined) rather than reading
    // camera.getWorldDirection() and flattening out its vertical component —
    // that flattening step could produce a zero-length vector (then NaN
    // after normalize()) whenever the camera's pitch was steep, silently
    // breaking movement and turning while the walk animation kept playing.
    this._camForward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    this._camRight.crossVectors(this._camForward, THREE.Object3D.DEFAULT_UP);

    const worldX = this._camForward.x * inputZ + this._camRight.x * inputX;
    const worldZ = this._camForward.z * inputZ + this._camRight.z * inputX;

    this._applyMovement(dt, worldX, worldZ, moveSpeed);
  }

  /**
   * Scripted movement toward a world-space direction (already normalized or
   * not — _applyMovement normalizes it). Used by AutoWalk. Always walks (no
   * running) for a calm, predictable "walking to destination" feel.
   */
  updateAutoWalk(dt, dirX, dirZ) {
    this._applyMovement(dt, dirX, dirZ, MOVE_SPEED);
  }

  /**
   * Turns in place to face a world-space direction, without moving. Used by
   * AutoWalk's post-arrival "finalFacing" override for objects rotated the
   * opposite way from the rest. Returns true once facing is close enough
   * (dot product against `doneDot`) to consider the turn finished.
   */
  faceDirection(dt, dirX, dirZ, doneDot = 0.995) {
    const len = Math.hypot(dirX, dirZ);
    if (len < 0.0001) return true;
    const nx = dirX / len;
    const nz = dirZ / len;

    const lookTarget = new THREE.Vector3(this.root.position.x + nx, this.root.position.y, this.root.position.z + nz);
    const m = new THREE.Matrix4().lookAt(this.root.position, lookTarget, THREE.Object3D.DEFAULT_UP);
    this._targetQuat.setFromRotationMatrix(m);
    this.root.quaternion.slerp(this._targetQuat, Math.min(1, TURN_SPEED * dt));

    this._setAction(this._findAction('idle')); // standing and turning in place, not walking
    this.mixer.update(dt);

    const currentForward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.root.quaternion);
    const dot = currentForward.x * nx + currentForward.z * nz;
    return dot >= doneDot;
  }
}
