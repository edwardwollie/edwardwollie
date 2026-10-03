import * as THREE from "three";
import { createBlueprintModel } from "./blueprint-mesh";
import { CIRCUITS, type CircuitProfile } from "./circuit-design";
import { TRACK_HALF_WIDTH, type RaceTrack } from "./track";

/** Builds every visible piece of a Grand Prix circuit from its RaceTrack. */

export type SceneryKind = "city" | "canyon" | "glacier" | "void" | "causeway" | "foundry";

export type ThemeLook = CircuitProfile & {
  scenery: SceneryKind;
  zenith: number;
  horizon: number;
  ground: number;
  groundLine: number;
  sun: number;
  fogDensity: number;
  road: number;
};

const LOOKS: Omit<ThemeLook, keyof CircuitProfile>[] = [
  { scenery: "city", zenith: 0x02010c, horizon: 0x3a0d6b, ground: 0x07061a, groundLine: 0x3b1680, sun: 0xff3bbd, fogDensity: 0.0016, road: 0x1a1d33 },
  { scenery: "canyon", zenith: 0x12030a, horizon: 0xff6a2a, ground: 0x3a1408, groundLine: 0x9c3a12, sun: 0xffc04d, fogDensity: 0.0012, road: 0x2a1a1a },
  { scenery: "glacier", zenith: 0x010818, horizon: 0x2a8fbf, ground: 0x9cc8e0, groundLine: 0x5aa6d6, sun: 0xd8f6ff, fogDensity: 0.0014, road: 0x1a2738 },
  { scenery: "void", zenith: 0x020008, horizon: 0x3d0b6b, ground: 0x05000f, groundLine: 0x6a2cff, sun: 0x38a7ff, fogDensity: 0.0009, road: 0x15122a },
  { scenery: "causeway", zenith: 0x010d0a, horizon: 0x0f6b4d, ground: 0x031a14, groundLine: 0x1cff9c, sun: 0xff5fc9, fogDensity: 0.0015, road: 0x14262a },
  { scenery: "foundry", zenith: 0x0a0302, horizon: 0x8a2a10, ground: 0x1a0c08, groundLine: 0xff5d3a, sun: 0xffa040, fogDensity: 0.0017, road: 0x231a1a },
];

export function themeLook(index: number): ThemeLook {
  const i = ((index % CIRCUITS.length) + CIRCUITS.length) % CIRCUITS.length;
  return { ...CIRCUITS[i], ...LOOKS[i] };
}

type Profile = [number, number][];

/** A strip swept along the track through a cross-section profile. */
function ribbon(
  track: RaceTrack,
  from: number,
  to: number,
  profile: Profile,
  vScale = 16,
  stride = 1,
): THREE.BufferGeometry {
  const rows: number[] = [];
  for (let i = from; i <= to; i += stride) rows.push(i);
  if (rows[rows.length - 1] !== to) rows.push(to);
  const cols = profile.length;
  const positions = new Float32Array(rows.length * cols * 3);
  const uvs = new Float32Array(rows.length * cols * 2);
  const p = new THREE.Vector3();
  let across = 0;
  const uAt: number[] = [0];
  for (let k = 1; k < cols; k += 1) {
    across += Math.hypot(profile[k][0] - profile[k - 1][0], profile[k][1] - profile[k - 1][1]);
    uAt.push(across);
  }
  rows.forEach((row, r) => {
    const i = ((row % track.count) + track.count) % track.count;
    const s = row * track.step;
    for (let k = 0; k < cols; k += 1) {
      const [d, h] = profile[k];
      p.copy(track.positions[i])
        .addScaledVector(track.rights[i], d)
        .addScaledVector(track.ups[i], h);
      const o = (r * cols + k) * 3;
      positions[o] = p.x;
      positions[o + 1] = p.y;
      positions[o + 2] = p.z;
      uvs[(r * cols + k) * 2] = across > 0 ? uAt[k] / across : 0;
      uvs[(r * cols + k) * 2 + 1] = s / vScale;
    }
  });
  const index: number[] = [];
  for (let r = 0; r < rows.length - 1; r += 1) {
    for (let k = 0; k < cols - 1; k += 1) {
      const a = r * cols + k;
      const b = (r + 1) * cols + k;
      index.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function hexCss(value: number): string {
  return `#${value.toString(16).padStart(6, "0")}`;
}

function roadTexture(look: ThemeLook): THREE.CanvasTexture {
  return canvasTexture(256, 512, (ctx) => {
    ctx.fillStyle = hexCss(look.road);
    ctx.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 2600; i += 1) {
      const shade = 20 + Math.random() * 40;
      ctx.fillStyle = `rgba(${shade},${shade + 8},${shade + 24},${0.25 + Math.random() * 0.3})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 512, 1.5, 1.5);
    }
    // Panel seams every 8 m make speed readable.
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(0, 0, 256, 3);
    ctx.fillRect(0, 256, 256, 3);
    // Edge lines and lane dashes.
    ctx.fillStyle = "#e9fbff";
    ctx.fillRect(10, 0, 5, 512);
    ctx.fillRect(241, 0, 5, 512);
    ctx.fillStyle = hexCss(look.rail);
    ctx.fillRect(18, 0, 2, 512);
    ctx.fillRect(236, 0, 2, 512);
    ctx.fillStyle = "rgba(233,251,255,0.85)";
    for (const x of [85, 170]) {
      ctx.fillRect(x - 2, 40, 4, 180);
      ctx.fillRect(x - 2, 296, 4, 180);
    }
  });
}

function windowTexture(color: number): THREE.CanvasTexture {
  return canvasTexture(64, 128, (ctx) => {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, 64, 128);
    const c = new THREE.Color(color);
    for (let y = 2; y < 128; y += 6) {
      for (let x = 2; x < 64; x += 5) {
        if (Math.random() < 0.42) {
          const a = 0.35 + Math.random() * 0.65;
          ctx.fillStyle = Math.random() < 0.7
            ? `rgba(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0},${a})`
            : `rgba(230,245,255,${a})`;
          ctx.fillRect(x, y, 3, 3);
        }
      }
    }
  });
}

function groundTexture(look: ThemeLook): THREE.CanvasTexture {
  const texture = canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = hexCss(look.ground);
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i += 1) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
    }
    ctx.strokeStyle = hexCss(look.groundLine);
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, 256, 256);
    ctx.globalAlpha = 0.12;
    ctx.beginPath();
    ctx.moveTo(128, 0);
    ctx.lineTo(128, 256);
    ctx.moveTo(0, 128);
    ctx.lineTo(256, 128);
    ctx.stroke();
  });
  return texture;
}

export type BuiltTrack = {
  root: THREE.Group;
  look: ThemeLook;
  sky: THREE.Mesh;
  animated: { object: THREE.Object3D; spin: number; bob: number; base: number }[];
  railMaterial: THREE.MeshBasicMaterial;
  dispose: () => void;
};

/** Distance from a ground point to the nearest centreline sample (XZ). */
function clearanceFrom(track: RaceTrack, x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < track.count; i += 3) {
    const p = track.positions[i];
    const dx = p.x - x;
    const dz = p.z - z;
    const d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

function seeded(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 100000) / 100000;
  };
}

export function buildTrackScene(track: RaceTrack, quality: "high" | "low"): BuiltTrack {
  const look = themeLook(track.spec.theme);
  const root = new THREE.Group();
  root.name = `track-${track.spec.id}`;
  const disposables: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };
  const animated: BuiltTrack["animated"] = [];
  const n = track.count;
  const W = TRACK_HALF_WIDTH;
  const random = seeded(track.spec.id.length * 7919 + track.spec.theme * 104729);
  const groundY = track.bounds.minY - 1.4;

  // --- Road surface (with a thick underside so bridges read as solid) ---
  const roadMap = keep(roadTexture(look));
  const roadMaterial = keep(
    new THREE.MeshStandardMaterial({ map: roadMap, roughness: 0.5, metalness: 0.15, envMapIntensity: 0.25 }),
  );
  const road = new THREE.Mesh(
    keep(ribbon(track, 0, n, [[-W, 0], [-W / 3, 0], [W / 3, 0], [W, 0]], 16)),
    roadMaterial,
  );
  road.receiveShadow = true;
  root.add(road);

  const underMaterial = keep(new THREE.MeshStandardMaterial({ color: 0x0b0f1c, roughness: 0.7, metalness: 0.6 }));
  const under = new THREE.Mesh(
    keep(ribbon(track, 0, n, [[W + 0.9, 0], [W + 0.9, -1.4], [-W - 0.9, -1.4], [-W - 0.9, 0]], 16, 2)),
    underMaterial,
  );
  root.add(under);

  // --- Energy barriers: inner face, cap and a glowing top rail ---
  const wallMaterial = keep(
    new THREE.MeshStandardMaterial({
      color: 0x1a2236,
      metalness: 0.85,
      roughness: 0.25,
      emissive: new THREE.Color(look.roadGlow),
      emissiveIntensity: 0.6,
      envMapIntensity: 0.3,
      transparent: true,
      opacity: 0.88,
    }),
  );
  const wallH = 1.25;
  for (const side of [-1, 1]) {
    const x0 = side * (W + 0.1);
    const x1 = side * (W + 0.7);
    const profile: Profile =
      side > 0
        ? [[x0, 0], [x0, wallH], [x1, wallH], [x1, 0]]
        : [[x1, 0], [x1, wallH], [x0, wallH], [x0, 0]];
    root.add(new THREE.Mesh(keep(ribbon(track, 0, n, profile, 8, 1)), wallMaterial));
  }
  const railMaterial = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(look.rail).multiplyScalar(1.6), toneMapped: false }));
  for (const side of [-1, 1]) {
    const x = side * (W + 0.4);
    const profile: Profile = [[x - 0.32, wallH + 0.02], [x + 0.32, wallH + 0.02]];
    root.add(new THREE.Mesh(keep(ribbon(track, 0, n, profile, 8, 1)), railMaterial));
    const edge: Profile = [[side * (W - 0.95) - 0.09, 0.025], [side * (W - 0.95) + 0.09, 0.025]];
    root.add(new THREE.Mesh(keep(ribbon(track, 0, n, edge, 8, 1)), railMaterial));
  }

  // --- Kerbs on the inside and outside of every real bend ---
  const kerbPositions: number[] = [];
  const kerbColors: number[] = [];
  const kerbA = new THREE.Color(look.key);
  const kerbB = new THREE.Color(0xf2f7ff);
  const tmp = new THREE.Vector3();
  for (let i = 0; i < n; i += 1) {
    if (Math.abs(track.curvature[i]) < 1 / 240) continue;
    const j = (i + 1) % n;
    const color = i % 2 === 0 ? kerbA : kerbB;
    for (const side of [-1, 1]) {
      const inner = side * (W - 1.4);
      const outer = side * W;
      const quad = [
        [i, inner], [i, outer], [j, inner], [i, outer], [j, outer], [j, inner],
      ] as const;
      const ordered = side > 0 ? quad : [quad[1], quad[0], quad[4], quad[0], quad[5], quad[4]];
      for (const [idx, d] of ordered) {
        tmp.copy(track.positions[idx]).addScaledVector(track.rights[idx], d).addScaledVector(track.ups[idx], 0.035);
        kerbPositions.push(tmp.x, tmp.y, tmp.z);
        kerbColors.push(color.r, color.g, color.b);
      }
    }
  }
  if (kerbPositions.length) {
    const kerbGeometry = keep(new THREE.BufferGeometry());
    kerbGeometry.setAttribute("position", new THREE.Float32BufferAttribute(kerbPositions, 3));
    kerbGeometry.setAttribute("color", new THREE.Float32BufferAttribute(kerbColors, 3));
    kerbGeometry.computeVertexNormals();
    const kerbs = new THREE.Mesh(
      kerbGeometry,
      keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, emissive: 0x111111, emissiveIntensity: 1 })),
    );
    root.add(kerbs);
  }

  // --- Bridge and viaduct supports wherever the road leaves the ground ---
  const pillarGeometry = keep(new THREE.CylinderGeometry(1.1, 1.5, 1, 10));
  const pillarMaterial = keep(new THREE.MeshStandardMaterial({ color: 0x161b2c, metalness: 0.7, roughness: 0.4, emissive: new THREE.Color(look.roadGlow), emissiveIntensity: 0.35 }));
  const pillars: THREE.Matrix4[] = [];
  const pillarStep = Math.round(36 / track.step);
  for (let i = 0; i < n; i += pillarStep) {
    const p = track.positions[i];
    const height = p.y - 1.4 - groundY;
    if (height < 1.5) continue;
    for (const side of [-1, 1]) {
      const base = p.clone().addScaledVector(track.rights[i], side * (W - 3));
      // Do not drop a pillar through the road passing underneath.
      let blocked = false;
      for (let k = 0; k < n; k += 2) {
        const q = track.positions[k];
        if (q.y < p.y - 4 && Math.hypot(q.x - base.x, q.z - base.z) < W + 2) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(base.x, groundY + height / 2, base.z),
        new THREE.Quaternion(),
        new THREE.Vector3(1, height, 1),
      );
      pillars.push(m);
    }
  }
  if (pillars.length) {
    const inst = new THREE.InstancedMesh(pillarGeometry, pillarMaterial, pillars.length);
    pillars.forEach((m, k) => inst.setMatrixAt(k, m));
    root.add(inst);
  }

  // --- Tunnels: an arched shell with light rings every 16 m ---
  const tunnelMaterial = keep(new THREE.MeshStandardMaterial({ color: 0x0d1220, metalness: 0.75, roughness: 0.35, side: THREE.DoubleSide }));
  const ringMaterial = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(look.rail).multiplyScalar(1.4), toneMapped: false }));
  const arch: Profile = [];
  const R = W + 1.6;
  for (let k = 0; k <= 14; k += 1) {
    const a = (k / 14) * Math.PI;
    arch.push([Math.cos(a) * R, Math.sin(a) * (R * 0.62) + 0.2]);
  }
  for (const [a, b] of track.spec.tunnels) {
    const from = Math.floor(a / track.step);
    const to = Math.ceil(b / track.step);
    root.add(new THREE.Mesh(keep(ribbon(track, from, to, arch, 12, 1)), tunnelMaterial));
    const ringStep = Math.max(1, Math.round(16 / track.step));
    for (let i = from; i <= to; i += ringStep) {
      const band: Profile = arch.map(([d, h]) => [d * 0.985, h * 0.975]);
      const ring = keep(ribbon(track, i, i + 1, band.slice(2, -2), 4));
      // Thin the light band to ~0.6 m by squashing toward its first row.
      const pos = ring.getAttribute("position") as THREE.BufferAttribute;
      const cols = band.length - 4;
      for (let k = 0; k < cols; k += 1) {
        const ax = pos.getX(k);
        const ay = pos.getY(k);
        const az = pos.getZ(k);
        const bx = pos.getX(cols + k);
        const by = pos.getY(cols + k);
        const bz = pos.getZ(cols + k);
        pos.setXYZ(cols + k, ax + (bx - ax) * 0.16, ay + (by - ay) * 0.16, az + (bz - az) * 0.16);
      }
      pos.needsUpdate = true;
      root.add(new THREE.Mesh(ring, ringMaterial));
    }
  }

  // --- Start/finish and checkpoint arches from the blueprint ---
  const frame = track.frameAt(0);
  const basis = new THREE.Matrix4();
  const placeOnTrack = (object: THREE.Object3D, s: number, d = 0, h = 0) => {
    track.frameAt(s, frame);
    const position = track.pointAt(s, d, h);
    // Blueprint models face +Z; the road runs along the tangent.
    const x = frame.right.clone().negate();
    basis.makeBasis(x, frame.up, frame.tangent);
    object.quaternion.setFromRotationMatrix(basis);
    object.position.copy(position);
  };
  track.spec.checkpoints.forEach((s, k) => {
    const gate = createBlueprintModel("gate");
    placeOnTrack(gate, s);
    if (k > 0) gate.children.forEach((child) => {
      if (child.name === "checker") child.visible = false;
    });
    root.add(gate);
  });
  for (const pad of track.spec.boostPads) {
    const model = createBlueprintModel("boostPad");
    placeOnTrack(model, pad.s, pad.d, 0.01);
    root.add(model);
  }

  // Grid boxes behind the start line.
  const gridMaterial = keep(new THREE.MeshBasicMaterial({ color: 0xf4f7ff, transparent: true, opacity: 0.55 }));
  for (let slot = 0; slot < 8; slot += 1) {
    const s = track.length - 10 - Math.floor(slot / 2) * 9;
    const d = slot % 2 === 0 ? -4.2 : 4.2;
    const marker = new THREE.Mesh(keep(new THREE.PlaneGeometry(3.2, 0.25)), gridMaterial);
    marker.rotation.x = -Math.PI / 2;
    const holder = new THREE.Group();
    holder.add(marker);
    placeOnTrack(holder, s + 2.6, d, 0.03);
    root.add(holder);
  }

  // --- Trackside light pylons every 60 m (instanced) ---
  const pylonGeometry = keep(new THREE.BoxGeometry(0.35, 7, 0.35));
  const lampGeometry = keep(new THREE.BoxGeometry(2.4, 0.22, 0.5));
  const pylonMaterial = keep(new THREE.MeshStandardMaterial({ color: 0x1b2133, metalness: 0.8, roughness: 0.3 }));
  const lampMaterial = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(look.key).multiplyScalar(1.5), toneMapped: false }));
  const pylonMatrices: THREE.Matrix4[] = [];
  const lampMatrices: THREE.Matrix4[] = [];
  const pylonStep = Math.round(60 / track.step);
  for (let i = 0; i < n; i += pylonStep) {
    if (track.inTunnel(i * track.step)) continue;
    const side = (i / pylonStep) % 2 === 0 ? 1 : -1;
    const s = i * track.step;
    track.frameAt(s, frame);
    const base = track.pointAt(s, side * (W + 1.6), 0);
    const q = new THREE.Quaternion().setFromRotationMatrix(
      basis.makeBasis(frame.right.clone().negate(), new THREE.Vector3(0, 1, 0), frame.tangent.clone().setY(0).normalize()),
    );
    pylonMatrices.push(new THREE.Matrix4().compose(base.clone().add(new THREE.Vector3(0, 3.5, 0)), q, new THREE.Vector3(1, 1, 1)));
    const lampPos = track.pointAt(s, side * (W + 0.5), 7);
    lampMatrices.push(new THREE.Matrix4().compose(lampPos, q, new THREE.Vector3(1, 1, 1)));
  }
  const pylonsInst = new THREE.InstancedMesh(pylonGeometry, pylonMaterial, pylonMatrices.length);
  pylonMatrices.forEach((m, k) => pylonsInst.setMatrixAt(k, m));
  const lampsInst = new THREE.InstancedMesh(lampGeometry, lampMaterial, lampMatrices.length);
  lampMatrices.forEach((m, k) => lampsInst.setMatrixAt(k, m));
  root.add(pylonsInst, lampsInst);

  // --- Ground (the void circuit floats over a distant grid instead) ---
  const { minX, maxX, minZ, maxZ } = track.bounds;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const span = Math.max(maxX - minX, maxZ - minZ) + 2600;
  const groundMap = keep(groundTexture(look));
  groundMap.repeat.set(span / 48, span / 48);
  const groundMaterial = keep(
    new THREE.MeshStandardMaterial({
      map: groundMap,
      roughness: look.scenery === "causeway" || look.scenery === "glacier" ? 0.2 : 0.9,
      metalness: look.scenery === "causeway" ? 0.6 : 0.1,
      transparent: look.scenery === "void",
      opacity: look.scenery === "void" ? 0.5 : 1,
    }),
  );
  const ground = new THREE.Mesh(keep(new THREE.PlaneGeometry(span, span)), groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(cx, look.scenery === "void" ? groundY - 70 : groundY, cz);
  ground.receiveShadow = true;
  root.add(ground);

  // --- Sky dome with a gradient, a glow around the sun and stars ---
  const sunDirection = new THREE.Vector3(-0.5, 0.18, -0.85).normalize();
  const skyMaterial = keep(
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        zenith: { value: new THREE.Color(look.zenith) },
        horizon: { value: new THREE.Color(look.horizon) },
        sunColor: { value: new THREE.Color(look.sun) },
        sunDirection: { value: sunDirection },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunColor; uniform vec3 sunDirection; varying vec3 vDir;
        float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
        void main(){
          float h = clamp(vDir.y, -0.2, 1.0);
          vec3 col = mix(horizon, zenith, pow(max(h, 0.0), 0.55));
          float sun = max(dot(vDir, sunDirection), 0.0);
          col += sunColor * (pow(sun, 900.0) * 3.0 + pow(sun, 12.0) * 0.35);
          vec3 cell = floor(vDir * 420.0);
          float star = step(0.9965, hash(cell)) * smoothstep(0.05, 0.4, h);
          col += vec3(star) * 0.9;
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  const sky = new THREE.Mesh(keep(new THREE.SphereGeometry(2400, 32, 16)), skyMaterial);
  sky.renderOrder = -1;
  root.add(sky);

  // Theme set piece in the sky.
  if (look.scenery === "void" || look.scenery === "glacier" || look.scenery === "city") {
    const planet = new THREE.Mesh(
      keep(new THREE.SphereGeometry(look.scenery === "void" ? 260 : 150, 48, 24)),
      keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(look.horizon).lerp(new THREE.Color(0xffffff), 0.25), fog: false })),
    );
    planet.position.set(cx - 900, 420, cz - 1500);
    root.add(planet);
    const ring = new THREE.Mesh(
      keep(new THREE.RingGeometry(look.scenery === "void" ? 330 : 190, look.scenery === "void" ? 470 : 260, 96)),
      keep(new THREE.MeshBasicMaterial({ color: look.sun, transparent: true, opacity: 0.45, side: THREE.DoubleSide, fog: false, toneMapped: false })),
    );
    ring.position.copy(planet.position);
    ring.rotation.set(1.2, 0.3, 0.2);
    root.add(ring);
    animated.push({ object: ring, spin: 0.01, bob: 0, base: 0 });
  }

  // --- Scenery: instanced, themed, never on or over the road ---
  const candidates: { x: number; z: number; size: number }[] = [];
  const target = quality === "high" ? 320 : 170;
  let attempts = 0;
  while (candidates.length < target && attempts < target * 12) {
    attempts += 1;
    const x = minX - 500 + random() * (maxX - minX + 1000);
    const z = minZ - 500 + random() * (maxZ - minZ + 1000);
    const size = 0.6 + random() * 1.6;
    const clear = clearanceFrom(track, x, z);
    if (clear < W + 18 + size * 14) continue;
    candidates.push({ x, z, size });
  }
  const sceneryGroup = new THREE.Group();
  root.add(sceneryGroup);
  const addInstanced = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    items: { position: THREE.Vector3; scale: THREE.Vector3; rotation?: THREE.Euler }[],
  ) => {
    keep(geometry);
    keep(material);
    if (!items.length) return;
    const inst = new THREE.InstancedMesh(geometry, material, items.length);
    const m = new THREE.Matrix4();
    items.forEach((item, k) => {
      m.compose(item.position, new THREE.Quaternion().setFromEuler(item.rotation ?? new THREE.Euler()), item.scale);
      inst.setMatrixAt(k, m);
    });
    inst.castShadow = false;
    sceneryGroup.add(inst);
  };

  const rail = new THREE.Color(look.rail);
  const key = new THREE.Color(look.key);
  if (look.scenery === "city") {
    const texA = keep(windowTexture(look.rail));
    const texB = keep(windowTexture(look.key));
    const half = Math.ceil(candidates.length / 2);
    [candidates.slice(0, half), candidates.slice(half)].forEach((group, g) => {
      const tex = g === 0 ? texA : texB;
      tex.repeat.set(2, 4);
      addInstanced(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0x0b0e1e, metalness: 0.9, roughness: 0.3, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.4 }),
        group.map((c) => {
          const h = 30 + random() * 150 * c.size;
          return { position: new THREE.Vector3(c.x, groundY + h / 2, c.z), scale: new THREE.Vector3(18 + c.size * 14, h, 18 + c.size * 14), rotation: new THREE.Euler(0, random() * 3, 0) };
        }),
      );
    });
    addInstanced(
      new THREE.CylinderGeometry(0.4, 0.8, 1, 6),
      new THREE.MeshBasicMaterial({ color: key.clone().multiplyScalar(1.5), toneMapped: false }),
      candidates.filter((_, k) => k % 5 === 0).map((c) => ({ position: new THREE.Vector3(c.x, groundY + 60 + c.size * 120, c.z), scale: new THREE.Vector3(1, 30, 1) })),
    );
  } else if (look.scenery === "canyon") {
    addInstanced(
      new THREE.CylinderGeometry(0.75, 1, 1, 7, 3),
      new THREE.MeshStandardMaterial({ color: 0x8a3a18, roughness: 0.95, metalness: 0.05, flatShading: true }),
      candidates.map((c) => {
        const h = 20 + random() * 80 * c.size;
        const w = 30 + c.size * 40;
        return { position: new THREE.Vector3(c.x, groundY + h / 2, c.z), scale: new THREE.Vector3(w, h, w * (0.6 + random() * 0.6)), rotation: new THREE.Euler(0, random() * 6, 0) };
      }),
    );
    addInstanced(
      new THREE.CylinderGeometry(1, 1, 1, 7),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff8a1f).multiplyScalar(1.4), toneMapped: false }),
      candidates.filter((_, k) => k % 6 === 0).map((c) => ({ position: new THREE.Vector3(c.x, groundY + 0.3, c.z), scale: new THREE.Vector3(10 + c.size * 10, 0.4, 10 + c.size * 10) })),
    );
  } else if (look.scenery === "glacier") {
    addInstanced(
      new THREE.ConeGeometry(1, 1, 5),
      new THREE.MeshPhysicalMaterial({ color: 0x9fe6ff, roughness: 0.08, metalness: 0.1, transmission: 0.25, transparent: true, opacity: 0.85, emissive: new THREE.Color(0x0a4a6a), flatShading: true }),
      candidates.map((c) => {
        const h = 18 + random() * 90 * c.size;
        return { position: new THREE.Vector3(c.x, groundY + h / 2 - 2, c.z), scale: new THREE.Vector3(8 + c.size * 12, h, 8 + c.size * 12), rotation: new THREE.Euler((random() - 0.5) * 0.4, random() * 6, (random() - 0.5) * 0.4) };
      }),
    );
  } else if (look.scenery === "void") {
    const rocks = candidates.map((c) => {
      const s = 6 + c.size * 18;
      return { position: new THREE.Vector3(c.x, groundY - 30 + random() * 140, c.z), scale: new THREE.Vector3(s, s * (0.6 + random() * 0.5), s), rotation: new THREE.Euler(random() * 6, random() * 6, random() * 6) };
    });
    addInstanced(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshStandardMaterial({ color: 0x241a3d, roughness: 0.8, metalness: 0.3, emissive: new THREE.Color(0x1a0638), flatShading: true }),
      rocks,
    );
    addInstanced(
      new THREE.OctahedronGeometry(1, 0),
      new THREE.MeshBasicMaterial({ color: rail.clone().multiplyScalar(1.5), toneMapped: false }),
      rocks.filter((_, k) => k % 4 === 0).map((r) => ({ position: r.position.clone().add(new THREE.Vector3(0, r.scale.y * 0.9, 0)), scale: new THREE.Vector3(2, 5, 2) })),
    );
  } else if (look.scenery === "causeway") {
    addInstanced(
      new THREE.CylinderGeometry(0.5, 0.9, 1, 6),
      new THREE.MeshStandardMaterial({ color: 0x0c2a22, roughness: 0.8 }),
      candidates.map((c) => ({ position: new THREE.Vector3(c.x, groundY + 7 * c.size, c.z), scale: new THREE.Vector3(1.6 * c.size, 14 * c.size, 1.6 * c.size) })),
    );
    const canopies = candidates.map((c, k) => ({
      position: new THREE.Vector3(c.x, groundY + 14 * c.size + 4, c.z),
      scale: new THREE.Vector3(8 * c.size, 6 * c.size, 8 * c.size),
      k,
    }));
    addInstanced(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: rail.clone().multiplyScalar(1.1), toneMapped: false }),
      canopies.filter((c) => c.k % 2 === 0),
    );
    addInstanced(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: key.clone().multiplyScalar(1.1), toneMapped: false }),
      canopies.filter((c) => c.k % 2 === 1),
    );
  } else {
    addInstanced(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x2a1d1a, metalness: 0.8, roughness: 0.45 }),
      candidates.map((c) => {
        const h = 14 + random() * 40 * c.size;
        return { position: new THREE.Vector3(c.x, groundY + h / 2, c.z), scale: new THREE.Vector3(30 + c.size * 30, h, 20 + c.size * 25), rotation: new THREE.Euler(0, random() * 3, 0) };
      }),
    );
    const stacks = candidates.filter((_, k) => k % 3 === 0).map((c) => {
      const h = 60 + random() * 90;
      return { position: new THREE.Vector3(c.x + 12, groundY + h / 2, c.z + 8), scale: new THREE.Vector3(5, h, 5), h };
    });
    addInstanced(new THREE.CylinderGeometry(1, 1.3, 1, 12), new THREE.MeshStandardMaterial({ color: 0x3a2a24, metalness: 0.7, roughness: 0.5 }), stacks);
    addInstanced(
      new THREE.TorusGeometry(1.1, 0.25, 6, 16),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff5d3a).multiplyScalar(1.6), toneMapped: false }),
      stacks.map((st) => ({ position: new THREE.Vector3(st.position.x, groundY + st.h - 4, st.position.z), scale: new THREE.Vector3(5, 5, 5), rotation: new THREE.Euler(Math.PI / 2, 0, 0) })),
    );
  }

  // Holographic billboards beside the long straights.
  const billboardTexture = keep(
    canvasTexture(512, 128, (ctx) => {
      ctx.fillStyle = "rgba(0,0,0,0)";
      ctx.clearRect(0, 0, 512, 128);
      ctx.strokeStyle = hexCss(look.rail);
      ctx.lineWidth = 6;
      ctx.strokeRect(6, 6, 500, 116);
      ctx.fillStyle = hexCss(look.rail);
      ctx.font = "bold 64px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("HYPERNOVA", 256, 52);
      ctx.font = "bold 26px sans-serif";
      ctx.fillStyle = hexCss(look.key);
      ctx.fillText("FLEXZONIC GRAND PRIX", 256, 100);
    }),
  );
  const billboardMaterial = keep(new THREE.MeshBasicMaterial({ map: billboardTexture, transparent: true, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }));
  const billboardGeometry = keep(new THREE.PlaneGeometry(24, 6));
  for (const pad of track.spec.boostPads) {
    for (const offset of [-40, 40]) {
      const s = pad.s + offset;
      const side = offset < 0 ? -1 : 1;
      const board = new THREE.Mesh(billboardGeometry, billboardMaterial);
      track.frameAt(s, frame);
      board.position.copy(track.pointAt(s, side * (W + 14), 9));
      board.lookAt(track.pointAt(s, 0, 9));
      root.add(board);
    }
  }

  return {
    root,
    look,
    sky,
    animated,
    railMaterial,
    dispose: () => {
      for (const item of disposables) item.dispose();
    },
  };
}
