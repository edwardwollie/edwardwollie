import * as THREE from "three";

/** Canvas text sprite (always faces the camera). Height is in metres. */
export function textSprite(text: string, options: { height?: number; fg?: string; bg?: string; border?: string; icon?: string; weight?: number; padding?: number } = {}) {
  const height = options.height ?? 1.2;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const fontSize = 64;
  const family = "'Fredoka Variable','Fredoka',system-ui,sans-serif";
  const label = options.icon ? `${options.icon}  ${text}` : text;
  ctx.font = `${options.weight ?? 700} ${fontSize}px ${family}`;
  const pad = options.padding ?? 34;
  const width = Math.ceil(ctx.measureText(label).width + pad * 2);
  canvas.width = width;
  canvas.height = fontSize + pad * 1.4;
  ctx.font = `${options.weight ?? 700} ${fontSize}px ${family}`;
  ctx.fillStyle = options.bg ?? "rgba(9,15,48,0.82)";
  ctx.beginPath();
  ctx.roundRect(3, 3, canvas.width - 6, canvas.height - 6, canvas.height / 2.4);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = options.border ?? "#62e8ff";
  ctx.stroke();
  ctx.fillStyle = options.fg ?? "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, canvas.width / 2, canvas.height / 2 + 3);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set((height * canvas.width) / canvas.height, height, 1);
  sprite.userData.aspect = canvas.width / canvas.height;
  sprite.renderOrder = 5;
  return sprite;
}

/** Paints wrapped, auto-sized text into a canvas (used for gate answer panels and signs). */
export function drawWrapped(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, maxHeight: number, startSize: number, weight = 700, lineGap = 1.12) {
  const family = "'Fredoka Variable','Fredoka',system-ui,sans-serif";
  let size = startSize;
  let lines: string[] = [];
  while (size > 14) {
    ctx.font = `${weight} ${size}px ${family}`;
    lines = [];
    let line = "";
    for (const word of text.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; } else line = test;
    }
    if (line) lines.push(line);
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (lines.length * size * lineGap <= maxHeight && widest <= maxWidth) break;
    size -= 4;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const total = lines.length * size * lineGap;
  lines.forEach((l, i) => ctx.fillText(l, x, y - total / 2 + size * lineGap * (i + 0.5)));
  return size;
}
