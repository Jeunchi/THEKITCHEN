# Chef's Kitchen — 3D Portfolio

An interactive Three.js portfolio built around a Blender kitchen scene. A
bear chef you control (or send on auto-walk) wanders the kitchen; walking up
to and facing an appliance highlights it and lets you open an info panel —
About, Education, Projects, and Contact are told through the fridge,
microwave, gas range, and trash can, plus a few extra props for skills and
fun asides.

Live at: **jjesque-kitchen.vercel.app**

---

## Features

- **Character control** — WASD to move, hold **Shift** to run, mouse drag to
  orbit the camera, scroll to zoom.
- **Collision** — the bear can't walk through the fridge, cabinets, counters,
  or trash can; wall-sliding when approaching at an angle.
- **Proximity interaction** — objects glow when the bear is close **and**
  facing them; press **E** (or click the popup banner) to open that
  object's info panel.
- **Auto-walk navigation** — the four buttons in the top-right (Introduction /
  Education / Projects / Contact Me) path the bear there automatically,
  following the room's walkable perimeter and turning to face the object on
  arrival. Manually pressing a movement key cancels an in-progress walk.
- **Custom UI skin** — every button (movement keys, exit, nav buttons,
  proximity popups) uses hand-made pixel-art assets with normal/hover/onclick
  states, a pixel-font type system (Press Start 2P / Pixelify Sans), and a
  bear-face favicon.
- **Welcome modal** — a one-time onboarding popup explaining controls, shown
  after the loading screen finishes.
- **Mobile support** — on-screen joystick + interact button replace the
  keyboard legend automatically on touch devices.

---

## Running locally

```bash
npm install
npm run dev
```

Open the printed local URL. You'll see the loading bar, then the kitchen
with the bear in it, then the welcome modal.

If something looks wired up wrong (an object doesn't highlight, the bear
doesn't move, etc.), open the browser console — `main.js`,
`InteractionManager.js`, and `Colliders.js` all log clear warnings naming
exactly what wasn't found by name.

---

## Project structure

```
public/models/kitchen.glb   ← the exported Blender scene (not committed if it's large — see below)
public/ui/                  ← all pixel-art UI assets (see naming convention below)

src/main.js                 ← scene, camera rig, lighting, loading, render loop
src/PlayerController.js     ← WASD/Shift movement, collision-aware translation, animation blending
src/AutoWalk.js             ← nav-button pathfinding (ring-perimeter routing around the room)
src/Colliders.js            ← builds obstacle bounding boxes; circle-vs-box overlap test
src/InteractionManager.js   ← proximity + facing detection, highlight, panel UI, signage popup
src/ControlsLegend.js       ← live key-press highlighting for the on-screen legend
src/TouchJoystick.js        ← mobile on-screen joystick
src/nameMatch.js            ← shared Blender-object-name matching (handles space/underscore/grouping quirks)
src/content.js              ← EDIT THIS — all panel copy, links, and per-object settings
src/style.css               ← the entire UI design system
index.html                  ← DOM shell (canvas + every UI overlay)
```

---

## How the pieces fit together

### The model (`public/models/kitchen.glb`)

Exported from Blender as a single glTF Binary file. A few names matter
because the code looks objects up by name:

- **`Bear`** — the player character (`PLAYER_ROOT_NAME` in `main.js`).
  Animation clips are found by substring match on `"walk"`, `"run"`, `"idle"`
  (case-insensitive), so name your Blender actions accordingly.
- **`Floor`** — used to compute walkable bounds and the camera's orbit
  center. Without it, both fall back to hardcoded defaults.
- Everything else is looked up via `content.js` / `Colliders.js` — see below.

Object-name matching (`nameMatch.js`) tolerates two things Blender's exporter
commonly introduces: spaces becoming underscores (`GAS RANGE` ↔ `GAS_RANGE`),
and grouped pieces suffixed `-01`, `-02`, etc. (`Counter-01`, `Counter-02`, ...
all match the key `"Counter"`).

### Interactive objects (`src/content.js`)

Each entry is keyed by an object name (or name prefix) from the scene:

```js
FRIDGE: {
  eyebrow: 'About',
  title: "Hey, I'm Charles",
  radius: 4.0,                    // how close (+ roughly facing) triggers it
  signImage: '/ui/sign-fridge.png', // optional: custom banner instead of plain text prompt
  html: `<p>...</p>`,
},
```

- `radius` is checked against the bear's actual collision size — if it's set
  too small relative to how close the bear can physically get (it can't
  overlap solid colliders), the object becomes unreachable. The live console
  warnings will tell you if an object's colliders/name aren't found at all.
- `signImage` is optional. If set, three files must exist following the
  naming convention below (`base.png`, `base-hover.png`, `base-onclick.png`);
  omit it and the object just uses the default text prompt.
- To wire up a **new** interactive object, add a new key matching its exact
  (or prefixed) Blender name — no other code changes needed.
- `Counter` is intentionally **not** in `content.js` — it's still a solid
  collider (`Colliders.js`) but was deliberately made non-interactive.

### Collision (`src/Colliders.js`)

`colliderObjectNames` lists which objects block the bear: `FRIDGE`,
`GAS_RANGE`, `Counter`, `Cabinet`, `Countertop`, `Trash`, `Exhaust`. Small
props sitting on top of a counter (fruit, utensils, the microwave) don't need
their own entry — the counter beneath them already blocks that footprint.
The bear's own collision radius is auto-measured from its model size at
load time, shrunk slightly (`* 0.85`) so it can still get close enough to
trigger interactions.

### Auto-walk (`src/AutoWalk.js`)

`autoWalkDestinations` maps each nav button to a target `{x, z}` position
and (where needed) a `finalFacing` override for objects rotated the "wrong"
way. Routing treats the room as a rectangular ring around the central
island counter — it projects the bear's current position and the
destination onto that ring, walks the shorter direction around it, and
takes one final straight step off the ring into the object. **If you move
furniture around in Blender, these hardcoded coordinates will need
updating** — they don't derive from the model automatically.

### UI assets (`public/ui/`)

Every interactive button follows the same 3-state naming convention:
`name.png` (default), `name-hover.png` (mouse hover), `name-onclick.png`
(pressed/active). `InteractionManager.js` derives the hover/onclick paths
from a `signImage` base path automatically by this convention — you don't
need to reference all three in `content.js`.

---

## Customizing

- **Movement feel** — `MOVE_SPEED` / `RUN_SPEED` / `TURN_SPEED` at the top of
  `PlayerController.js`.
- **Camera** — `camDistance`, `pitch`, `yaw`, and the scroll-zoom clamp
  (`CAM_MIN_DIST` / `CAM_MAX_DIST`) in `main.js`, in the camera rig section.
- **Content** — everything visitor-facing lives in `content.js`. It's plain
  HTML strings inside template literals, so links, lists, and formatting all
  work as expected.
- **Lighting** — `main.js` looks for a light and camera exported from
  Blender (`KHR_lights_punctual` — check "Punctual Lights" under the glTF
  export panel's Lighting section to include yours) and falls back to a
  built-in hemisphere + directional light if none is found.

---

## Deploy: GitHub → Vercel

**Push to GitHub**
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

**Deploy on Vercel**
1. vercel.com → **Add New... → Project** → import the GitHub repo.
2. Vercel auto-detects Vite — defaults are correct (`vite build`, output `dist`).
3. Deploy. Every future `git push` to `main` auto-redeploys.

**On `.glb` file size:** if `kitchen.glb` is large (many textures), consider
Draco compression on export (the loader already decodes it) and/or resizing
textures to 1–2K before baking them into the glTF. Vercel's free tier is
generous, but very large assets slow down first load for visitors.
