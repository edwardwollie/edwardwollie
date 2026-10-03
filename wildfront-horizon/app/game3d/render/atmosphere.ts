// Shared atmosphere uniforms: exponential distance haze + analytic height fog
// with sun in-scattering. Every world material is patched with patchWorldFog()
// so valleys fill with mist at dawn and the haze glows toward the sun.

import * as THREE from "three";

export const ATMO = {
  uFogColor: { value: new THREE.Color(0.62, 0.7, 0.78) },
  uFogSun: { value: new THREE.Color(1.0, 0.82, 0.55) },
  uSunDir: { value: new THREE.Vector3(0.3, 0.5, -0.8).normalize() },
  uHaze: { value: 0.0016 },          // distance haze density (exp)
  uHeightFog: { value: 0.012 },      // height fog density at base height
  uFogBase: { value: 0.0 },          // world height of the dense fog layer
  uFogFalloff: { value: 0.06 },      // per metre
  uTime: { value: 0 },
  uWind: { value: new THREE.Vector2(1, 0) }, // direction * strength (m/s)
  uSnow: { value: 0 },               // weather snow cover 0..1
  uWet: { value: 0 },                // rain wetness 0..1
  uScan: { value: 0 },               // trail scanner pulse 0..1
};

export const FOG_PARS_VERT = /* glsl */`
#ifdef USE_FOG
varying vec3 vFogWorld;
#endif`;
const FOG_VERT = /* glsl */`
#ifdef USE_FOG
  vec4 fogW = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    fogW = instanceMatrix * fogW;
  #endif
  fogW = modelMatrix * fogW;
  vFogWorld = fogW.xyz;
#endif`;
export const FOG_PARS_FRAG = /* glsl */`
#ifdef USE_FOG
varying vec3 vFogWorld;
uniform vec3 uFogColor;
uniform vec3 uFogSun;
uniform vec3 uSunDir;
uniform float uHaze;
uniform float uHeightFog;
uniform float uFogBase;
uniform float uFogFalloff;
vec3 applyAtmosphere(vec3 col, vec3 worldPos) {
  vec3 rd = worldPos - cameraPosition;
  float dist = length(rd);
  rd /= max(dist, 1e-4);
  // distance haze
  float haze = 1.0 - exp(-dist * uHaze);
  // analytic exponential height fog (integral along the ray)
  float b = uFogFalloff;
  float a = uHeightFog * exp(-b * (cameraPosition.y - uFogBase));
  float ry = rd.y;
  float hf = abs(ry) > 1e-3 ? a * (1.0 - exp(-dist * ry * b)) / (ry * b) : a * dist;
  float fogAmt = 1.0 - exp(-max(hf, 0.0));
  float f = clamp(1.0 - (1.0 - haze) * (1.0 - fogAmt), 0.0, 1.0);
  float sun = pow(max(dot(rd, uSunDir), 0.0), 7.0);
  vec3 fc = mix(uFogColor, uFogSun, sun * 0.85);
  return mix(col, fc, f);
}
#endif`;
const FOG_FRAG = /* glsl */`
#ifdef USE_FOG
  gl_FragColor.rgb = applyAtmosphere(gl_FragColor.rgb, vFogWorld);
#endif`;

/** applyAtmosphere() + its uniforms for custom ShaderMaterials (no varying). */
export function atmoGLSL(): string {
  return FOG_PARS_FRAG.replace("#ifdef USE_FOG", "").replace("varying vec3 vFogWorld;", "").replace(/#endif\s*$/, "");
}

/** Uniforms to merge into custom ShaderMaterials that call applyAtmosphere(). */
export function atmoUniforms() {
  return { uFogColor: ATMO.uFogColor, uFogSun: ATMO.uFogSun, uSunDir: ATMO.uSunDir, uHaze: ATMO.uHaze, uHeightFog: ATMO.uHeightFog, uFogBase: ATMO.uFogBase, uFogFalloff: ATMO.uFogFalloff };
}

/** Patch a material so it uses the shared atmosphere fog. Chains any existing onBeforeCompile. */
export function patchWorldFog<T extends THREE.Material>(mat: T, extra?: (shader: THREE.WebGLProgramParametersWithUniforms) => void): T {
  const prev = mat.onBeforeCompile;
  (mat as THREE.Material & { fog?: boolean }).fog = true;
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);
    shader.uniforms.uFogColor = ATMO.uFogColor;
    shader.uniforms.uFogSun = ATMO.uFogSun;
    shader.uniforms.uSunDir = ATMO.uSunDir;
    shader.uniforms.uHaze = ATMO.uHaze;
    shader.uniforms.uHeightFog = ATMO.uHeightFog;
    shader.uniforms.uFogBase = ATMO.uFogBase;
    shader.uniforms.uFogFalloff = ATMO.uFogFalloff;
    shader.vertexShader = shader.vertexShader
      .replace("#include <fog_pars_vertex>", FOG_PARS_VERT)
      .replace("#include <fog_vertex>", FOG_VERT);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <fog_pars_fragment>", FOG_PARS_FRAG)
      .replace("#include <fog_fragment>", FOG_FRAG);
    extra?.(shader);
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (key ? key() : "") + "|wfFog";
  return mat;
}

/** CPU version (for the sky dome / UI tinting). */
export function fogFactor(dist: number, camY: number, rdY: number): number {
  const haze = 1 - Math.exp(-dist * ATMO.uHaze.value);
  const b = ATMO.uFogFalloff.value;
  const a = ATMO.uHeightFog.value * Math.exp(-b * (camY - ATMO.uFogBase.value));
  const hf = Math.abs(rdY) > 1e-3 ? a * (1 - Math.exp(-dist * rdY * b)) / (rdY * b) : a * dist;
  const fa = 1 - Math.exp(-Math.max(hf, 0));
  return Math.min(1, 1 - (1 - haze) * (1 - fa));
}
