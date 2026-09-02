import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { PlayerController } from './PlayerController.js';
import { InteractionManager } from './InteractionManager.js';
import { TouchJoystick } from './TouchJoystick.js';

// ---------------------------------------------------------------------------
// CONFIG — change this to match your exported filename
// ---------------------------------------------------------------------------
const MODEL_URL = '/models/kitchen.glb';
const PLAYER_ROOT_NAME = 'CHEF'; // must match the collection/object name in Blender

/**
 * Finds an object by name, tolerating case differences and stray whitespace
 * (both common after a Blender rename + export round-trip). Tries an exact
 * match first, then falls back to a trimmed/lowercased comparison.
 */
function findNamedObject(root, name) {
  const exact = root.getObjectByName(name);
  if (exact) return exact;

  const target = name.trim().toLowerCase();
  let found = null;
  root.traverse((obj) => {
    if (!found && obj.name && obj.name.trim().toLowerCase() === target) {
      found = obj;
    }
  });
  return found;
}

/** Logs every object name in the loaded model — check this if something isn't found. */
function debugLogSceneNames(model) {
  console.groupCollapsed('[debug] Object names in loaded model (click to expand)');
  model.traverse((obj) => {
    console.log(`${obj.type}: "${obj.name || '(unnamed)'}"`);
  });
  console.groupEnd();
}

// ---------------------------------------------------------------------------
// Renderer / Scene / Camera
// ---------------------------------------------------------------------------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a1f1a);
scene.fog = new THREE.Fog(0x2a1f1a, 12, 30);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 3, 6);

// ---------------------------------------------------------------------------
// Lights (your Blender file may already include lights baked into the glTF —
// if so, feel free to delete this block. This is a safe fallback so the
// scene isn't pitch black if it doesn't.)
// ---------------------------------------------------------------------------
const hemi = new THREE.HemisphereLight(0xfff2df, 0x2a1f1a, 0.9);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xffffff, 1.8);
key.position.set(4, 6, 3);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -8;
key.shadow.camera.right = 8;
key.shadow.camera.top = 8;
key.shadow.camera.bottom = -8;
scene.add(key);

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------
const loaderEl = document.getElementById('loader');
const loaderFill = document.getElementById('loader-fill');
const loaderPct = document.getElementById('loader-pct');

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

let playerController = null;
let interactionManager = null;
const clock = new THREE.Clock();

gltfLoader.load(
  MODEL_URL,
  (gltf) => onModelLoaded(gltf),
  (evt) => {
    if (evt.total) {
      const pct = Math.round((evt.loaded / evt.total) * 100);
      loaderFill.style.width = `${pct}%`;
      loaderPct.textContent = `${pct}%`;
    }
  },
  (err) => {
    console.error('Failed to load model:', err);
    loaderPct.textContent = 'Failed to load — see console';
  }
);

function onModelLoaded(gltf) {
  const model = gltf.scene;
  model.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  scene.add(model);
  debugLogSceneNames(model);

  // --- find the bear ---
  const chef = findNamedObject(model, PLAYER_ROOT_NAME);
  let playerRoot;
  if (chef) {
    playerRoot = chef;
  } else {
    console.error(
      `Could not find an object named "${PLAYER_ROOT_NAME}" in the loaded model (see the ` +
      `"[debug] Object names" log above for what's actually there). Movement is DISABLED ` +
      `until this is fixed — using a detached placeholder instead of the whole scene on ` +
      `purpose, so a naming mismatch can't accidentally drag your entire kitchen around.`
    );
    playerRoot = new THREE.Object3D();
    playerRoot.name = 'MISSING_CHEF_PLACEHOLDER';
    scene.add(playerRoot);
  }

  // --- animations ---
  // Attached to the WHOLE loaded model (not just `chef`) on purpose: in Blender,
  // an armature linked via an Armature *modifier* isn't necessarily a parent/child
  // of the mesh object, so the bones might not be descendants of `chef`. Three.js
  // resolves animation tracks by searching the mixer root's full subtree, so using
  // `model` guarantees the bones are reachable no matter how the rig is parented.
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  gltf.animations.forEach((clip) => {
    actions[clip.name.toLowerCase()] = mixer.clipAction(clip);
  });
  if (gltf.animations.length === 0) {
    console.warn('No animation clips found in the .glb — the bear will be static. ' +
      'Make sure your CHEF ANIMATIONS armature actions are included in the export.');
  }

  // Walkable bounds are computed from the actual "Floor" object's bounding box
  // (not hardcoded) so they're always correct regardless of your room's real
  // size or where it sits in world space.
  const floor = findNamedObject(model, 'Floor');
  let bounds;
  if (floor) {
    const box = new THREE.Box3().setFromObject(floor);
    const margin = 0.8; // keep the bear a bit clear of the walls
    bounds = {
      minX: box.min.x + margin,
      maxX: box.max.x - margin,
      minZ: box.min.z + margin,
      maxZ: box.max.z - margin,
    };

    // Size the starting camera distance to the room instead of a fixed guess.
    const size = new THREE.Vector3();
    box.getSize(size);
    const diagonal = Math.hypot(size.x, size.z);
    camDistance = THREE.MathUtils.clamp(diagonal * 0.35, 6, 16);
  } else {
    console.warn(
      'No object named "Floor" found — falling back to a default walkable area. ' +
      'The bear may be able to walk through walls. Check your export for a "Floor" object.'
    );
    bounds = { minX: -8, maxX: 8, minZ: -5, maxZ: 5 };
  }

  playerController = new PlayerController(playerRoot, mixer, actions, bounds);
  interactionManager = new InteractionManager(model, playerRoot);
  interactionManager.setCamera(camera);

  // Snap straight to the intended framing instead of slowly lerping in from
  // the hardcoded startup position — this is the very first thing a visitor
  // sees, so it should be right on the first rendered frame.
  snapCameraTo(playerRoot);

  const joystickVec = new THREE.Vector2();
  new TouchJoystick(joystickVec);
  playerController.joystickVector = joystickVec;

  loaderEl.classList.add('hidden');
  animate();
}

// ---------------------------------------------------------------------------
// Simple third-person camera rig: orbit with mouse/touch drag, follow the bear
// ---------------------------------------------------------------------------
let yaw = 0;
let pitch = 0.5; // higher default angle — the first-load view should read as an overview, not eye-level
let isDragging = false;
let lastX = 0;
let lastY = 0;
let camDistance = 6; // overwritten once the room's real size is known (see onModelLoaded)

function onDragStart(x, y) { isDragging = true; lastX = x; lastY = y; }
function onDragMove(x, y) {
  if (!isDragging) return;
  yaw -= (x - lastX) * 0.005;
  pitch = THREE.MathUtils.clamp(pitch - (y - lastY) * 0.005, 0.08, 1.2);
  lastX = x; lastY = y;
}
function onDragEnd() { isDragging = false; }

canvas.addEventListener('mousedown', (e) => onDragStart(e.clientX, e.clientY));
window.addEventListener('mousemove', (e) => onDragMove(e.clientX, e.clientY));
window.addEventListener('mouseup', onDragEnd);
canvas.addEventListener('touchstart', (e) => {
  if (e.target.closest('#joystick-base') || e.target.closest('#touch-interact')) return;
  onDragStart(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: true });
window.addEventListener('touchmove', (e) => onDragMove(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
window.addEventListener('touchend', onDragEnd);

// --- Shift+WASD: keyboard camera control, fully separate from bear movement ---
// Plain WASD always moves the bear (see PlayerController). Holding Shift flips
// W/A/S/D over to camera orbit/zoom instead, and PlayerController ignores
// movement keys entirely while Shift is held (see setShiftHeld below), so the
// two never fight over the same keys.
let shiftHeld = false;
const cameraKeys = new Set();
const CAMERA_KEY_CODES = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
const CAM_ORBIT_SPEED = 1.2;  // radians/second
const CAM_ZOOM_SPEED = 6;     // meters/second
const CAM_MIN_DIST = 3;
const CAM_MAX_DIST = 20;

window.addEventListener('keydown', (e) => {
  if (e.key === 'Shift') shiftHeld = true;
  if (shiftHeld && CAMERA_KEY_CODES.includes(e.code)) cameraKeys.add(e.code);
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'Shift') shiftHeld = false;
  cameraKeys.delete(e.code);
});

function updateCameraKeys(dt) {
  if (cameraKeys.has('KeyA')) yaw += CAM_ORBIT_SPEED * dt;
  if (cameraKeys.has('KeyD')) yaw -= CAM_ORBIT_SPEED * dt;
  if (cameraKeys.has('KeyW')) camDistance = Math.max(CAM_MIN_DIST, camDistance - CAM_ZOOM_SPEED * dt);
  if (cameraKeys.has('KeyS')) camDistance = Math.min(CAM_MAX_DIST, camDistance + CAM_ZOOM_SPEED * dt);
}

function snapCameraTo(target) {
  const horizDist = camDistance * Math.cos(pitch);
  const height = camDistance * Math.sin(pitch);
  camera.position.set(
    target.position.x + Math.sin(yaw) * horizDist,
    target.position.y + height,
    target.position.z + Math.cos(yaw) * horizDist
  );
  camera.lookAt(target.position.x, target.position.y + 1, target.position.z);
}

function updateCamera(target) {
  const horizDist = camDistance * Math.cos(pitch);
  const height = camDistance * Math.sin(pitch);
  const offset = new THREE.Vector3(
    Math.sin(yaw) * horizDist,
    height,
    Math.cos(yaw) * horizDist
  );
  const desired = new THREE.Vector3().copy(target.position).add(offset);
  camera.position.lerp(desired, 0.12);
  const lookAt = new THREE.Vector3().copy(target.position).add(new THREE.Vector3(0, 1, 0));
  camera.lookAt(lookAt);
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);

  updateCameraKeys(dt);

  if (playerController) {
    playerController.setShiftHeld(shiftHeld);
    playerController.update(dt, camera);
    updateCamera(playerController.root);
  }
  if (interactionManager) {
    interactionManager.update();
  }

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
