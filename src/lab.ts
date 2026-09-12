import type { Project, Result } from "./types";
export const Q = 1.602176634e-19,
  KB = 8.617333262e-5,
  EPS = 11.7 * 8.8541878128e-14;
export type LogoVariant = "delta" | "wedge" | "chibi";
export type PageId =
  | "home"
  | "project"
  | "structure"
  | "experiment"
  | "quantum"
  | "studies"
  | "data"
  | "results"
  | "learn"
  | "settings";
export interface Dataset {
  id: string;
  name: string;
  source: string;
  quantity: "current" | "capacitance" | "capacitance_density";
  unit: string;
  points: { x: number; y: number }[];
  headers: string[];
  skipped: number;
}
export interface Study {
  id: string;
  name: string;
  parameter: "bias" | "doping" | "cv";
  values: number[];
  device: Project;
}
export interface StudyCase {
  name: string;
  value: number;
  project: Project;
  result: Result;
}
export interface AnalysisConfig {
  dataset_id: string;
  min: number;
  max: number;
  temperature: number;
  richardson: number;
  mass: number;
  richardson_mode: "material" | "mass";
  known: "barrier" | "area";
  barrier: number;
  area: number;
  depletion_threshold: number;
  scale: "linear" | "log";
}
export interface WorkspaceProject {
  schema_version: 2;
  device: Project;
  datasets: Dataset[];
  studies: Study[];
  analysis: AnalysisConfig;
}
export const defaultAnalysis: AnalysisConfig = {
  dataset_id: "",
  min: 0.08,
  max: 0.25,
  temperature: 300,
  richardson: 112,
  mass: 1.08,
  richardson_mode: "material",
  known: "barrier",
  barrier: 0.6,
  area: 1e-4,
  depletion_threshold: 0.95,
  scale: "linear",
};
export interface FitResult {
  slope: number;
  intercept: number;
  r2: number;
  slope_se: number;
  intercept_se: number;
  count: number;
  residuals: { x: number; y: number }[];
}
export function regression(points: { x: number; y: number }[]): FitResult {
  if (points.length < 3) throw Error("Select at least three finite points.");
  const n = points.length,
    xm = points.reduce((s, p) => s + p.x, 0) / n,
    ym = points.reduce((s, p) => s + p.y, 0) / n;
  const xx = points.reduce((s, p) => s + (p.x - xm) ** 2, 0);
  if (xx <= 0) throw Error("The fit needs distinct voltage values.");
  const slope = points.reduce((s, p) => s + (p.x - xm) * (p.y - ym), 0) / xx,
    intercept = ym - slope * xm;
  const residuals = points.map((p) => ({
      x: p.x,
      y: p.y - (slope * p.x + intercept),
    })),
    sse = residuals.reduce((s, p) => s + p.y * p.y, 0),
    yy = points.reduce((s, p) => s + (p.y - ym) ** 2, 0),
    variance = sse / (n - 2);
  return {
    slope,
    intercept,
    r2: yy > 0 ? 1 - sse / yy : 1,
    slope_se: Math.sqrt(variance / xx),
    intercept_se: Math.sqrt(variance * (1 / n + (xm * xm) / xx)),
    count: n,
    residuals,
  };
}
export function parseTable(source: string) {
  const lines = source.replace(/\r/g, "").split("\n");
  const rows: number[][] = [];
  let headers: string[] = [];
  let skipped = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    if (/^\s*(#|\[|\/\/)/.test(line)) {
      skipped++;
      continue;
    }
    const cells = line.trim().split(/[,;\t ]+/);
    const values = cells.map(Number);
    if (cells.length >= 2 && values.every(Number.isFinite)) rows.push(values);
    else {
      if (!rows.length) headers = cells;
      skipped++;
    }
  }
  if (rows.length < 3)
    throw Error(
      "No numeric table found. Choose a text, CSV, or TSV file with at least three data rows.",
    );
  return {
    rows,
    headers,
    skipped,
    columns: rows.reduce((min, r) => Math.min(min, r.length), Infinity),
  };
}
export function suggestRange(data: Dataset): [number, number] {
  const all = data.points
    .filter((p) => p.x > 0 && p.y > 0)
    .sort((a, b) => a.x - b.x);
  const p = all.filter(
    (_, i) => i % Math.max(1, Math.ceil(all.length / 1200)) === 0,
  );
  if (data.quantity !== "current")
    return data.points.reduce<[number, number]>(
      (r, p) => [Math.min(r[0], p.x), Math.max(r[1], p.x)],
      [Infinity, -Infinity],
    );
  let best: [number, number] = [p[0]?.x ?? 0, p[p.length - 1]?.x ?? 1],
    score = -Infinity;
  for (let i = 0; i < p.length - 4; i++)
    for (let j = i + 4; j < Math.min(p.length, i + 40); j++) {
      const points = p
        .slice(i, j + 1)
        .map((p) => ({ x: p.x, y: Math.log(p.y) }));
      const fit = regression(points);
      const span = points.at(-1)!.y - points[0].y;
      if (fit.slope > 0 && span > 2 && fit.r2 > 0.99) {
        const s = span - 1000 * (1 - fit.r2);
        if (s > score) {
          score = s;
          best = [p[i].x, p[j].x];
        }
      }
    }
  return best;
}
export function analyze(data: Dataset, c: AnalysisConfig) {
  if (!(
    c.temperature > 0 &&
    c.richardson > 0 &&
    c.mass > 0 &&
    c.area > 0 &&
    c.barrier > 0 &&
    c.min < c.max
  ))
    throw Error(
      "Temperature, Richardson constant, mass, area, and barrier must be positive; choose an increasing fit interval.",
    );
  const selected = data.points.filter(
    (p) =>
      p.x >= c.min &&
      p.x <= c.max &&
      p.y > 0 &&
      (data.quantity !== "current" || p.x > 0),
  );
  if (data.quantity === "current" && selected.length < 5)
    throw Error(
      "Select at least five positive forward-current points. Sparse data may not contain a clean exponential region.",
    );
  const fit = regression(
    selected.map((p) => ({
      x: p.x,
      y: data.quantity === "current" ? Math.log(p.y) : 1 / (p.y * p.y),
    })),
  );
  const vt = KB * c.temperature,
    richardson = c.richardson_mode === "mass" ? 120.173 * c.mass : c.richardson;
  if (data.quantity === "current") {
    if (fit.slope <= 0)
      throw Error("The forward-current fit must have a positive slope.");
    const saturation = Math.exp(fit.intercept),
      ideality = 1 / (fit.slope * vt);
    const barrier =
      c.known === "area"
        ? vt * Math.log((c.area * richardson * c.temperature ** 2) / saturation)
        : c.barrier;
    const area =
      c.known === "barrier"
        ? (saturation * Math.exp(c.barrier / vt)) /
          (richardson * c.temperature ** 2)
        : c.area;
    if (![saturation, ideality, barrier, area].every(Number.isFinite))
      throw Error(
        "The fit overflows for these inputs. Check units, temperature, barrier, and selected range.",
      );
    return {
      fit,
      saturation,
      ideality,
      ideality_se: (ideality * fit.slope_se) / fit.slope,
      barrier,
      barrier_se: c.known === "area" ? vt * fit.intercept_se : null,
      area,
      area_se: c.known === "barrier" ? area * fit.intercept_se : null,
      doping: null,
      doping_se: null,
      intercept_v: null,
      built_in_v: null,
      richardson,
    };
  }
  if (fit.slope >= 0)
    throw Error(
      "Use metal voltage (forward positive): 1/C² must decrease with voltage in the depletion range.",
    );
  const area = data.quantity === "capacitance_density" ? 1 : c.area;
  const doping = -2 / (Q * EPS * area * area * fit.slope);
  return {
    fit,
    doping,
    doping_se: doping * Math.abs(fit.slope_se / fit.slope),
    intercept_v: -fit.intercept / fit.slope,
    built_in_v: -fit.intercept / fit.slope + vt,
    richardson,
    saturation: null,
    ideality: null,
    ideality_se: null,
    barrier: null,
    barrier_se: null,
    area: null,
    area_se: null,
  };
}
export function schottky(
  project: Project,
  result: Result | null,
  threshold = 0.95,
) {
  const l = project.layers[0],
    nd = l.donors_cm3 - l.acceptors_cm3,
    vt = KB * project.temperature_k;
  if (l.material !== "Si" || nd <= 0 || project.surface.kind !== "schottky")
    return null;
  const ecEf =
      vt * Math.log((2.8e19 * (project.temperature_k / 300) ** 1.5) / nd),
    builtIn = project.surface.barrier_ev - ecEf,
    drop = builtIn - project.surface.voltage_v + project.substrate.voltage_v;
  const width = drop > 0 ? Math.sqrt((2 * EPS * drop) / (Q * nd)) * 1e7 : 0,
    debye = Math.sqrt((EPS * vt) / (Q * nd)) * 1e7;
  let numerical: number | null = null,
    chargeWidth: number | null = null;
  if (result?.convergence.converged) {
    const i = result.position_nm.findIndex(
      (x, i) =>
        x < l.thickness_nm &&
        i + 3 < result.position_nm.length &&
        [0, 1, 2, 3].every(
          (k) =>
            result.electron_cm3[i + k] >= threshold * nd &&
            Math.abs(result.net_charge_cm3[i + k]) / nd <= 1 - threshold + 1e-9,
        ),
    );
    if (i >= 0) numerical = result.position_nm[i];
    let sum = 0;
    for (
      let j = 1;
      j < result.position_nm.length && result.position_nm[j] <= l.thickness_nm;
      j++
    )
      sum +=
        ((result.position_nm[j] - result.position_nm[j - 1]) *
          (result.net_charge_cm3[j] + result.net_charge_cm3[j - 1])) /
        2 /
        nd;
    chargeWidth = sum;
  }
  return { ecEf, builtIn, drop, width, debye, numerical, chargeWidth };
}
export function caseProject(study: Study, value: number): Project {
  const p = structuredClone(study.device);
  p.sweep.enabled = study.parameter === "cv";
  if (study.parameter === "bias") p.surface.voltage_v = value;
  else {
    p.layers[0].donors_cm3 = value;
    p.layers[0].acceptors_cm3 = 0;
    const ld = Math.sqrt((EPS * KB * p.temperature_k) / (Q * value)) * 1e7;
    p.mesh_spacing_nm = Math.max(0.1, Math.min(1, ld / 8));
  }
  if (study.parameter === "cv")
    p.sweep = { enabled: true, start_v: -0.5, stop_v: 0, step_v: 0.01 };
  return p;
}
export function deviceKey(project: Project) {
  return JSON.stringify({
    ...project,
    name: "",
    description: "",
    layers: project.layers.map((l) => ({ ...l, name: "" })),
  });
}
