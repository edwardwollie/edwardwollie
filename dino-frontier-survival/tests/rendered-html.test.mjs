import assert from "node:assert/strict";
import test from "node:test";
async function worker(){const url=new URL("../dist/server/index.js",import.meta.url);url.searchParams.set("test",`${Date.now()}-${Math.random()}`);return(await import(url.href)).default}
const env={ASSETS:{fetch:async()=>new Response("Not found",{status:404})}},ctx={waitUntil(){},passThroughOnException(){}};
test("renders Dino Frontier production metadata",async()=>{const app=await worker(),response=await app.fetch(new Request("http://localhost/",{headers:{accept:"text/html"}}),env,ctx),html=await response.text();assert.equal(response.status,200);assert.match(html,/<title>Dino Frontier Survival<\/title>/i);assert.match(html,/frontier\.flexzonicgames\.com\/og\.png/i)});
test("serves Dino Frontier health",async()=>{const app=await worker(),response=await app.fetch(new Request("http://localhost/healthz"),env,ctx);assert.equal(response.status,200);assert.equal((await response.text()).trim(),"dino-frontier-ok")});
test("serves the blueprint archive",async()=>{const app=await worker(),response=await app.fetch(new Request("http://localhost/blueprints",{headers:{accept:"text/html"}}),env,ctx),html=await response.text();assert.equal(response.status,200);assert.match(html,/<title>Blueprints · Dino Frontier Survival<\/title>/i)});
