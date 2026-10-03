/* eslint-disable @typescript-eslint/no-explicit-any -- dev QA harness that pokes at engine internals from the console */
// Lodge backdrop preview: ?r=Aurora%20Pines&time=Morning&weather=Clear&species=Elk&t=20&q=medium
import { GameHost } from "../../app/game3d/engine/host.ts";
import { ShowcaseMode } from "../../app/game3d/modes/showcase.ts";
import type { QualityName } from "../../app/game3d/render/quality.ts";
const q = new URLSearchParams(location.search);
const host = new GameHost(document.getElementById("c") as HTMLCanvasElement, (q.get("q") ?? "medium") as QualityName);
const t0 = performance.now();
const sc = new ShowcaseMode(host.renderer, host.quality, { reserve: q.get("r") ?? "Aurora Pines", time: (q.get("time") ?? "Morning") as never, hour: q.get("hour") ? Number(q.get("hour")) : undefined, weather: (q.get("weather") ?? "Clear") as never, species: q.get("species")?.split(","), seed: Number(q.get("seed") ?? 3) });
const build = performance.now() - t0;
host.setMode(sc);
const info = document.getElementById("info")!;
// jump the cinematic clock forward for stills
(sc as any).t = Number(q.get("t") ?? 0);
host.onFrame = () => { const h = sc.herd; info.textContent = `build ${build.toFixed(0)} ms · fps ${host.fps.toFixed(0)} · herd ${h?.species} ×${h?.members.length} · cam ${sc.camera.position.toArray().map(v => v.toFixed(0)).join(",")}`; };
host.start();
(window as any).__sc = sc;
setTimeout(() => { (window as any).__ready = true; }, Number(q.get("wait") ?? 2500));
