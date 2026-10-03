import { useMemo, useState } from "react";
import { WORLDS, type AgePath } from "../../flight-data.ts";
import { SPACE_RUSH_TOPICS, createSpaceRushDeck, type SpaceRushQuestion } from "../../space-rush-data.ts";
import { CADETS, SUIT_ACCENTS } from "../blueprints/cast.ts";
import { STUDIO_ENABLED } from "../app/features.ts";
import { ACHIEVEMENTS } from "../data/achievements.ts";
import { PHOTO_TARGETS } from "../data/destinations.ts";
import { AGE_PATHS, DESTINATIONS, type ActivityKind } from "../engineering/missions.ts";
import { partInfo, type SystemId } from "../engineering/systems.ts";
import type { HangarScene } from "../scenes/hangar.ts";
import type { StudioScene } from "../scenes/studio.ts";
import { missionKey, rankFor, totalStars } from "../state/save.ts";
import { Sheet, Stars, useGame, useSave } from "./common.tsx";
import { AGE_INFO } from "./screens.tsx";

/** All 216 Space Rush questions (72 per crew path), by id. */
const QUESTION_BANK: ReadonlyMap<string, SpaceRushQuestion & { age: AgePath }> = new Map(
  AGE_PATHS.flatMap((age) => createSpaceRushDeck(age).map((q) => [q.id, { ...q, age }] as const)),
);
export const TOTAL_FACTS = QUESTION_BANK.size;

type LoungeTab = "cadet" | "journal" | "badges" | "passport" | "album" | "designs";
const TABS: { id: LoungeTab; label: string }[] = [
  { id: "cadet", label: "🧑‍🚀 Cadet" },
  { id: "journal", label: "📘 Star Journal" },
  { id: "badges", label: "🏅 Badges" },
  { id: "passport", label: "🛂 Passport" },
  { id: "album", label: "📸 Photo album" },
  { id: "designs", label: "🚀 My rockets" },
];

function CadetTab() {
  const game = useGame();
  const save = useSave((s) => s);
  const age = save.age ?? "5–7";
  const look = CADETS.find((c) => c.id === save.v3.cadet) ?? CADETS[0];
  const thumbs = useMemo(() => Object.fromEntries(CADETS.map((c) => [c.id, game.thumbnail(`cadet-${c.id}`, 112)])), [game]);
  const rank = rankFor(save.xp);
  const st = save.v3.stats;
  const accuracy = st.gates ? Math.round((st.gatesCorrect / st.gates) * 100) : 0;
  return (
    <>
      <div className="lounge-hero">
        <img src={thumbs[look.id]} alt="" />
        <div>
          <div className="kicker">{AGE_INFO[age].icon} {AGE_INFO[age].name} · ages {age}</div>
          <div className="h2">Cadet {look.name}</div>
          <div>Rank: <b style={{ color: "var(--gold)" }}>{rank.current.name}</b>{rank.next ? <span className="muted"> · {rank.next.xp - save.xp} XP to {rank.next.name}</span> : <span className="muted"> · top rank!</span>}</div>
          <div className="path-bar" style={{ maxWidth: 360 }}><i style={{ width: `${Math.round(rank.progress * 100)}%` }} /></div>
        </div>
      </div>
      <div className="stat-grid">
        <div><b>★ {totalStars(save)}</b>mission stars</div>
        <div><b>✦ {save.starCores}</b>star cores</div>
        <div><b>⚡ {save.xp}</b>XP</div>
        <div><b>🔥 {save.bestCombo}</b>best gate combo</div>
        <div><b>{st.gates}</b>gates flown</div>
        <div><b>{accuracy}%</b>answered right</div>
        <div><b>{st.launches}</b>launches</div>
        <div><b>{st.orbits}</b>orbits</div>
        <div><b>{st.docks}</b>dockings</div>
        <div><b>{st.landings}</b>landings</div>
        <div><b>{st.samples}</b>asteroid grabs</div>
        <div><b>{st.photos}</b>photo flybys</div>
      </div>
      <div className="kicker" style={{ marginTop: 14 }}>Change cadet</div>
      <div className="cadet-pick" style={{ marginTop: 6 }}>
        {CADETS.map((c) => (
          <button key={c.id} className={"cadet-btn" + (save.v3.cadet === c.id ? " on" : "")} onClick={() => game.chooseCadet(c.id)}>
            <img src={thumbs[c.id]} alt="" /> {c.name}
          </button>
        ))}
      </div>
      <div className="kicker" style={{ marginTop: 12 }}>Suit colour</div>
      <div className="suit-pick" style={{ marginTop: 6 }}>
        {Object.entries(SUIT_ACCENTS).map(([key, value]) => (
          <button key={key} className={"suit-dot" + (save.v3.suit === key ? " on" : "")} style={{ background: value.accent }} title={value.label} aria-label={value.label} onClick={() => game.chooseSuit(key)} />
        ))}
      </div>
    </>
  );
}

function JournalTab() {
  const game = useGame();
  const journal = useSave((s) => s.v3.journal);
  const [topic, setTopic] = useState<string>("all");
  const entries = journal.map((id) => QUESTION_BANK.get(id)).filter((q) => q !== undefined).reverse();
  const shown = topic === "all" ? entries : entries.filter((q) => q.topic === topic);
  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>Every Space Rush gate you answer correctly adds its fact to your journal. <b style={{ color: "var(--text)" }}>{entries.length} of {TOTAL_FACTS}</b> facts collected.</p>
      <div className="tabs">
        <button className={"btn small" + (topic === "all" ? " on" : "")} onClick={() => setTopic("all")}>All</button>
        {SPACE_RUSH_TOPICS.map((t) => {
          const count = entries.filter((q) => q.topic === t).length;
          return <button key={t} className={"btn small" + (topic === t ? " on" : "")} onClick={() => setTopic(t)}>{t} · {count}</button>;
        })}
      </div>
      {shown.length === 0 && <div className="card">✨ Fly a mission and answer the learning gates to collect your first facts!</div>}
      {shown.map((q) => (
        <div key={q.id} className="journal-item row" style={{ alignItems: "flex-start" }}>
          <div style={{ fontSize: 22 }}>{q.icon}</div>
          <div style={{ flex: 1 }}>
            <small>{q.topic.toUpperCase()} · AGES {q.age}</small>
            <div>{q.explanation}</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>Q: {q.prompt} <b style={{ color: "var(--green)" }}>{q.correct}</b></div>
          </div>
          <button className="btn small round" style={{ width: 40, height: 40, minHeight: 40, fontSize: 16 }} aria-label="Read this fact" onClick={() => void game.say(`${q.prompt} ${q.correct}. ${q.explanation}`)}>🔊</button>
        </div>
      ))}
    </>
  );
}

function BadgesTab() {
  const owned = useSave((s) => s.v3.achievements);
  const badges = useSave((s) => s.badges);
  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>{ACHIEVEMENTS.filter((a) => owned.includes(a.id)).length} of {ACHIEVEMENTS.length} achievements unlocked.</p>
      <div className="grid-cards" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 8 }}>
        {ACHIEVEMENTS.map((a) => (
          <div key={a.id} className={"badge-tile" + (owned.includes(a.id) ? "" : " locked")}>
            <span className="ico">{a.icon}</span>
            <div><b>{a.name}</b><div className="muted" style={{ fontSize: 13 }}>{a.detail}</div></div>
          </div>
        ))}
      </div>
      <div className="kicker" style={{ marginTop: 14 }}>Sector Ace badges (boss missions)</div>
      <div className="row wrap" style={{ marginTop: 6 }}>
        {WORLDS.map((w) => {
          const name = `${w.name} Ace`;
          return <span key={name} className={"chip" + (badges.includes(name) ? " ok" : "")} style={badges.includes(name) ? undefined : { opacity: 0.45 }}>{w.icon} {name}</span>;
        })}
      </div>
    </>
  );
}

function PassportTab() {
  const save = useSave((s) => s);
  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>Complete a mission at each destination to stamp your Space Passport.</p>
      <div className="grid-cards" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}>
        {WORLDS.map((w, i) => {
          const stamped = save.v3.passport.includes(String(i));
          return (
            <div key={w.name} className={"card passport" + (stamped ? " stamped" : "")} style={{ ["--accent" as string]: w.color }}>
              <div className="icon">{w.icon}</div>
              <h3>{w.name}</h3>
              <p>{DESTINATIONS[i][0].toUpperCase() + DESTINATIONS[i].slice(1)} · {w.detail}</p>
              <div className="stamp">{stamped ? "✓ VISITED" : "NOT YET"}</div>
            </div>
          );
        })}
      </div>
      <div className="stat-grid" style={{ marginTop: 12 }}>
        <div><b>{save.v3.planetWalk.length}/10</b>Planet Walk stops</div>
        <div><b>{save.v3.observatory.length}/11</b>worlds explored</div>
        <div><b>{save.v3.jumps.length}</b>worlds jumped on</div>
        {STUDIO_ENABLED && <div><b>{save.v3.studioSeen.length}</b>blueprints read</div>}
      </div>
    </>
  );
}

function AlbumTab() {
  const game = useGame();
  const photos = useSave((s) => s.v3.photos);
  const all = Object.entries(PHOTO_TARGETS).flatMap(([planet, list]) => list.map((t) => ({ ...t, planet })));
  const icon: Record<string, string> = { jupiter: "🟠", saturn: "🪐", uranus: "🔵", neptune: "🔷" };
  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>Photos from your Outer Worlds flybys: <b style={{ color: "var(--text)" }}>{photos.length} of {all.length}</b>.</p>
      <div className="grid-cards" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        {all.map((t) => {
          const have = photos.includes(t.id);
          return (
            <div key={t.id} className="card" style={have ? undefined : { opacity: 0.5 }}>
              <div className="icon">{have ? icon[t.planet] : "❔"}</div>
              <h3>{have ? t.name : "Undiscovered"}</h3>
              <p>{have ? t.fact : `Fly a mission to ${t.planet[0].toUpperCase() + t.planet.slice(1)} to snap this photo.`}</p>
              {have && <button className="btn small" onClick={() => void game.say(`${t.name}. ${t.fact}`)}>🔊 Read</button>}
            </div>
          );
        })}
      </div>
    </>
  );
}

function safeName(id: string) {
  try { return partInfo(id as SystemId).name; } catch { return id; }
}

function DesignsTab() {
  const game = useGame();
  const designs = useSave((s) => s.v3.designs);
  const open = async (counts: Record<string, number>) => {
    await game.openHangarSandbox();
    (game.scene("hangar") as HangarScene).loadDesign(counts);
  };
  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>Rockets you saved in the Hangar sandbox (💾 Save). Up to 12 designs are kept.</p>
      {designs.length === 0 && <div className="card">🔧 Build a rocket in the Rocket Hangar and tap 💾 Save to keep it here.</div>}
      <div className="grid-cards">
        {designs.map((d, i) => (
          <div key={d.savedAt + i} className="card">
            <div className="icon">🚀</div>
            <h3>{d.name}</h3>
            <p>{Object.entries(d.counts).filter(([, n]) => n > 0).map(([id, n]) => `${safeName(id)} ×${n}`).join(" · ") || "Empty"}</p>
            <div className="row wrap">
              <button className="btn small primary" onClick={() => void open(d.counts)}>🔧 Open in Hangar</button>
              <button className="btn small" onClick={() => game.save.set((s) => ({ v3: { ...s.v3, designs: s.v3.designs.filter((_, j) => j !== i) } }))}>🗑 Remove</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function Lounge() {
  const game = useGame();
  const [tab, setTab] = useState<LoungeTab>("cadet");
  return (
    <Sheet title="Crew Lounge" kicker="Your cadet · facts · badges · passport" onClose={() => void game.goHub()} wide>
      <div className="tabs">
        {TABS.map((t) => <button key={t.id} className={"btn small" + (tab === t.id ? " on" : "")} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>
      {tab === "cadet" && <CadetTab />}
      {tab === "journal" && <JournalTab />}
      {tab === "badges" && <BadgesTab />}
      {tab === "passport" && <PassportTab />}
      {tab === "album" && <AlbumTab />}
      {tab === "designs" && <DesignsTab />}
    </Sheet>
  );
}

// ---------------------------------------------------------------- Grown-ups

function PathProgress({ age }: { age: AgePath }) {
  const game = useGame();
  const save = useSave((s) => s);
  const [confirm, setConfirm] = useState(false);
  const info = AGE_INFO[age];
  let stars = 0, done = 0;
  for (let level = 1; level <= 30; level++) {
    const st = save.stars[missionKey(age, level)];
    if (st) { stars += st; done++; }
  }
  const unlocked = save.progress[age];
  return (
    <div className="card" style={{ ["--accent" as string]: info.color }}>
      <div className="row"><span style={{ fontSize: 28 }}>{info.icon}</span><div><b>{info.name}</b><div className="muted" style={{ fontSize: 13 }}>Ages {age}</div></div><div className="spacer" />{save.age === age && <span className="chip ok">Current</span>}</div>
      <div className="path-bar"><i style={{ width: `${(done / 30) * 100}%` }} /></div>
      <div style={{ fontSize: 14 }}>{done} of 30 missions complete · mission {unlocked} unlocked · <span className="stars">★</span> {stars}/90 stars</div>
      <div className="row wrap" style={{ marginTop: 8 }}>
        {save.age !== age && <button className="btn small" onClick={() => game.chooseAge(age)}>Switch to this path</button>}
        {!confirm ? (
          <button className="btn small" onClick={() => setConfirm(true)}>↺ Reset this path…</button>
        ) : (
          <>
            <button className="btn small pink" onClick={() => { game.resetProgress(age); setConfirm(false); game.toast(`${info.name} progress was reset.`, "↺"); }}>Yes, reset {info.name}</button>
            <button className="btn small" onClick={() => setConfirm(false)}>Cancel</button>
          </>
        )}
      </div>
    </div>
  );
}

export function Grownups() {
  const game = useGame();
  const save = useSave((s) => s);
  const journal = save.v3.journal.map((id) => QUESTION_BANK.get(id)).filter((q) => q !== undefined);
  const st = save.v3.stats;
  const accuracy = st.gates ? Math.round((st.gatesCorrect / st.gates) * 100) : 0;
  const close = () => game.setScreen(game.previousScreen === "grownups" ? "title" : game.previousScreen ?? "title");
  return (
    <Sheet title="For grown-ups" kicker="Progress · learning · privacy" onClose={close} wide>
      <div className="grid-cards" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
        {AGE_PATHS.map((age) => <PathProgress key={age} age={age} />)}
      </div>
      <h3 style={{ margin: "16px 0 6px" }}>What your cadet is learning</h3>
      <div className="stat-grid">
        <div><b>{st.gates}</b>learning gates answered</div>
        <div><b>{accuracy}%</b>answered correctly</div>
        <div><b>{journal.length}/{TOTAL_FACTS}</b>facts in the Star Journal</div>
        <div><b>{save.v3.achievements.length}</b>achievements</div>
      </div>
      <div className="topic-bars">
        {SPACE_RUSH_TOPICS.map((t) => {
          const n = journal.filter((q) => q.topic === t).length;
          return (
            <div key={t}>
              <div className="row" style={{ justifyContent: "space-between", fontSize: 14 }}><span>{t}</span><span className="muted">{n} / {TOTAL_FACTS / SPACE_RUSH_TOPICS.length}</span></div>
              <div className="path-bar"><i style={{ width: `${(n / (TOTAL_FACTS / SPACE_RUSH_TOPICS.length)) * 100}%` }} /></div>
            </div>
          );
        })}
      </div>
      <h3 style={{ margin: "16px 0 6px" }}>How the learning works</h3>
      <div className="journal-item">🔊 Every Space Rush question <b>and all three answers</b> are read aloud before anything else happens. Then there are 7 seconds to think, and an answer window of 30 seconds that shortens gently to 22 seconds in later missions. <b>READ AGAIN</b> restarts the narration and the timer.</div>
      <div className="journal-item">🧭 Prefer no countdown? Choose <b>Relaxed timing</b> in Settings: questions wait until your child answers.</div>
      <div className="journal-item">🔧 Rocket engineering uses real physics in simple form: thrust must beat weight (thrust-to-weight above 1.1), fuel gives the change in speed needed for the trip, and fins keep the centre of pressure behind the centre of mass. Every mission is checked by tests to be solvable, and rockets can be rebuilt as often as needed.</div>
      <div className="journal-item">👪 Try asking: “Which part do you think matters most for this mission?” “What would happen with one more engine?” “Can you show me how the rocket stays upright?”</div>
      <div className="row wrap" style={{ marginTop: 8 }}>
        <button className="btn small primary" onClick={() => game.setOverlay("settings")}>⚙️ Sound, reading &amp; timing settings</button>
        <a className="btn small" href="/classic/">Open the Classic 2D edition</a>
      </div>
      <h3 style={{ margin: "16px 0 6px" }}>Privacy</h3>
      <div className="journal-item">🔒 Progress is saved only in this browser on this device, and the Classic edition shares the same save. No accounts, advertisements, microphone, camera, location data, or personal information are used. Read-aloud uses the speech voices provided by your browser.</div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- Training Center

const DRILLS: { kind: ActivityKind; icon: string; title: string; text: string }[] = [
  { kind: "orbit", icon: "🌍", title: "Orbit insertion", text: "Hold BOOST to fly sideways fast enough that your path closes into a circle around Earth." },
  { kind: "docking", icon: "🛰️", title: "Docking", text: "Line up the yellow ring with the green cross and glide gently into Orbital School." },
  { kind: "moon-landing", icon: "🌙", title: "Moon landing", text: "Use short bursts of THRUST to slow down and touch down softly on the glowing pad." },
  { kind: "mars-landing", icon: "🔴", title: "Mars landing + rover", text: "Open the parachute at the right speed, land with rockets, then drive Dusty to scan three rocks." },
  { kind: "asteroid", icon: "☄️", title: "Asteroid sample grab", text: "Tap GRAB when a green target on the spinning asteroid slides under the sampler." },
  { kind: "photo", icon: "📸", title: "Outer Worlds photos", text: "Steer the probe's camera and SNAP three discoveries on a giant planet." },
];

export function Training() {
  const game = useGame();
  const best = useSave((s) => s.v3.activityBest);
  return (
    <Sheet title="Astronaut Training Center" kicker="Practise any flight skill — no stars at stake" onClose={() => void game.goHub()} wide>
      <div className="grid-cards">
        {DRILLS.map((d) => (
          <article key={d.kind} className="card">
            <div className="row"><span className="icon">{d.icon}</span><div className="spacer" /><Stars count={best[d.kind] ?? 0} /></div>
            <h3>{d.title}</h3>
            <p>{d.text}</p>
            <button className="btn small primary" onClick={() => void game.practice(d.kind)}>▶ Practise</button>
          </article>
        ))}
        <article className="card">
          <div className="icon">🦘</div>
          <h3>Gravity Jump lab</h3>
          <p>Jump on the Moon, Mars, Pluto and more. Same legs, different gravity: see how high you fly!</p>
          <button className="btn small primary" onClick={() => void game.openObservatory({ mode: "jump", body: "moon" })}>▶ Start jumping</button>
        </article>
        {STUDIO_ENABLED && (
          <article className="card">
            <div className="icon">🕵️</div>
            <h3>View Detective</h3>
            <p>Engineers read drawings from every side. Can you tell the front view from the top view?</p>
            <button className="btn small primary" onClick={async () => { await game.openStudio(); (game.scene("studio") as StudioScene).startDetective(); }}>▶ Play</button>
          </article>
        )}
        <article className="card">
          <div className="icon">🔧</div>
          <h3>Rocket Hangar sandbox</h3>
          <p>Build any rocket you like with all 12 systems, check the engineering view, and launch it.</p>
          <button className="btn small primary" onClick={() => void game.openHangarSandbox()}>▶ Build</button>
        </article>
      </div>
    </Sheet>
  );
}
