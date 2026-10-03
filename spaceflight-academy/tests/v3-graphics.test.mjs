import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("High graphics only adds glow to glowing things (no full-screen wash-out)", async () => {
  const THREE = await import("three");
  const { isGlowing } = await import("../src/v3/engine/engine.ts");
  const { PALETTE } = await import("../src/v3/blueprints/palette.ts");
  const { materialFromSpec } = await import("../src/v3/models/build.ts");
  // White buildings, suits and text never glow.
  assert.equal(isGlowing(new THREE.MeshStandardMaterial({ color: "#ffffff" })), false);
  assert.equal(isGlowing(new THREE.MeshBasicMaterial({ color: "#ffffff" })), false);
  assert.equal(isGlowing(new THREE.SpriteMaterial({ color: "#ffffff" })), false);
  assert.equal(isGlowing(new THREE.MeshStandardMaterial({ color: "#ff66bf", emissive: "#ff3fa4", emissiveIntensity: 0.8 })), false);
  // Light strips, flames, sparks and halos do.
  assert.equal(isGlowing(new THREE.MeshStandardMaterial({ emissive: "#3fe6ff", emissiveIntensity: 1.6 })), true);
  assert.equal(isGlowing(new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending })), true);
  const optOut = new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending });
  optOut.userData.noBloom = true;
  assert.equal(isGlowing(optOut), false);
  // Blueprint palette: only the emissive "light" materials glow.
  for (const [key, spec] of Object.entries(PALETTE)) {
    const glows = isGlowing(materialFromSpec(spec));
    assert.equal(glows, (spec.emissiveIntensity ?? 0) >= 1 && !!spec.emissive, `palette.${key}`);
  }
  for (const key of ["white", "hull", "pearl", "royal", "magenta", "screen", "window", "solarCell"]) assert.equal(isGlowing(materialFromSpec(PALETTE[key])), false, key);
});

test("the engine draws the normal frame first and never tone-maps a bloomed frame", async () => {
  const engine = await readFile(new URL("../src/v3/engine/engine.ts", import.meta.url), "utf8");
  assert.doesNotMatch(engine, /OutputPass|EffectComposer/, "no full-frame post-processing chain");
  const render = engine.slice(engine.indexOf("private render(active: SceneController)"));
  assert.ok(render.indexOf("this.renderer.render(active.scene, active.camera)") < render.indexOf("this.renderGlow("), "base frame before glow");
});
