/**
 * Blender's glTF exporter converts spaces in object names to underscores, so
 * "GAS RANGE" in Blender can come through as "GAS_RANGE" in the export. This
 * strips spaces AND underscores entirely so the two compare as equal.
 */
export function normalizeForMatch(name) {
  return name.trim().toLowerCase().replace(/[\s_]+/g, '');
}

/**
 * Finds every object belonging to a logical "key" name.
 * Handles two cases produced by Blender exports:
 *   1. A single object renamed exactly to the key (e.g. "FRIDGE"), tolerating
 *      space/underscore differences (e.g. "GAS RANGE" vs "GAS_RANGE").
 *   2. A group of objects renamed "Key-01", "Key-02", ... (e.g. "Counter-01",
 *      "Counter-02" for the key "Counter") — common when you didn't join
 *      multiple meshes into one object in Blender.
 */
export function findGroupObjects(scene, key) {
  const results = [];

  const exact = scene.getObjectByName(key);
  if (exact) {
    results.push(exact);
  } else {
    const target = normalizeForMatch(key);
    scene.traverse((obj) => {
      if (results.length === 0 && obj.name && normalizeForMatch(obj.name) === target) {
        results.push(obj);
      }
    });
  }

  const prefix = `${key}-`;
  scene.traverse((obj) => {
    if (obj.name.startsWith(prefix) && !results.includes(obj)) {
      results.push(obj);
    }
  });

  return results;
}
