// Healthy Hero 3D — production blueprints (single source of truth).
//
// Every 3D model in the game is generated from these specs by src/models.js, and the
// printable blueprint sheets in /blueprints are rendered from the very same specs by
// tools/blueprint-sheets.html. Change a number here and both the game and the
// blueprints change together.
//
// Conventions
//   • Units: meters in the spec (1 game unit = 1 m). Blueprint sheets print centimeters.
//   • Axes: +Y up. Characters and props face +Z (toward the viewer in FRONT view).
//     The character's LEFT side is +X, so LEFT SIDE view looks from +X toward −X.
//   • Joints: positions are relative to the parent joint. `rest` is the blueprint pose
//     rotation in degrees (XYZ). Joints ending in "L" with mirror:true get an "R" twin.
//   • Parts: `pos` is relative to the joint, `rot` is degrees (Euler XYZ unless `order`).
//     Parts with mirror:true get a twin across the YZ plane (x → −x).
//   • Shapes: sphere(size = full extents), cap(sphere slice), box(size, r = corner radius),
//     capsule(r, len = straight section), cylinder(rt, rb, h), cone(r, h), torus(R, r, arc°),
//     octa(r), dodeca(r), lathe(pts), extrude(outline, size, depth), plane(size), twists(...).

export const BLUEPRINT_VERSION = '2.0.0';
export const DRAWING = { units: 'cm', perMeter: 100, projection: 'Third-angle', date: '2026-09-30', studio: 'Flexzonic Games' };

// ---------------------------------------------------------------------------------------
// Gameplay layout — the run scene reads these numbers directly.
// ---------------------------------------------------------------------------------------
export const LAYOUT = {
  lanes: 3,
  laneWidth: 2.4,          // center-to-center lane spacing
  curbWidth: 0.5,
  tileLength: 12,          // recycled track tile length
  tilesAhead: 9,
  runSpeed: 9,             // visual scenery speed (m/s) while sprinting
  jogSpeed: 5.2,           // visual scenery speed while the question is being read
  gate: {
    spawnDistance: 64,     // gates fly in from here
    parkDistance: 14,      // where gates wait while the child listens and thinks
    hitDistance: 0.9,      // runner meets the gate here
    spacing: 2.4
  },
  camera: {
    fov: 50,
    height: 3.0,           // above track
    back: 5.6,             // behind runner
    lookAhead: 10,         // look-at point ahead of the runner
    lookHeight: 1.35
  },
  runnerZ: 0
};
export const laneX = (lane) => (lane - (LAYOUT.lanes - 1) / 2) * LAYOUT.laneWidth;

// ---------------------------------------------------------------------------------------
// Shared materials (assets may override or add their own).
// ---------------------------------------------------------------------------------------
const GLOBAL_MATERIALS = {
  white:     { hex: '#ffffff', rough: 0.4, name: 'Pure white' },
  shine:     { hex: '#ffffff', rough: 0.2, emissive: 0.6, name: 'Eye highlight' },
  eyeDark:   { hex: '#1b1320', rough: 0.18, name: 'Eye — gloss ink' },
  mouth:     { hex: '#b83552', rough: 0.5, name: 'Mouth — berry' },
  blush:     { hex: '#ff8fa3', rough: 0.7, opacity: 0.72, name: 'Cheek blush (72% opacity)' }
};

// Small helpers keep the specs readable.
const S  = (id, name, joint, size, pos, mat, x = {}) => ({ id, name, joint, shape: 'sphere', size, pos, mat, ...x });
const B  = (id, name, joint, size, r, pos, mat, x = {}) => ({ id, name, joint, shape: 'box', size, r, pos, mat, ...x });
const C  = (id, name, joint, r, len, pos, mat, x = {}) => ({ id, name, joint, shape: 'capsule', r, len, pos, mat, ...x });
const CY = (id, name, joint, rt, rb, h, pos, mat, x = {}) => ({ id, name, joint, shape: 'cylinder', rt, rb, h, pos, mat, ...x });
const CO = (id, name, joint, r, h, pos, mat, x = {}) => ({ id, name, joint, shape: 'cone', r, h, pos, mat, ...x });
const T  = (id, name, joint, R, r, arc, pos, mat, x = {}) => ({ id, name, joint, shape: 'torus', R, r, arc, pos, mat, ...x });

// ---------------------------------------------------------------------------------------
// CAST
// ---------------------------------------------------------------------------------------
const PIP = {
  id: 'pip', kind: 'character', rig: 'hover', name: 'Pip', title: 'Pip — Wellness Robot',
  role: 'Default hero. A friendly hover-robot with a glowing heart core and visor face.',
  greeting: 'Beep boop! I am Pip, your wellness robot. Let us power up healthy habits together!',
  overall: { width: 0.728, height: 1.062, depth: 0.605 },
  materials: {
    shell:    { hex: '#f3f7fc', rough: 0.3, name: 'Gloss white shell' },
    pod:      { hex: '#cfdbea', rough: 0.38, name: 'Cool grey pods' },
    visor:    { hex: '#0c1424', rough: 0.1, metal: 0.35, name: 'Smoked visor glass' },
    eyeGlow:  { hex: '#74f7ff', emissive: 2.4, name: 'Eye light — cyan' },
    blueGlow: { hex: '#39c2ff', emissive: 2.0, name: 'Signal blue light' },
    mint:     { hex: '#63f2c0', rough: 0.4, name: 'Flexzonic mint trim' },
    heart:    { hex: '#22e070', emissive: 1.2, name: 'Heart core — green light' },
    cheek:    { hex: '#ff8fc0', emissive: 0.7, name: 'Cheek light — pink' },
    thruster: { hex: '#7af8ff', emissive: 2.6, name: 'Hover thruster light' }
  },
  joints: {
    root:      { parent: null, pos: [0, 0, 0] },
    hover:     { parent: 'root', pos: [0, 0, 0] },
    body:      { parent: 'hover', pos: [0, 0.30, 0] },
    head:      { parent: 'body', pos: [0, 0.36, 0] },
    antenna:   { parent: 'head', pos: [0, 0.26, 0] },
    shoulderL: { parent: 'body', pos: [0.19, 0.06, 0], mirror: true }
  },
  parts: [
    S('body', 'Body shell', 'body', [0.44, 0.34, 0.40], [0, 0, 0], 'shell'),
    T('belt', 'Mint belly band', 'body', 0.205, 0.018, 360, [0, -0.025, 0], 'mint', { rot: [90, 0, 0], scale: [1, 0.93, 1] }),
    { id: 'heartCore', name: 'Heart core', joint: 'body', shape: 'extrude', outline: 'heart', size: [0.13, 0.115], depth: 0.026, pos: [0, 0.03, 0.186], mat: 'heart' },
    CY('skirt', 'Hover skirt', 'body', 0.13, 0.16, 0.07, [0, -0.17, 0], 'pod'),
    CY('thruster', 'Thruster disc', 'body', 0.12, 0.12, 0.015, [0, -0.21, 0], 'thruster'),
    S('head', 'Head shell', 'head', [0.64, 0.56, 0.58], [0, 0, 0], 'shell'),
    S('visor', 'Visor', 'head', [0.50, 0.36, 0.30], [0, 0, 0.16], 'visor'),
    S('eyeL', 'Eye light', 'head', [0.075, 0.10, 0.03], [0.085, 0.025, 0.30], 'eyeGlow', { mirror: true }),
    T('smile', 'Smile light', 'head', 0.045, 0.009, 180, [0, -0.06, 0.296], 'eyeGlow', { rot: [0, 0, 180] }),
    S('cheekL', 'Cheek light', 'head', [0.05, 0.028, 0.012], [0.15, -0.045, 0.276], 'cheek', { mirror: true, rot: [0, 28, 0] }),
    CY('earL', 'Ear pod', 'head', 0.10, 0.10, 0.07, [0.31, 0, 0], 'pod', { mirror: true, rot: [0, 0, 90] }),
    T('earRingL', 'Ear ring light', 'head', 0.075, 0.016, 360, [0.348, 0, 0], 'blueGlow', { mirror: true, rot: [0, 90, 0] }),
    CY('earCapL', 'Ear cap', 'head', 0.055, 0.055, 0.02, [0.35, 0, 0], 'mint', { mirror: true, rot: [0, 0, 90] }),
    CY('antennaBase', 'Antenna base', 'antenna', 0.03, 0.03, 0.025, [0, 0, 0], 'pod'),
    CY('antennaStem', 'Antenna stem', 'antenna', 0.012, 0.012, 0.10, [0, 0.05, 0], 'pod'),
    S('antennaTip', 'Antenna light', 'antenna', [0.064, 0.064, 0.064], [0, 0.11, 0], 'blueGlow'),
    C('armL', 'Arm', 'shoulderL', 0.045, 0.10, [0.04, -0.086, 0], 'shell', { mirror: true, rot: [0, 0, 25] }),
    CY('cuffL', 'Wrist light', 'shoulderL', 0.05, 0.05, 0.03, [0.072, -0.155, 0], 'blueGlow', { mirror: true, rot: [0, 0, 25] }),
    S('handL', 'Hand', 'shoulderL', [0.11, 0.11, 0.11], [0.082, -0.178, 0], 'shell', { mirror: true })
  ],
  dims: [
    { type: 'part', part: 'head', axis: 'x', views: ['front'], label: 'HEAD' },
    { type: 'between', a: 'eyeL', b: 'eyeR', axis: 'x', views: ['front'], label: 'EYE C/C' },
    { type: 'ground', part: 'thruster', axis: 'y', views: ['left'], label: 'HOVER' },
    { type: 'part', part: 'body', axis: 'y', views: ['left'], label: 'BODY' },
    { type: 'span', parts: ['antennaStem', 'antennaTip'], axis: 'y', views: ['back'], label: 'ANTENNA' }
  ],
  notes: [
    'Pip floats 8 cm above the track; the hover joint bobs ±2.5 cm at 1.6 Hz.',
    'Visor is an ellipsoid set 16 cm forward so it bulges 2 cm out of the head shell.',
    'Eyes, smile, ear rings, cuffs and antenna are emissive (unlit) and stay bright at night.',
    'Heart core pulses with the combo meter during a run.'
  ]
};

// Humanoid skeleton shared by Mia and Leo (scaled per hero).
function humanoidJoints(s = 1, hipY = 0.50) {
  const k = (v) => Number((v * s).toFixed(4));
  return {
    root:      { parent: null, pos: [0, 0, 0] },
    hips:      { parent: 'root', pos: [0, k(hipY), 0] },
    spine:     { parent: 'hips', pos: [0, k(0.10), 0] },
    chest:     { parent: 'spine', pos: [0, k(0.12), 0] },
    neck:      { parent: 'chest', pos: [0, k(0.12), 0] },
    head:      { parent: 'neck', pos: [0, k(0.05), 0] },
    shoulderL: { parent: 'chest', pos: [k(0.17), k(0.06), 0], rest: [0, 0, 16], mirror: true },
    elbowL:    { parent: 'shoulderL', pos: [0, k(-0.165), 0], rest: [0, 0, -4], mirror: true },
    wristL:    { parent: 'elbowL', pos: [0, k(-0.15), 0], mirror: true },
    hipL:      { parent: 'hips', pos: [k(0.085), k(-0.05), 0], mirror: true },
    kneeL:     { parent: 'hipL', pos: [0, k(-0.19), 0], mirror: true },
    ankleL:    { parent: 'kneeL', pos: [0, k(-0.185), 0], mirror: true }
  };
}

function faceParts(skinShade, opts = {}) {
  const ez = opts.eyeZ ?? 0.198;
  return [
    S('eyeL', 'Eye', 'head', [0.062, 0.086, 0.03], [0.086, 0.16, ez], 'eyeDark', { mirror: true }),
    S('eyeShineL', 'Eye highlight', 'head', [0.022, 0.022, 0.01], [0.098, 0.18, ez + 0.016], 'shine', { mirror: true }),
    C('browL', 'Eyebrow', 'head', 0.0075, 0.035, [0.085, 0.222, ez - 0.006], 'hair', { mirror: true, rot: [0, 0, 82] }),
    S('nose', 'Nose', 'head', [0.026, 0.02, 0.02], [0, 0.128, 0.213], skinShade),
    T('mouth', 'Smile', 'head', 0.03, 0.008, 180, [0, 0.094, 0.203], 'mouth', { rot: [0, 0, 180] }),
    S('cheekL', 'Cheek blush', 'head', [0.05, 0.03, 0.01], [0.138, 0.112, 0.163], 'blush', { mirror: true, rot: [0, 40, 0] }),
    S('earL', 'Ear', 'head', [0.045, 0.075, 0.04], [0.226, 0.15, -0.005], 'skin', { mirror: true })
  ];
}

const MIA = {
  id: 'mia', kind: 'character', rig: 'humanoid', name: 'Mia', title: 'Mia — Sporty Explorer',
  role: 'Playable hero. Loves dancing, water breaks and trying new foods.',
  greeting: 'Hi, I am Mia! I love dancing, water breaks, and trying new foods. Let us go!',
  overall: { width: 0.591, height: 1.304, depth: 0.584 },
  materials: {
    ...GLOBAL_MATERIALS,
    skin:      { hex: '#e2a47c', rough: 0.62, name: 'Skin — warm tan' },
    skinShade: { hex: '#cf8d66', rough: 0.62, name: 'Skin shade' },
    hair:      { hex: '#1c1724', rough: 0.5, name: 'Hair — blue-black' },
    jacket:    { hex: '#22b8c8', rough: 0.55, name: 'Jacket — lagoon teal' },
    panel:     { hex: '#7c4ad8', rough: 0.55, name: 'Jacket panels — grape' },
    zip:       { hex: '#e9fbff', rough: 0.3, name: 'Zip — ice white' },
    leggings:  { hex: '#6a3ea6', rough: 0.6, name: 'Leggings — violet' },
    shorts:    { hex: '#4f2d86', rough: 0.6, name: 'Shorts — deep violet' },
    kneepad:   { hex: '#2b2550', rough: 0.55, name: 'Knee panels — night' },
    shoe:      { hex: '#2fd0c4', rough: 0.45, name: 'Sneakers — aqua' },
    sole:      { hex: '#ff5fa8', rough: 0.5, name: 'Soles — bubblegum' },
    band:      { hex: '#1fd6c8', rough: 0.5, name: 'Headband — teal' },
    bandStripe:{ hex: '#8b5cff', rough: 0.5, name: 'Headband stripe — purple' },
    watch:     { hex: '#2fe39a', emissive: 0.9, name: 'Smartwatch screen' }
  },
  joints: { ...humanoidJoints(1, 0.50), ponytail: { parent: 'head', pos: [0, 0.335, -0.19] } },
  parts: [
    B('pelvis', 'Shorts', 'hips', [0.25, 0.14, 0.17], 0.06, [0, -0.01, 0], 'shorts'),
    B('torsoLow', 'Jacket — waist', 'spine', [0.27, 0.16, 0.18], 0.07, [0, 0.02, 0], 'jacket'),
    B('torsoUp', 'Jacket — chest', 'chest', [0.30, 0.18, 0.19], 0.08, [0, 0, 0], 'jacket'),
    B('sidePanelL', 'Jacket side panel', 'chest', [0.04, 0.26, 0.15], 0.02, [0.137, -0.06, 0], 'panel', { mirror: true }),
    B('zip', 'Zip line', 'chest', [0.012, 0.28, 0.01], 0.004, [0, -0.06, 0.097], 'zip'),
    T('collar', 'Collar', 'neck', 0.075, 0.028, 360, [0, -0.02, 0], 'panel', { rot: [90, 0, 0] }),
    CY('neck', 'Neck', 'neck', 0.045, 0.045, 0.08, [0, 0.02, 0], 'skin'),
    S('head', 'Head', 'head', [0.46, 0.44, 0.43], [0, 0.17, 0], 'skin'),
    ...faceParts('skinShade'),
    { id: 'hairCap', name: 'Hair cap', joint: 'head', shape: 'cap', size: [0.49, 0.47, 0.46], theta: [0, 96], pos: [0, 0.18, -0.012], rot: [-32, 0, 0], mat: 'hair' },
    S('bangC', 'Bangs — center', 'head', [0.16, 0.07, 0.07], [0.0, 0.318, 0.168], 'hair', { rot: [-28, 0, 0] }),
    S('bangL', 'Bangs — side', 'head', [0.14, 0.07, 0.07], [0.09, 0.305, 0.158], 'hair', { mirror: true, rot: [-26, 0, -18] }),
    T('headband', 'Headband', 'head', 0.229, 0.024, 360, [0, 0.262, -0.012], 'band', { rot: [78, 0, 0] }),
    T('headbandStripe', 'Headband stripe', 'head', 0.241, 0.0105, 360, [0, 0.262, -0.012], 'bandStripe', { rot: [78, 0, 0] }),
    T('hairTie', 'Hair tie', 'ponytail', 0.036, 0.015, 360, [0, 0, 0], 'bandStripe', { rot: [55, 0, 0] }),
    S('tail1', 'Ponytail — top', 'ponytail', [0.12, 0.13, 0.13], [0, -0.03, -0.06], 'hair'),
    C('tail2', 'Ponytail — length', 'ponytail', 0.052, 0.13, [0, -0.135, -0.095], 'hair', { rot: [-10, 0, 0] }),
    S('tail3', 'Ponytail — tip', 'ponytail', [0.075, 0.09, 0.075], [0, -0.245, -0.082], 'hair'),
    C('lockL', 'Side lock', 'head', 0.026, 0.15, [0.208, 0.085, 0.075], 'hair', { mirror: true, rot: [8, 0, 4] }),
    C('upperArmL', 'Sleeve — upper', 'shoulderL', 0.043, 0.10, [0, -0.075, 0], 'jacket', { mirror: true }),
    CY('sleeveStripeL', 'Sleeve stripe', 'shoulderL', 0.046, 0.046, 0.025, [0, -0.035, 0], 'panel', { mirror: true }),
    C('forearmL', 'Sleeve — lower', 'elbowL', 0.04, 0.09, [0, -0.07, 0], 'jacket', { mirror: true }),
    CY('cuffL', 'Cuff', 'elbowL', 0.043, 0.043, 0.03, [0, -0.13, 0], 'panel', { mirror: true }),
    S('handL', 'Hand', 'wristL', [0.085, 0.095, 0.075], [0, -0.03, 0], 'skin', { mirror: true }),
    B('watch', 'Smartwatch', 'elbowL', [0.05, 0.034, 0.06], 0.01, [0, -0.108, 0.036], 'watch'),
    C('thighL', 'Leggings — thigh', 'hipL', 0.055, 0.11, [0, -0.095, 0], 'leggings', { mirror: true }),
    S('kneePadL', 'Knee panel', 'kneeL', [0.10, 0.09, 0.06], [0, 0, 0.03], 'kneepad', { mirror: true }),
    C('shinL', 'Leggings — shin', 'kneeL', 0.048, 0.12, [0, -0.095, 0], 'leggings', { mirror: true }),
    B('shoeL', 'Sneaker', 'ankleL', [0.115, 0.085, 0.21], 0.04, [0, -0.03, 0.035], 'shoe', { mirror: true }),
    B('soleL', 'Sneaker sole', 'ankleL', [0.12, 0.025, 0.215], 0.01, [0, -0.06, 0.035], 'sole', { mirror: true })
  ],
  dims: [
    { type: 'part', part: 'head', axis: 'x', views: ['front'], label: 'HEAD' },
    { type: 'span', parts: ['shoeL', 'soleL', 'shinL', 'thighL', 'pelvis'], axis: 'y', views: ['left'], label: 'LEG' },
    { type: 'span', parts: ['upperArmL', 'forearmL', 'handL'], axis: 'y', views: ['back'], label: 'ARM' },
    { type: 'between', a: 'eyeL', b: 'eyeR', axis: 'x', views: ['front'], label: 'EYE C/C' },
    { type: 'span', parts: ['hairTie', 'tail1', 'tail2', 'tail3'], axis: 'z', views: ['left'], label: 'PONYTAIL' }
  ],
  notes: [
    'Chibi proportion: total height ≈ 2.9 heads; head 44 cm tall, eyes on the head’s equator.',
    'Hair cap is a 96° sphere slice tilted 32° back so the face stays open.',
    'Ponytail hangs from its own joint and swings with a spring during runs.',
    'Blueprint pose: relaxed A-pose, shoulders rotated 16° out.'
  ]
};

function twistsSpec() {
  return { id: 'twists', name: 'Hair twists', joint: 'head', shape: 'twists', count: 34, r: 0.03, len: 0.06,
    ellipsoid: [0.235, 0.225, 0.225], center: [0, 0.19, -0.005], polarMax: 70, tiltBack: 16, seed: 7, pos: [0, 0, 0], mat: 'hair' };
}

const LEO = {
  id: 'leo', kind: 'character', rig: 'humanoid', name: 'Leo', title: 'Leo — Energetic Sprinter',
  role: 'Playable hero. Loves running, resting well and cheering for friends.',
  greeting: 'Hey, I am Leo! Let us run, rest, and recharge together. Heroes help each other!',
  overall: { width: 0.614, height: 1.426, depth: 0.53 },
  materials: {
    ...GLOBAL_MATERIALS,
    skin:      { hex: '#8a5637', rough: 0.6, name: 'Skin — deep brown' },
    skinShade: { hex: '#77482c', rough: 0.6, name: 'Skin shade' },
    hair:      { hex: '#22150f', rough: 0.55, name: 'Hair — espresso' },
    hoodie:    { hex: '#7fd650', rough: 0.6, name: 'Hoodie — lime' },
    sleeve:    { hex: '#3b4352', rough: 0.6, name: 'Sleeves — slate' },
    string:    { hex: '#f2f6fb', rough: 0.5, name: 'Drawstrings — white' },
    shorts:    { hex: '#2b313f', rough: 0.62, name: 'Shorts — charcoal' },
    stripe:    { hex: '#7fd650', rough: 0.6, name: 'Shorts stripe — lime' },
    sock:      { hex: '#d5dce6', rough: 0.7, name: 'Socks — cloud grey' },
    shoe:      { hex: '#4fd24a', rough: 0.45, name: 'Sneakers — green' },
    sole:      { hex: '#f2f6fb', rough: 0.5, name: 'Soles — white' },
    band:      { hex: '#7fd650', rough: 0.5, name: 'Wristband — lime' }
  },
  joints: humanoidJoints(1.04, 0.50),
  parts: [
    B('pelvis', 'Shorts', 'hips', [0.27, 0.15, 0.18], 0.06, [0, -0.02, 0], 'shorts'),
    B('shortsStripeL', 'Shorts stripe', 'hips', [0.012, 0.14, 0.12], 0.004, [0.136, -0.02, 0], 'stripe', { mirror: true }),
    B('torsoLow', 'Hoodie — waist', 'spine', [0.29, 0.17, 0.19], 0.075, [0, 0.02, 0], 'hoodie'),
    B('torsoUp', 'Hoodie — chest', 'chest', [0.32, 0.19, 0.20], 0.085, [0, 0, 0], 'hoodie'),
    B('pocket', 'Hoodie pocket', 'spine', [0.18, 0.08, 0.02], 0.02, [0, 0.0, 0.094], 'hoodie', { scale: [1, 1, 1] }),
    T('hood', 'Hood roll (down)', 'neck', 0.12, 0.05, 180, [0, -0.01, -0.01], 'hoodie', { rot: [-90, 0, 0] }),
    S('hoodBack', 'Hood back', 'neck', [0.24, 0.17, 0.08], [0, -0.04, -0.125], 'hoodie'),
    C('stringL', 'Drawstring', 'chest', 0.006, 0.08, [0.035, 0.0, 0.105], 'string', { mirror: true }),
    CY('neck', 'Neck', 'neck', 0.047, 0.047, 0.08, [0, 0.02, 0], 'skin'),
    S('head', 'Head', 'head', [0.46, 0.44, 0.43], [0, 0.17, 0], 'skin'),
    ...faceParts('skinShade'),
    { id: 'hairCap', name: 'Hair base', joint: 'head', shape: 'cap', size: [0.475, 0.46, 0.45], theta: [0, 74], pos: [0, 0.182, -0.012], rot: [-20, 0, 0], mat: 'hair' },
    twistsSpec(),
    C('upperArmL', 'Sleeve — upper', 'shoulderL', 0.045, 0.10, [0, -0.075, 0], 'sleeve', { mirror: true }),
    C('forearmL', 'Sleeve — lower', 'elbowL', 0.042, 0.09, [0, -0.07, 0], 'sleeve', { mirror: true }),
    S('handL', 'Hand', 'wristL', [0.088, 0.098, 0.078], [0, -0.03, 0], 'skin', { mirror: true }),
    CY('wristband', 'Wristband', 'elbowL', 0.047, 0.047, 0.04, [0, -0.125, 0], 'band'),
    C('thighL', 'Shorts — leg', 'hipL', 0.062, 0.08, [0, -0.07, 0], 'shorts', { mirror: true }),
    C('shinL', 'Leg', 'kneeL', 0.047, 0.11, [0, -0.07, 0], 'skin', { mirror: true }),
    CY('sockL', 'Sock', 'ankleL', 0.05, 0.052, 0.07, [0, 0.03, 0], 'sock', { mirror: true }),
    B('shoeL', 'Sneaker', 'ankleL', [0.12, 0.09, 0.22], 0.042, [0, -0.032, 0.035], 'shoe', { mirror: true }),
    B('soleL', 'Sneaker sole', 'ankleL', [0.125, 0.026, 0.225], 0.01, [0, -0.064, 0.035], 'sole', { mirror: true })
  ],
  dims: [
    { type: 'part', part: 'head', axis: 'x', views: ['front'], label: 'HEAD' },
    { type: 'part', part: 'twists', axis: 'y', views: ['left'], label: 'TWISTS' },
    { type: 'span', parts: ['upperArmL', 'forearmL', 'handL'], axis: 'y', views: ['back'], label: 'ARM' },
    { type: 'between', a: 'eyeL', b: 'eyeR', axis: 'x', views: ['front'], label: 'EYE C/C' },
    { type: 'span', parts: ['shoeL', 'soleL', 'shinL', 'thighL', 'pelvis'], axis: 'y', views: ['left'], label: 'LEG' }
  ],
  notes: [
    'Same skeleton as Mia scaled 104%. Shorts end above the knee; socks + sneakers below.',
    '34 hair twists are placed on an ellipsoid with a fixed seed so every build matches.',
    'Hood is a 180° torus roll plus a soft back panel resting behind the neck.',
    'Blueprint pose: relaxed A-pose, shoulders rotated 16° out.'
  ]
};

const GINGER = {
  id: 'ginger', kind: 'character', rig: 'quadruped', name: 'Ginger', title: 'Ginger — Fox Companion',
  role: 'Playable hero and companion. A cheerful fox with a mint-green scarf.',
  greeting: 'Yip yip! I am Ginger the fox. Let us explore every world and keep calm together!',
  overall: { width: 0.32, height: 0.78, depth: 1.209 },
  materials: {
    fur:      { hex: '#f17a2b', rough: 0.7, name: 'Fur — ginger orange' },
    cream:    { hex: '#fff0dc', rough: 0.75, name: 'Fur — cream' },
    tip:      { hex: '#fffaf2', rough: 0.75, name: 'Tail tip — snow' },
    dark:     { hex: '#3a2418', rough: 0.6, name: 'Socks, ear tips, nose' },
    sclera:   { hex: '#ffffff', rough: 0.3, name: 'Eye white' },
    iris:     { hex: '#36c46d', rough: 0.25, name: 'Iris — leaf green' },
    pupil:    { hex: '#111111', rough: 0.2, name: 'Pupil' },
    shine:    { hex: '#ffffff', rough: 0.2, emissive: 0.6, name: 'Eye highlight' },
    scarf:    { hex: '#2fbf71', rough: 0.6, name: 'Scarf — mint green' },
    scarfStripe: { hex: '#ffd45b', rough: 0.6, name: 'Scarf stripe — sunshine' }
  },
  joints: {
    root:     { parent: null, pos: [0, 0, 0] },
    body:     { parent: 'root', pos: [0, 0.36, 0] },
    chest:    { parent: 'body', pos: [0, 0.03, 0.17] },
    neck:     { parent: 'chest', pos: [0, 0.08, 0.10] },
    head:     { parent: 'neck', pos: [0, 0.08, 0.05] },
    earL:     { parent: 'head', pos: [0.075, 0.11, -0.01], rest: [-8, 0, -14], mirror: true },
    tailBase: { parent: 'body', pos: [0, 0.04, -0.24] },
    tail1:    { parent: 'tailBase', pos: [0, 0.06, -0.10] },
    tail2:    { parent: 'tail1', pos: [0, 0.05, -0.10] },
    frontL:   { parent: 'body', pos: [0.08, -0.08, 0.16], mirror: true },
    frontKneeL: { parent: 'frontL', pos: [0, -0.13, 0], mirror: true },
    backL:    { parent: 'body', pos: [0.085, -0.06, -0.17], mirror: true },
    backKneeL:  { parent: 'backL', pos: [0, -0.13, 0], mirror: true }
  },
  parts: [
    C('torso', 'Body', 'body', 0.13, 0.26, [0, 0, 0], 'fur', { rot: [90, 0, 0] }),
    S('belly', 'Belly', 'body', [0.20, 0.17, 0.30], [0, -0.045, 0.06], 'cream'),
    S('chestFluff', 'Chest fluff', 'chest', [0.20, 0.22, 0.16], [0, -0.02, 0.06], 'cream'),
    S('head', 'Head', 'head', [0.30, 0.26, 0.27], [0, 0.06, 0.02], 'fur'),
    S('cheekL', 'Cheek fluff', 'head', [0.10, 0.09, 0.10], [0.11, 0.0, 0.03], 'cream', { mirror: true }),
    S('snout', 'Snout', 'head', [0.13, 0.10, 0.16], [0, 0.015, 0.15], 'cream'),
    S('nose', 'Nose', 'head', [0.045, 0.035, 0.035], [0, 0.035, 0.232], 'dark'),
    S('scleraL', 'Eye white', 'head', [0.078, 0.088, 0.03], [0.066, 0.09, 0.134], 'sclera', { mirror: true, rot: [0, 18, 0] }),
    S('irisL', 'Iris', 'head', [0.058, 0.068, 0.02], [0.07, 0.088, 0.146], 'iris', { mirror: true, rot: [0, 18, 0] }),
    S('pupilL', 'Pupil', 'head', [0.032, 0.042, 0.014], [0.072, 0.088, 0.154], 'pupil', { mirror: true, rot: [0, 18, 0] }),
    S('shineL', 'Eye highlight', 'head', [0.017, 0.017, 0.008], [0.08, 0.102, 0.161], 'shine', { mirror: true }),
    CO('earL', 'Ear', 'earL', 0.055, 0.13, [0, 0.06, 0], 'fur', { mirror: true }),
    CO('earInnerL', 'Inner ear', 'earL', 0.032, 0.08, [0, 0.045, 0.022], 'cream', { mirror: true }),
    CO('earTipL', 'Ear tip', 'earL', 0.03, 0.05, [0, 0.1, 0], 'dark', { mirror: true }),
    T('scarf', 'Scarf', 'neck', 0.10, 0.036, 360, [0, -0.025, 0], 'scarf', { rot: [62, 0, 0] }),
    T('scarfStripe', 'Scarf stripe', 'neck', 0.112, 0.012, 360, [0, -0.025, 0], 'scarfStripe', { rot: [62, 0, 0] }),
    B('scarfEnd', 'Scarf tail', 'neck', [0.06, 0.13, 0.022], 0.01, [0.085, -0.085, 0.035], 'scarf', { rot: [8, 30, 20] }),
    S('tailA', 'Tail — base', 'tailBase', [0.16, 0.16, 0.24], [0, 0.03, -0.08], 'fur'),
    S('tailB', 'Tail — plume', 'tail1', [0.2, 0.2, 0.26], [0, 0.05, -0.08], 'fur'),
    S('tailTip', 'Tail — tip', 'tail2', [0.14, 0.14, 0.16], [0, 0.04, -0.12], 'tip'),
    C('frontLegL', 'Front leg', 'frontL', 0.04, 0.08, [0, -0.06, 0], 'fur', { mirror: true }),
    C('frontSockL', 'Front sock', 'frontKneeL', 0.035, 0.07, [0, -0.06, 0], 'dark', { mirror: true }),
    S('frontPawL', 'Front paw', 'frontKneeL', [0.075, 0.05, 0.10], [0, -0.115, 0.02], 'dark', { mirror: true }),
    C('backLegL', 'Back leg', 'backL', 0.05, 0.08, [0, -0.06, 0], 'fur', { mirror: true }),
    C('backSockL', 'Back sock', 'backKneeL', 0.036, 0.07, [0, -0.06, 0], 'dark', { mirror: true }),
    S('backPawL', 'Back paw', 'backKneeL', [0.075, 0.05, 0.10], [0, -0.135, 0.02], 'dark', { mirror: true })
  ],
  dims: [
    { type: 'part', part: 'head', axis: 'x', views: ['front'], label: 'HEAD' },
    { type: 'span', parts: ['tailA', 'tailB', 'tailTip'], axis: 'z', views: ['left'], label: 'TAIL' },
    { type: 'span', parts: ['frontLegL', 'frontSockL', 'frontPawL'], axis: 'y', views: ['left'], label: 'LEG' },
    { type: 'between', a: 'earL', b: 'earR', axis: 'x', views: ['front'], label: 'EAR C/C' }
  ],
  notes: [
    'Quadruped rig: front and back leg pairs gallop 180° out of phase; body pitches ±4°.',
    'Tail is a three-joint chain that wags and trails behind with spring lag.',
    'Ears rest 14° outward and twitch on correct answers.',
    'Big cartoon eyes: white, green iris, pupil, highlight — four stacked ellipsoids.'
  ]
};

// ---------------------------------------------------------------------------------------
// GAMEPLAY OBJECTS
// ---------------------------------------------------------------------------------------
const GATE = {
  id: 'gate', kind: 'object', rig: 'gate', name: 'Power Gate', title: 'Power Gate — Answer Obstacle',
  role: 'One per lane. Carries an answer sign; splits open for a helpful answer, wobbles and crashes softly for a miss.',
  overall: { width: 2.26, height: 3.3, depth: 0.64 },
  materials: {
    metal:      { hex: '#1b3a5b', rough: 0.45, metal: 0.3, name: 'Hover base — navy alloy' },
    frame:      { hex: '#63f2c0', rough: 0.4, runtime: 'topic', name: 'Frame — topic color (runtime)' },
    frameLight: { hex: '#d6fff2', rough: 0.35, name: 'Caps & crown — pearl' },
    panel:      { hex: '#2a7fa8', rough: 0.25, opacity: 0.86, emissive: 0.25, runtime: 'topic', name: 'Energy panels — tinted glass' },
    sign:       { hex: '#ffffff', rough: 0.6, runtime: 'sign', name: 'Answer sign (canvas texture)' },
    core:       { hex: '#ffd45b', emissive: 1.4, name: 'Gate core — sunshine light' },
    laneGlow:   { hex: '#ffb347', emissive: 1.6, runtime: 'lane', name: 'Lane light — lane color (runtime)' },
    badge:      { hex: '#ffb347', rough: 0.4, runtime: 'lane', name: 'Lane badge — lane color (runtime)' },
    thruster:   { hex: '#7af8ff', emissive: 2.4, name: 'Hover thrusters' },
    beacon:     { hex: '#e8fbff', rough: 0.05, opacity: 0.4, name: 'Beacon glass (40% opacity)' }
  },
  joints: {
    root:   { parent: null, pos: [0, 0, 0] },
    frame:  { parent: 'root', pos: [0, 0.26, 0] },
    panelL: { parent: 'frame', pos: [0.44, 1.24, 0], mirror: true },
    beacon: { parent: 'frame', pos: [0, 2.83, 0] }
  },
  parts: [
    B('base', 'Hover base', 'frame', [2.2, 0.14, 0.62], 0.06, [0, 0.07, 0], 'metal'),
    B('baseGlow', 'Lane light strip', 'frame', [2.0, 0.035, 0.64], 0.012, [0, 0.07, 0], 'laneGlow'),
    CY('thrusterL', 'Hover thruster', 'frame', 0.16, 0.16, 0.05, [0.7, -0.025, 0], 'thruster', { mirror: true }),
    B('pillarL', 'Pillar', 'frame', [0.24, 2.3, 0.46], 0.08, [0.98, 1.29, 0], 'frame', { mirror: true }),
    S('capL', 'Pillar cap', 'frame', [0.3, 0.18, 0.3], [0.98, 2.47, 0], 'frameLight', { mirror: true }),
    B('header', 'Header beam', 'frame', [2.2, 0.32, 0.5], 0.1, [0, 2.46, 0], 'frame'),
    T('crown', 'Crown arch', 'frame', 0.36, 0.06, 180, [0, 2.6, 0], 'frameLight'),
    S('beaconGlass', 'Beacon globe', 'beacon', [0.42, 0.42, 0.42], [0, 0, 0], 'beacon'),
    CY('badge', 'Lane badge', 'frame', 0.17, 0.17, 0.04, [0, 2.46, 0.26], 'badge', { rot: [90, 0, 0] }),
    B('panelL', 'Energy panel', 'panelL', [0.86, 1.96, 0.08], 0.03, [0, 0, 0], 'panel', { mirror: true }),
    { id: 'signL', name: 'Answer sign half', joint: 'panelL', shape: 'plane', size: [0.84, 0.84], pos: [0, 0.38, 0.045], mat: 'sign', mirror: true },
    { id: 'core', name: 'Gate core', joint: 'frame', shape: 'octa', r: 0.15, pos: [0, 0.66, 0.07], mat: 'core' }
  ],
  dims: [
    { type: 'span', parts: ['panelL', 'panelR'], axis: 'x', views: ['front'], label: 'PANELS' },
    { type: 'ground', part: 'thrusterL', axis: 'y', views: ['left'], label: 'HOVER' },
    { type: 'part', part: 'panelL', axis: 'y', views: ['left'], label: 'PANEL' },
    { type: 'part', part: 'beaconGlass', axis: 'x', views: ['back'], label: 'BEACON' }
  ],
  notes: [
    'Three gates sit on lane centers 240 cm apart; each gate is 226 cm wide, leaving a 14 cm gap.',
    'The answer sign is one 1024×512 canvas texture split across both panels (left half / right half).',
    'Helpful answer: panels slide ±1.2 m apart and spin away; the core bursts into sparkles.',
    'Miss: panels crack, wobble ±6° and drop; the runner keeps going (gentle crash-through).',
    'Frame and panel color follow the obstacle’s wellness topic; lane badge color follows the lane.'
  ]
};

// Topic emblems — 3D icons used on gate beacons, island monuments and medals.
const EMBLEMS = {
  emblemApple: {
    id: 'emblemApple', kind: 'emblem', topic: 0, name: 'Apple Emblem', title: 'Topic Emblem — Fuel Garden',
    overall: { width: 0.302, height: 0.357, depth: 0.302 },
    materials: { red: { hex: '#ff5a4f', rough: 0.3, name: 'Apple red' }, stem: { hex: '#7a4a2a', rough: 0.7, name: 'Stem brown' }, leaf: { hex: '#5ed35a', rough: 0.5, name: 'Leaf green' } },
    joints: { root: { parent: null, pos: [0, 0, 0] } },
    parts: [
      { id: 'apple', name: 'Apple body', joint: 'root', shape: 'lathe', pts: [[0, 0.0], [0.07, 0.01], [0.13, 0.05], [0.15, 0.12], [0.145, 0.19], [0.12, 0.25], [0.07, 0.275], [0.02, 0.262], [0, 0.25]], smooth: true, pos: [0, -0.14, 0], mat: 'red' },
      CY('stem', 'Stem', 'root', 0.012, 0.016, 0.09, [0.005, 0.15, 0], 'stem', { rot: [0, 0, -12] }),
      { id: 'leaf', name: 'Leaf', joint: 'root', shape: 'extrude', outline: 'leaf', size: [0.12, 0.07], depth: 0.012, pos: [0.06, 0.18, 0], rot: [0, 0, 28], mat: 'leaf' }
    ]
  },
  emblemDrop: {
    id: 'emblemDrop', kind: 'emblem', topic: 1, name: 'Water Drop Emblem', title: 'Topic Emblem — Hydration Falls',
    overall: { width: 0.24, height: 0.36, depth: 0.24 },
    materials: { water: { hex: '#49c8ff', rough: 0.08, metal: 0.1, name: 'Water blue gloss' }, glint: { hex: '#ffffff', emissive: 0.8, name: 'Glint' } },
    joints: { root: { parent: null, pos: [0, 0, 0] } },
    parts: [
      { id: 'drop', name: 'Drop body', joint: 'root', shape: 'lathe', pts: [[0, -0.18], [0.07, -0.17], [0.11, -0.13], [0.12, -0.07], [0.105, -0.01], [0.075, 0.06], [0.04, 0.12], [0.012, 0.165], [0, 0.18]], smooth: true, pos: [0, 0, 0], mat: 'water' },
      S('glint', 'Glint', 'root', [0.035, 0.06, 0.02], [-0.045, -0.04, 0.1], 'glint', { rot: [0, -25, 0] })
    ]
  },
  emblemBolt: {
    id: 'emblemBolt', kind: 'emblem', topic: 2, name: 'Energy Bolt Emblem', title: 'Topic Emblem — Move Mountain',
    overall: { width: 0.227, height: 0.364, depth: 0.07 },
    materials: { bolt: { hex: '#ffc21a', rough: 0.3, emissive: 0.12, name: 'Bolt yellow' } },
    joints: { root: { parent: null, pos: [0, 0, 0] } },
    parts: [{ id: 'bolt', name: 'Bolt', joint: 'root', shape: 'extrude', outline: 'bolt', size: [0.22, 0.36], depth: 0.07, pos: [0, 0, 0], mat: 'bolt' }]
  },
  emblemMoon: {
    id: 'emblemMoon', kind: 'emblem', topic: 3, name: 'Moon Emblem', title: 'Topic Emblem — Sleep Sky',
    overall: { width: 0.322, height: 0.34, depth: 0.07 },
    materials: { moon: { hex: '#e3d2ff', rough: 0.35, emissive: 0.25, name: 'Moon lavender' }, star: { hex: '#ffcf33', emissive: 1.0, name: 'Star light' } },
    joints: { root: { parent: null, pos: [0, 0, 0] } },
    parts: [
      { id: 'moon', name: 'Crescent', joint: 'root', shape: 'extrude', outline: 'crescent', size: [0.28, 0.34], depth: 0.07, pos: [-0.02, 0, 0], mat: 'moon' },
      { id: 'star', name: 'Star', joint: 'root', shape: 'extrude', outline: 'star', size: [0.1, 0.1], depth: 0.03, pos: [0.11, 0.08, 0.01], mat: 'star' }
    ]
  },
  emblemBubbles: {
    id: 'emblemBubbles', kind: 'emblem', topic: 4, name: 'Bubbles Emblem', title: 'Topic Emblem — Hygiene Harbor',
    overall: { width: 0.3, height: 0.3, depth: 0.2 },
    materials: { bubble: { hex: '#9ff7e6', rough: 0.05, opacity: 0.62, emissive: 0.3, name: 'Soap bubble (62% opacity)' }, glint: { hex: '#ffffff', emissive: 0.9, name: 'Glint' } },
    joints: { root: { parent: null, pos: [0, 0, 0] } },
    parts: [
      S('bubbleBig', 'Big bubble', 'root', [0.2, 0.2, 0.2], [-0.045, -0.045, 0], 'bubble'),
      S('bubbleMid', 'Middle bubble', 'root', [0.13, 0.13, 0.13], [0.09, 0.07, 0], 'bubble'),
      S('bubbleSmall', 'Small bubble', 'root', [0.08, 0.08, 0.08], [-0.02, 0.115, 0], 'bubble'),
      S('glint', 'Glint', 'root', [0.04, 0.025, 0.02], [-0.09, 0.0, 0.085], 'glint', { rot: [0, 0, 35] })
    ]
  },
  emblemLeaf: {
    id: 'emblemLeaf', kind: 'emblem', topic: 5, name: 'Calm Leaf Emblem', title: 'Topic Emblem — Calm Grove',
    overall: { width: 0.209, height: 0.309, depth: 0.052 },
    materials: { leaf: { hex: '#7ee063', rough: 0.45, name: 'Leaf green' }, vein: { hex: '#d9ffc9', rough: 0.5, name: 'Leaf vein' } },
    joints: { root: { parent: null, pos: [0, 0, 0] } },
    parts: [
      { id: 'leaf', name: 'Leaf', joint: 'root', shape: 'extrude', outline: 'leaf', size: [0.34, 0.2], depth: 0.04, pos: [0, 0, 0], rot: [0, 0, 62], mat: 'leaf' },
      B('vein', 'Vein', 'root', [0.012, 0.24, 0.012], 0.004, [0, 0, 0.026], 'vein', { rot: [0, 0, -28] })
    ]
  }
};

// ---------------------------------------------------------------------------------------
// WORLD PROPS — six biome kits. All props merge into 1–2 draw calls in the game.
// ---------------------------------------------------------------------------------------
const PROPS = {
  // Fuel Garden ------------------------------------------------------------------------
  fruitTree: {
    id: 'fruitTree', kind: 'prop', biome: 0, name: 'Rainbow Fruit Tree', title: 'Fuel Garden — Rainbow Fruit Tree',
    overall: { width: 2.745, height: 3.45, depth: 2.01 },
    materials: { bark: { hex: '#8a5a3b', rough: 0.85, name: 'Bark' }, leaves: { hex: '#4fbf4a', rough: 0.8, name: 'Canopy green' }, leaves2: { hex: '#6fd65a', rough: 0.8, name: 'Canopy light' },
      fruitA: { hex: '#ff4d4d', rough: 0.35, name: 'Apple red' }, fruitB: { hex: '#ffa22e', rough: 0.35, name: 'Orange' }, fruitC: { hex: '#ffd84a', rough: 0.35, name: 'Lemon' }, fruitD: { hex: '#9a4dff', rough: 0.35, name: 'Plum' } },
    joints: { root: { parent: null, pos: [0, 0, 0] } },
    parts: [
      CY('trunk', 'Trunk', 'root', 0.13, 0.2, 1.7, [0, 0.85, 0], 'bark'),
      S('canopyA', 'Canopy — main', 'root', [2.1, 1.8, 1.9], [0, 2.55, 0], 'leaves'),
      S('canopyB', 'Canopy — left', 'root', [1.3, 1.15, 1.2], [-0.72, 2.25, 0.25], 'leaves2'),
      S('canopyC', 'Canopy — right', 'root', [1.25, 1.1, 1.15], [0.75, 2.3, -0.2], 'leaves2'),
      S('fruit1', 'Fruit', 'root', [0.22, 0.22, 0.22], [0.55, 2.0, 0.78], 'fruitA'),
      S('fruit2', 'Fruit', 'root', [0.22, 0.22, 0.22], [-0.45, 2.7, 0.86], 'fruitB'),
      S('fruit3', 'Fruit', 'root', [0.22, 0.22, 0.22], [-1.05, 2.05, 0.55], 'fruitC'),
      S('fruit4', 'Fruit', 'root', [0.22, 0.22, 0.22], [0.15, 3.15, 0.66], 'fruitD'),
      S('fruit5', 'Fruit', 'root', [0.22, 0.22, 0.22], [1.15, 2.6, 0.2], 'fruitA'),
      S('fruit6', 'Fruit', 'root', [0.22, 0.22, 0.22], [0.0, 2.25, 0.95], 'fruitB')
    ]
  },
  carrot: {
    id: 'carrot', kind: 'prop', biome: 0, name: 'Giant Carrot', title: 'Fuel Garden — Giant Carrot',
    overall: { width: 0.7, height: 1.755, depth: 0.7 },
    materials: { carrot: { hex: '#ff8a2a', rough: 0.55, name: 'Carrot orange' }, tops: { hex: '#53c84a', rough: 0.7, name: 'Carrot tops' }, soil: { hex: '#6b4a33', rough: 0.95, name: 'Soil mound' } },
    joints: { root: { parent: null, pos: [0, 0, 0] } },
    parts: [
      S('mound', 'Soil mound', 'root', [0.7, 0.2, 0.7], [0, 0.0, 0], 'soil'),
      CO('body', 'Carrot body', 'root', 0.24, 1.2, [0, 0.62, 0], 'carrot', { rot: [180, 0, 0] }),
      CO('topA', 'Leaf top', 'root', 0.07, 0.55, [0, 1.48, 0], 'tops'),
      CO('topB', 'Leaf top', 'root', 0.06, 0.48, [0.1, 1.42, 0.02], 'tops', { rot: [0, 0, -22] }),
      CO('topC', 'Leaf top', 'root', 0.06, 0.48, [-0.1, 1.42, -0.02], 'tops', { rot: [0, 0, 22] })
    ]
  },
  veggieCrate: {
    id: 'veggieCrate', kind: 'prop', biome: 0, name: 'Veggie Crate', title: 'Fuel Garden — Veggie Crate',
    overall: { width: 1.241, height: 0.77, depth: 0.8 },
    materials: { wood: { hex: '#c98a52', rough: 0.85, name: 'Crate wood' }, tomato: { hex: '#ff4d3d', rough: 0.4, name: 'Tomato' }, broccoli: { hex: '#3fb34f', rough: 0.8, name: 'Broccoli' }, corn: { hex: '#ffd84a', rough: 0.6, name: 'Corn' }, plum: { hex: '#9a4dff', rough: 0.4, name: 'Eggplant' } },
    joints: { root: { parent: null, pos: [0, 0, 0] } },
    parts: [
      B('crate', 'Crate', 'root', [1.2, 0.5, 0.8], 0.04, [0, 0.25, 0], 'wood'),
      S('veg1', 'Tomato', 'root', [0.26, 0.24, 0.26], [-0.36, 0.56, 0.12], 'tomato'),
      S('veg2', 'Tomato', 'root', [0.24, 0.22, 0.24], [-0.1, 0.55, -0.15], 'tomato'),
      S('veg3', 'Broccoli', 'root', [0.34, 0.3, 0.34], [0.2, 0.62, 0.1], 'broccoli'),
      C('veg4', 'Corn', 'root', 0.08, 0.3, [0.42, 0.58, -0.12], 'corn', { rot: [0, 0, 70] }),
      S('veg5', 'Eggplant', 'root', [0.2, 0.2, 0.36], [-0.25, 0.6, -0.05], 'plum', { rot: [0, 30, 0] })
    ]
  },
  sunflower: {
    id: 'sunflower', kind: 'prop', biome: 0, name: 'Sunflower', title: 'Fuel Garden — Sunflower',
    overall: { width: 0.86, height: 2.48, depth: 0.21 },
    materials: { stem: { hex: '#4cae45', rough: 0.7, name: 'Stem' }, petal: { hex: '#ffd23a', rough: 0.55, name: 'Petals' }, seed: { hex: '#6a4320', rough: 0.9, name: 'Seed disc' } },
    joints: { root: { parent: null, pos: [0, 0, 0] } },
    parts: [
      CY('stem', 'Stem', 'root', 0.04, 0.05, 2.0, [0, 1.0, 0], 'stem'),
      T('petals', 'Petal ring', 'root', 0.3, 0.13, 360, [0, 2.05, 0.04], 'petal', { scale: [1, 1, 0.45] }),
      CY('disc', 'Seed disc', 'root', 0.24, 0.24, 0.08, [0, 2.05, 0.08], 'seed', { rot: [90, 0, 0] }),
      S('leafL', 'Leaf', 'root', [0.4, 0.08, 0.18], [0.2, 0.9, 0], 'stem', { mirror: true, rot: [0, 0, 25] })
    ]
  },
  // Hydration Falls --------------------------------------------------------------------
  cliffFalls: {
    id: 'cliffFalls', kind: 'prop', biome: 1, name: 'Waterfall Cliff', title: 'Hydration Falls — Waterfall Cliff',
    overall: { width: 6.138, height: 4.7, depth: 3.02 },
    materials: { rock: { hex: '#7a8aa0', rough: 0.9, name: 'Cliff rock' }, rock2: { hex: '#94a5ba', rough: 0.9, name: 'Cliff rock light' }, moss: { hex: '#4fbf6a', rough: 0.85, name: 'Moss' }, water: { hex: '#7fe3ff', rough: 0.1, emissive: 0.35, opacity: 0.9, name: 'Falling water' }, foam: { hex: '#ffffff', rough: 0.4, emissive: 0.3, name: 'Foam' } },
    joints: { root: { parent: null, pos: [0, 0, 0] } },
    parts: [
      { id: 'rockA', name: 'Cliff block', joint: 'root', shape: 'dodeca', r: 1.9, pos: [-1.6, 2.2, -0.4], scale: [0.85, 1.35, 0.8], mat: 'rock' },
      { id: 'rockB', name: 'Cliff block', joint: 'root', shape: 'dodeca', r: 1.8, pos: [1.6, 2.0, -0.3], scale: [0.85, 1.3, 0.75], mat: 'rock2' },
      S('mossA', 'Moss cap', 'root', [2.0, 0.55, 1.6], [-1.6, 4.12, -0.4], 'moss'),
      S('mossB', 'Moss cap', 'root', [1.9, 0.55, 1.5], [1.6, 3.82, -0.3], 'moss'),
      B('fall', 'Water sheet', 'root', [1.25, 4.6, 0.12], 0.05, [0, 2.4, 0.2], 'water', { tags: ['waterfall'] }),
      S('pool', 'Splash foam', 'root', [1.8, 0.35, 1.2], [0, 0.12, 0.6], 'foam')
    ]
  },
  bottleTower: {
    id: 'bottleTower', kind: 'prop', biome: 1, name: 'Water Bottle Tower', title: 'Hydration Falls — Water Bottle Tower',
    overall: { width: 1.3, height: 3.78, depth: 1.3 },
    materials: { bottle: { hex: '#5fd4ff', rough: 0.15, opacity: 0.85, name: 'Bottle body (85% opacity)' }, cap: { hex: '#63f2c0', rough: 0.35, name: 'Cap mint' }, label: { hex: '#ffffff', rough: 0.4, name: 'Label band' }, base: { hex: '#2c6e9c', rough: 0.6, name: 'Plinth' } },
    joints: { root: { parent: null, pos: [0, 0, 0] } },
    parts: [
      CY('plinth', 'Plinth', 'root', 0.65, 0.65, 0.3, [0, 0.15, 0], 'base'),
      { id: 'bottle', name: 'Bottle body', joint: 'root', shape: 'lathe', pts: [[0, 0], [0.42, 0], [0.48, 0.12], [0.48, 2.2], [0.4, 2.5], [0.22, 2.75], [0.22, 2.9], [0, 2.9]], pos: [0, 0.3, 0], mat: 'bottle' },
      CY('label', 'Label band', 'root', 0.495, 0.495, 0.55, [0, 1.6, 0], 'label'),
      CY('cap', 'Cap', 'root', 0.26, 0.26, 0.35, [0, 3.35, 0], 'cap'),
      T('loop', 'Carry loop', 'root', 0.16, 0.04, 360, [0, 3.58, 0], 'cap', { rot: [0, 90, 0] })
    ]
  },
  reeds: {
    id: 'reeds', kind: 'prop', biome: 1, name: 'River Reeds', title: 'Hydration Falls — River Reeds',
    overall: { width: 0.752, height: 1.46, depth: 0.29 },
    materials: { reed: { hex: '#5cc06a', rough: 0.7, name: 'Reed green' }, cattail: { hex: '#8a5a3b', rough: 0.8, name: 'Cattail brown' } },
    joints: { root: { parent: null, pos: [0, 0, 0] } },
    parts: [
      CO('reed1', 'Reed', 'root', 0.05, 1.4, [0, 0.7, 0], 'reed'),
      CO('reed2', 'Reed', 'root', 0.045, 1.2, [0.25, 0.6, 0.1], 'reed', { rot: [0, 0, -10] }),
      CO('reed3', 'Reed', 'root', 0.045, 1.1, [-0.25, 0.55, -0.1], 'reed', { rot: [0, 0, 12] }),
      C('tail1', 'Cattail', 'root', 0.05, 0.18, [0.03, 1.32, 0], 'cattail'),
      C('tail2', 'Cattail', 'root', 0.045, 0.15, [0.33, 1.14, 0.1], 'cattail', { rot: [0, 0, -10] })
    ]
  },
  // Move Mountain ----------------------------------------------------------------------
  mountain: {
    id: 'mountain', kind: 'prop', biome: 2, name: 'Mountain Peak', title: 'Move Mountain — Mountain Peak',
    overall: { width: 8.774, height: 7.9, depth: 8.554 },
    materials: { rock: { hex: '#8f7fb0', rough: 0.9, name: 'Mountain violet-grey' }, snow: { hex: '#f4f8ff', rough: 0.7, name: 'Snow cap' }, grass: { hex: '#68c95a', rough: 0.9, name: 'Foothill grass' } },
    joints: { root: { parent: null, pos: [0, 0, 0] } },
    parts: [
      CY('foot', 'Foothills', 'root', 3.6, 4.5, 1.2, [0, 0.6, 0], 'grass', { seg: 7 }),
      CO('peak', 'Peak', 'root', 3.7, 7.2, [0, 4.2, 0], 'rock', { seg: 7 }),
      CO('snow', 'Snow cap', 'root', 1.32, 2.6, [0, 6.6, 0], 'snow', { seg: 7 })
    ]
  },
  pineTree: {
    id: 'pineTree', kind: 'prop', biome: 2, name: 'Pine Tree', title: 'Move Mountain — Pine Tree',
    overall: { width: 1.7, height: 3.6, depth: 1.7 },
    materials: { bark: { hex: '#7a4f33', rough: 0.85, name: 'Bark' }, pine: { hex: '#2fa35a', rough: 0.8, name: 'Pine green' }, pine2: { hex: '#3dbb68', rough: 0.8, name: 'Pine light' } },
    joints: { root: { parent: null, pos: [0, 0, 0] } },
    parts: [
      CY('trunk', 'Trunk', 'root', 0.12, 0.16, 0.9, [0, 0.45, 0], 'bark'),
      CO('tier1', 'Lower tier', 'root', 0.85, 1.4, [0, 1.4, 0], 'pine', { seg: 8 }),
      CO('tier2', 'Middle tier', 'root', 0.68, 1.2, [0, 2.15, 0], 'pine2', { seg: 8 }),
      CO('tier3', 'Top tier', 'root', 0.48, 1.0, [0, 3.1, 0], 'pine', { seg: 8 })
    ]
  },
  flag: {
    id: 'flag', kind: 'prop', biome: 2, name: 'Energy Flag', title: 'Move Mountain — Energy Flag',
    overall: { width: 1.08, height: 3.2, depth: 0.12 },
    materials: { pole: { hex: '#e8eef8', rough: 0.4, name: 'Pole white' }, flag: { hex: '#ffd45b', rough: 0.6, name: 'Flag sunshine' }, bolt: { hex: '#ff8a2a', rough: 0.5, name: 'Flag bolt' } },
    joints: { root: { parent: null, pos: [0, 0, 0] } },
    parts: [
      CY('pole', 'Pole', 'root', 0.04, 0.05, 3.1, [0, 1.55, 0], 'pole'),
      S('finial', 'Finial', 'root', [0.12, 0.12, 0.12], [0, 3.14, 0], 'flag'),
      { id: 'cloth', name: 'Flag cloth', joint: 'root', shape: 'extrude', outline: 'flag', size: [1.0, 0.62], depth: 0.03, pos: [0.52, 2.65, 0], mat: 'flag' },
      { id: 'boltMark', name: 'Bolt mark', joint: 'root', shape: 'extrude', outline: 'bolt', size: [0.24, 0.4], depth: 0.04, pos: [0.42, 2.65, 0.01], mat: 'bolt' }
    ]
  },
  hurdle: {
    id: 'hurdle', kind: 'prop', biome: 2, name: 'Soft Hurdle', title: 'Move Mountain — Soft Hurdle',
    overall: { width: 1.74, height: 0.86, depth: 0.5 },
    materials: { post: { hex: '#ffffff', rough: 0.4, name: 'Posts' }, bar: { hex: '#ff6f61', rough: 0.5, name: 'Foam bar coral' }, foot: { hex: '#2c3e64', rough: 0.6, name: 'Feet navy' } },
    joints: { root: { parent: null, pos: [0, 0, 0] } },
    parts: [
      CY('postL', 'Post', 'root', 0.04, 0.04, 0.75, [0.8, 0.42, 0], 'post', { mirror: true }),
      B('footL', 'Foot', 'root', [0.12, 0.06, 0.5], 0.02, [0.8, 0.03, 0], 'foot', { mirror: true }),
      C('bar', 'Foam bar', 'root', 0.07, 1.6, [0, 0.79, 0], 'bar', { rot: [0, 0, 90] })
    ]
  },
  // Sleep Sky --------------------------------------------------------------------------
  cloud: {
    id: 'cloud', kind: 'prop', biome: 3, name: 'Dream Cloud', title: 'Sleep Sky — Dream Cloud',
    overall: { width: 3.55, height: 1.7, depth: 1.6 },
    materials: { cloud: { hex: '#f3ecff', rough: 0.95, name: 'Cloud lilac white' }, cloud2: { hex: '#ddd0ff', rough: 0.95, name: 'Cloud shade' } },
    joints: { root: { parent: null, pos: [0, 0, 0] } },
    parts: [
      S('puffA', 'Puff', 'root', [1.8, 1.4, 1.6], [0, 0.85, 0], 'cloud'),
      S('puffB', 'Puff', 'root', [1.3, 1.0, 1.2], [-1.1, 0.55, 0.1], 'cloud2'),
      S('puffC', 'Puff', 'root', [1.4, 1.1, 1.3], [1.1, 0.6, -0.1], 'cloud'),
      S('puffD', 'Puff', 'root', [0.9, 0.7, 0.9], [0.55, 1.35, 0.2], 'cloud2')
    ]
  },
  cloudBed: {
    id: 'cloudBed', kind: 'prop', biome: 3, name: 'Cloud Bed', title: 'Sleep Sky — Cozy Cloud Bed',
    overall: { width: 2.8, height: 1.6, depth: 3.4 },
    materials: { frame: { hex: '#b889ff', rough: 0.5, name: 'Bed frame lavender' }, mattress: { hex: '#ffffff', rough: 0.8, name: 'Mattress' }, blanket: { hex: '#6c7dff', rough: 0.7, name: 'Blanket periwinkle' }, pillow: { hex: '#ffe9f6', rough: 0.85, name: 'Pillow' }, cloud: { hex: '#f3ecff', rough: 0.95, name: 'Cloud base' } },
    joints: { root: { parent: null, pos: [0, 0, 0] } },
    parts: [
      S('cloudBase', 'Cloud base', 'root', [2.8, 0.7, 3.4], [0, 0.3, 0], 'cloud'),
      B('frame', 'Bed frame', 'root', [1.5, 0.3, 2.3], 0.08, [0, 0.72, 0], 'frame'),
      B('headboard', 'Headboard', 'root', [1.6, 0.9, 0.14], 0.07, [0, 1.15, -1.1], 'frame'),
      B('mattress', 'Mattress', 'root', [1.4, 0.2, 2.1], 0.08, [0, 0.95, 0.02], 'mattress'),
      B('blanket', 'Blanket', 'root', [1.46, 0.12, 1.3], 0.05, [0, 1.06, 0.4], 'blanket'),
      B('pillow', 'Pillow', 'root', [0.9, 0.2, 0.42], 0.09, [0, 1.15, -0.72], 'pillow')
    ]
  },
  starLantern: {
    id: 'starLantern', kind: 'prop', biome: 3, name: 'Star Lantern', title: 'Sleep Sky — Star Lantern',
    overall: { width: 0.45, height: 2.336, depth: 0.45 },
    materials: { post: { hex: '#4b3f8f', rough: 0.5, name: 'Post indigo' }, glow: { hex: '#ffe58a', emissive: 1.6, name: 'Lantern glow' }, star: { hex: '#ffd45b', emissive: 1.2, name: 'Star topper' } },
    joints: { root: { parent: null, pos: [0, 0, 0] } },
    parts: [
      CY('post', 'Post', 'root', 0.05, 0.08, 1.7, [0, 0.85, 0], 'post'),
      S('lamp', 'Lamp globe', 'root', [0.45, 0.45, 0.45], [0, 1.88, 0], 'glow'),
      { id: 'star', name: 'Star topper', joint: 'root', shape: 'extrude', outline: 'star', size: [0.26, 0.26], depth: 0.06, pos: [0, 2.2, 0], mat: 'star' }
    ]
  },
  // Hygiene Harbor ---------------------------------------------------------------------
  lighthouse: {
    id: 'lighthouse', kind: 'prop', biome: 4, name: 'Lighthouse', title: 'Hygiene Harbor — Lighthouse',
    overall: { width: 2.429, height: 6.24, depth: 2.429 },
    materials: { white: { hex: '#ffffff', rough: 0.5, name: 'Tower white' }, stripe: { hex: '#2ec4b6', rough: 0.5, name: 'Tower stripe teal' }, rock: { hex: '#7d8ea3', rough: 0.9, name: 'Rock base' }, lamp: { hex: '#fff3a3', emissive: 2.0, name: 'Lamp light' }, roof: { hex: '#ff6f61', rough: 0.5, name: 'Roof coral' } },
    joints: { root: { parent: null, pos: [0, 0, 0] } },
    parts: [
      { id: 'rocks', name: 'Rock base', joint: 'root', shape: 'dodeca', r: 1.3, pos: [0, 0.3, 0], scale: [1, 0.45, 1], mat: 'rock' },
      CY('towerA', 'Tower — base', 'root', 0.75, 0.9, 1.6, [0, 1.4, 0], 'white'),
      CY('stripeA', 'Stripe', 'root', 0.72, 0.76, 0.5, [0, 2.45, 0], 'stripe'),
      CY('towerB', 'Tower — middle', 'root', 0.6, 0.72, 1.2, [0, 3.3, 0], 'white'),
      CY('stripeB', 'Stripe', 'root', 0.58, 0.61, 0.45, [0, 4.1, 0], 'stripe'),
      CY('deck', 'Lamp deck', 'root', 0.85, 0.85, 0.15, [0, 4.42, 0], 'white'),
      CY('lamp', 'Lamp room', 'root', 0.45, 0.45, 0.8, [0, 4.9, 0], 'lamp'),
      CO('roof', 'Roof', 'root', 0.6, 0.8, [0, 5.7, 0], 'roof'),
      S('finial', 'Finial', 'root', [0.18, 0.18, 0.18], [0, 6.15, 0], 'stripe')
    ]
  },
  bubble: {
    id: 'bubble', kind: 'prop', biome: 4, name: 'Soap Bubble', title: 'Hygiene Harbor — Soap Bubble',
    overall: { width: 1.2, height: 1.2, depth: 1.2 },
    materials: { bubble: { hex: '#b5fff0', rough: 0.05, opacity: 0.45, emissive: 0.25, name: 'Bubble film (45% opacity)' }, glint: { hex: '#ffffff', emissive: 0.9, name: 'Glint' } },
    joints: { root: { parent: null, pos: [0, 0, 0] } },
    parts: [
      S('film', 'Bubble film', 'root', [1.2, 1.2, 1.2], [0, 0.6, 0], 'bubble'),
      S('glint', 'Glint', 'root', [0.2, 0.12, 0.05], [-0.28, 0.9, 0.48], 'glint', { rot: [0, -30, 35] })
    ]
  },
  toothbrushPost: {
    id: 'toothbrushPost', kind: 'prop', biome: 4, name: 'Toothbrush Post', title: 'Hygiene Harbor — Toothbrush Post',
    overall: { width: 0.5, height: 2.8, depth: 0.61 },
    materials: { handle: { hex: '#63f2c0', rough: 0.35, name: 'Handle mint' }, grip: { hex: '#2b7fff', rough: 0.5, name: 'Grip blue' }, bristle: { hex: '#ffffff', rough: 0.8, name: 'Bristles' }, base: { hex: '#355a7a', rough: 0.6, name: 'Dock post base' } },
    joints: { root: { parent: null, pos: [0, 0, 0] } },
    parts: [
      CY('base', 'Base', 'root', 0.25, 0.25, 0.3, [0, 0.15, 0], 'base'),
      B('handle', 'Handle', 'root', [0.22, 2.2, 0.16], 0.07, [0, 1.4, 0], 'handle'),
      B('grip', 'Grip', 'root', [0.24, 0.6, 0.18], 0.07, [0, 1.0, 0], 'grip'),
      B('head', 'Brush head', 'root', [0.24, 0.5, 0.2], 0.06, [0, 2.55, 0.02], 'handle'),
      B('bristles', 'Bristles', 'root', [0.2, 0.42, 0.24], 0.04, [0, 2.57, 0.24], 'bristle')
    ]
  },
  duck: {
    id: 'duck', kind: 'prop', biome: 4, name: 'Bath Duck Buoy', title: 'Hygiene Harbor — Bath Duck Buoy',
    overall: { width: 0.9, height: 1.02, depth: 1.22 },
    materials: { duck: { hex: '#ffd84a', rough: 0.4, name: 'Duck yellow' }, beak: { hex: '#ff8a2a', rough: 0.45, name: 'Beak orange' }, eye: { hex: '#1b1320', rough: 0.2, name: 'Eye' } },
    joints: { root: { parent: null, pos: [0, 0, 0] } },
    parts: [
      S('body', 'Body', 'root', [0.9, 0.62, 1.1], [0, 0.31, -0.05], 'duck'),
      S('head', 'Head', 'root', [0.5, 0.48, 0.48], [0, 0.78, 0.22], 'duck'),
      S('beak', 'Beak', 'root', [0.22, 0.1, 0.24], [0, 0.74, 0.5], 'beak'),
      S('eyeL', 'Eye', 'root', [0.06, 0.08, 0.04], [0.13, 0.85, 0.42], 'eye', { mirror: true })
    ]
  },
  // Calm Grove -------------------------------------------------------------------------
  bamboo: {
    id: 'bamboo', kind: 'prop', biome: 5, name: 'Bamboo Cluster', title: 'Calm Grove — Bamboo Cluster',
    overall: { width: 1.171, height: 4.2, depth: 0.719 },
    materials: { bamboo: { hex: '#8fd36a', rough: 0.6, name: 'Bamboo green' }, node: { hex: '#5fae4a', rough: 0.6, name: 'Bamboo nodes' }, leaf: { hex: '#4fbf5a', rough: 0.7, name: 'Bamboo leaves' } },
    joints: { root: { parent: null, pos: [0, 0, 0] } },
    parts: [
      CY('stalkA', 'Stalk', 'root', 0.09, 0.1, 4.2, [0, 2.1, 0], 'bamboo'),
      CY('stalkB', 'Stalk', 'root', 0.08, 0.09, 3.5, [0.42, 1.75, 0.2], 'bamboo'),
      CY('stalkC', 'Stalk', 'root', 0.075, 0.085, 3.0, [-0.38, 1.5, -0.22], 'bamboo'),
      CY('nodeA1', 'Node ring', 'root', 0.105, 0.105, 0.05, [0, 1.2, 0], 'node'),
      CY('nodeA2', 'Node ring', 'root', 0.1, 0.1, 0.05, [0, 2.5, 0], 'node'),
      CY('nodeB1', 'Node ring', 'root', 0.095, 0.095, 0.05, [0.42, 1.4, 0.2], 'node'),
      CY('nodeC1', 'Node ring', 'root', 0.09, 0.09, 0.05, [-0.38, 1.0, -0.22], 'node'),
      S('leafA', 'Leaf spray', 'root', [0.8, 0.14, 0.3], [0.32, 4.0, 0], 'leaf', { rot: [0, 0, 18] }),
      S('leafB', 'Leaf spray', 'root', [0.7, 0.12, 0.28], [0.15, 3.35, 0.2], 'leaf', { rot: [0, 30, -14] })
    ]
  },
  zenStones: {
    id: 'zenStones', kind: 'prop', biome: 5, name: 'Zen Stone Stack', title: 'Calm Grove — Zen Stone Stack',
    overall: { width: 1.2, height: 1.17, depth: 1 },
    materials: { stone: { hex: '#8b97a8', rough: 0.85, name: 'Stone grey' }, stone2: { hex: '#a7b2c2', rough: 0.85, name: 'Stone light' }, moss: { hex: '#6fcf5f', rough: 0.9, name: 'Moss' } },
    joints: { root: { parent: null, pos: [0, 0, 0] } },
    parts: [
      S('moss', 'Moss pad', 'root', [1.2, 0.16, 1.0], [0, 0.04, 0], 'moss'),
      S('stone1', 'Base stone', 'root', [0.9, 0.36, 0.76], [0, 0.26, 0], 'stone'),
      S('stone2', 'Middle stone', 'root', [0.68, 0.3, 0.58], [0.04, 0.58, 0.02], 'stone2'),
      S('stone3', 'Upper stone', 'root', [0.5, 0.25, 0.44], [-0.03, 0.85, -0.01], 'stone'),
      S('stone4', 'Top pebble', 'root', [0.32, 0.2, 0.3], [0.02, 1.07, 0.01], 'stone2')
    ]
  },
  paperLantern: {
    id: 'paperLantern', kind: 'prop', biome: 5, name: 'Paper Lantern', title: 'Calm Grove — Paper Lantern Post',
    overall: { width: 0.79, height: 2.4, depth: 0.42 },
    materials: { wood: { hex: '#6b4a33', rough: 0.85, name: 'Post wood' }, paper: { hex: '#ffcf7a', emissive: 1.1, name: 'Lantern paper glow' }, cap: { hex: '#c0392b', rough: 0.5, name: 'Lantern caps' } },
    joints: { root: { parent: null, pos: [0, 0, 0] } },
    parts: [
      CY('post', 'Post', 'root', 0.06, 0.08, 2.4, [0, 1.2, 0], 'wood'),
      B('arm', 'Hanger arm', 'root', [0.6, 0.06, 0.06], 0.02, [0.27, 2.35, 0], 'wood'),
      S('lantern', 'Lantern', 'root', [0.42, 0.5, 0.42], [0.5, 1.95, 0], 'paper'),
      CY('capTop', 'Top cap', 'root', 0.12, 0.14, 0.06, [0.5, 2.21, 0], 'cap'),
      CY('capBottom', 'Bottom cap', 'root', 0.14, 0.12, 0.06, [0.5, 1.69, 0], 'cap')
    ]
  },
  blossomTree: {
    id: 'blossomTree', kind: 'prop', biome: 5, name: 'Blossom Tree', title: 'Calm Grove — Blossom Tree',
    overall: { width: 2.65, height: 3.45, depth: 1.8 },
    materials: { bark: { hex: '#7a5a48', rough: 0.85, name: 'Bark' }, bloom: { hex: '#ffb3d1', rough: 0.85, name: 'Blossom pink' }, bloom2: { hex: '#ffd6e7', rough: 0.85, name: 'Blossom light' } },
    joints: { root: { parent: null, pos: [0, 0, 0] } },
    parts: [
      CY('trunk', 'Trunk', 'root', 0.12, 0.2, 1.6, [0, 0.8, 0], 'bark'),
      CY('branch', 'Branch', 'root', 0.06, 0.09, 0.9, [0.35, 1.7, 0], 'bark', { rot: [0, 0, -40] }),
      S('bloomA', 'Blossom cloud', 'root', [2.0, 1.4, 1.8], [0, 2.75, 0], 'bloom'),
      S('bloomB', 'Blossom cloud', 'root', [1.2, 0.9, 1.1], [0.75, 2.35, 0.2], 'bloom2'),
      S('bloomC', 'Blossom cloud', 'root', [1.1, 0.85, 1.0], [-0.75, 2.45, -0.1], 'bloom2')
    ]
  }
};

// ---------------------------------------------------------------------------------------
// Registry + biome kits
// ---------------------------------------------------------------------------------------
export const CAST = { pip: PIP, mia: MIA, leo: LEO, ginger: GINGER };
export const HERO_ORDER = ['pip', 'mia', 'leo', 'ginger'];
export const BLUEPRINTS = { ...CAST, gate: GATE, ...EMBLEMS, ...PROPS };
export const EMBLEM_BY_TOPIC = ['emblemApple', 'emblemDrop', 'emblemBolt', 'emblemMoon', 'emblemBubbles', 'emblemLeaf'];

export const BIOMES = [
  { key: 'garden', name: 'Fuel Garden', props: ['fruitTree', 'carrot', 'veggieCrate', 'sunflower'], weights: [4, 3, 2, 3],
    sky: ['#5fb4ff', '#bfe4ff', '#ffe9c4'], fog: '#ffe2bd', ground: '#5fbf4a', ground2: '#4aa83c', path: ['#d9a066', '#c48a52'], sun: '#fff1c9', hemi: ['#fff4dc', '#5a8a3a'], ambient: 'petals' },
  { key: 'falls', name: 'Hydration Falls', props: ['cliffFalls', 'bottleTower', 'reeds'], weights: [2, 1, 4],
    sky: ['#3aa6ff', '#9fdcff', '#e4fbff'], fog: '#c4efff', ground: '#3aaee0', ground2: '#2f9fd0', path: ['#9fb4c8', '#8aa1b8'], sun: '#ffffff', hemi: ['#e8fbff', '#2f7f74'], ambient: 'drops', water: true },
  { key: 'mountain', name: 'Move Mountain', props: ['mountain', 'pineTree', 'flag', 'hurdle'], weights: [1, 4, 2, 2],
    sky: ['#4f9dff', '#b9dcff', '#fff3d6'], fog: '#d8ebff', ground: '#78cf5a', ground2: '#5fb84a', path: ['#c9a27a', '#b88f66'], sun: '#fff8e1', hemi: ['#ffffff', '#5a7f3a'], ambient: 'sparks' },
  { key: 'sky', name: 'Sleep Sky', props: ['cloud', 'cloudBed', 'starLantern'], weights: [5, 1, 2],
    sky: ['#120b3d', '#3b2a8f', '#8d6be0'], fog: '#3d2f86', ground: '#d9ccff', ground2: '#c3b2ff', path: ['#f3ecff', '#e2d6ff'], sun: '#cfc2ff', hemi: ['#b9a8ff', '#2a1f66'], ambient: 'stars', night: true },
  { key: 'harbor', name: 'Hygiene Harbor', props: ['lighthouse', 'bubble', 'toothbrushPost', 'duck'], weights: [1, 4, 2, 2],
    sky: ['#3cb8ff', '#a6ecff', '#e8fffb'], fog: '#c8f6ff', ground: '#22a9c9', ground2: '#1f9fb3', path: ['#c79a6b', '#b5865a'], sun: '#ffffff', hemi: ['#f0ffff', '#2a7f8f'], ambient: 'bubbles', water: true },
  { key: 'grove', name: 'Calm Grove', props: ['bamboo', 'zenStones', 'paperLantern', 'blossomTree'], weights: [4, 2, 2, 2],
    sky: ['#6fb8e8', '#cdeccf', '#fff4e0'], fog: '#e0f2d6', ground: '#6fcf5f', ground2: '#5ab84c', path: ['#b8c4a8', '#a4b296'], sun: '#fff4d6', hemi: ['#f4ffe8', '#3f7f3a'], ambient: 'fireflies' }
];

// Expand mirrored joints/parts so consumers can iterate a flat list.
export function expandSpec(spec) {
  const mirrorName = (n) => (n && n.endsWith('L') ? `${n.slice(0, -1)}R` : n);
  const joints = {};
  for (const [name, j] of Object.entries(spec.joints || {})) {
    joints[name] = { ...j, name };
    if (j.mirror) {
      const r = j.rest || [0, 0, 0];
      joints[mirrorName(name)] = {
        ...j, name: mirrorName(name), parent: spec.joints[j.parent]?.mirror ? mirrorName(j.parent) : j.parent,
        pos: [-j.pos[0], j.pos[1], j.pos[2]], rest: [r[0], -r[1], -r[2]], mirrorOf: name
      };
    }
  }
  const parts = [];
  for (const p of spec.parts || []) {
    parts.push(p);
    if (p.mirror) {
      const jointMirrored = spec.joints[p.joint]?.mirror;
      const rot = p.rot || [0, 0, 0];
      parts.push({
        ...p, id: mirrorName(p.id) === p.id ? `${p.id}R` : mirrorName(p.id),
        joint: jointMirrored ? mirrorName(p.joint) : p.joint,
        pos: [-p.pos[0], p.pos[1], p.pos[2]], rot: [rot[0], -rot[1], -rot[2]], mirrorOf: p.id
      });
    }
  }
  return { joints, parts };
}

// Grouped parts list for blueprint tables (mirrored pairs collapse into “×2”).
export function partsTable(spec) {
  const rows = [];
  for (const p of spec.parts || []) {
    const qty = (p.mirror ? 2 : 1) * (p.shape === 'twists' ? p.count : 1);
    rows.push({ id: p.id, name: p.name, shape: p.shape, qty, size: describeSize(p), mat: p.mat });
  }
  return rows;
}

const cm = (m) => {
  const v = m * 100;
  return Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1);
};
export function describeSize(p) {
  switch (p.shape) {
    case 'sphere': case 'cap': return `${cm(p.size[0])}×${cm(p.size[1])}×${cm(p.size[2])}`;
    case 'box': return `${cm(p.size[0])}×${cm(p.size[1])}×${cm(p.size[2])} r${cm(p.r || 0)}`;
    case 'capsule': return `Ø${cm(p.r * 2)} L${cm(p.len + p.r * 2)}`;
    case 'cylinder': return p.rt === p.rb ? `Ø${cm(p.rt * 2)} H${cm(p.h)}` : `Ø${cm(p.rt * 2)}/${cm(p.rb * 2)} H${cm(p.h)}`;
    case 'cone': return `Ø${cm(p.r * 2)} H${cm(p.h)}`;
    case 'torus': return `R${cm(p.R)} Ø${cm(p.r * 2)}${p.arc && p.arc < 360 ? ` ${p.arc}°` : ''}`;
    case 'octa': case 'dodeca': return `R${cm(p.r)}`;
    case 'lathe': return `Ø${cm(Math.max(...p.pts.map((q) => q[0])) * 2)} H${cm(Math.max(...p.pts.map((q) => q[1])) - Math.min(...p.pts.map((q) => q[1])))}`;
    case 'extrude': return `${cm(p.size[0])}×${cm(p.size[1])}×${cm(p.depth)}`;
    case 'plane': return `${cm(p.size[0])}×${cm(p.size[1])}`;
    case 'twists': return `${p.count}× Ø${cm(p.r * 2)} L${cm(p.len + p.r * 2)}`;
    default: return '';
  }
}
export { cm as toCm };
