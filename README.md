# Chef's Kitchen — 3D Portfolio Starter

A Three.js starter built around your Blender kitchen scene: an interactive
bear (CHEF) you move with WASD, and objects around the kitchen (fridge, stove,
counter, faucet...) that open info panels for About / Projects / Education /
Contact.

This is a working scaffold with placeholder copy — the code runs, but you
need to (1) drop in your exported model and (2) edit the real content.

---

## 1. Export your model from Blender

1. **Apply all transforms first.** Select every object → `Ctrl+A` → *All
   Transforms*. Skipping this is the #1 cause of "my model is squished/rotated
   in Three.js."
2. **Check your armature's actions are named clearly.** Open the Action
   Editor / NLA for the CHEF ANIMATIONS armature. Whatever you named the
   actions (e.g. `Walk`, `Idle`) is what shows up as `clip.name` in Three.js.
   `PlayerController.js` looks for a clip name containing `"walk"` and one
   containing `"idle"` (case-insensitive) — rename your actions to include
   those words, or edit `_findAction()` calls in `PlayerController.js` to
   match your actual names.
3. **File → Export → glTF 2.0 (.glb/.gltf)**
   - Format: **glTF Binary (.glb)** — everything in one file, easiest to host.
   - Under *Include*: check **Animations**, **Custom Properties** (optional),
     and make sure *Selected Objects Only* is **unchecked** so the whole
     scene comes with you.
   - Under *Transform*: `+Y Up` should be checked (Blender is Z-up, three.js
     is Y-up — this setting handles the conversion).
   - Under *Geometry*: enable **Apply Modifiers** if you have any.
   - Under *Compression*: turning on Draco compression will make the file
     much smaller for the web; this project's loader already has a
     `DRACOLoader` configured to decode it.
4. Name the exported file `kitchen.glb` and put it at:
   ```
   public/models/kitchen.glb
   ```
   (If you want a different name, update `MODEL_URL` at the top of
   `src/main.js`.)

**Important — names carry over.** Your outliner already has clean collection
names (`CHEF`, `GAS RANGE`, `FRIDGE`, `Counter`, `Faucet`, etc.). glTF export
keeps these as the `name` property on the corresponding Object3D/Group nodes,
which is exactly how the code below finds them — via
`scene.getObjectByName('FRIDGE')`. Don't rename things in Blender after
you've wired up `content.js`, or the lookups will silently fail (you'll see a
console warning telling you which name wasn't found).

---

## 2. Run it locally

```bash
npm install
npm run dev
```

Open the printed local URL. You should see the loading bar, then the kitchen
with the bear in it. WASD/arrows to move, drag the mouse to orbit the camera,
E (or click an object) to open its info panel.

If the bear doesn't animate, or an object doesn't open a panel, check the
browser console — both `main.js` and `InteractionManager.js` log clear
warnings naming exactly what wasn't found.

---

## 3. Customize the content

Open `src/content.js`. Each entry is keyed by an object name from your scene:

```js
FRIDGE: {
  eyebrow: 'About',
  title: "Hey, I'm Your Name",
  radius: 2.2,       // how close the bear needs to be, in meters, to trigger it
  html: `<p>Your real bio here.</p>`,
},
```

- `radius` — increase it for big objects (counters), decrease for small ones.
- `html` — anything you'd put inside a `<div>`: paragraphs, links, lists.
- To wire up a *new* interactive object (say, the Pot for a specific project
  write-up), add a new key matching its exact Blender name — no other code
  changes needed, `InteractionManager` picks up everything in `content.js`
  automatically.

To change movement feel, tweak `MOVE_SPEED` / `TURN_SPEED` at the top of
`src/PlayerController.js`. To change camera distance/height, edit
`camDistance` and the initial `pitch` in `src/main.js`.

---

## 4. Deploy: GitHub → Vercel

**Push to GitHub**
```bash
git init
git add .
git commit -m "Initial 3D portfolio"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```
(Create the empty repo on GitHub first via the "New repository" button, then
copy its URL into the command above.)

**Deploy on Vercel**
1. Go to vercel.com → **Add New... → Project** → import your GitHub repo.
2. Vercel auto-detects Vite. Defaults are correct:
   - Build command: `vite build`
   - Output directory: `dist`
3. Click **Deploy**. Every future `git push` to `main` auto-redeploys.

**A note on file size:** `.glb` files with textures can get large. Vercel's
free tier is generous, but if your model is >50–100MB, consider:
- Compressing textures (resize to 1–2K, convert to `.webp`/JPEG before baking into the glTF).
- Using Draco compression on export (already supported by the loader here).
- Running `gltf-transform` (a CLI tool) to further optimize the .glb post-export.

---

## Project structure

```
public/models/kitchen.glb   ← your exported Blender scene (you add this)
src/main.js                 ← scene, camera, loading, render loop
src/PlayerController.js     ← WASD movement + animation blending for the bear
src/InteractionManager.js   ← proximity detection, click detection, panel UI
src/TouchJoystick.js        ← mobile on-screen joystick
src/content.js              ← EDIT THIS — your actual bio/projects/education/contact text
src/style.css               ← UI design system (loading screen, panel, HUD)
index.html                  ← DOM shell for the canvas + UI overlay
```
