// Sheet kit for the Wildfront Horizon blueprint book: A3 landscape sheets at
// 150 dpi (2480 × 1754 px) with a drafting grid, zoned frame, third-angle
// projection symbol, title block, dimension lines, tables, captions and charts.

export const SW = 2480, SH = 1754;
export const MM = SW / 420;                 // px per millimetre on the printed sheet
export const FRAME = 10 * MM;               // frame inset

/** Standard drawing scales (denominators). */
export const SCALES = [1, 2, 2.5, 4, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 200, 250, 500, 1000, 2000, 2500, 5000];
/** Largest standard scale whose px-per-metre does not exceed `maxPxPerM`. */
export function pickScale(maxPxPerM: number): { n: number; pxPerM: number; label: string } {
  for (const n of SCALES) { const p = (1000 / n) * MM; if (p <= maxPxPerM) return { n, pxPerM: p, label: n >= 1 ? `1:${n}` : `${1 / n}:1` }; }
  const n = 5000; return { n, pxPerM: (1000 / n) * MM, label: `1:${n}` };
}

export interface SheetMeta {
  drawing: string; title: string; subtitle?: string; scale: string; rev: string;
  sheetNo: number; sheetCount: number; section: string; date: string;
}

export type Align = "left" | "center" | "right";
export interface TextOpts { size?: number; weight?: number | string; align?: Align; color?: string; font?: "head" | "body" | "mono"; spacing?: number; baseline?: CanvasTextBaseline; italic?: boolean; maxWidth?: number }

export class Sheet {
  c: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  paper: boolean;
  bg: string; ink: string; ink2: string; faint: string; accent: string; accent2: string; warn: string;
  /** usable drawing area inside the frame */
  area = { x: FRAME + 14, y: FRAME + 14, w: SW - 2 * FRAME - 28, h: SH - 2 * FRAME - 28 };
  /** title block rectangle */
  tb = { x: 0, y: 0, w: 190 * MM, h: 44 * MM };
  constructor(paper = false) {
    this.paper = paper;
    this.c = document.createElement("canvas");
    this.c.width = SW; this.c.height = SH;
    this.g = this.c.getContext("2d")!;
    if (paper) { this.bg = "#f6f2e7"; this.ink = "#172334"; this.ink2 = "#3b4a5e"; this.faint = "rgba(23,35,52,0.10)"; this.accent = "#a4402a"; this.accent2 = "#1f6f8b"; this.warn = "#b2471f"; }
    else { this.bg = "#1f5c99"; this.ink = "#f2f8ff"; this.ink2 = "#c9def5"; this.faint = "rgba(255,255,255,0.075)"; this.accent = "#ffe08a"; this.accent2 = "#9ff3ff"; this.warn = "#ffb38a"; }
    this.tb.x = SW - FRAME - this.tb.w; this.tb.y = SH - FRAME - this.tb.h;
    const g = this.g;
    g.fillStyle = this.bg; g.fillRect(0, 0, SW, SH);
    if (!paper) {
      // subtle paper grain / vignette for the blueprint look
      const rg = g.createRadialGradient(SW / 2, SH / 2, SH * 0.2, SW / 2, SH / 2, SW * 0.75);
      rg.addColorStop(0, "rgba(255,255,255,0.035)"); rg.addColorStop(1, "rgba(0,0,30,0.18)");
      g.fillStyle = rg; g.fillRect(0, 0, SW, SH);
    }
    this.grid();
  }

  grid() {
    const g = this.g, x0 = FRAME, y0 = FRAME, x1 = SW - FRAME, y1 = SH - FRAME;
    const step = 5 * MM;
    g.save();
    g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
    for (let i = 0, x = x0; x <= x1; x += step, i++) { g.strokeStyle = i % 5 === 0 ? (this.paper ? "rgba(23,35,52,0.09)" : "rgba(255,255,255,0.12)") : this.faint; g.lineWidth = i % 5 === 0 ? 1.4 : 1; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); }
    for (let i = 0, y = y0; y <= y1; y += step, i++) { g.strokeStyle = i % 5 === 0 ? (this.paper ? "rgba(23,35,52,0.09)" : "rgba(255,255,255,0.12)") : this.faint; g.lineWidth = i % 5 === 0 ? 1.4 : 1; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); }
    g.restore();
  }

  font(o: TextOpts = {}) {
    const fam = o.font === "body" ? "'Inter Variable', Inter, sans-serif" : o.font === "mono" ? "ui-monospace, Menlo, monospace" : "'Barlow Condensed', sans-serif";
    return `${o.italic ? "italic " : ""}${o.weight ?? (o.font === "body" ? 450 : 700)} ${o.size ?? 22}px ${fam}`;
  }

  text(s: string, x: number, y: number, o: TextOpts = {}) {
    const g = this.g;
    g.save();
    g.font = this.font(o);
    g.fillStyle = o.color ?? this.ink;
    g.textAlign = o.align ?? "left";
    g.textBaseline = o.baseline ?? "alphabetic";
    if (o.spacing) (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${o.spacing}px`;
    g.fillText(s, x, y, o.maxWidth);
    g.restore();
  }

  measure(s: string, o: TextOpts = {}) { const g = this.g; g.save(); g.font = this.font(o); if (o.spacing) (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${o.spacing}px`; const w = g.measureText(s).width; g.restore(); return w; }

  /** Wrapped paragraph; returns the y after the last line. */
  para(s: string, x: number, y: number, maxW: number, o: TextOpts & { lineH?: number } = {}): number {
    const words = s.split(/\s+/);
    const lh = o.lineH ?? (o.size ?? 20) * 1.38;
    let line = "";
    for (const w of words) {
      const t = line ? line + " " + w : w;
      if (this.measure(t, o) > maxW && line) { this.text(line, x, y, o); y += lh; line = w; }
      else line = t;
    }
    if (line) { this.text(line, x, y, o); y += lh; }
    return y;
  }

  line(x0: number, y0: number, x1: number, y1: number, color = this.ink, w = 2, dash?: number[]) {
    const g = this.g;
    g.save(); g.strokeStyle = color; g.lineWidth = w; if (dash) g.setLineDash(dash);
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.restore();
  }
  rect(x: number, y: number, w: number, h: number, stroke = this.ink, lw = 2, fill?: string) {
    const g = this.g;
    g.save(); if (fill) { g.fillStyle = fill; g.fillRect(x, y, w, h); }
    g.strokeStyle = stroke; g.lineWidth = lw; g.strokeRect(x, y, w, h); g.restore();
  }

  arrowHead(x: number, y: number, ang: number, size = 14, color = this.ink) {
    const g = this.g;
    g.save(); g.translate(x, y); g.rotate(ang); g.fillStyle = color;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(-size, -size * 0.32); g.lineTo(-size, size * 0.32); g.closePath(); g.fill(); g.restore();
  }

  /** Horizontal dimension between x0 and x1 at height y; extension lines from `from` (object edge) toward y. */
  dimH(x0: number, x1: number, y: number, label: string, from?: number, color = this.ink) {
    const ext = 10;
    if (from !== undefined) { const d = y > from ? 1 : -1; this.line(x0, from + d * 6, x0, y + d * ext, color, 1.3); this.line(x1, from + d * 6, x1, y + d * ext, color, 1.3); }
    this.line(x0, y, x1, y, color, 1.4);
    this.arrowHead(x0, y, Math.PI, 13, color); this.arrowHead(x1, y, 0, 13, color);
    const w = this.measure(label, { size: 21, weight: 700 }) + 14;
    const cx = (x0 + x1) / 2;
    if (w < x1 - x0 - 30) { this.g.fillStyle = this.bg; this.g.fillRect(cx - w / 2, y - 13, w, 26); this.text(label, cx, y + 7, { size: 21, weight: 700, align: "center", color }); }
    else this.text(label, cx, y - 10, { size: 21, weight: 700, align: "center", color });
  }
  /** Vertical dimension between y0 and y1 at x. */
  dimV(y0: number, y1: number, x: number, label: string, from?: number, color = this.ink) {
    const ext = 10;
    if (from !== undefined) { const d = x > from ? 1 : -1; this.line(from + d * 6, y0, x + d * ext, y0, color, 1.3); this.line(from + d * 6, y1, x + d * ext, y1, color, 1.3); }
    this.line(x, y0, x, y1, color, 1.4);
    this.arrowHead(x, Math.min(y0, y1), -Math.PI / 2, 13, color); this.arrowHead(x, Math.max(y0, y1), Math.PI / 2, 13, color);
    const g = this.g;
    g.save(); g.translate(x, (y0 + y1) / 2); g.rotate(-Math.PI / 2);
    const w = this.measure(label, { size: 21, weight: 700 }) + 14;
    if (w < Math.abs(y1 - y0) - 30) { g.fillStyle = this.bg; g.fillRect(-w / 2, -13, w, 26); this.text(label, 0, 7, { size: 21, weight: 700, align: "center", color }); }
    else this.text(label, 0, -10, { size: 21, weight: 700, align: "center", color });
    g.restore();
  }

  /** View caption: bold title + scale line, centred under (or above) a view. */
  caption(cx: number, y: number, title: string, sub?: string) {
    this.text(title, cx, y, { size: 26, weight: 800, align: "center", spacing: 2 });
    const w = this.measure(title, { size: 26, weight: 800, spacing: 2 });
    this.line(cx - w / 2, y + 7, cx + w / 2, y + 7, this.ink, 2);
    if (sub) this.text(sub, cx, y + 34, { size: 19, weight: 600, align: "center", color: this.ink2, spacing: 1 });
  }

  /** Callout with leader line from (x0,y0) to a label at (x1,y1). */
  callout(x0: number, y0: number, x1: number, y1: number, label: string, color = this.ink, align: Align = "left") {
    this.line(x0, y0, x1, y1, color, 1.5);
    this.g.save(); this.g.fillStyle = color; this.g.beginPath(); this.g.arc(x0, y0, 4.5, 0, Math.PI * 2); this.g.fill(); this.g.restore();
    const tx = align === "left" ? x1 + 8 : align === "right" ? x1 - 8 : x1;
    this.line(x1, y1, align === "left" ? x1 + 4 : x1 - 4, y1, color, 1.5);
    this.text(label, tx, y1 + 7, { size: 20, weight: 700, align, color });
  }

  image(img: CanvasImageSource, x: number, y: number, w?: number, h?: number) { if (w !== undefined && h !== undefined) this.g.drawImage(img, x, y, w, h); else this.g.drawImage(img, x, y); }

  /** Table with optional header row; returns the bottom y. */
  table(x: number, y: number, cols: number[], rows: string[][], o: { head?: string[]; size?: number; rowH?: number; zebra?: boolean; title?: string; colAlign?: Align[] } = {}): number {
    const size = o.size ?? 19, rh = o.rowH ?? Math.round(size * 1.65);
    const W = cols.reduce((a, b) => a + b, 0);
    let yy = y;
    if (o.title) { this.text(o.title, x, yy + size, { size: size + 3, weight: 800, spacing: 2 }); yy += size + 16; }
    const drawRow = (cells: string[], head: boolean) => {
      if (head) { this.g.fillStyle = this.paper ? "rgba(23,35,52,0.10)" : "rgba(255,255,255,0.12)"; this.g.fillRect(x, yy, W, rh); }
      let cx = x;
      cells.forEach((cell, i) => {
        const al = o.colAlign?.[i] ?? "left";
        const tx = al === "right" ? cx + cols[i] - 8 : al === "center" ? cx + cols[i] / 2 : cx + 8;
        this.text(cell, tx, yy + rh / 2 + size * 0.36, { size, weight: head ? 800 : 500, font: head ? "head" : "body", align: al, color: head ? this.ink : this.ink, spacing: head ? 1 : 0, maxWidth: cols[i] - 12 });
        cx += cols[i];
      });
      this.line(x, yy + rh, x + W, yy + rh, this.paper ? "rgba(23,35,52,0.25)" : "rgba(255,255,255,0.28)", 1);
      yy += rh;
    };
    const top = yy;
    if (o.head) drawRow(o.head, true);
    for (const r of rows) drawRow(r, false);
    this.rect(x, top, W, yy - top, this.ink, 1.6);
    let cx = x;
    for (let i = 0; i < cols.length - 1; i++) { cx += cols[i]; this.line(cx, top, cx, yy, this.paper ? "rgba(23,35,52,0.25)" : "rgba(255,255,255,0.28)", 1); }
    return yy;
  }

  /** Third-angle projection symbol (truncated cone in two views). */
  projSymbol(x: number, y: number, s = 1) {
    const g = this.g;
    g.save(); g.translate(x, y); g.scale(s, s); g.strokeStyle = this.ink; g.lineWidth = 2;
    // side view of the cone (trapezoid), then end view (two circles) to its right = third angle
    g.beginPath(); g.moveTo(0, -14); g.lineTo(46, -24); g.lineTo(46, 24); g.lineTo(0, 14); g.closePath(); g.stroke();
    g.beginPath(); g.arc(90, 0, 24, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(90, 0, 14, 0, Math.PI * 2); g.stroke();
    g.setLineDash([8, 4, 2, 4]); g.lineWidth = 1;
    g.beginPath(); g.moveTo(-8, 0); g.lineTo(124, 0); g.moveTo(90, -30); g.lineTo(90, 30); g.stroke();
    g.restore();
  }

  private meta: SheetMeta | null = null;
  /** Register the sheet metadata; the frame and title block are drawn by finish() so they can show the final scale. */
  frame(m: SheetMeta) { this.meta = m; }
  finish() { if (this.meta) this.drawFrame(this.meta); return this; }

  /** Zoned frame + title block. */
  drawFrame(m: SheetMeta) {
    const g = this.g, x0 = FRAME, y0 = FRAME, x1 = SW - FRAME, y1 = SH - FRAME;
    this.rect(x0, y0, x1 - x0, y1 - y0, this.ink, 4);
    this.rect(x0 - 12, y0 - 12, x1 - x0 + 24, y1 - y0 + 24, this.ink, 1.2);
    // zone marks: 8 columns, 6 rows
    const cols = 8, rows = 6;
    for (let i = 0; i <= cols; i++) {
      const x = x0 + (x1 - x0) * i / cols;
      if (i > 0 && i < cols) { this.line(x, y0 - 12, x, y0, this.ink, 1.5); this.line(x, y1, x, y1 + 12, this.ink, 1.5); }
      if (i < cols) { const cx = x0 + (x1 - x0) * (i + 0.5) / cols; this.text(String(i + 1), cx, y0 - 16, { size: 16, weight: 700, align: "center", color: this.ink2 }); this.text(String(i + 1), cx, y1 + 30, { size: 16, weight: 700, align: "center", color: this.ink2 }); }
    }
    for (let j = 0; j <= rows; j++) {
      const y = y0 + (y1 - y0) * j / rows;
      if (j > 0 && j < rows) { this.line(x0 - 12, y, x0, y, this.ink, 1.5); this.line(x1, y, x1 + 12, y, this.ink, 1.5); }
      if (j < rows) { const cy = y0 + (y1 - y0) * (j + 0.5) / rows; const L = String.fromCharCode(65 + j); this.text(L, x0 - 30, cy + 6, { size: 16, weight: 700, align: "center", color: this.ink2 }); this.text(L, x1 + 30, cy + 6, { size: 16, weight: 700, align: "center", color: this.ink2 }); }
    }
    // title block
    const t = this.tb;
    g.save(); g.fillStyle = this.paper ? "rgba(246,242,231,0.96)" : "rgba(22,74,128,0.96)"; g.fillRect(t.x, t.y, t.w, t.h); g.restore();
    this.rect(t.x, t.y, t.w, t.h, this.ink, 3);
    const c1 = t.x + t.w * 0.64, c2 = t.x + t.w * 0.82;
    const r1 = t.y + t.h * 0.30, r2 = t.y + t.h * 0.58, r3 = t.y + t.h * 0.79;
    this.line(t.x, r1, t.x + t.w, r1, this.ink, 1.5);
    this.line(t.x, r2, t.x + t.w, r2, this.ink, 1.5);
    this.line(t.x, r3, t.x + t.w, r3, this.ink, 1.5);
    this.line(c1, r1, c1, t.y + t.h, this.ink, 1.5);
    this.line(c2, r1, c2, t.y + t.h, this.ink, 1.5);
    const lab = (s: string, x: number, y: number) => this.text(s, x + 10, y + 19, { size: 14, weight: 700, color: this.ink2, spacing: 2 });
    // header row: project
    this.text("WILDFRONT HORIZON 3D", t.x + 16, t.y + 34, { size: 32, weight: 900, spacing: 4 });
    this.text(`BLUEPRINT BOOK · ${m.section.toUpperCase()}`, t.x + 16, t.y + 62, { size: 16, weight: 700, color: this.ink2, spacing: 3 });
    this.text("FLEXZONIC GAMES", t.x + t.w - 16, t.y + 34, { size: 22, weight: 800, align: "right", spacing: 3 });
    this.text("hunt.flexzonicgames.com", t.x + t.w - 16, t.y + 60, { size: 16, weight: 600, align: "right", color: this.ink2 });
    // title
    lab("TITLE", t.x, r1);
    this.text(m.title.toUpperCase(), t.x + 14, r2 - 14, { size: 38, weight: 900, spacing: 1, maxWidth: c1 - t.x - 28 });
    lab("DRAWING NO.", c1, r1); this.text(m.drawing, c1 + 14, r2 - 14, { size: 38, weight: 900, maxWidth: c2 - c1 - 24 });
    lab("REV", c2, r1); this.text(m.rev, c2 + 14, r2 - 14, { size: 38, weight: 900 });
    lab("DESCRIPTION", t.x, r2); this.text(m.subtitle ?? "", t.x + 14, r3 - 10, { size: 21, weight: 600, font: "body", maxWidth: c1 - t.x - 28 });
    lab("SCALE", c1, r2); this.text(m.scale, c1 + 14, r3 - 10, { size: 26, weight: 800 });
    lab("SHEET", c2, r2); this.text(`${m.sheetNo} / ${m.sheetCount}`, c2 + 14, r3 - 10, { size: 26, weight: 800 });
    this.text(`UNITS: METRES / MILLIMETRES · +Z FORWARD, +Y UP, +X SUBJECT'S LEFT · DATE ${m.date}`, t.x + 14, t.y + t.h - 14, { size: 15, weight: 700, color: this.ink2, spacing: 1 });
    this.projSymbol(c1 + 30, t.y + t.h - 26, 0.42);
    this.text("THIRD ANGLE", c1 + 90, t.y + t.h - 19, { size: 14, weight: 700, color: this.ink2, spacing: 1 });
    this.text("GENERATED FROM GAME DATA", c2 + 14, t.y + t.h - 14, { size: 13, weight: 700, color: this.ink2, spacing: 1 });
  }

  /** Simple line chart. series: [{label, color, pts:[x,y][]}] */
  chart(x: number, y: number, w: number, h: number, o: { xMax: number; yMin: number; yMax: number; xStep: number; yStep: number; xLabel: string; yLabel: string; series: { label: string; color: string; pts: [number, number][]; dash?: number[] }[]; yFmt?: (v: number) => string; xFmt?: (v: number) => string; title?: string }) {
    const g = this.g;
    const X = (v: number) => x + (v / o.xMax) * w, Y = (v: number) => y + h - ((v - o.yMin) / (o.yMax - o.yMin)) * h;
    if (o.title) this.text(o.title, x, y - 24, { size: 24, weight: 800, spacing: 2 });
    g.save();
    g.strokeStyle = this.paper ? "rgba(23,35,52,0.18)" : "rgba(255,255,255,0.2)"; g.lineWidth = 1;
    for (let v = 0; v <= o.xMax + 1e-6; v += o.xStep) { g.beginPath(); g.moveTo(X(v), y); g.lineTo(X(v), y + h); g.stroke(); this.text((o.xFmt ?? String)(v), X(v), y + h + 26, { size: 17, weight: 600, align: "center", color: this.ink2 }); }
    for (let v = Math.ceil(o.yMin / o.yStep) * o.yStep; v <= o.yMax + 1e-6; v += o.yStep) { g.beginPath(); g.moveTo(x, Y(v)); g.lineTo(x + w, Y(v)); g.stroke(); this.text((o.yFmt ?? String)(v), x - 10, Y(v) + 6, { size: 17, weight: 600, align: "right", color: this.ink2 }); }
    g.restore();
    this.rect(x, y, w, h, this.ink, 2);
    this.text(o.xLabel, x + w / 2, y + h + 56, { size: 18, weight: 700, align: "center", spacing: 2 });
    g.save(); g.translate(x - 74, y + h / 2); g.rotate(-Math.PI / 2); this.text(o.yLabel, 0, 0, { size: 18, weight: 700, align: "center", spacing: 2 }); g.restore();
    o.series.forEach((s, i) => {
      g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
      g.strokeStyle = s.color; g.lineWidth = 3.5; if (s.dash) g.setLineDash(s.dash);
      g.beginPath(); s.pts.forEach(([a, b], k) => { if (k) g.lineTo(X(a), Y(b)); else g.moveTo(X(a), Y(b)); }); g.stroke(); g.restore();
      const ly = y + 30 + i * 30;
      this.line(x + w - 260, ly - 7, x + w - 214, ly - 7, s.color, 4, s.dash);
      this.text(s.label, x + w - 204, ly, { size: 18, weight: 700 });
    });
  }
}

/** A 1.8 m human silhouette for scale (feet at (x, y), px per metre). */
export function human(sh: Sheet, x: number, y: number, pxPerM: number) {
  const g = sh.g, s = pxPerM;
  g.save(); g.translate(x, y); g.fillStyle = sh.paper ? "rgba(23,35,52,0.55)" : "rgba(255,255,255,0.55)";
  g.beginPath(); g.arc(0, -1.68 * s, 0.11 * s, 0, Math.PI * 2); g.fill();
  g.beginPath();
  g.moveTo(-0.2 * s, -1.52 * s); g.lineTo(0.2 * s, -1.52 * s); g.lineTo(0.23 * s, -0.95 * s); g.lineTo(0.15 * s, -0.95 * s);
  g.lineTo(0.13 * s, 0); g.lineTo(0.03 * s, 0); g.lineTo(0, -0.85 * s); g.lineTo(-0.03 * s, 0); g.lineTo(-0.13 * s, 0);
  g.lineTo(-0.15 * s, -0.95 * s); g.lineTo(-0.23 * s, -0.95 * s); g.closePath(); g.fill();
  g.restore();
  sh.text("1.80 m", x, y + 28, { size: 16, weight: 700, align: "center", color: sh.ink2 });
}
