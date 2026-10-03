// app/leaderboard-store.ts
var SECTOR_IDS = [1, 2, 3, 4];
var MIN_TIME = { 1: 25, 2: 35, 3: 45, 4: 55 };
var KEEP = 50;
function cleanName(raw) {
  if (typeof raw !== "string") return null;
  const name = raw.toUpperCase().replace(/[^A-Z0-9 _-]/g, "").replace(/\s+/g, " ").trim().slice(0, 14);
  return name.length >= 2 ? name : null;
}
function validate(input) {
  const body = input && typeof input === "object" ? input : {};
  const sector = Number(body.sector);
  if (!SECTOR_IDS.includes(sector)) return "unknown sector";
  const name = cleanName(body.name);
  if (!name) return "callsign must be 2-14 letters or numbers";
  const time = Number(body.time), health = Number(body.health), stars = Number(body.stars), score = Number(body.score), falls = Number(body.falls ?? 0);
  if (!Number.isFinite(time) || time < MIN_TIME[sector] || time > 3600) return "run time is outside the valid range for this sector";
  if (!Number.isFinite(health) || health < 0 || health > 100) return "integrity out of range";
  if (![1, 2, 3].includes(stars)) return "stars out of range";
  if (!Number.isFinite(score) || score < 0 || score > 2e5) return "score out of range";
  if (!Number.isInteger(falls) || falls < 0 || falls > 999) return "falls out of range";
  return { sector, entry: { name, time: Math.round(time * 100) / 100, health: Math.round(health), stars, score: Math.round(score), falls, at: (/* @__PURE__ */ new Date()).toISOString() } };
}
function insert(board, sector, entry) {
  const key = String(sector), list = (board[key] || []).filter((e) => e.name !== entry.name || e.time <= entry.time);
  if (!list.some((e) => e.name === entry.name)) list.push(entry);
  list.sort((a, b) => a.time - b.time || b.score - a.score);
  board[key] = list.slice(0, KEEP);
  const rank = board[key].findIndex((e) => e.name === entry.name) + 1;
  return { rank, best: board[key].find((e) => e.name === entry.name) };
}
var chain = Promise.resolve();
async function fsx() {
  return await import("node:fs/promises");
}
function dir() {
  return typeof process !== "undefined" && process.env?.LEADERBOARD_DIR || "/game/data";
}
async function readBoard() {
  const fs = await fsx();
  try {
    return JSON.parse(await fs.readFile(`${dir()}/leaderboard.json`, "utf8"));
  } catch (e) {
    if (e?.code === "ENOENT") return {};
    throw e;
  }
}
function update(fn) {
  const run = chain.then(async () => {
    const fs = await fsx(), board = await readBoard(), out = fn(board), file = `${dir()}/leaderboard.json`, tmp = `${file}.${Date.now()}.tmp`;
    await fs.mkdir(dir(), { recursive: true });
    await fs.writeFile(tmp, JSON.stringify(board));
    await fs.rename(tmp, file);
    return out;
  });
  chain = run.catch(() => void 0);
  return run;
}
export {
  MIN_TIME,
  SECTOR_IDS,
  cleanName,
  insert,
  readBoard,
  update,
  validate
};
