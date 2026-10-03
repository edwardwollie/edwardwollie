import * as THREE from "three";
import trackSpec from "./track-spec.json";

/**
 * Grand Prix circuit model. The centreline samples come straight from
 * track-spec.json (written by blueprints/design_tracks.py), so the drivable
 * road is exactly the road drawn on the circuit plan plates.
 *
 * Track space: s = distance along the lap (0..length), d = lateral offset in
 * metres (positive = right of the direction of travel).
 */

export type TrackFeature = { s: number; d: number };
export type CoinLine = TrackFeature & { count: number; spacing: number };
export type TrackItem = TrackFeature & { kind: "nitro" | "repair" };
export type TrackHazard = TrackFeature & { kind: "mine" | "barrier" | "drone" };

export type TrackSpec = {
  id: string;
  name: string;
  theme: number;
  laps: number;
  blurb: string;
  length: number;
  minRadius: number;
  climb: number;
  points: number[];
  bank: number[];
  tunnels: [number, number][];
  checkpoints: number[];
  boostPads: TrackFeature[];
  coinLines: CoinLine[];
  items: TrackItem[];
  hazards: TrackHazard[];
};

export const TRACK_WIDTH: number = (trackSpec as { width: number }).width;
export const TRACK_HALF_WIDTH = TRACK_WIDTH / 2;
export const TRACKS: TrackSpec[] = (trackSpec as unknown as { tracks: TrackSpec[] })
  .tracks;

export type Frame = {
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
};

export function wrap(s: number, length: number): number {
  return ((s % length) + length) % length;
}

/** Signed shortest distance from a to b along a closed lap. */
export function lapDelta(a: number, b: number, length: number): number {
  let delta = wrap(b - a, length);
  if (delta > length / 2) delta -= length;
  return delta;
}

function smoothLoop(values: Float32Array, radius: number): Float32Array {
  const n = values.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    let sum = 0;
    for (let k = -radius; k <= radius; k += 1) sum += values[(i + k + n) % n];
    out[i] = sum / (2 * radius + 1);
  }
  return out;
}

export class RaceTrack {
  readonly spec: TrackSpec;
  readonly length: number;
  readonly count: number;
  readonly step: number;
  readonly positions: THREE.Vector3[] = [];
  readonly tangents: THREE.Vector3[] = [];
  readonly rights: THREE.Vector3[] = [];
  readonly ups: THREE.Vector3[] = [];
  readonly bank: Float32Array;
  /** Horizontal curvature (1/m); positive bends to the right. */
  readonly curvature: Float32Array;
  /** Preferred lateral offset for AI drivers (outside-apex-outside). */
  readonly racingLine: Float32Array;
  /** Highest comfortable speed (m/s) for a reference grip of 1 m/s². */
  readonly cornerFactor: Float32Array;
  readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number };

  constructor(spec: TrackSpec) {
    this.spec = spec;
    this.length = spec.length;
    this.count = spec.points.length / 3;
    this.step = this.length / this.count;
    this.bank = Float32Array.from(spec.bank);

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < this.count; i += 1) {
      const p = new THREE.Vector3(
        spec.points[i * 3],
        spec.points[i * 3 + 1],
        spec.points[i * 3 + 2],
      );
      this.positions.push(p);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    this.bounds = { minX, maxX, minZ, maxZ, minY, maxY };

    const worldUp = new THREE.Vector3(0, 1, 0);
    const heading = new Float32Array(this.count);
    for (let i = 0; i < this.count; i += 1) {
      const next = this.positions[(i + 1) % this.count];
      const prev = this.positions[(i - 1 + this.count) % this.count];
      const tangent = next.clone().sub(prev).normalize();
      const flatRight = tangent.clone().cross(worldUp).normalize();
      const flatUp = flatRight.clone().cross(tangent).normalize();
      const b = this.bank[i];
      // Bank > 0 lowers the right-hand edge.
      const right = flatRight
        .clone()
        .multiplyScalar(Math.cos(b))
        .addScaledVector(flatUp, -Math.sin(b));
      const up = flatUp
        .clone()
        .multiplyScalar(Math.cos(b))
        .addScaledVector(flatRight, Math.sin(b));
      this.tangents.push(tangent);
      this.rights.push(right);
      this.ups.push(up);
      heading[i] = Math.atan2(next.x - prev.x, -(next.z - prev.z));
    }

    const rawCurvature = new Float32Array(this.count);
    for (let i = 0; i < this.count; i += 1) {
      let dh =
        heading[(i + 2) % this.count] - heading[(i - 2 + this.count) % this.count];
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      rawCurvature[i] = dh / (4 * this.step);
    }
    this.curvature = smoothLoop(rawCurvature, 2);

    // Racing line: drift wide before a bend, clip the apex, run out on exit.
    const wide = smoothLoop(this.curvature, Math.round(36 / this.step));
    const line = new Float32Array(this.count);
    const lead = Math.round(44 / this.step);
    const limit = TRACK_HALF_WIDTH - 2.6;
    for (let i = 0; i < this.count; i += 1) {
      const apex = wide[i] * 520;
      const entry = wide[(i + lead) % this.count] * 380;
      line[i] = THREE.MathUtils.clamp(apex - entry, -1, 1) * limit;
    }
    this.racingLine = smoothLoop(line, Math.round(16 / this.step));

    // v = sqrt(grip / |k|); store sqrt(1/|k|) so any grip can be applied later.
    // A short window keeps the true apex curvature (the racing line opens a
    // bend up a little, which is the drivers' safety margin).
    const apexCurvature = smoothLoop(this.curvature, Math.round(10 / this.step));
    this.cornerFactor = new Float32Array(this.count);
    for (let i = 0; i < this.count; i += 1) {
      this.cornerFactor[i] = Math.sqrt(1 / Math.max(1e-5, Math.abs(apexCurvature[i]) * 0.92));
    }
  }

  private index(s: number): [number, number, number] {
    const u = wrap(s, this.length) / this.step;
    const i = Math.floor(u) % this.count;
    return [i, (i + 1) % this.count, u - Math.floor(u)];
  }

  sampleScalar(values: ArrayLike<number>, s: number): number {
    const [i, j, t] = this.index(s);
    return values[i] + (values[j] - values[i]) * t;
  }

  curvatureAt(s: number): number {
    return this.sampleScalar(this.curvature, s);
  }

  racingLineAt(s: number): number {
    return this.sampleScalar(this.racingLine, s);
  }

  bankAt(s: number): number {
    return this.sampleScalar(this.bank, s);
  }

  frameAt(s: number, target?: Frame): Frame {
    const [i, j, t] = this.index(s);
    const frame = target ?? {
      position: new THREE.Vector3(),
      tangent: new THREE.Vector3(),
      right: new THREE.Vector3(),
      up: new THREE.Vector3(),
    };
    frame.position.lerpVectors(this.positions[i], this.positions[j], t);
    frame.tangent.lerpVectors(this.tangents[i], this.tangents[j], t).normalize();
    frame.up.lerpVectors(this.ups[i], this.ups[j], t).normalize();
    frame.right.crossVectors(frame.tangent, frame.up).normalize();
    return frame;
  }

  /** World point at track coordinates (s, d) and height h above the road. */
  pointAt(s: number, d: number, h = 0, target = new THREE.Vector3()): THREE.Vector3 {
    const [i, j, t] = this.index(s);
    target.lerpVectors(this.positions[i], this.positions[j], t);
    const rx = this.rights[i].x + (this.rights[j].x - this.rights[i].x) * t;
    const ry = this.rights[i].y + (this.rights[j].y - this.rights[i].y) * t;
    const rz = this.rights[i].z + (this.rights[j].z - this.rights[i].z) * t;
    const ux = this.ups[i].x + (this.ups[j].x - this.ups[i].x) * t;
    const uy = this.ups[i].y + (this.ups[j].y - this.ups[i].y) * t;
    const uz = this.ups[i].z + (this.ups[j].z - this.ups[i].z) * t;
    target.x += rx * d + ux * h;
    target.y += ry * d + uy * h;
    target.z += rz * d + uz * h;
    return target;
  }

  /**
   * Speed limit (m/s) for a given lateral grip, looking ahead along the lap so
   * drivers brake before the bend rather than inside it.
   */
  buildSpeedProfile(grip: number, topSpeed: number, braking: number): Float32Array {
    const n = this.count;
    const profile = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      profile[i] = Math.min(topSpeed, this.cornerFactor[i] * Math.sqrt(grip));
    }
    for (let pass = 0; pass < 2; pass += 1) {
      for (let k = 2 * n - 1; k >= 0; k -= 1) {
        const i = k % n;
        const next = profile[(i + 1) % n];
        profile[i] = Math.min(profile[i], Math.sqrt(next * next + 2 * braking * this.step));
      }
    }
    return profile;
  }

  /** Nearest centreline distance s to a world point (coarse, then refined). */
  project(point: THREE.Vector3, hint?: number): number {
    let best = 0;
    let bestDistance = Infinity;
    const start = hint === undefined ? 0 : Math.floor(wrap(hint, this.length) / this.step) - 40;
    const span = hint === undefined ? this.count : 80;
    for (let k = 0; k < span; k += 1) {
      const i = (((start + k) % this.count) + this.count) % this.count;
      const distance = this.positions[i].distanceToSquared(point);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }
    return best * this.step;
  }

  inTunnel(s: number): boolean {
    const w = wrap(s, this.length);
    return this.spec.tunnels.some(([a, b]) => w >= a && w <= b);
  }
}

const trackCache = new Map<number, RaceTrack>();

export function getTrack(index: number): RaceTrack {
  const i = ((index % TRACKS.length) + TRACKS.length) % TRACKS.length;
  let track = trackCache.get(i);
  if (!track) {
    track = new RaceTrack(TRACKS[i]);
    trackCache.set(i, track);
  }
  return track;
}

/** Minimap polyline in normalised 0..1 coordinates (x right, y down = +Z). */
export function minimapPath(track: RaceTrack, points = 160): string {
  const { minX, maxX, minZ, maxZ } = track.bounds;
  const size = Math.max(maxX - minX, maxZ - minZ);
  const ox = (size - (maxX - minX)) / 2;
  const oz = (size - (maxZ - minZ)) / 2;
  const parts: string[] = [];
  for (let k = 0; k < points; k += 1) {
    const p = track.positions[Math.floor((k / points) * track.count)];
    const x = ((p.x - minX + ox) / size) * 100;
    const y = ((p.z - minZ + oz) / size) * 100;
    parts.push(`${k === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return `${parts.join(" ")} Z`;
}

export function minimapPoint(track: RaceTrack, x: number, z: number): [number, number] {
  const { minX, maxX, minZ, maxZ } = track.bounds;
  const size = Math.max(maxX - minX, maxZ - minZ);
  const ox = (size - (maxX - minX)) / 2;
  const oz = (size - (maxZ - minZ)) / 2;
  return [((x - minX + ox) / size) * 100, ((z - minZ + oz) / size) * 100];
}
