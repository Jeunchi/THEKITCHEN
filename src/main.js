import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { PlayerController } from './PlayerController.js';
import { InteractionManager } from './InteractionManager.js';
import { TouchJoystick } from './TouchJoystick.js';
import { buildColliders } from './Colliders.js';
import { initControlsLegend } from './ControlsLegend.js';

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

/**
 * Shows a warning both in the console AND as a visible on-screen banner, so
 * critical setup problems (missing objects, etc.) don't require opening
 * DevTools to notice.
 */
const debugWarningsEl = document.getElementById('debug-warnings');
function showDebugWarning(message) {
  console.error(message);
  debugWarningsEl.classList.remove('hidden');
  const line = document.createElement('div');
  line.textContent = `⚠ ${message}`;
  debugWarningsEl.appendChild(line);
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
// No fog — for a room this size, fog was kicking in well before it should,
// blending distant furniture into the background color and making the whole
// room look dim/washed out whenever the camera pulled back.

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
key.shadow.camera.left = -16;
key.shadow.camera.right = 16;
key.shadow.camera.top = 16;
key.shadow.camera.bottom = -16;
key.shadow.camera.far = 60;
key.shadow.bias = -0.0005; // reduces shadow acne/self-shadowing artifacts
key.shadow.camera.updateProjectionMatrix(); // REQUIRED — without this, the frustum
// changes above never actually apply, and the light keeps using its much smaller
// default bounds. That default frustum's hard edge is exactly what showed up as
// a visible diagonal shadow seam cutting across the room.
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
initControlsLegend();

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
      importedLight.shadow.camera.left = -16;
      importedLight.shadow.camera.right = 16;
      importedLight.shadow.camera.top = 16;
      importedLight.shadow.camera.bottom = -16;
      importedLight.shadow.camera.far = 60;
      importedLight.shadow.bias = -0.0005;
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

  // --- find the bear, and wrap it (mesh + armature) so we move a plain,
  // ordinary Object3D instead of the SkinnedMesh directly ---
  // Some skinned rigs compute their final vertex positions almost entirely
  // from the BONES' own world transforms, largely ignoring the mesh node's
  // own transform. If that's the case here, moving the mesh directly would
  // do nothing visually (even though the position numbers change correctly)
  // — which matches exactly what was reported. Wrapping both the mesh and
  // its armature under one new parent and moving THAT instead works
  // regardless of which behavior this rig uses, because it's the parent
  // transform that both the mesh and the bones ultimately inherit from.
  const chef = findNamedObject(model, PLAYER_ROOT_NAME);
  let playerRoot;
  let pivotCorrection = null;
  let bearCollisionRadius = 0.4; // sensible default, overwritten below once we know the bear's actual size
  if (chef) {
    playerRoot = new THREE.Object3D();
    playerRoot.name = 'BearMovementRig';
    scene.add(playerRoot);
    playerRoot.attach(chef); // reparents while preserving current world position

    // Find the armature's root node by climbing up from any bone in the
    // skeleton, rather than assuming a specific object name — this works
    // regardless of what the armature object is actually called.
    let armatureRoot = null;
    if (chef.isSkinnedMesh && chef.skeleton?.bones?.length) {
      let node = chef.skeleton.bones[0];
      while (node.parent && node.parent.isBone) node = node.parent;
      armatureRoot = node.parent;
    }
    if (armatureRoot && armatureRoot !== chef && armatureRoot !== playerRoot) {
      playerRoot.attach(armatureRoot);
      console.log(`Wrapped "${chef.name}" and its armature ("${armatureRoot.name}") under a single movement rig.`);
    } else {
      console.log(`Wrapped "${chef.name}" under a movement rig (no separate armature root found to attach).`);
    }

    // Re-center the rig's own pivot on the character's actual visual bounding
    // box (X/Z only — Y is left alone so the feet stay on the floor). Without
    // this, if the Bear's original object origin wasn't centered on the
    // character (very easy to end up with on a rigged model), the rig would
    // just inherit that same off-center pivot — meaning rotating it still
    // swings the visible body around a point that isn't where it actually
    // sits, which looks like "turning also slides it sideways," and the
    // boundary clamp (which only checks the pivot's raw X/Z) can let the
    // visible mesh clip through a wall while the pivot itself is still
    // technically in bounds.
    const box = new THREE.Box3().setFromObject(playerRoot);
    const worldCenter = new THREE.Vector3();
    box.getCenter(worldCenter);
    const boxSize = new THREE.Vector3();
    box.getSize(boxSize);
    // Slightly shrink the measured footprint (0.85x) so the bear can still
    // get close enough to obstacles to trigger interaction prompts, rather
    // than being stopped a full body-width away.
    bearCollisionRadius = Math.max(boxSize.x, boxSize.z) / 2 * 0.85;

    const planarDelta = new THREE.Vector3(
      worldCenter.x - playerRoot.position.x,
      0,
      worldCenter.z - playerRoot.position.z
    );
    if (planarDelta.lengthSq() > 0.0001) {
      playerRoot.position.add(planarDelta);
      // Compensate every direct child so nothing visually jumps — the rig
      // has no rotation applied yet at this point, so a plain subtraction
      // (no quaternion transform needed) keeps the visible result identical.
      playerRoot.children.forEach((child) => child.position.sub(planarDelta));
      pivotCorrection = planarDelta.clone();
      console.log(
        `Re-centered the movement rig's pivot by (${planarDelta.x.toFixed(2)}, ${planarDelta.z.toFixed(2)}) ` +
        `to match the bear's actual visual center.`
      );
    }
  } else {
    showDebugWarning(
      `Could not find an object named "${PLAYER_ROOT_NAME}" — movement is disabled. ` +
      `Open DevTools Console and expand "[debug] Object names" to see what's actually ` +
      `in the file, and make sure you re-exported kitchen.glb after any rename.`
    );
    playerRoot = new THREE.Object3D();
    playerRoot.name = 'MISSING_CHEF_PLACEHOLDER';
    scene.add(playerRoot);
  }

  // --- animations ---
  // Mixer root is the WHOLE SCENE (not `model`) on purpose: the wrapping step
  // above may have moved the armature/bones out from under `model` and into
  // playerRoot, which sits directly under `scene`. Using `scene` as the mixer
  // root guarantees every animated node is still reachable no matter how
  // things got reparented.
  const mixer = new THREE.AnimationMixer(scene);
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
    const size = new THREE.Vector3();
    box.getSize(size);

    // The margin keeps the bear clear of walls, but if the floor is thinner
    // than 2x the margin along an axis, min could end up > max — and clamping
    // to an inverted range silently snaps the position to a fixed wrong value
    // every frame (looks exactly like "any movement teleports me to one
    // spot"). Scaling the margin down for thin axes makes that impossible.
    const marginX = Math.min(0.8, size.x * 0.4);
    const marginZ = Math.min(0.8, size.z * 0.4);
    bounds = {
      minX: box.min.x + marginX,
      maxX: box.max.x - marginX,
      minZ: box.min.z + marginZ,
      maxZ: box.max.z - marginZ,
    };

    const center = new THREE.Vector3();
    box.getCenter(center);
    cameraTarget.copy(center);

    // Size the starting camera distance to the room instead of a fixed guess.
    const diagonal = Math.hypot(size.x, size.z);
    camDistance = THREE.MathUtils.clamp(diagonal * 0.65, 12, 30);
  } else {
    console.warn(
      'No object named "Floor" found — falling back to a default walkable area and ' +
      'camera target. The bear may be able to walk through walls, and the camera may ' +
      'not be centered on the room. Check your export for a "Floor" object.'
    );
    bounds = { minX: -8, maxX: 8, minZ: -5, maxZ: 5 };
    cameraTarget.copy(playerRoot.position);
  }

  const colliders = buildColliders(model);
  console.log(`Built ${colliders.length} collision box(es) from the kitchen furniture/appliances.`);

  playerController = new PlayerController(playerRoot, mixer, actions, bounds, colliders, bearCollisionRadius);
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
      camDistance = THREE.MathUtils.clamp(dist, 3, 40);
      yaw = Math.atan2(offset.x, offset.z);
      pitch = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(offset.y / dist, -1, 1)), 0.05, 1.4);
    }
  }

  console.log('Computed walkable bounds:', bounds, '| Bear spawn position:', playerRoot.position.clone());

  // Always-visible status readout — check this on-screen instead of digging
  // through DevTools when something seems wired up wrong.
  const statusEl = document.getElementById('debug-status');
  statusEl.classList.remove('hidden');
  statusEl.textContent =
    `Player root: ${chef ? `"${chef.name}" ✓` : 'NOT FOUND ✗ (placeholder)'}\n` +
    `Animations: ${Object.keys(actions).length ? Object.keys(actions).join(', ') : '(none found)'}\n` +
    `Floor: ${floor ? `"${floor.name}" ✓` : 'NOT FOUND ✗ (default bounds)'}\n` +
    `Bounds: x[${bounds.minX.toFixed(2)}, ${bounds.maxX.toFixed(2)}]  z[${bounds.minZ.toFixed(2)}, ${bounds.maxZ.toFixed(2)}]\n` +
    `Pivot correction: ${pivotCorrection ? `(${pivotCorrection.x.toFixed(2)}, ${pivotCorrection.z.toFixed(2)}) applied` : 'none needed'}\n` +
    `Collision: ${colliders.length} box(es), bear radius ${bearCollisionRadius.toFixed(2)}m\n` +
    `Light: ${importedLight ? `"${importedLight.name}" (${importedLight.type}) ✓` : 'not found (using fallback)'}\n` +
    `Camera: ${importedCamera ? `"${importedCamera.name}" ✓` : 'not found (using computed framing)'}`;

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
const CAM_MAX_DIST = 40;

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
const liveStatusEl = document.getElementById('debug-live');

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

  if (playerController) {
    liveStatusEl.classList.remove('hidden');
    const p = playerController.root.position;
    const heldKeys = [...playerController.keys].join(', ') || '(none)';
    const currentClip = playerController.currentAction?.getClip().name ?? '(none)';

    let interactionLine = 'interaction: (no targets registered)';
    const dn = interactionManager?.debugNearest;
    if (dn) {
      const distOk = dn.dist <= dn.radius;
      const dotOk = dn.dot === null || dn.dot >= 0.35;
      interactionLine =
        `nearest: "${dn.name}"  dist=${dn.dist.toFixed(2)}/${dn.radius.toFixed(2)}${distOk ? ' ✓' : ' ✗ TOO FAR'}  ` +
        `facingDot=${dn.dot === null ? 'n/a' : dn.dot.toFixed(2)}${dotOk ? ' ✓' : ' ✗ NOT FACING'}`;
    }

    liveStatusEl.textContent =
      `LIVE — watch these while pressing WASD:\n` +
      `bear position: x=${p.x.toFixed(2)}  z=${p.z.toFixed(2)}\n` +
      `keys held: ${heldKeys}\n` +
      `shift (run): ${playerController.shiftHeld}\n` +
      `current clip: ${currentClip}\n` +
      interactionLine;
  }

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
