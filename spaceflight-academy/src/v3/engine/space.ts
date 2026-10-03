import * as THREE from "three";

/**
 * Procedural space visuals baked on the GPU once and cached:
 * planet surfaces, clouds, nebula skies, starfields, glows and rings.
 */
const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+10.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.5-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
  return 105.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p){float a=0.5;float s=0.0;for(int i=0;i<6;i++){s+=a*snoise(p);p*=2.03;a*=0.5;}return s;}
float sstep(float a, float b, float x){ return a < b ? smoothstep(a, b, x) : 1.0 - smoothstep(b, a, x); }
`;

export type PlanetKind = "earth" | "moon" | "mars" | "jupiter" | "saturn" | "uranus" | "neptune" | "mercury" | "venus" | "pluto" | "sun" | "titan" | "europa" | "io" | "asteroid";

const SURFACE: Record<PlanetKind, string> = {
  earth: `
    float c = fbm(p*1.6+vec3(3.1,0.0,1.7));
    float lat = abs(p.y);
    vec3 deep = vec3(0.06,0.22,0.52), shallow = vec3(0.13,0.45,0.78);
    vec3 col = mix(deep, shallow, sstep(-0.25,0.08,c));
    if (c > 0.08) {
      float m = fbm(p*5.0);
      vec3 green = vec3(0.22,0.55,0.25), dry = vec3(0.72,0.6,0.36), hill = vec3(0.42,0.36,0.27);
      col = mix(green, dry, sstep(0.1,0.5, m + (0.35-lat)*0.3));
      col = mix(col, hill, sstep(0.32,0.5,c));
    }
    col = mix(col, vec3(0.94,0.97,1.0), sstep(0.78,0.84,lat + fbm(p*4.0)*0.05));
    gl_FragColor = vec4(col,1.0);`,
  moon: `
    float maria = sstep(0.05,0.3, fbm(p*1.3+vec3(7.0)));
    float n = fbm(p*8.0)*0.5+0.5;
    vec3 col = mix(vec3(0.74,0.73,0.7), vec3(0.42,0.42,0.43), maria*0.8);
    col *= 0.82 + 0.3*n;
    for (int k=0;k<14;k++){
      vec3 cc = normalize(vec3(sin(float(k)*12.9898),cos(float(k)*4.1414),sin(float(k)*78.233+1.0)));
      float d = distance(p, cc);
      float r = 0.07 + 0.12*fract(float(k)*0.618);
      col *= 1.0 - 0.18*sstep(r*1.1,r*0.8,d) + 0.14*sstep(r*0.8,r,d)*sstep(r*1.2,r,d);
    }
    gl_FragColor = vec4(col,1.0);`,
  mars: `
    float n = fbm(p*2.2+vec3(1.0,4.0,2.0));
    vec3 col = mix(vec3(0.76,0.33,0.17), vec3(0.88,0.52,0.3), sstep(-0.2,0.4,n));
    col = mix(col, vec3(0.45,0.2,0.12), sstep(0.2,0.55,fbm(p*1.4+vec3(9.0))));
    float canyon = sstep(0.035,0.0,abs(p.y+0.08+0.04*sin(atan(p.z,p.x)*3.0))) * sstep(-0.2,0.6,p.z);
    col = mix(col, vec3(0.32,0.13,0.08), canyon*0.85);
    col = mix(col, vec3(0.96,0.95,0.94), sstep(0.86,0.9,abs(p.y)));
    gl_FragColor = vec4(col,1.0);`,
  jupiter: `
    float lat = p.y;
    float turb = fbm(p*vec3(2.0,6.0,2.0))*0.12;
    float bands = sin((lat+turb)*26.0);
    vec3 cream = vec3(0.93,0.86,0.72), tan = vec3(0.78,0.58,0.4), brown = vec3(0.56,0.36,0.24);
    vec3 col = mix(cream, tan, sstep(-0.3,0.6,bands));
    col = mix(col, brown, sstep(0.75,1.0,sin((lat+turb)*13.0+1.0))*0.6);
    vec2 sp = vec2(atan(p.z,p.x)-0.9, (lat+0.36)*3.2);
    float spot = sstep(0.42,0.22,length(sp*vec2(1.0,1.7)));
    col = mix(col, vec3(0.78,0.32,0.2), spot);
    gl_FragColor = vec4(col,1.0);`,
  saturn: `
    float lat = p.y;
    float turb = fbm(p*vec3(2.0,5.0,2.0))*0.06;
    float bands = sin((lat+turb)*22.0);
    vec3 col = mix(vec3(0.95,0.87,0.66), vec3(0.83,0.7,0.48), sstep(-0.4,0.9,bands));
    col = mix(col, vec3(0.7,0.62,0.48), sstep(0.8,0.95,abs(lat)));
    gl_FragColor = vec4(col,1.0);`,
  uranus: `
    float b = sin(p.y*10.0+fbm(p*3.0)*0.4);
    vec3 col = mix(vec3(0.62,0.86,0.89), vec3(0.55,0.8,0.86), b*0.5+0.5);
    gl_FragColor = vec4(col,1.0);`,
  neptune: `
    float turb = fbm(p*vec3(2.0,6.0,2.0))*0.15;
    vec3 col = mix(vec3(0.16,0.32,0.82), vec3(0.24,0.46,0.92), sin((p.y+turb)*14.0)*0.5+0.5);
    vec2 sp = vec2(atan(p.z,p.x)+0.4, (p.y+0.3)*3.0);
    col = mix(col, vec3(0.06,0.12,0.4), sstep(0.3,0.15,length(sp*vec2(1.0,1.6))));
    col = mix(col, vec3(0.9,0.95,1.0), sstep(0.55,0.75,fbm(p*vec3(1.0,9.0,1.0)+vec3(4.0)))*0.6);
    gl_FragColor = vec4(col,1.0);`,
  mercury: `
    float n = fbm(p*6.0)*0.5+0.5;
    vec3 col = mix(vec3(0.42,0.39,0.37), vec3(0.66,0.62,0.58), n);
    gl_FragColor = vec4(col,1.0);`,
  venus: `
    float n = fbm(p*vec3(2.0,4.0,2.0)+vec3(fbm(p*2.0)));
    vec3 col = mix(vec3(0.86,0.72,0.42), vec3(0.97,0.9,0.7), n*0.5+0.5);
    gl_FragColor = vec4(col,1.0);`,
  pluto: `
    float n = fbm(p*3.0)*0.5+0.5;
    vec3 col = mix(vec3(0.55,0.42,0.33), vec3(0.8,0.7,0.6), n);
    vec2 h = vec2(atan(p.z,p.x)-1.57, p.y+0.05)*vec2(1.0,1.3);
    float heart = sstep(0.42,0.32,length(h-vec2(-0.13,0.05))) + sstep(0.4,0.3,length(h-vec2(0.13,0.05))) + sstep(0.38,0.0,length(h*vec2(1.0,0.8)+vec2(0.0,0.18)))*0.0;
    float tip = sstep(0.32,0.05,abs(h.x)+ (0.05-h.y)*1.1) * step(h.y,0.06);
    col = mix(col, vec3(0.97,0.93,0.88), clamp(heart+tip,0.0,1.0));
    gl_FragColor = vec4(col,1.0);`,
  sun: `
    float n = fbm(p*6.0)*0.5+0.5;
    vec3 col = mix(vec3(1.0,0.55,0.12), vec3(1.0,0.86,0.42), n);
    gl_FragColor = vec4(col,1.0);`,
  titan: `
    float n = fbm(p*vec3(2.0,5.0,2.0))*0.5+0.5;
    gl_FragColor = vec4(mix(vec3(0.82,0.58,0.26), vec3(0.93,0.73,0.38), n),1.0);`,
  europa: `
    float n = fbm(p*3.0)*0.5+0.5;
    vec3 col = mix(vec3(0.86,0.84,0.8), vec3(0.95,0.93,0.9), n);
    float cracks = sstep(0.03,0.0,abs(snoise(p*4.0))) + sstep(0.02,0.0,abs(snoise(p*7.0+vec3(3.0))));
    col = mix(col, vec3(0.62,0.38,0.24), clamp(cracks,0.0,1.0)*0.8);
    gl_FragColor = vec4(col,1.0);`,
  io: `
    float n = fbm(p*4.0)*0.5+0.5;
    vec3 col = mix(vec3(0.9,0.8,0.3), vec3(0.95,0.92,0.6), n);
    col = mix(col, vec3(0.35,0.2,0.1), sstep(0.62,0.7,fbm(p*6.0+vec3(5.0))*0.5+0.5));
    col = mix(col, vec3(0.85,0.35,0.15), sstep(0.66,0.75,fbm(p*5.0+vec3(1.0))*0.5+0.5));
    gl_FragColor = vec4(col,1.0);`,
  asteroid: `
    float n = fbm(p*5.0)*0.5+0.5;
    gl_FragColor = vec4(mix(vec3(0.36,0.32,0.29), vec3(0.6,0.55,0.5), n),1.0);`,
};

const CLOUDS = `
  float c = fbm(p*2.6 + vec3(fbm(p*1.2)*1.4));
  float a = sstep(0.16, 0.55, c);
  gl_FragColor = vec4(1.0,1.0,1.0,a*0.8);`;

function bakeShader(body: string) {
  return new THREE.ShaderMaterial({
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: `precision highp float; varying vec2 vUv; ${NOISE}
      void main(){
        float phi = vUv.x * 6.28318530718;
        float theta = (1.0 - vUv.y) * 3.14159265359;
        vec3 p = vec3(-cos(phi)*sin(theta), cos(theta), sin(phi)*sin(theta));
        ${body}
        // Colours above are authored in sRGB; store them as linear values.
        gl_FragColor.rgb = pow(max(gl_FragColor.rgb, vec3(0.0)), vec3(2.2));
      }`,
    depthTest: false,
    depthWrite: false,
  });
}

export class SpaceFactory {
  private readonly cache = new Map<string, THREE.Texture>();
  private readonly quad: THREE.Mesh;
  private readonly bakeScene = new THREE.Scene();
  private readonly bakeCamera = new THREE.Camera();
  private glowTexture: THREE.Texture | null = null;
  private starSprite: THREE.Texture | null = null;

  readonly renderer: THREE.WebGLRenderer;
  readonly size: number;

  constructor(renderer: THREE.WebGLRenderer, size = 1024) {
    this.renderer = renderer;
    this.size = size;
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.bakeScene.add(this.quad);
  }

  private bake(key: string, body: string, width: number, height: number, transparent = false) {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const target = new THREE.WebGLRenderTarget(width, height, { type: THREE.UnsignedByteType, colorSpace: THREE.SRGBColorSpace, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
    const material = bakeShader(body);
    material.transparent = transparent;
    this.quad.material = material;
    const previous = this.renderer.getRenderTarget();
    const tone = this.renderer.toneMapping;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setRenderTarget(target);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.render(this.bakeScene, this.bakeCamera);
    this.renderer.setRenderTarget(previous);
    this.renderer.toneMapping = tone;
    material.dispose();
    target.texture.wrapS = THREE.RepeatWrapping;
    target.texture.anisotropy = 4;
    this.cache.set(key, target.texture);
    return target.texture;
  }

  surface(kind: PlanetKind) {
    const w = kind === "earth" || kind === "jupiter" || kind === "moon" || kind === "mars" ? this.size : this.size / 2;
    return this.bake("surface:" + kind, SURFACE[kind], w, w / 2);
  }

  clouds() {
    return this.bake("clouds", CLOUDS, this.size, this.size / 2, true);
  }

  nebula(palette: [string, string, string], seed = 1) {
    const [a, b, c] = palette.map((hex) => new THREE.Color(hex));
    const v = (col: THREE.Color) => `vec3(${col.r.toFixed(3)},${col.g.toFixed(3)},${col.b.toFixed(3)})`;
    const body = `
      vec3 q = p*1.4 + vec3(${seed.toFixed(1)});
      float n1 = fbm(q + vec3(fbm(q*1.7)));
      float n2 = fbm(q*2.3 + vec3(5.2,1.3,2.8));
      vec3 col = vec3(0.03,0.04,0.11);
      col += ${v(a)} * sstep(-0.1,0.7,n1) * 0.85;
      col += ${v(b)} * sstep(0.0,0.8,n2) * 0.7;
      col += ${v(c)} * pow(max(0.0,n1*n2*2.0),2.0) * 0.9;
      float dust = sstep(0.3,0.9,fbm(q*4.0));
      col *= 0.75 + 0.35*dust;
      gl_FragColor = vec4(col,1.0);`;
    return this.bake("nebula:" + palette.join(",") + seed, body, this.size, this.size / 2);
  }

  /** Planet mesh (radius r) with optional clouds, atmosphere glow and rings. */
  planet(kind: PlanetKind, radius: number, options: { clouds?: boolean; atmosphere?: string | null; rings?: boolean; segments?: number } = {}) {
    const group = new THREE.Group();
    const segments = options.segments ?? 64;
    const map = this.surface(kind);
    const material = kind === "sun"
      ? new THREE.MeshBasicMaterial({ map, color: 0xffffff })
      : new THREE.MeshStandardMaterial({ map, roughness: kind === "earth" ? 0.75 : 0.92, metalness: 0 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(radius, segments, Math.round(segments * 0.6)), material);
    body.name = "body";
    if (kind === "sun") body.userData.bloom = true;
    group.add(body);
    if (options.clouds) {
      const clouds = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.012, segments, Math.round(segments * 0.6)), new THREE.MeshStandardMaterial({ map: this.clouds(), transparent: true, depthWrite: false, roughness: 1 }));
      clouds.name = "clouds";
      group.add(clouds);
    }
    const atmosphere = options.atmosphere === undefined ? defaultAtmosphere(kind) : options.atmosphere;
    if (atmosphere) group.add(this.atmosphere(radius, atmosphere));
    if (options.rings) group.add(this.rings(radius));
    if (kind === "sun") group.add(this.glow(radius * 4.2, "#ffb347", 0.9));
    return group;
  }

  atmosphere(radius: number, color: string, power = 2.6, scale = 1.08) {
    const material = new THREE.ShaderMaterial({
      uniforms: { glowColor: { value: new THREE.Color(color) }, power: { value: power } },
      vertexShader: "varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }",
      fragmentShader: "uniform vec3 glowColor; uniform float power; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), power); gl_FragColor = vec4(glowColor*f*1.4, f); }",
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius * scale, 48, 32), material);
    mesh.name = "atmosphere";
    mesh.userData.noBloom = true;
    return mesh;
  }

  rings(radius: number) {
    const inner = radius * 1.25, outer = radius * 2.3;
    const geometry = new THREE.RingGeometry(inner, outer, 128, 1);
    const pos = geometry.attributes.position as THREE.BufferAttribute;
    const uv = geometry.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getY(i));
      uv.setXY(i, (r - inner) / (outer - inner), 0.5);
    }
    const canvas = document.createElement("canvas");
    canvas.width = 512; canvas.height = 4;
    const ctx = canvas.getContext("2d")!;
    for (let x = 0; x < 512; x++) {
      const t = x / 512;
      let a = 0.25 + 0.6 * Math.abs(Math.sin(t * 40) * Math.sin(t * 13 + 1));
      if (t > 0.58 && t < 0.63) a *= 0.08; // Cassini Division
      if (t < 0.05 || t > 0.97) a *= 0.3;
      const shade = 200 + Math.round(40 * Math.sin(t * 9));
      ctx.fillStyle = `rgba(${shade},${shade - 22},${shade - 60},${a.toFixed(3)})`;
      ctx.fillRect(x, 0, 1, 4);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 1 }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.name = "rings";
    return mesh;
  }

  glowSprite() {
    if (!this.glowTexture) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 128;
      const ctx = canvas.getContext("2d")!;
      const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.25, "rgba(255,255,255,0.55)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
      this.glowTexture = new THREE.CanvasTexture(canvas);
    }
    return this.glowTexture;
  }

  glow(size: number, color: string, opacity = 0.8) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowSprite(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
    sprite.userData.noBloom = true; // already a soft glow; blooming it again only fogs the screen
    sprite.scale.set(size, size, 1);
    sprite.name = "glow";
    return sprite;
  }

  /** Twinkling starfield on a sphere of the given radius. */
  starfield(count: number, radius: number, sizeScale = 1) {
    if (!this.starSprite) this.starSprite = this.glowSprite();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const palette = [new THREE.Color("#ffffff"), new THREE.Color("#cfe3ff"), new THREE.Color("#ffe9c4"), new THREE.Color("#bfefff"), new THREE.Color("#ffd1ef")];
    for (let i = 0; i < count; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      positions.set([Math.cos(a) * s * radius, u * radius, Math.sin(a) * s * radius], i * 3);
      const c = palette[Math.floor(Math.random() * palette.length)];
      colors.set([c.r, c.g, c.b], i * 3);
      sizes[i] = (Math.random() < 0.06 ? 3.2 + Math.random() * 2.5 : 1.0 + Math.random() * 1.6) * sizeScale;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    const material = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, map: { value: this.starSprite }, pixelRatio: { value: this.renderer.getPixelRatio() } },
      vertexShader: "attribute float size; attribute vec3 color; varying vec3 vColor; varying float vTw; uniform float time; uniform float pixelRatio; void main(){ vColor = color; vTw = 0.7 + 0.3*sin(time*2.0 + position.x*0.37 + position.y*0.11); vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = size * pixelRatio * 2.2; gl_Position = projectionMatrix*mv; }",
      fragmentShader: "uniform sampler2D map; varying vec3 vColor; varying float vTw; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vColor*vTw, t.a); }",
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.name = "stars";
    points.userData.noBloom = true;
    return points;
  }

  /** Big inside-out sphere showing a baked nebula. */
  skySphere(palette: [string, string, string], seed = 1, radius = 900) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), new THREE.MeshBasicMaterial({ map: this.nebula(palette, seed), side: THREE.BackSide, depthWrite: false, fog: false }));
    mesh.name = "nebula";
    mesh.renderOrder = -10;
    return mesh;
  }

  /** Lumpy asteroid geometry (deformed icosahedron). */
  asteroidGeometry(radius: number, seed: number, detail = 3) {
    const geometry = new THREE.IcosahedronGeometry(radius, detail);
    const pos = geometry.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = v.clone().normalize();
      const bump = 1 + 0.22 * Math.sin(n.x * 3.1 + seed) * Math.cos(n.y * 2.7 + seed * 1.3) + 0.12 * Math.sin(n.z * 7.3 + seed * 2.1) + 0.06 * Math.sin((n.x + n.y) * 13 + seed);
      v.copy(n).multiplyScalar(radius * bump);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geometry.computeVertexNormals();
    return geometry;
  }
}

function defaultAtmosphere(kind: PlanetKind): string | null {
  switch (kind) {
    case "earth": return "#5fb6ff";
    case "venus": return "#ffe0a0";
    case "mars": return "#ff9a6b";
    case "titan": return "#ffb85e";
    case "neptune": return "#5c8dff";
    case "uranus": return "#9ff5ff";
    case "jupiter": return "#ffe2b8";
    case "saturn": return "#ffe8bd";
    default: return null;
  }
}

/** Gradient daytime sky dome with a soft sun glow. */
export function skyDome(top = "#2f73d6", horizon = "#bfe6ff", sunDir = new THREE.Vector3(0.4, 0.5, -0.8), radius = 600) {
  const material = new THREE.ShaderMaterial({
    uniforms: { top: { value: new THREE.Color(top) }, horizon: { value: new THREE.Color(horizon) }, sunDir: { value: sunDir.clone().normalize() } },
    vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
    fragmentShader: "uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; varying vec3 vDir; void main(){ float h = clamp(vDir.y,0.0,1.0); vec3 col = mix(horizon, top, pow(h,0.55)); float s = max(0.0, dot(normalize(vDir), sunDir)); col += vec3(1.0,0.9,0.7)*pow(s,64.0)*0.9 + vec3(1.0,0.85,0.6)*pow(s,6.0)*0.18; if (vDir.y < 0.0) col = horizon*0.95; gl_FragColor = vec4(col,1.0); }",
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 20), material);
  mesh.renderOrder = -10;
  mesh.name = "sky";
  return mesh;
}

export function updateStars(root: THREE.Object3D, time: number) {
  root.traverse((node) => {
    const material = (node as THREE.Points).material as THREE.ShaderMaterial | undefined;
    if (node.name === "stars" && material?.uniforms?.time) material.uniforms.time.value = time;
  });
}
