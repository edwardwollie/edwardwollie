// Unit formatting for the HUD and menus (metric / imperial setting).

export type Units = "metric" | "imperial";

export const fmtDist = (m: number | null | undefined, u: Units, short = false): string => {
  if (m === null || m === undefined || !isFinite(m)) return "—";
  return u === "imperial" ? `${Math.round(m * 1.09361)}${short ? "" : " "}yd` : `${Math.round(m)}${short ? "" : " "}m`;
};
export const fmtLen = (m: number, u: Units): string => {
  if (u === "imperial") { const inch = m / 0.0254; const ft = Math.floor(inch / 12); const ins = Math.round(inch - ft * 12); return ft > 0 ? `${ft}′ ${ins}″` : `${ins}″`; }
  return m >= 1 ? `${m.toFixed(2)} m` : `${Math.round(m * 1000)} mm`;
};
export const fmtSpeed = (ms: number, u: Units): string => (u === "imperial" ? `${(ms * 2.23694).toFixed(1)} mph` : `${ms.toFixed(1)} m/s`);
/** one decimal, never "-0.0" */
export const fix1 = (v: number): string => { const s = v.toFixed(1); return s === "-0.0" ? "0.0" : s; };
export const fmtCm = (cm: number, u: Units): string => (u === "imperial" ? `${fix1(cm / 2.54)} in` : `${fix1(cm)} cm`);
export const fmtKg = (kg: number, u: Units): string => (u === "imperial" ? `${Math.round(kg * 2.20462)} lb` : `${Math.round(kg)} kg`);
export const fmtEnergy = (j: number, u: Units): string => (u === "imperial" ? `${Math.round(j * 0.737562).toLocaleString()} ft·lbf` : `${Math.round(j).toLocaleString()} J`);
export const fmtVel = (ms: number, u: Units): string => (u === "imperial" ? `${Math.round(ms * 3.28084).toLocaleString()} fps` : `${Math.round(ms)} m/s`);

/** Rewrites metric distances inside engine messages ("130m", "≈120 m") for imperial players. */
export function localizeMessage(text: string, u: Units): string {
  if (u === "metric") return text;
  return text.replace(/(\d+(?:\.\d+)?)\s?m\b(?!\/)/g, (_, v) => `${Math.round(Number(v) * 1.09361)} yd`);
}

export const fmtTime = (s: number): string => { const m = Math.floor(s / 60), r = Math.floor(s % 60); return `${m}:${String(r).padStart(2, "0")}`; };
export const fmtDate = (t: number): string => new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

export const RATING_LABEL: Record<string, string> = { none: "—", bronze: "BRONZE", silver: "SILVER", gold: "GOLD", diamond: "DIAMOND" };
export const RATING_COLOR: Record<string, string> = { none: "#86a6b7", bronze: "#d08a4e", silver: "#cfd8de", gold: "#ffd75a", diamond: "#9ff3ff" };
export const GRADE_COLOR: Record<string, string> = { perfect: "#ffd75a", great: "#caff47", good: "#53f3dc", graze: "#ff9c38", miss: "#ff9c38" };
