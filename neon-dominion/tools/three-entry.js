// Entry point for the self-hosted three.js bundle (see tools/vendor-three.mjs).
// The game is served with a strict `script-src 'self'` CSP, so no CDN or import map is used.
export * from "three";
export { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
export { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
export { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
export { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
export { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
export { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
export { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
export { FXAAShader } from "three/examples/jsm/shaders/FXAAShader.js";
export { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
export { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
