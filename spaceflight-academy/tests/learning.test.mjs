import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

test("ships keep the full age-adaptive rocket engineering progression",async()=>{
  const {availableParts,WORLDS,ROCKET_PARTS,FLIGHT_SUMMARY,makeFlightMission}=await import("../src/flight-data.ts");
  assert.equal(FLIGHT_SUMMARY.paths,3);assert.equal(FLIGHT_SUMMARY.missionsPerPath,30);assert.equal(WORLDS.length,6);assert.equal(ROCKET_PARTS.length,12);
  assert.equal(availableParts("5–7").length,6);assert.equal(availableParts("8–10").length,8);assert.equal(availableParts("11–12").length,12);
  for(const age of ["5–7","8–10","11–12"])for(let level=1;level<=30;level+=1){const mission=makeFlightMission(age,level);assert.equal(mission.level,level);assert.ok(mission.target>=56&&mission.target<=83);assert.ok(mission.energy>=16);assert.ok(mission.brief.length>55);assert.ok(mission.tip.length>55)}
});

test("all ninety rocket builds remain solvable inside the energy budget",async()=>{
  const {applyRocketPart,availableParts,makeFlightMission,missionComplete}=await import("../src/flight-data.ts");
  for(const age of ["5–7","8–10","11–12"])for(let level=1;level<=30;level+=1){const mission=makeFlightMission(age,level),parts=availableParts(age);let states=[{stats:mission.start,energy:mission.energy}],solved=false;const seen=new Set;while(states.length&&!solved){const next=[];for(const state of states){if(missionComplete(mission,state.stats)){solved=true;break}for(const part of parts){if(part.cost>state.energy)continue;const stats=applyRocketPart(state.stats,part),energy=state.energy-part.cost,key=energy+":"+Object.values(stats).join(",");if(!seen.has(key)){seen.add(key);next.push({stats,energy})}}}states=next}assert.ok(solved,age+" mission "+level+" must be solvable")}
});

test("space rush has 72 age-specific encounters and no repeat in missions 1-12",async()=>{
  const {createSpaceRushDeck,createSpaceRushMission,SPACE_RUSH_SUMMARY}=await import("../src/space-rush-data.ts");
  assert.deepEqual(SPACE_RUSH_SUMMARY,{topics:6,questionsPerAge:72,uniqueMissionsBeforeRepeat:12,questionsPerMission:6});
  for(const age of ["5–7","8–10","11–12"]){const deck=createSpaceRushDeck(age);assert.equal(deck.length,72);assert.equal(new Set(deck.map(q=>q.id)).size,72);const first=[];for(let mission=1;mission<=12;mission++){const questions=createSpaceRushMission(age,mission);assert.equal(questions.length,6);assert.equal(new Set(questions.map(q=>q.topic)).size,6);first.push(...questions.map(q=>q.id))}assert.equal(new Set(first).size,72)}
});

test("narration prefers feminine voices and prepares flight units",async()=>{
  const {prepareNarrationText,scoreVoice}=await import("../src/narrator.ts");
  assert.ok(scoreVoice("Microsoft Aria Natural","en-US",true)>scoreVoice("Microsoft David","en-US",true));
  assert.match(prepareNarrationText("Travel 100 km at 20 m/s with GPS"),/100 kilometers at 20 meters per second with G P S/);
});

test("v2.1 replaces the 25-square field with kid-friendly three-lane Variety Rush",async()=>{
  const app=await readFile(new URL("../src/SpaceflightAcademyV2.tsx",import.meta.url),"utf8");
  for(const feature of ["READING_GRACE_SECONDS = 7","30, 28, 26, 24, 22","sf2-rush-course","sf2-rush-gate","READ AGAIN","BOOST THROUGH LANE","Correct gates split open","crash-through","ENGINEER THE ROCKET","Family Space Lab"])assert.match(app,new RegExp(feature.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"i"));
  assert.doesNotMatch(app,/Array\.from\(\{\s*length:\s*25/);assert.doesNotMatch(app,/className="sf2-spacefield"/);
  assert.match(app,/key === "a" \|\| key === "arrowleft"/);assert.match(app,/key === "d" \|\| key === "arrowright"/);assert.match(app,/key === "w" \|\| key === "arrowup"/);
});

test("deployment and portal metadata are standardized for v3.0.2",async()=>{
  const read=(path)=>readFile(new URL(path,import.meta.url),"utf8");
  const compose=await read("../docker-compose.yml"),deploy=await read("../deploy.sh"),swTemplate=await read("../sw/sw.template.js"),vite=await read("../vite.config.ts"),server=await read("../server.mjs");
  const metadata=JSON.parse(await read("../public/.well-known/flexzonic-game.json")),version=JSON.parse(await read("../public/version.json")),pkg=JSON.parse(await read("../package.json")),manifest=JSON.parse(await read("../public/manifest.webmanifest"));
  assert.equal(pkg.version,"3.0.2");
  assert.match(compose,/SPACEFLIGHT_PORT:-8119/);assert.match(compose,/network_mode:\s*bridge/);assert.match(compose,/spaceflight-academy:3\.0\.2/);
  assert.match(deploy,/PASS - Spaceflight Academy is healthy/);assert.match(deploy,/v3\.0\.2/);
  assert.match(swTemplate,/__CACHE_NAME__/);assert.match(swTemplate,/__PRECACHE__/);assert.match(vite,/spaceflight-academy-v\$\{pkg\.version\}-3d/);
  assert.match(server,/no-cache, no-store, must-revalidate/);assert.match(server,/immutable/);assert.match(server,/spaceflight-academy-ok/);
  assert.equal(metadata.title,"Spaceflight Academy");assert.equal(metadata.name,"Spaceflight Academy");assert.equal(metadata.category,"Educational");assert.equal(metadata.version,"3.0.2");assert.equal(metadata.order,38);assert.equal(metadata.url,"https://spaceflight.flexzonicgames.com");assert.equal(metadata.healthPath,"/healthz");
  assert.equal(version.version,"3.0.2");assert.equal(version.port,8119);assert.equal(manifest.start_url,"/?v=3.0.2");
});

test("the production build ships the 3D game, the Classic edition and an offline service worker",async()=>{
  const read=(path)=>readFile(new URL(path,import.meta.url),"utf8");
  const index=await read("../dist/index.html"),classic=await read("../dist/classic/index.html"),sw=await read("../dist/sw.js");
  assert.match(index,/<div id="boot"/);assert.match(index,/assets\/.*\.js/);
  assert.match(classic,/assets\/.*\.js/);
  assert.match(sw,/spaceflight-academy-v3\.0\.2-3d/);assert.match(sw,/"\/classic\/"/);assert.match(sw,/\/healthz/);
  const metadata=JSON.parse(await read("../dist/.well-known/flexzonic-game.json"));assert.equal(metadata.version,"3.0.2");
});

test("the Blueprint Studio is internal: the production build leaves it out",async()=>{
  const {readdir}=await import("node:fs/promises");
  const dir=new URL("../dist/assets/",import.meta.url);
  const js=(await Promise.all((await readdir(dir)).filter((f)=>f.endsWith(".js")).map((f)=>readFile(new URL(f,dir),"utf8")))).join("\n");
  for(const text of ["View Detective","Blueprint Reader","Which view of the","About this blueprint","Blueprints explored","blueprints read"])assert.ok(!js.includes(text),`production bundle still contains "${text}"`);
  assert.doesNotMatch(js,/label:`Blueprint Studio`|label:"Blueprint Studio"/,"no Blueprint Studio station on the campus");
  const metadata=JSON.parse(await readFile(new URL("../dist/.well-known/flexzonic-game.json",import.meta.url),"utf8"));
  assert.ok(!metadata.features.includes("Blueprint Studio"));assert.doesNotMatch(metadata.description,/Blueprint Studio/);
});
