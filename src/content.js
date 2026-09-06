// ---------------------------------------------------------------------------
// Portfolio content, keyed by a logical name from your Blender scene.
//
// Two naming patterns are supported automatically (see findGroupObjects in
// InteractionManager.js):
//   - Single object, renamed exactly to the key            e.g. "FRIDGE"
//   - Multiple objects, renamed "Key-01", "Key-02", ...    e.g. "Counter-01",
//     "Counter-02", "Counter-03", "Counter-04" all match the key "Counter"
//
// Optional `signImage`: path (under /public) to a custom banner shown in the
// bottom-middle proximity prompt instead of the default plain-text bubble —
// used for your four Figma signage assets. Omit it and the object just uses
// the default text prompt ("Press E to view ...").
//
// Edit the text below to be your real bio / projects / education / contact.
// Add or remove entries freely — just make sure the key matches an object
// name (or name prefix) that actually exists in your exported model.
// ---------------------------------------------------------------------------

export const interactiveContent = {
  FRIDGE: {
    eyebrow: 'About',
    title: "Hey, I'm Charles",
    radius: 4.0, // bear's own collision radius is 1.5m, so this needs real headroom to ever be reachable
    signImage: '/ui/sign-fridge.png',
    html: `
      <p>I'm Charles Junjie A. Mempin, a 2026 Computer Science graduate
      (Dean's Awardee, Mapúa University) with full-stack development
      experience — React.js, Next.js, TypeScript, ASP.NET Core, SQL — and
      an applied AI/ML capstone project built with PyTorch.</p>
      <p>I've picked up hands-on experience gathering cross-functional
      requirements, designing and documenting RESTful APIs
      (Swagger/OpenAPI), and working with relational databases through a
      software engineering internship.</p>
      <p><strong>Experience</strong></p>
      <ul>
        <li><strong>Software Engineer Intern</strong>, Elinnov Technologies, Inc. — Jun–Sep 2025</li>
        <li><strong>Web Developer</strong>, Mapúa Radio Cardinal — May 2024–Aug 2025</li>
      </ul>
    `,
  },

  GAS_RANGE: {
    eyebrow: 'Projects',
    title: "What I've been cooking",
    radius: 4.0,
    signImage: '/ui/sign-gasrange.png',
    html: `
      <ul>
        <li>
          <strong>Mini Jira Tracker</strong> — a lightweight project/task
          tracker inspired by Jira.<br>
          <a href="https://github.com/Jeunchi/mini-jira-tracker" target="_blank" rel="noopener">GitHub</a>
          &nbsp;·&nbsp;
          <a href="https://mini-jira-tracker.vercel.app" target="_blank" rel="noopener">Live demo</a>
        </li>
        <li>
          <strong>Olist Marketplace Risk</strong> — a data analysis project
          exploring risk patterns in the Olist e-commerce marketplace dataset.<br>
          <a href="https://github.com/Jeunchi/olist-marketplace-risk" target="_blank" rel="noopener">GitHub</a>
        </li>
        <li>
          <strong>SaaS Retention Insights</strong> — an analytics project on
          customer retention and churn for a SaaS business.<br>
          <a href="https://github.com/Jeunchi/saas-retention-insights" target="_blank" rel="noopener">GitHub</a>
        </li>
      </ul>
      <p><a href="https://github.com/Jeunchi" target="_blank" rel="noopener">More on GitHub →</a></p>
    `,
  },

  // Counter is intentionally NOT interactive — it's still a solid collider
  // (see Colliders.js) so the bear bumps into it, but it no longer highlights
  // or responds to E. The small items sitting on top of it are the
  // selectable ones instead.

  // Reassigned to "Microwave" (was "Exhaust") to match your Figma signage
  // naming (MICROWAVE -> the Education banner).
  Microwave: {
    eyebrow: 'Education',
    title: 'Where I Studied',
    radius: 3.5,
    signImage: '/ui/sign-microwave.png',
    html: `
      <p><strong>B.S. Computer Science, Dean's Awardee</strong><br>
      Mapúa University — Aug 2022 to May 2026</p>
      <p>Relevant coursework: Database Management Systems, Data Analytics &amp;
      Data Mining, Statistics &amp; Probability, Data Structures &amp; Algorithms,
      Machine Learning/AI, Software Development, UI/UX Design, Application Development.</p>
    `,
  },

  // Reassigned from "Faucet" — that object got merged directly into the
  // Counter mesh, so it no longer exists as its own named object. Matches
  // your Figma signage naming (TRASHCAN -> the Contact banner).
  Trash: {
    eyebrow: 'Contact',
    title: "Let's talk",
    radius: 3.2,
    signImage: '/ui/sign-trash.png',
    html: `
      <p>Best way to reach me is email — I read everything.</p>
      <p><a href="mailto:cjmempin18@gmail.com">cjmempin18@gmail.com</a></p>
      <p>+971 54 146 4159</p>
      <p>
        <a href="https://github.com/Jeunchi" target="_blank" rel="noopener">GitHub</a>
        $nbsp;·&nbsp;
        <a href="https://www.linkedin.com/in/charles-junjie-mempin-700480226/" target="_blank" rel="noopener">LinkedIn</a>
      </p>
    `,
  },

  // --------------------------------------------------------------------
  // Everything below is wired up (highlight + proximity + facing + E to
  // interact all work), but the content is a placeholder — swap in
  // whatever you actually want each one to say. Small props like these
  // use a tighter radius since they sit close together on the counter.
  // No signImage set, so these fall back to the default text prompt.
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
    eyebrow: 'Skills',
    title: 'What I work with',
    radius: 3.0,
    html: `
      <p><strong>Development</strong> — React.js, Next.js, TypeScript, JavaScript (ES6+), ASP.NET Core (C#), HTML/CSS, Python</p>
      <p><strong>Backend &amp; Data</strong> — RESTful API design &amp; documentation (Swagger/OpenAPI), SQL &amp; relational schema design, JSON/API integration</p>
      <p><strong>AI &amp; ML</strong> — PyTorch, self-supervised learning (SimCLR), embeddings &amp; similarity-based retrieval, few-shot classification, model evaluation &amp; ablation design</p>
      <p><strong>Tools &amp; Practices</strong> — Git/GitHub, GitHub Copilot, Agile/Scrum, Figma, Vercel, Microsoft Office, Google Suite</p>
    `,
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
// available to wire up next (Pan, Pot, individual project write-ups, etc.)
export const availableObjectNames = [
  'Bear', 'GAS_RANGE', 'FRIDGE', 'Counter', 'Cabinet', 'Countertop',
  'Trash', 'Strawberry', 'Mango', 'Pan', 'Pot', 'Chicken drumstick', 'Ham',
  'Plate', 'Fork', 'Spoon', 'Exhaust', 'Kitchen', 'Microwave',
];
