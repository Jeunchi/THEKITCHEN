import * as THREE from 'three';

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
 * and crossfades between idle/walk animation clips.
 */
export class PlayerController {
  /**
   * @param {THREE.Object3D} root - the CHEF object (already added to the scene)
   * @param {THREE.AnimationMixer} mixer
   * @param {Record<string, THREE.AnimationAction>} actions - keyed by lowercase clip name
   * @param {{minX:number,maxX:number,minZ:number,maxZ:number}} [bounds] - optional room bounds
   */
  constructor(root, mixer, actions, bounds = null) {
    this.root = root;
    this.mixer = mixer;
    this.actions = actions;
    this.bounds = bounds;

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

    if (speed > 0.001) {
      // Movement direction derived directly from the camera rig's yaw angle
      // (sin/cos of a plain number, always well-defined) rather than reading
      // camera.getWorldDirection() and flattening out its vertical component —
      // that flattening step could produce a zero-length vector (then NaN
      // after normalize()) whenever the camera's pitch was steep, silently
      // breaking movement and turning while the walk animation kept playing.
      this._camForward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      // NOTE: no .negate() here — with this forward formula, cross(forward, up)
      // already gives the correct rightward vector. A .negate() was needed for
      // the old camera.getWorldDirection()-based forward, but left in during
      // a later change it silently swapped A and D.
      this._camRight.crossVectors(this._camForward, THREE.Object3D.DEFAULT_UP);

      this._moveDir.set(0, 0, 0)
        .addScaledVector(this._camForward, inputZ)
        .addScaledVector(this._camRight, inputX);

      if (this._moveDir.lengthSq() > 0.0001) {
        this._moveDir.normalize();

        this.root.position.addScaledVector(this._moveDir, moveSpeed * dt);

        if (this.bounds) {
          this.root.position.x = THREE.MathUtils.clamp(this.root.position.x, this.bounds.minX, this.bounds.maxX);
          this.root.position.z = THREE.MathUtils.clamp(this.root.position.z, this.bounds.minZ, this.bounds.maxZ);
        }

        const lookTarget = new THREE.Vector3().copy(this.root.position).add(this._moveDir);
        const m = new THREE.Matrix4().lookAt(this.root.position, lookTarget, THREE.Object3D.DEFAULT_UP);
        this._targetQuat.setFromRotationMatrix(m);
        this.root.quaternion.slerp(this._targetQuat, Math.min(1, TURN_SPEED * dt));
      }

      this._setAction(this.shiftHeld ? (this._findAction('run') || this._findAction('walk')) : this._findAction('walk'));
    } else {
      this._setAction(this._findAction('idle'));
    }

    this.mixer.update(dt);
  }
}
