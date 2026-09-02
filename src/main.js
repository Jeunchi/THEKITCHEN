import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { PlayerController } from './PlayerController.js';
import { InteractionManager } from './InteractionManager.js';
import { TouchJoystick } from './TouchJoystick.js';

// ---------------------------------------------------------------------------
// CONFIG — change this to match your exported filename
// ---------------------------------------------------------------------------
const MODEL_URL = '/models/kitchen.glb';
const PLAYER_ROOT_NAME = 'Bear'; // must match the object name in Blender — you renamed it from CHEF to Bear

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
gltfLoader.setMeshoptDecoder(MeshoptDecoder);

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
  // Force an immediate world-matrix update. Without this, Box3().setFromObject()
  // below could read stale (pre-scene-graph) transforms, since Three.js normally
  // only refreshes world matrices during a render pass — and this all runs BEFORE
  // the first render. Skipping this was likely why bounds/camera math was off.
  model.updateMatrixWorld(true);
  debugLogSceneNames(model);

  // --- use your Blender Camera and Sun, if they were exported ---
  // Note: Blender's glTF exporter only includes lights if "Punctual Lights"
  // is checked under the export panel's Lighting section (off by default).
  let importedLight = null;
  let importedCamera = null;
  model.traverse((obj) => {
    if (obj.isLight && !importedLight) importedLight = obj;
    if (obj.isCamera && !importedCamera) importedCamera = obj;
  });

  if (importedLight) {
    console.log(`Using imported light "${importedLight.name}" (${importedLight.type}) from Blender.`);
    importedLight.castShadow = true;
    if (importedLight.shadow?.camera) {
      importedLight.shadow.mapSize.set(2048, 2048);
      importedLight.shadow.camera.left = -12;
      importedLight.shadow.camera.right = 12;
      importedLight.shadow.camera.top = 12;
      importedLight.shadow.camera.bottom = -12;
      importedLight.shadow.camera.updateProjectionMatrix();
    }
    hemi.intensity = 0.25; // dim the fallback fill light rather than remove it — a little ambient fill still helps
    key.visible = false;   // the imported Sun replaces this built-in stand-in
  } else {
    console.warn(
      'No light found in the exported model — using the built-in fallback lights instead. ' +
      'If you added a Sun in Blender, make sure "Punctual Lights" is checked in the glTF ' +
      'export panel (under Lighting) and re-export.'
    );
  }

  if (importedCamera) {
    console.log(`Found imported camera "${importedCamera.name}" — using its framing as the starting view.`);
  }

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

  // If a clip has keyframes on the Bear object's OWN position/rotation/scale
  // (as opposed to only its bones) — e.g. because the walk cycle was authored
  // with the whole object moving during preview in Blender — the mixer would
  // silently overwrite our manual movement/turning every frame, since
  // mixer.update() runs after PlayerController sets the transform each frame.
  // Strip those specific tracks here so only bone animation survives; this is
  // a no-op if no such tracks exist.
  let strippedRootMotion = false;
  const preparedClips = gltf.animations.map((clip) => {
    if (!chef) return clip;
    const prefix = `${chef.name}.`;
    const keptTracks = clip.tracks.filter((t) => !t.name.startsWith(prefix));
    if (keptTracks.length === clip.tracks.length) return clip;
    strippedRootMotion = true;
    const cloned = clip.clone();
    cloned.tracks = keptTracks;
    return cloned;
  });
  if (strippedRootMotion) {
    console.log(
      `Removed root-motion keyframes targeting "${chef.name}" from one or more clips — ` +
      `these would have fought manual movement each frame. Bone animation is untouched.`
    );
  }

  preparedClips.forEach((clip) => {
    actions[clip.name.toLowerCase()] = mixer.clipAction(clip);
  });
  if (gltf.animations.length === 0) {
    console.warn('No animation clips found in the .glb — the bear will be static. ' +
      'Make sure your CHEF ANIMATIONS armature actions are included in the export.');
  }

  // Walkable bounds are computed from the actual "Floor" object's bounding box
  // (not hardcoded) so they're always correct regardless of your room's real
  // size or where it sits in world space. The camera's fixed orbit target is
  // set to the room's center here too — see the camera rig section below for
  // why this only happens once, on load, rather than every frame.
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

    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    cameraTarget.copy(center);

    // Size the starting camera distance to the room instead of a fixed guess.
    const diagonal = Math.hypot(size.x, size.z);
    camDistance = THREE.MathUtils.clamp(diagonal * 0.45, 8, 20);
  } else {
    console.warn(
      'No object named "Floor" found — falling back to a default walkable area and ' +
      'camera target. The bear may be able to walk through walls, and the camera may ' +
      'not be centered on the room. Check your export for a "Floor" object.'
    );
    bounds = { minX: -8, maxX: 8, minZ: -5, maxZ: 5 };
    cameraTarget.copy(playerRoot.position);
  }

  playerController = new PlayerController(playerRoot, mixer, actions, bounds);
  interactionManager = new InteractionManager(model, playerRoot);
  interactionManager.setCamera(camera);

  if (importedCamera) {
    camera.fov = importedCamera.fov ?? camera.fov;
    camera.updateProjectionMatrix();

    const camWorldPos = new THREE.Vector3();
    importedCamera.getWorldPosition(camWorldPos);
    const offset = new THREE.Vector3().subVectors(camWorldPos, cameraTarget);
    const dist = offset.length();
    if (dist > 0.01) {
      camDistance = THREE.MathUtils.clamp(dist, 3, 24);
      yaw = Math.atan2(offset.x, offset.z);
      pitch = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(offset.y / dist, -1, 1)), 0.05, 1.4);
    }
  }

  console.log('Computed walkable bounds:', bounds, '| Bear spawn position:', playerRoot.position.clone());

  // Snap straight to the intended framing instead of slowly lerping in from
  // the hardcoded startup position — this is the very first thing a visitor
  // sees, so it should be right on the first rendered frame.
  snapCameraTo();

  const joystickVec = new THREE.Vector2();
  new TouchJoystick(joystickVec);
  playerController.joystickVector = joystickVec;

  loaderEl.classList.add('hidden');
  animate();
}

// ---------------------------------------------------------------------------
// Camera rig — orbits a FIXED point in the room (set once, from the floor's
// center, or the imported Blender camera's framing, when the model loads).
// The camera never re-centers on the bear automatically. It only ever moves
// via mouse/touch drag (orbit) or the scroll wheel (zoom).
// ---------------------------------------------------------------------------
const cameraTarget = new THREE.Vector3(0, 0, 0);
let yaw = 0;
let pitch = 0.5; // higher default angle — the first-load view should read as an overview, not eye-level
let isDragging = false;
let lastX = 0;
let lastY = 0;
let camDistance = 6; // overwritten once the room's real size (or imported camera) is known
const CAM_MIN_DIST = 3;
const CAM_MAX_DIST = 24;

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

// Scroll wheel zoom — the only other camera control, alongside drag-to-orbit.
// (Shift is reserved for running; see PlayerController.)
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  camDistance = THREE.MathUtils.clamp(camDistance + e.deltaY * 0.01, CAM_MIN_DIST, CAM_MAX_DIST);
}, { passive: false });

function snapCameraTo() {
  const horizDist = camDistance * Math.cos(pitch);
  const height = camDistance * Math.sin(pitch);
  camera.position.set(
    cameraTarget.x + Math.sin(yaw) * horizDist,
    cameraTarget.y + height,
    cameraTarget.z + Math.cos(yaw) * horizDist
  );
  camera.lookAt(cameraTarget.x, cameraTarget.y + 1, cameraTarget.z);
}

function updateCamera() {
  const horizDist = camDistance * Math.cos(pitch);
  const height = camDistance * Math.sin(pitch);
  const desired = new THREE.Vector3(
    cameraTarget.x + Math.sin(yaw) * horizDist,
    cameraTarget.y + height,
    cameraTarget.z + Math.cos(yaw) * horizDist
  );
  // Lerp here just smooths drag/scroll input, NOT chasing the bear —
  // cameraTarget itself never changes on its own.
  camera.position.lerp(desired, 0.15);
  camera.lookAt(cameraTarget.x, cameraTarget.y + 1, cameraTarget.z);
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);

  if (playerController) {
    playerController.update(dt, yaw);
  }
  updateCamera();
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
