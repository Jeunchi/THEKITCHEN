// ---------------------------------------------------------------------------
// Portfolio content, keyed by a logical name from your Blender scene.
//
// Two naming patterns are supported automatically (see findGroupObjects in
// InteractionManager.js):
//   - Single object, renamed exactly to the key            e.g. "FRIDGE"
//   - Multiple objects, renamed "Key-01", "Key-02", ...    e.g. "Counter-01",
//     "Counter-02", "Counter-03", "Counter-04" all match the key "Counter"
//
// Edit the text below to be your real bio / projects / education / contact.
// Add or remove entries freely — just make sure the key matches an object
// name (or name prefix) that actually exists in your exported model.
// ---------------------------------------------------------------------------

export const interactiveContent = {
  FRIDGE: {
    eyebrow: 'About',
    title: 'Hey, I\'m [Your Name]',
    radius: 4.0, // bear's own collision radius is 1.5m, so this needs real headroom to ever be reachable
    html: `
      <p>I'm a [your role — e.g. "3D artist and front-end developer"] who likes
      building things that feel a little more alive than a normal webpage.</p>
      <p>This kitchen is my portfolio: walk the bear around, open the fridge,
      poke the stove, and you'll find my work, background, and contact info
      tucked into the everyday objects.</p>
    `,
  },

  GAS_RANGE: {
    eyebrow: 'Projects',
    title: 'What I\'ve been cooking',
    radius: 4.0,
    html: `
      <ul>
        <li><strong>Project One</strong> — one line on what it is and the stack used.</li>
        <li><strong>Project Two</strong> — one line on what it is and the stack used.</li>
        <li><strong>Project Three</strong> — one line on what it is and the stack used.</li>
      </ul>
      <p><a href="https://github.com/yourusername" target="_blank" rel="noopener">See more on GitHub →</a></p>
    `,
  },

  Counter: {
    eyebrow: 'Education',
    title: 'Where I trained',
    radius: 3.5, // distance is checked to whichever Counter-0X piece is nearest
    html: `
      <p><strong>[Degree / Program]</strong> — [School], [Year]</p>
      <p>[A sentence or two about relevant coursework, thesis, or focus area.]</p>
      <p><strong>[Certificate / Bootcamp]</strong> — [Institution], [Year]</p>
    `,
  },

  // Reassigned from "Faucet" — that object got merged directly into the
  // Counter mesh, so it no longer exists as its own named object. Move this
  // to whichever remaining object you'd like ("Trash" is just a placeholder
  // — the key just needs to match an object name in your exported model).
  Trash: {
    eyebrow: 'Contact',
    title: "Let's talk",
    radius: 3.2,
    html: `
      <p>Best way to reach me is email — I read everything.</p>
      <p><a href="mailto:you@example.com">you@example.com</a></p>
      <p>
        <a href="https://linkedin.com/in/yourprofile" target="_blank" rel="noopener">LinkedIn</a>
        &nbsp;·&nbsp;
        <a href="https://github.com/yourusername" target="_blank" rel="noopener">GitHub</a>
      </p>
    `,
  },

  // --------------------------------------------------------------------
  // Everything below is wired up (highlight + proximity + facing + E to
  // interact all work), but the content is a placeholder — swap in
  // whatever you actually want each one to say. Small props like these
  // use a tighter radius since they sit close together on the counter.
  // --------------------------------------------------------------------

  Strawberry: {
    eyebrow: 'Placeholder',
    title: 'Strawberry',
    radius: 3.0,
    html: `<p>Put whatever you want here — a hobby, a fun fact, anything.</p>`,
  },

  Mango: {
    eyebrow: 'Placeholder',
    title: 'Mango',
    radius: 3.0,
    html: `<p>Put whatever you want here — a hobby, a fun fact, anything.</p>`,
  },

  Ham: {
    eyebrow: 'Placeholder',
    title: 'Ham',
    radius: 3.0,
    html: `<p>Put whatever you want here.</p>`,
  },

  'Chicken drumstick': {
    eyebrow: 'Placeholder',
    title: 'Chicken Drumstick',
    radius: 3.0,
    html: `<p>Put whatever you want here.</p>`,
  },

  Fork: {
    eyebrow: 'Placeholder',
    title: 'Fork',
    radius: 3.0,
    html: `<p>Put whatever you want here — maybe a skills list?</p>`,
  },

  Spoon: {
    eyebrow: 'Placeholder',
    title: 'Spoon',
    radius: 3.0,
    html: `<p>Put whatever you want here.</p>`,
  },
};

// Objects the bear can walk right up to and "read" but that don't need their
// own dedicated panel content yet — left here so you remember what's
// available to wire up next (Pan, Pot, Ham, Chicken drumstick, individual
// project write-ups, etc.)
export const availableObjectNames = [
  'Bear', 'GAS_RANGE', 'FRIDGE', 'Counter', 'Cabinet', 'Countertop',
  'Trash', 'Strawberry', 'Mango', 'Pan', 'Pot', 'Chicken drumstick', 'Ham',
  'Plate', 'Fork', 'Spoon', 'Exhaust', 'Kitchen',
];
