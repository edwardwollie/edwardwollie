// DOM builders for every screen and modal. No innerHTML with dynamic text and no inline
// style attributes (the server's CSP forbids them); dynamic values use CSSOM.
import { WORLDS, LANES, TUTORIAL, FAMILY, Q, MOVES, TOPIC_FACTS } from './content.js?v=2.0.1';
import { BLUEPRINTS, HERO_ORDER, toCm } from './blueprints.js?v=2.0.1';

// The Blueprint Lab is an internal tool: it only appears when the game is opened from this
// computer (npm start, then open localhost:3000). The public site never shows it.
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];
export const LAB_ENABLED = typeof location !== 'undefined' && LOCAL_HOSTS.includes(location.hostname);

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'vars') for (const [n, val] of Object.entries(v)) el.style.setProperty(n, val);
    else if (k === 'ref') v(el);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const toggles = (save) => [
  h('button', { class: 'icon-btn', 'data-action': 'voice', 'aria-label': 'Narration', 'aria-pressed': String(save.voice), title: 'Narration' }, save.voice ? '🔊' : '🔇'),
  h('button', { class: 'icon-btn', 'data-action': 'music', 'aria-label': 'Music', 'aria-pressed': String(save.music), title: 'Music' }, '🎵')
];

export function statPills(s) {
  return h('div', { class: 'stats' },
    h('span', { class: 'pill', title: 'Stars' }, `⭐ ${s.stars}`),
    h('span', { class: 'pill', title: 'Power' }, `⚡ ${s.xp}`),
    h('span', { class: 'pill', title: 'Badges' }, `🏅 ${s.badges}/6`),
    h('span', { class: 'pill', title: 'Power facts' }, `📘 ${s.facts}/72`));
}

// ---------------------------------------------------------------------------------------
export function titleScreen({ save, stats, mission, version }) {
  return h('section', { class: 'screen title-screen' },
    h('header', { class: 'brand' },
      h('span', { class: 'kicker' }, 'Flexzonic Wellness Rush'),
      h('h1', {}, 'Healthy Hero ', h('span', {}, '3D')),
      h('p', {}, 'Run through six Power Worlds, answer wellness questions, and learn healthy habits. Every body can be a hero.'),
      h('span', { class: 'build-tag' }, `3D BUILD v${version}`)),
    h('div', { class: 'corner' }, ...toggles(save)),
    h('div', { class: 'focus-area' }),
    h('div', { class: 'title-menu glass' },
      h('button', { class: 'btn-play', 'data-action': 'play' }, `▶ Play Mission ${mission.number}`, h('small', {}, `${mission.title} · ${mission.world.icon} ${mission.world.name}`)),
      h('div', { class: 'menu-grid' },
        h('button', { class: 'btn', 'data-action': 'map' }, h('span', { class: 'emo' }, '🗺️'), 'Island Map'),
        h('button', { class: 'btn', 'data-action': 'heroes' }, h('span', { class: 'emo' }, '🦸'), 'Heroes'),
        h('button', { class: 'btn', 'data-action': 'journal' }, h('span', { class: 'emo' }, '📘'), 'Power Journal'),
        LAB_ENABLED ? h('button', { class: 'btn', 'data-action': 'lab' }, h('span', { class: 'emo' }, '📐'), 'Blueprint Lab') : null,
        h('button', { class: 'btn', 'data-action': 'move' }, h('span', { class: 'emo' }, '💪'), 'Move Break'),
        h('button', { class: 'btn', 'data-action': 'breathe' }, h('span', { class: 'emo' }, '🫧'), 'Bubble Breathing'),
        h('button', { class: 'btn', 'data-action': 'family' }, h('span', { class: 'emo' }, '👨‍👩‍👧'), 'Family Play'),
        h('button', { class: 'btn', 'data-action': 'grownup' }, h('span', { class: 'emo' }, '🔒'), 'Grown-ups')),
      h('div', { class: 'title-stats' }, statPills(stats))));
}

export function mapScreen({ save, stats, mission, unlocked, stars }) {
  const locked = mission.index >= unlocked;
  const w = mission.world;
  return h('section', { class: 'screen map-screen' },
    h('header', { class: 'topbar' },
      h('button', { class: 'btn small ghost', 'data-action': 'home', 'aria-label': 'Back to home' }, '◀ Home'),
      h('h2', {}, 'Wellness Island'),
      statPills(stats), ...toggles(save)),
    h('div', { class: 'map-hint' }, 'Drag to spin · Pinch or scroll to zoom · Tap a stone or a world statue'),
    h('div', { class: 'focus-area' }),
    h('div', { class: 'side' },
      h('aside', { class: 'world-card glass', id: 'world-card', hidden: true }),
      h('aside', { class: 'mission-sheet glass' },
        h('div', { class: 'row' },
          h('span', { class: 'world-chip', vars: { background: w.color } }, `${w.icon} ${w.name}`),
          h('span', { class: 'pill' }, `⚡ Tier ${mission.tier + 1}/5 · ${Math.round(mission.approachMs / 1000)}s answer time`)),
        h('h3', {}, `Mission ${mission.number}: ${mission.title}`),
        h('p', {}, locked ? 'Locked — finish the mission before it to open this stone.' : 'Six Power Gates. Every gate is a different wellness world: food, water, movement, sleep, hygiene and feelings.'),
        h('div', { class: 'row' },
          h('span', { class: 'stars-line', 'aria-label': `${stars} of 3 stars` }, '★'.repeat(stars) + '☆'.repeat(3 - stars)),
          h('button', { class: 'btn primary', 'data-action': 'play-selected', disabled: locked || undefined }, locked ? '🔒 Locked' : '▶ Play mission')))));
}

export function worldCardContent(w) {
  const world = WORLDS[w];
  return [
    h('div', { class: 'row' }, h('span', { class: 'world-chip', vars: { background: world.color } }, `${world.icon} ${world.name}`), h('span', { class: 'pill' }, `Badge: ${world.badge}`)),
    h('ul', {}, ...TOPIC_FACTS[w].map((f) => h('li', {}, f))),
    h('div', { class: 'row' }, h('button', { class: 'btn small', 'data-action': 'hear-world', 'data-world': w }, '🔊 Hear it'), h('button', { class: 'btn small ghost', 'data-action': 'close-world' }, 'Close'))
  ];
}

// ---------------------------------------------------------------------------------------
export function runScreen({ save, mission, step, total, hearts, score, results, q, topic, lane }) {
  const pips = Array.from({ length: total }, (_, i) => {
    const res = results[i];
    const t = WORLDS[Q[mission.qids[i]].zone];
    return h('span', { class: `pip ${res === true ? 'done' : res === false ? 'miss' : ''} ${i === step ? 'now' : ''}`, title: t.name }, t.icon);
  });
  return h('section', { class: 'screen run-screen', vars: { '--topic': topic.color } },
    h('header', { class: 'run-top' },
      h('button', { class: 'icon-btn', 'data-action': 'pause', 'aria-label': 'Pause' }, '⏸'),
      h('div', { class: 'mission-label' }, h('small', {}, `Mission ${mission.number}`), mission.title),
      h('div', { class: 'pips', id: 'pips' }, ...pips),
      h('span', { class: 'pill hearts', id: 'hearts', 'aria-label': `${hearts} hearts` }, '💚'.repeat(hearts) + '🤍'.repeat(3 - hearts)),
      h('span', { class: 'pill', id: 'score' }, `⚡ ${score}`)),
    h('div', { class: 'question-card glass', id: 'question-card' },
      h('div', { class: 'q-meta' },
        h('span', { class: 'topic-chip' }, `${topic.icon} ${topic.name}`),
        h('span', { class: 'phase-chip', id: 'phase-chip', 'aria-live': 'polite' }, save.voice ? '🔊 Listening…' : '📖 Reading time'),
        h('span', { class: 'pill' }, `Gate ${step + 1} of ${total}`)),
      h('h3', { id: 'q-text', 'aria-live': 'polite' }, q.q),
      h('button', { class: 'btn small read-btn', 'data-action': 'speak', 'aria-label': 'Read the question again' }, '🔊 READ'),
      h('div', { class: 'timer-bar reading', id: 'timer-bar', 'aria-hidden': 'true' }, h('i', { id: 'timer-fill' }))),
    h('div', { class: 'focus-area' }),
    h('div', { class: 'answer-cards', id: 'answer-cards' }, ...q.choices.map((c, i) =>
      h('button', { class: `answer-card ${i === lane ? 'selected' : ''}`, 'data-answer': i, vars: { '--lane': LANES[i].color }, 'aria-label': `Lane ${i + 1}: ${c}` },
        h('span', { class: 'lane-badge' }, `${i + 1} ${LANES[i].shape}`), h('b', {}, c), h('small', {}, 'YOUR LANE')))),
    h('div', { class: 'run-controls' },
      h('button', { 'data-lane': '-1', 'aria-label': 'Move left' }, '◀', h('small', {}, 'LEFT')),
      h('button', { class: 'dash', 'data-action': 'rush', 'aria-label': 'Dash now' }, '⚡ DASH', h('small', {}, 'GO NOW')),
      h('button', { 'data-lane': '1', 'aria-label': 'Move right' }, '▶', h('small', {}, 'RIGHT')),
      h('button', { class: 'calm', 'data-action': 'guard', 'aria-label': 'Calm shield' }, '💚', h('small', {}, 'CALM'))),
    h('div', { class: 'impact-text', id: 'impact', 'aria-hidden': 'true' }),
    h('div', { class: 'combo-pop', id: 'combo', 'aria-hidden': 'true' }));
}

export function factCard({ correct, q, autoMs }) {
  const answer = q.choices[q.answer];
  return h('section', { class: `fact-card glass ${correct ? '' : 'miss'}`, id: 'fact-card', role: 'status', 'aria-live': 'polite' },
    h('h3', {}, correct ? '✨ Power burst!' : '💡 Nice try — keep running!'),
    correct ? null : h('p', { class: 'helpful' }, `Helpful answer: ${answer}`),
    h('p', {}, q.explain),
    h('div', { class: 'fact-progress' }, h('i', { id: 'fact-progress' })),
    h('div', { class: 'actions' },
      h('button', { class: 'btn mint', 'data-action': 'next-gate' }, '▶ Keep running'),
      h('button', { class: 'btn small', 'data-action': 'speak-fact' }, '🔊'),
      h('span', { class: 'auto' }, autoMs ? 'Next gate starts by itself' : '')));
}

// ---------------------------------------------------------------------------------------
export function completeScreen({ stars, score, bestCombo, facts, badge, isLast }) {
  return h('section', { class: 'screen stage-screen complete-screen' },
    h('header', { class: 'topbar' }, h('span', { class: 'kicker' }, 'Mission complete')),
    h('div', { class: 'focus-area' }),
    h('div', { class: 'bottom-card glass complete-card' },
      h('div', { class: 'big-stars', 'aria-label': `${stars} of 3 stars` }, ...[0, 1, 2].map((i) => (i < stars ? h('b', {}, '★') : '☆'))),
      h('h3', {}, 'World powered up!'),
      h('div', { class: 'result-grid' },
        h('div', {}, h('small', {}, 'Score'), `⚡ ${score}`),
        h('div', {}, h('small', {}, 'Best combo'), `🔥 ${bestCombo}×`),
        h('div', {}, h('small', {}, 'Power facts'), `📘 +${facts}`)),
      badge ? h('p', { class: 'badge-line' }, `🏅 New badge: ${badge}!`) : null,
      h('p', {}, 'You cleared every gate and practiced helpful wellness powers. There is no perfect body and no food-shaming here—only helpful choices and teamwork.'),
      h('div', { class: 'actions' },
        isLast ? null : h('button', { class: 'btn primary', 'data-action': 'next' }, '▶ Next mission'),
        h('button', { class: 'btn', 'data-action': 'replay' }, '↻ Replay'),
        h('button', { class: 'btn', 'data-action': 'map' }, '🗺️ Island map'))));
}

export function heroesScreen({ selected }) {
  const spec = BLUEPRINTS[selected];
  return h('section', { class: 'screen stage-screen heroes-screen' },
    h('header', { class: 'topbar' }, h('button', { class: 'btn small ghost', 'data-action': 'home' }, '◀ Home'), h('h2', {}, 'Choose your hero')),
    h('div', { class: 'focus-area' }),
    h('div', { class: 'bottom-card glass' },
      h('div', { class: 'hero-chips' }, ...HERO_ORDER.map((id) => h('button', { class: `hero-chip ${id === selected ? 'on' : ''}`, 'data-hero': id }, BLUEPRINTS[id].name, h('small', {}, BLUEPRINTS[id].title.split('— ')[1] || '')))),
      h('h3', {}, spec.title),
      h('p', {}, spec.role),
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary', 'data-action': 'choose-hero' }, `✔ Play as ${spec.name}`),
        h('button', { class: 'btn', 'data-action': 'hero-hello' }, '🔊 Say hi'),
        LAB_ENABLED ? h('button', { class: 'btn', 'data-action': 'lab-hero' }, '📐 See blueprint') : null)));
}

export function moveScreen({ hero, index, remaining, running }) {
  const m = MOVES[index] || MOVES[0];
  return h('section', { class: 'screen stage-screen move-screen' },
    h('header', { class: 'topbar' }, h('button', { class: 'btn small ghost', 'data-action': 'stop-activity' }, '◀ Back'), h('h2', {}, 'Move Break')),
    h('div', { class: 'focus-area' }),
    h('div', { class: 'bottom-card glass' },
      h('div', { class: 'move-row' },
        h('div', { class: 'count-ring', id: 'count-ring', vars: { '--p': String(Math.round((1 - remaining / 60) * 100)) } }, h('span', { id: 'count-num' }, String(remaining))),
        h('div', {},
          h('h3', { class: 'move-name', id: 'move-name' }, running ? m.name : 'Copy your hero!'),
          h('p', { id: 'move-tip' }, running ? m.tip : `Copy ${BLUEPRINTS[hero].name}’s moves for 60 seconds, or invent your own comfortable move.`))),
      h('div', { class: 'move-dots', id: 'move-dots' }, ...MOVES.map((_, i) => h('i', { class: i < index ? 'done' : i === index && running ? 'on' : '' }))),
      h('p', { class: 'tip', id: 'move-easy' }, running ? m.easy : 'March, stretch, dance, wheel, balance, or invent a move that feels good for your body. Stop if anything hurts.'),
      h('div', { class: 'actions' }, running ? h('button', { class: 'btn', 'data-action': 'stop-activity' }, '■ Stop') : h('button', { class: 'btn primary', 'data-action': 'move-start' }, '▶ Start 60 seconds'))));
}

export function breatheScreen({ running, cycle }) {
  return h('section', { class: 'screen stage-screen breathe-screen' },
    h('header', { class: 'topbar' }, h('button', { class: 'btn small ghost', 'data-action': 'stop-activity' }, '◀ Back'), h('h2', {}, 'Bubble Breathing')),
    h('div', { class: 'breathe-word', id: 'breathe-word' }, running ? 'Breathe in…' : 'Ready?', h('small', { id: 'breathe-count' }, running ? `Bubble ${cycle} of 5` : 'Watch the bubble grow and shrink')),
    h('div', { class: 'bottom-card glass' },
      h('p', {}, 'Breathe in slowly while the bubble grows. Breathe out slowly while it shrinks. Breathe comfortably — you can stop any time.'),
      h('div', { class: 'actions' }, running ? h('button', { class: 'btn', 'data-action': 'stop-activity' }, '■ Stop') : h('button', { class: 'btn mint', 'data-action': 'breathe-start' }, '▶ Start 5 bubbles'))));
}

export function labScreen({ id, view, style, groups }) {
  const spec = BLUEPRINTS[id];
  const parts = (spec.parts || []).reduce((n, p) => n + (p.mirror ? 2 : 1) * (p.shape === 'twists' ? p.count : 1), 0);
  return h('section', { class: 'screen lab-screen' },
    style === 'blueprint' ? h('div', { class: 'lab-grid-overlay' }) : null,
    h('header', { class: 'topbar' }, h('button', { class: 'btn small ghost', 'data-action': 'home' }, '◀ Home'), h('h2', {}, '📐 Blueprint Lab')),
    h('div', { class: 'focus-area' }),
    h('div', { class: 'lab-panel glass' },
      ...groups.map((g) => h('div', { class: 'lab-row' }, h('span', { class: 'label' }, g.title),
        h('div', { class: 'chip-scroll' }, ...g.ids.map((mid) => h('button', { class: `chip ${mid === id ? 'on' : ''}`, 'data-lab': mid }, BLUEPRINTS[mid].name))))),
      h('div', { class: 'lab-row' }, h('span', { class: 'label' }, 'View'),
        ...[['iso', '3D'], ['spin', 'Spin'], ['front', 'Front'], ['back', 'Back'], ['left', 'Left'], ['right', 'Right'], ['top', 'Top']].map(([v, n]) => h('button', { class: `chip ${v === view ? 'on' : ''}`, 'data-view': v }, n))),
      h('div', { class: 'lab-row' }, h('span', { class: 'label' }, 'Style'),
        h('button', { class: `chip ${style === 'blueprint' ? 'on' : ''}`, 'data-style': 'blueprint' }, 'Blueprint'),
        h('button', { class: `chip ${style === 'color' ? 'on' : ''}`, 'data-style': 'color' }, 'Color'),
        h('button', { class: 'chip', 'data-action': 'build' }, '🔧 Build it!')),
      h('div', { class: 'lab-info' }, h('b', {}, spec.title || spec.name), h('br'),
        `Size: ${toCm(spec.overall?.width || 0)} × ${toCm(spec.overall?.height || 0)} × ${toCm(spec.overall?.depth || 0)} cm · ${parts} parts`),
      h('p', { class: 'lab-explain' }, 'Designers draw an object from every side — front, back, left, right and top. These drawings are called blueprints. The game builds every 3D model from these exact measurements!'),
      h('div', { class: 'lab-row' }, h('a', { class: 'btn small', href: '/blueprints/healthy-hero-3d-blueprints.pdf', target: '_blank', rel: 'noopener' }, '⬇ Blueprint book (PDF)'))),
    h('svg', { class: 'lab-dims', id: 'lab-dims', 'aria-hidden': 'true' }));
}

// ---------------------------------------------------------------------------------------
export function modal(...children) {
  return h('div', { class: 'modal-backdrop', 'data-backdrop': 'true' }, h('section', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, ...children));
}

export function tutorialModal(step) {
  const [a, b] = TUTORIAL[step];
  return modal(
    h('span', { class: 'eyebrow' }, `Hero training ${step + 1}/${TUTORIAL.length}`),
    h('h2', {}, a),
    h('div', { class: 'tutorial-step' }, h('span', { class: 'tutorial-num' }, String(step + 1)), h('p', {}, b)),
    h('div', { class: 'tutorial-dots' }, ...TUTORIAL.map((_, i) => h('i', { class: i === step ? 'on' : '' }))),
    h('div', { class: 'actions' },
      step ? h('button', { class: 'btn', 'data-action': 'tutorial-back' }, 'Back') : null,
      h('button', { class: 'btn primary', 'data-action': 'tutorial-next' }, step === TUTORIAL.length - 1 ? '▶ Start running' : 'Next'),
      h('button', { class: 'btn ghost', 'data-action': 'tutorial-skip' }, 'Skip')));
}

export function familyModal(save) {
  return modal(
    h('span', { class: 'eyebrow' }, 'Play together'),
    h('h2', {}, 'Family Power-Up Deck'),
    h('p', {}, 'Choose one short activity. A grown-up adapts it for the child’s abilities, sensory needs, allergies, culture, and family guidance.'),
    h('div', { class: 'family-grid' }, ...FAMILY.map(([a, b], i) => h('button', { class: 'family-activity', 'data-family': i }, h('strong', {}, `${save.familyDone.includes(i) ? '✅ ' : ''}${a}`), h('span', {}, b)))),
    h('p', { class: 'tip' }, 'Healthy Hero is educational play, not medical advice. Families should follow guidance from their child’s pediatric or health professionals.'),
    h('div', { class: 'actions' }, h('button', { class: 'btn', 'data-action': 'close' }, 'Close')));
}

export function journalModal(save, tab) {
  const facts = save.facts || {};
  const inTopic = Q.filter((q) => q.zone === tab);
  const found = Object.keys(facts).length;
  return modal(
    h('span', { class: 'eyebrow' }, `Power Journal · ${found}/72 discovered`),
    h('h2', {}, `${WORLDS[tab].icon} ${WORLDS[tab].name}`),
    h('div', { class: 'journal-tabs' }, ...WORLDS.map((w, i) => h('button', { class: `chip ${i === tab ? 'on' : ''}`, 'data-journal': i }, `${w.icon} ${w.topic} ${Q.filter((q) => q.zone === i && facts[q.id]).length}/12`))),
    h('div', { class: 'journal-grid' }, ...inTopic.map((q) => {
      const state = facts[q.id];
      if (!state) return h('div', { class: 'fact locked' }, h('b', {}, '🔒 Power fact'), h('span', {}, 'Clear more gates in this world to discover it.'));
      return h('button', { class: `fact ${state === 2 ? 'mastered' : ''}`, 'data-fact': q.id },
        state === 2 ? h('span', { class: 'tag' }, '★ MASTERED') : h('span', { class: 'tag' }, 'DISCOVERED'),
        h('b', {}, q.q), h('span', {}, `✔ ${q.choices[q.answer]} — ${q.explain}`));
    })),
    h('div', { class: 'actions' }, h('button', { class: 'btn', 'data-action': 'close' }, 'Close')));
}

export function grownupModal(save, stats, mastery) {
  const seg = (key, options) => h('div', { class: 'seg' }, ...options.map(([v, n]) => h('button', { class: `chip ${String(save[key]) === String(v) ? 'on' : ''}`, 'data-setting': key, 'data-value': String(v) }, n)));
  return modal(
    h('span', { class: 'eyebrow' }, 'Private grown-up view'),
    h('h2', {}, 'Progress snapshot'),
    h('p', {}, `${stats.completed} missions completed · ${stats.stars} stars · ${stats.badges} badges · ${stats.facts}/72 power facts · ${save.familyDone.length} family activities tried.`),
    h('div', { class: 'mastery' }, ...WORLDS.map((w, i) => h('div', { class: 'mastery-row' }, h('span', {}, `${w.icon} ${w.topic}`), h('div', { class: 'meter' }, h('i', { vars: { width: `${Math.round(mastery[i] * 100)}%` } })), h('span', {}, `${Math.round(mastery[i] * 12)}/12`)))),
    h('p', { class: 'tip' }, 'Play tip: ask, “Which power would help our family today?” Praise noticing body signals, asking for help, and trying — not appearance, weight, speed, or perfection. Progress is saved only on this device; no account, microphone, camera, location, ads, or personal information is used.'),
    h('div', { class: 'settings' },
      h('div', { class: 'setting' }, 'Narration', seg('voice', [[true, 'On'], [false, 'Off']])),
      h('div', { class: 'setting' }, 'Music', seg('music', [[true, 'On'], [false, 'Off']])),
      h('div', { class: 'setting' }, 'Sound effects', seg('sfx', [[true, 'On'], [false, 'Off']])),
      h('div', { class: 'setting' }, 'Motion', seg('motion', [['auto', 'Auto'], ['reduced', 'Reduced']])),
      h('div', { class: 'setting' }, '3D quality', seg('quality', [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Med'], ['high', 'High']]))),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', 'data-action': 'close' }, 'Close'),
      h('button', { class: 'btn', 'data-action': 'replay-tutorial' }, 'Replay tutorial'),
      h('a', { class: 'btn', href: '/classic/' }, 'Classic 2D mode'),
      h('button', { class: 'btn ghost', 'data-action': 'reset' }, 'Reset device progress')));
}

export function pauseModal(save) {
  return modal(
    h('span', { class: 'eyebrow' }, 'Paused'),
    h('h2', {}, 'Take a breather'),
    h('p', {}, 'The gate waits for you. When you come back, the question is read again and you get the full thinking and answer time.'),
    h('div', { class: 'actions' },
      h('button', { class: 'btn primary', 'data-action': 'resume' }, '▶ Keep running'),
      h('button', { class: 'btn', 'data-action': 'restart' }, '↻ Restart mission'),
      h('button', { class: 'btn', 'data-action': 'map' }, '🗺️ Island map'),
      h('button', { class: 'btn', 'data-action': 'home' }, '🏠 Home')),
    h('div', { class: 'settings' }, h('div', { class: 'setting' }, 'Narration', h('div', { class: 'seg' }, ...[[true, 'On'], [false, 'Off']].map(([v, n]) => h('button', { class: `chip ${save.voice === v ? 'on' : ''}`, 'data-setting': 'voice', 'data-value': String(v) }, n))))));
}

export function confirmModal(text, yesAction) {
  return modal(h('h2', {}, 'Are you sure?'), h('p', {}, text),
    h('div', { class: 'actions' }, h('button', { class: 'btn primary', 'data-action': yesAction }, 'Yes, reset'), h('button', { class: 'btn', 'data-action': 'close' }, 'Cancel')));
}

export function fallbackModal() {
  return modal(
    h('span', { class: 'eyebrow' }, '3D is not available'),
    h('h2', {}, 'Let’s play Classic!'),
    h('p', {}, 'This device or browser can’t show 3D graphics right now. Healthy Hero Classic has the same 72 wellness questions in 2D — and your progress is shared.'),
    h('div', { class: 'actions' }, h('a', { class: 'btn primary', href: '/classic/' }, '▶ Play Healthy Hero Classic')));
}
