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
    radius: 2.2,
    html: `
      <p>I'm a [your role — e.g. "3D artist and front-end developer"] who likes
      building things that feel a little more alive than a normal webpage.</p>
      <p>This kitchen is my portfolio: walk the bear around, open the fridge,
      poke the stove, and you'll find my work, background, and contact info
      tucked into the everyday objects.</p>
    `,
  },

  'GAS RANGE': {
    eyebrow: 'Projects',
    title: 'What I\'ve been cooking',
    radius: 2.4,
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
    radius: 1.8, // distance is checked to whichever Counter-0X piece is nearest
    html: `
      <p><strong>[Degree / Program]</strong> — [School], [Year]</p>
      <p>[A sentence or two about relevant coursework, thesis, or focus area.]</p>
      <p><strong>[Certificate / Bootcamp]</strong> — [Institution], [Year]</p>
    `,
  },

  Faucet: {
    eyebrow: 'Contact',
    title: "Let's talk",
    radius: 1.8,
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
};

// Objects the bear can walk right up to and "read" but that don't need their
// own dedicated panel content yet — left here so you remember what's
// available to wire up next (Pan, Pot, Ham, Chicken drumstick, individual
// project write-ups, etc.)
export const availableObjectNames = [
  'CHEF', 'GAS RANGE', 'FRIDGE', 'Counter', 'Cabinet', 'Faucet', 'Countertop',
  'Trash', 'Strawberry', 'Mango', 'Pan', 'Pot', 'Chicken drumstick', 'Ham',
  'Plate', 'Fork', 'Spoon', 'Exhaust', 'Kitchen',
];
