import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { Project, Result } from "./types";
import {
  analyze,
  caseProject,
  defaultAnalysis,
  deviceKey,
  parseTable,
  schottky,
  suggestRange,
  type AnalysisConfig,
  type Dataset,
  type Study,
  type StudyCase,
} from "./lab";
import { queuedSolve } from "./solveQueue";
import { Select } from "./Select";
import { saveText, serializeFigure } from "./exports";
const Chart = lazy(() => import("./Chart"));
const fmt = (n: number | null | undefined) =>
  n == null
    ? "—"
    : Math.abs(n) >= 1e4 || Math.abs(n) < 0.001
      ? n.toExponential(4)
      : n.toPrecision(5);
export function Field({
  label,
  value,
  onChange,
  unit,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  unit?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="field">
      <span>
        {label} {unit && `(${unit})`}
      </span>
      <div>
        <input
          aria-label={label}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          onBlur={() => {
            const n = Number(draft);
            if (draft.trim() && Number.isFinite(n)) onChange(n);
            else setDraft(String(value));
          }}
        />
      </div>
    </label>
  );
}
export function SchottkyMetrics({
  project,
  result,
  threshold,
  onThreshold,
}: {
  project: Project;
  result: Result | null;
  threshold: number;
  onThreshold: (n: number) => void;
}) {
  const s = schottky(project, result, threshold);
  if (!s) return null;
  return (
    <section className="lab-card" data-tour-id="schottky-metrics">
      <h3>Schottky electrostatics</h3>
      <div className="metric-grid">
        {[
          ["Bulk Ec − EF (Boltzmann)", s.ecEf, "eV"],
          ["Built-in potential", s.builtIn, "V"],
          ["Semiconductor barrier", s.drop, "eV"],
          ["Depletion approximation", s.width, "nm"],
          ["Debye length", s.debye, "nm"],
          [`${Math.round(threshold * 100)}% recovery edge`, s.numerical, "nm"],
          ["Charge-equivalent width", s.chargeWidth, "nm"],
        ].map(([label, value, unit]) => (
          <div key={String(label)}>
            <span>{label}</span>
            <strong>
              {fmt(value as number | null)} <small>{unit}</small>
            </strong>
          </div>
        ))}
      </div>
      <p>
        {s.drop <= 0
          ? "At or beyond flat band: the depletion-width approximation is zero; negative charge-equivalent width indicates electron accumulation. "
          : ""}
        Analytic values use Si at {project.temperature_k} K and Boltzmann
        statistics. The recovery edge includes the diffuse Debye tail;
        charge-equivalent width is the integral of net charge divided by qNᴅ.
        These are different definitions of width.
      </p>
      <details>
        <summary>Edge threshold and model assumptions</summary>
        <Field
          label="Neutral carrier recovery"
          value={threshold}
          onChange={(n) => onThreshold(Math.max(0.5, Math.min(0.999, n)))}
        />
        <p>
          The edge requires four consecutive samples with n/Nᴅ ≥ {threshold} and
          |ρ|/(qNᴅ) ≤ {fmt(1 - threshold)}. A missing edge means the neutral
          tail is not resolved. Actual solve statistics:{" "}
          {project.carrier_statistics ?? "boltzmann"}. Depletion formulas cease
          to apply near flat band or accumulation.
        </p>
      </details>
    </section>
  );
}
export function StudiesPanel({
  project,
  studies,
  setStudies,
  cases,
  setCases,
  onAdopt,
  onAnalyze,
}: {
  project: Project;
  studies: Study[];
  setStudies: (s: Study[]) => void;
  cases: StudyCase[];
  setCases: (s: StudyCase[]) => void;
  onAdopt: (p: Project) => void;
  onAnalyze: (d: Dataset) => void;
}) {
  const [parameter, setParameter] = useState<Study["parameter"]>("bias"),
    [values, setValues] = useState("0, 0.2, 0.5, -0.2, -0.5"),
    [running, setRunning] = useState(false),
    [progress, setProgress] = useState(""),
    [error, setError] = useState(""),
    [kind, setKind] = useState("charge"),
    [hidden, setHidden] = useState<string[]>([]),
    [name, setName] = useState("Bias comparison");
  const [rangeStart, setRangeStart] = useState(-0.5),
    [rangeStop, setRangeStop] = useState(0.5),
    [rangeStep, setRangeStep] = useState(0.1);
  const cancel = useRef(false),
    cache = useRef(new Map<string, Result>()),
    lock = useRef(false);
  useEffect(
    () => () => {
      cancel.current = true;
    },
    [],
  );
  const run = async (study: Study) => {
    if (lock.current) return;
    lock.current = true;
    cancel.current = false;
    setRunning(true);
    setError("");
    setCases([]);
    setHidden([]);
    const completed: StudyCase[] = [];
    try {
      for (let i = 0; i < study.values.length; i++) {
        if (cancel.current) break;
        const value = study.values[i],
          p = caseProject(study, value);
        setProgress(`Case ${i + 1} of ${study.values.length}`);
        const key = deviceKey(p);
        let result = cache.current.get(key);
        if (!result) {
          result = await queuedSolve(p, "full", () => cancel.current);
          if (cache.current.size >= 24)
            cache.current.delete(cache.current.keys().next().value!);
          cache.current.set(key, result);
        }
        if (cancel.current) break;
        completed.push({
          name: `${value} ${study.parameter === "bias" ? "V" : "cm⁻³"}`,
          value,
          project: p,
          result,
        });
        setCases([...completed]);
      }
      setProgress(
        cancel.current
          ? "Cancelled · completed cases retained"
          : "Study complete",
      );
    } catch (e) {
      setError(String(e));
    } finally {
      lock.current = false;
      setRunning(false);
    }
  };
  const create = () => {
    const nums = values
      .split(/[ ,;]+/)
      .filter(Boolean)
      .map(Number);
    if (
      !nums.length ||
      nums.length > 24 ||
      nums.some((n) => !Number.isFinite(n) || (parameter !== "bias" && n <= 0))
    ) {
      setError("Enter 1–24 finite values; doping must be positive.");
      return;
    }
    const s = {
      id: crypto.randomUUID(),
      name,
      parameter,
      values: nums,
      device: structuredClone(project),
    };
    setStudies([...studies, s]);
    void run(s);
  };
  const curves = cases
    .filter((c) => !hidden.includes(c.name))
    .map((c) => ({
      name: c.name + (c.result.convergence.converged ? "" : " · diagnostic"),
      points:
        kind === "cv" || kind === "inverse"
          ? c.result.sweep.map((p) => ({
              x: p.voltage_v,
              y:
                p.capacitance_f_m2 != null && p.capacitance_f_m2 > 0
                  ? kind === "inverse"
                    ? 1 / (p.capacitance_f_m2 / 1e4) ** 2
                    : p.capacitance_f_m2 / 1e4
                  : null,
            }))
          : c.result.position_nm.map((x, i) => ({
              x,
              y:
                kind === "charge"
                  ? c.result.charge_density_c_cm3[i]
                  : kind === "field"
                    ? c.result.electric_field_v_cm[i]
                    : kind === "bands"
                      ? c.result.conduction_band_ev[i]
                      : c.result.potential_v[i],
            })),
    }));
  const exportStudy = async () => {
    try {
      if (!cases.length) throw Error("Run a study first.");
      const rows = [
        "case,position_nm,potential_v,field_v_cm,charge_c_cm3,Ec_eV,Ev_eV,converged",
      ];
      for (const c of cases)
        for (let i = 0; i < c.result.position_nm.length; i++)
          rows.push(
            [
              JSON.stringify(c.name),
              c.result.position_nm[i],
              c.result.potential_v[i],
              c.result.electric_field_v_cm[i],
              c.result.charge_density_c_cm3[i],
              c.result.conduction_band_ev[i],
              c.result.valence_band_ev[i],
              c.result.convergence.converged,
            ].join(","),
          );
      await saveText("study_profiles.csv", rows.join("\n"), "text/csv");
      const sweeps = [
        "case,voltage_v,metal_charge_C_m2,capacitance_F_m2,current_A_m2",
      ];
      for (const c of cases)
        for (const p of c.result.sweep)
          sweeps.push(
            [
              JSON.stringify(c.name),
              p.voltage_v,
              p.charge_c_m2,
              p.capacitance_f_m2 ?? "",
              p.current_a_m2 ?? "",
            ].join(","),
          );
      if (sweeps.length > 1)
        await saveText("study_sweeps.csv", sweeps.join("\n"), "text/csv");
    } catch (e) {
      setError(String(e));
    }
  };
  return (
    <div className="lab-page" data-tour-id="studies">
      <header>
        <small>COMPARE & EXPLORE</small>
        <h2>Studies</h2>
        <p>
          Keep the device fixed while changing bias or donor density. Each case
          retains its own inputs and convergence result.
        </p>
      </header>
      <div className="lab-card">
        <div className="inline-actions">
          <button
            onClick={() => {
              setParameter("bias");
              setValues("0, 0.2, 0.5, -0.2, -0.5");
              setName("Lab 2.4 · bias");
            }}
          >
            Lab bias cases
          </button>
          <button
            onClick={() => {
              setParameter("doping");
              setValues("1e16, 1e17, 1e18, 1e19");
              setName("Lab 2.4 · doping");
            }}
          >
            Lab doping cases
          </button>
          <button
            onClick={() => {
              setParameter("cv");
              setValues("1e16, 1e18");
              setName("Lab 2.4 · C–V");
              setKind("cv");
            }}
          >
            Lab C–V cases
          </button>
        </div>
        <label className="field">
          <span>Study name</span>
          <div>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </label>
        <label className="field">
          <span>Parameter</span>
          <Select
            aria-label="Study parameter"
            value={parameter}
            onChange={(e) => setParameter(e.target.value as Study["parameter"])}
          >
            <option value="bias">Surface bias (V)</option>
            <option value="doping">First-layer donors (cm⁻³)</option>
            <option value="cv">C–V by donor density</option>
          </Select>
        </label>
        <label className="field">
          <span>Values, separated by commas</span>
          <div>
            <input
              aria-label="Study values"
              value={values}
              onChange={(e) => setValues(e.target.value)}
            />
          </div>
        </label>
        <details>
          <summary>Generate values from a range</summary>
          <div className="form-grid">
            <Field
              label="Range start"
              value={rangeStart}
              onChange={setRangeStart}
            />
            <Field
              label="Range stop"
              value={rangeStop}
              onChange={setRangeStop}
            />
            <Field
              label="Range step"
              value={rangeStep}
              onChange={setRangeStep}
            />
          </div>
          <button
            onClick={() => {
              const count =
                Math.floor((rangeStop - rangeStart) / rangeStep + 1e-9) + 1;
              if (!Number.isFinite(count) || count < 1 || count > 24) {
                setError(
                  "Choose a range with 1–24 points and a matching nonzero step.",
                );
                return;
              }
              setValues(
                Array.from({ length: count }, (_, i) =>
                  Number((rangeStart + i * rangeStep).toPrecision(12)),
                ).join(", "),
              );
            }}
          >
            Use range
          </button>
        </details>
        <div className="inline-actions">
          <button
            className="primary"
            data-tour-id="run-study"
            disabled={running}
            onClick={create}
          >
            Save and run study
          </button>
          {running && (
            <button
              onClick={() => {
                cancel.current = true;
              }}
            >
              Cancel after current case
            </button>
          )}
          <span role="status">{progress}</span>
        </div>
        <details>
          <summary>Saved studies ({studies.length})</summary>
          {studies.map((s) => (
            <div className="saved-study" key={s.id}>
              <span>{s.name}</span>
              <button disabled={running} onClick={() => void run(s)}>
                Run saved inputs
              </button>
              <button
                disabled={running}
                onClick={() => setStudies(studies.filter((x) => x.id !== s.id))}
              >
                Remove
              </button>
            </div>
          ))}
        </details>
      </div>
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      {cases.length > 0 && (
        <section className="lab-card">
          <div className="inline-actions">
            <Select
              aria-label="Study plot"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              {[
                ["charge", "Charge"],
                ["field", "Field"],
                ["bands", "Conduction band"],
                ["potential", "Potential"],
                ["cv", "C–V"],
                ["inverse", "1/C²–V"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
            <button onClick={() => void exportStudy()}>
              Export all case data
            </button>
            <button
              onClick={() =>
                void exportChart().catch((e) => setError(String(e)))
              }
            >
              Export figure
            </button>
          </div>
          <Suspense fallback={<p>Loading plot…</p>}>
            <Chart
              curves={
                kind === "bands"
                  ? [
                      ...curves,
                      ...cases
                        .filter((c) => !hidden.includes(c.name))
                        .map((c) => ({
                          name: c.name + " · Ev",
                          dashed: true,
                          points: c.result.position_nm.map((x, i) => ({
                            x,
                            y: c.result.valence_band_ev[i],
                          })),
                        })),
                    ]
                  : curves
              }
              xLabel={
                kind === "cv" || kind === "inverse"
                  ? "Metal voltage (V)"
                  : "Position (nm)"
              }
              yLabel={
                {
                  charge: "Charge (C/cm³)",
                  field: "Field (V/cm)",
                  bands: "Energy (eV)",
                  potential: "Potential (V)",
                  cv: "C/A (F/cm²)",
                  inverse: "1/(C/A)² (cm⁴/F²)",
                }[kind]!
              }
            />
          </Suspense>
          {cases.map((c) => (
            <div className="saved-study" key={c.name}>
              <label>
                <input
                  type="checkbox"
                  checked={!hidden.includes(c.name)}
                  onChange={(e) =>
                    setHidden(
                      e.target.checked
                        ? hidden.filter((n) => n !== c.name)
                        : [...hidden, c.name],
                    )
                  }
                />{" "}
                {c.name}
              </label>
              <span>
                {c.result.convergence.converged ? "Converged" : "Not converged"}
              </span>
              <button onClick={() => onAdopt(c.project)}>Inspect device</button>
              {c.result.sweep.some((p) => p.capacitance_f_m2 != null) && (
                <button
                  onClick={() =>
                    onAnalyze({
                      id: crypto.randomUUID(),
                      name: `C–V · ${c.name}`,
                      source: "Requin simulated terminal capacitance",
                      quantity: "capacitance_density",
                      unit: "F/cm²",
                      headers: ["Voltage_V", "Capacitance_F_cm2"],
                      skipped: 0,
                      points: c.result.sweep
                        .filter(
                          (p) =>
                            p.capacitance_f_m2 != null &&
                            p.capacitance_f_m2 > 0,
                        )
                        .map((p) => ({
                          x: p.voltage_v,
                          y: p.capacitance_f_m2! / 1e4,
                        })),
                    })
                  }
                >
                  Fit 1/C²
                </button>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
async function exportChart() {
  const node = document.querySelector<SVGSVGElement>(
    ".analysis-chart .recharts-surface",
  );
  if (!node) throw Error("No figure available");
  await saveText("analysis.svg", serializeFigure(node), "image/svg+xml");
}
export function DataPanel({
  datasets,
  setDatasets,
  config,
  setConfig,
  sample,
}: {
  datasets: Dataset[];
  setDatasets: (d: Dataset[]) => void;
  config: AnalysisConfig;
  setConfig: (c: AnalysisConfig) => void;
  sample: string;
}) {
  const [pending, setPending] = useState<ReturnType<typeof parseTable> | null>(
      null,
    ),
    [filename, setFilename] = useState(""),
    [xcol, setXcol] = useState(0),
    [ycol, setYcol] = useState(1),
    [unit, setUnit] = useState(""),
    [xunit, setXunit] = useState("V"),
    [kind, setKind] = useState<Dataset["quantity"]>("current"),
    [error, setError] = useState(""),
    [view, setView] = useState("raw");
  const [rawOpen, setRawOpen] = useState(false);
  const [residualsOpen, setResidualsOpen] = useState(false);
  const patch = (p: Partial<AnalysisConfig>) => setConfig({ ...config, ...p });
  const preview = (source: string, name: string) => {
    try {
      setPending(parseTable(source));
      setFilename(name);
      setUnit("");
      setXcol(0);
      setYcol(1);
      setError("");
    } catch (e) {
      setError(String(e));
    }
  };
  const data = datasets.find((d) => d.id === config.dataset_id) ?? datasets[0];
  let calculation: ReturnType<typeof analyze> | null = null,
    fitError = "";
  if (data) {
    try {
      calculation = analyze(data, config);
    } catch (e) {
      fitError = String(e);
    }
  }
  const commit = () => {
    if (!pending || !unit) {
      setError("Confirm the measurement units before importing.");
      return;
    }
    const factors: Record<string, number> = {
      A: 1,
      mA: 1e-3,
      µA: 1e-6,
      F: 1,
      nF: 1e-9,
      pF: 1e-12,
      "F/cm²": 1,
      "µF/cm²": 1e-6,
    };
    const d: Dataset = {
      id: crypto.randomUUID(),
      name: filename,
      source: filename,
      quantity: kind,
      unit: kind === "current" ? "A" : kind === "capacitance" ? "F" : "F/cm²",
      headers: pending.headers,
      skipped: pending.skipped,
      points: pending.rows.map((r) => ({
        x: r[xcol] * (xunit === "mV" ? 0.001 : 1),
        y: r[ycol] * factors[unit],
      })),
    };
    const range = suggestRange(d);
    setDatasets([...datasets, d]);
    patch({ dataset_id: d.id, min: range[0], max: range[1] });
    setPending(null);
    setError("");
  };
  const graphPoints =
    data?.points.map((p) => ({
      x: p.x,
      y: view === "inverse" ? (p.y > 0 ? 1 / (p.y * p.y) : null) : p.y,
    })) ?? [];
  const curves = [
    { name: data?.name ?? "Data", points: graphPoints },
    ...(calculation && view !== "inverse" && data?.quantity === "current"
      ? [
          {
            name: "Exponential fit",
            dashed: true,
            points: Array.from({ length: 100 }, (_, i) => {
              const x = config.min + ((config.max - config.min) * i) / 99;
              return {
                x,
                y: Math.exp(
                  calculation!.fit.intercept + calculation!.fit.slope * x,
                ),
              };
            }),
          },
        ]
      : []),
    ...(calculation && view === "inverse" && data?.quantity !== "current"
      ? [
          {
            name: "Linear fit",
            dashed: true,
            points: [config.min, config.max].map((x) => ({
              x,
              y: calculation!.fit.intercept + calculation!.fit.slope * x,
            })),
          },
        ]
      : []),
  ];
  const exp = async () => {
    try {
      if (!data) return;
      const rows = [
        "voltage_V,value_" + data.unit,
        ...data.points.map((p) => `${p.x},${p.y}`),
      ];
      await saveText(`${data.name}_data.csv`, rows.join("\n"), "text/csv");
      if (calculation) {
        const output = [
          "parameter,value",
          ...Object.entries(calculation)
            .filter(([k]) => k !== "fit")
            .map(([k, v]) => `${k},${v ?? ""}`),
          ...Object.entries(calculation.fit)
            .filter(([k]) => k !== "residuals")
            .map(([k, v]) => `${k},${v}`),
          `fit_min_V,${config.min}`,
          `fit_max_V,${config.max}`,
          `temperature_K,${config.temperature}`,
          `known_input,${config.known}`,
        ];
        await saveText("fit_parameters.csv", output.join("\n"), "text/csv");
      }
    } catch (e) {
      setError(String(e));
    }
  };
  return (
    <div className="lab-page" data-tour-id="data">
      <header>
        <small>MEASUREMENTS & EXTRACTION</small>
        <h2>Data analysis</h2>
        <p>
          Import measurements, inspect the fit region, and calculate physical
          parameters with visible assumptions.
        </p>
      </header>
      <section className="lab-card" data-tour-id="import-data">
        <div className="inline-actions">
          <label className="file-button">
            Import CSV / TSV / text
            <input
              type="file"
              accept=".csv,.tsv,.txt"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) preview(await f.text(), f.name);
              }}
            />
          </label>
          <button onClick={() => preview(sample, "Schottky practice sweep")}>
            Load practice measurement
          </button>
        </div>
        {pending && (
          <>
            <h3>Confirm columns and units</h3>
            <p>
              {pending.rows.length} numeric rows · {pending.skipped} header or
              nonnumeric rows skipped. Raw order and duplicate points will be
              preserved.
            </p>
            <div className="form-grid">
              <label className="field">
                <span>Voltage column</span>
                <Select
                  aria-label="Voltage column"
                  value={xcol}
                  onChange={(e) => setXcol(Number(e.target.value))}
                >
                  {Array.from({ length: pending.columns }, (_, i) => (
                    <option
                      key={i}
                      value={i}
                    >{`Column ${i + 1} · ${pending.headers[i] ?? ""}`}</option>
                  ))}
                </Select>
              </label>
              <label className="field">
                <span>Measurement column</span>
                <Select
                  aria-label="Measurement column"
                  value={ycol}
                  onChange={(e) => setYcol(Number(e.target.value))}
                >
                  {Array.from({ length: pending.columns }, (_, i) => (
                    <option
                      key={i}
                      value={i}
                    >{`Column ${i + 1} · ${pending.headers[i] ?? ""}`}</option>
                  ))}
                </Select>
              </label>
              <label className="field">
                <span>Quantity</span>
                <Select
                  value={kind}
                  aria-label="Measured quantity"
                  onChange={(e) => {
                    setKind(e.target.value as Dataset["quantity"]);
                    setUnit("");
                  }}
                >
                  <option value="current">Current</option>
                  <option value="capacitance">Capacitance</option>
                  <option value="capacitance_density">
                    Capacitance per area
                  </option>
                </Select>
              </label>
              <label className="field">
                <span>Voltage unit</span>
                <Select
                  value={xunit}
                  aria-label="Voltage unit"
                  onChange={(e) => setXunit(e.target.value)}
                >
                  <option>V</option>
                  <option>mV</option>
                </Select>
              </label>
              <label className="field">
                <span>Measurement unit (required)</span>
                <Select
                  aria-label="Measurement unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                >
                  <option value="" disabled>
                    Choose unit…
                  </option>
                  {(kind === "current"
                    ? ["A", "mA", "µA"]
                    : kind === "capacitance"
                      ? ["F", "nF", "pF"]
                      : ["F/cm²", "µF/cm²"]
                  ).map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </Select>
              </label>
            </div>
            <pre>
              {pending.rows
                .slice(0, 5)
                .map((r) => r.join("   "))
                .join("\n")}
            </pre>
            <div className="inline-actions">
              <button onClick={commit}>Import confirmed data</button>
              <button onClick={() => setPending(null)}>Cancel</button>
            </div>
          </>
        )}
      </section>
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      {data && (
        <>
          <section className="lab-card">
            <div className="inline-actions">
              <Select
                aria-label="Dataset"
                value={data.id}
                onChange={(e) => {
                  const d = datasets.find((d) => d.id === e.target.value)!;
                  const [min, max] = suggestRange(d);
                  patch({ dataset_id: d.id, min, max });
                  setView("raw");
                }}
              >
                {datasets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
              <button
                onClick={() => {
                  setDatasets(datasets.filter((d) => d.id !== data.id));
                }}
              >
                Remove dataset
              </button>
              <button onClick={() => void exp()}>Export data and fit</button>
              <button
                onClick={() =>
                  void exportChart().catch((e) => setError(String(e)))
                }
              >
                Export figure
              </button>
            </div>
            <div className="inline-actions">
              <button
                className={config.scale === "linear" ? "active" : ""}
                onClick={() => patch({ scale: "linear" })}
              >
                Linear
              </button>
              <button
                className={config.scale === "log" ? "active" : ""}
                onClick={() => patch({ scale: "log" })}
              >
                Log (positive values)
              </button>
              {data.quantity !== "current" && (
                <button
                  onClick={() =>
                    setView(view === "inverse" ? "raw" : "inverse")
                  }
                >
                  {view === "inverse" ? "Show C–V" : "Show 1/C²–V"}
                </button>
              )}
            </div>
            <Suspense fallback={<p>Loading plot…</p>}>
              <Chart
                curves={curves}
                log={config.scale === "log"}
                yLabel={
                  view === "inverse"
                    ? `1/value² (${data.unit}⁻²)`
                    : `${data.quantity === "current" ? "Current" : "Capacitance"} (${data.unit})`
                }
                range={[config.min, config.max]}
                onRange={([min, max]) => patch({ min, max })}
              />
            </Suspense>
            <p>
              {data.points.length} samples · Log plots omit{" "}
              {data.points.filter((p) => p.y <= 0).length} nonpositive values.
              Fitting uses original points; the display may be sampled for
              performance. Drag across the graph or enter bounds below.
            </p>
          </section>
          <section className="lab-card" data-tour-id="fit">
            <h3>
              {data.quantity === "current"
                ? "Thermionic-emission fit"
                : "Doping from capacitance"}
            </h3>
            <div className="form-grid">
              <Field
                label="Fit minimum voltage"
                value={config.min}
                onChange={(min) => patch({ min })}
                unit="V"
              />
              <Field
                label="Fit maximum voltage"
                value={config.max}
                onChange={(max) => patch({ max })}
                unit="V"
              />
              <Field
                label="Measurement temperature"
                value={config.temperature}
                onChange={(temperature) => patch({ temperature })}
                unit="K"
              />
              {data.quantity === "current" ? (
                <>
                  <label className="field">
                    <span>Independent known input</span>
                    <Select
                      aria-label="Known input"
                      value={config.known}
                      onChange={(e) =>
                        patch({ known: e.target.value as "barrier" | "area" })
                      }
                    >
                      <option value="barrier">
                        Known barrier → calculate area
                      </option>
                      <option value="area">
                        Known area → calculate barrier
                      </option>
                    </Select>
                  </label>
                  {config.known === "barrier" ? (
                    <Field
                      label="Known barrier"
                      value={config.barrier}
                      onChange={(barrier) => patch({ barrier })}
                      unit="eV"
                    />
                  ) : (
                    <Field
                      label="Known junction area"
                      value={config.area}
                      onChange={(area) => patch({ area })}
                      unit="cm²"
                    />
                  )}
                  <label className="field">
                    <span>Richardson constant</span>
                    <Select
                      aria-label="Richardson model"
                      value={config.richardson_mode}
                      onChange={(e) =>
                        patch({
                          richardson_mode: e.target.value as
                            "material" | "mass",
                        })
                      }
                    >
                      <option value="material">Material value</option>
                      <option value="mass">
                        Calculate from effective mass
                      </option>
                    </Select>
                  </label>
                  {config.richardson_mode === "mass" ? (
                    <Field
                      label="Emission effective mass"
                      value={config.mass}
                      onChange={(mass) => patch({ mass })}
                      unit="m₀"
                    />
                  ) : (
                    <Field
                      label="Richardson constant"
                      value={config.richardson}
                      onChange={(richardson) => patch({ richardson })}
                      unit="A cm⁻² K⁻²"
                    />
                  )}
                </>
              ) : (
                data.quantity === "capacitance" && (
                  <Field
                    label="Known junction area"
                    value={config.area}
                    onChange={(area) => patch({ area })}
                    unit="cm²"
                  />
                )
              )}
            </div>
            <button
              onClick={() => {
                const [min, max] = suggestRange(data);
                patch({ min, max });
              }}
            >
              Suggest fit range
            </button>
            {fitError && <p role="status">{fitError}</p>}
            {calculation && (
              <>
                <div className="metric-grid">
                  {Object.entries(calculation)
                    .filter(([k, v]) => k !== "fit" && v !== null)
                    .map(([k, v]) => (
                      <div key={k}>
                        <span>
                          {{
                            saturation: "Saturation current (A)",
                            ideality: "Ideality factor n",
                            ideality_se: "n · standard error",
                            barrier:
                              config.known === "barrier"
                                ? "Supplied barrier (eV)"
                                : "Calculated barrier (eV)",
                            barrier_se: "Barrier fit error (eV)",
                            area:
                              config.known === "area"
                                ? "Supplied area (cm²)"
                                : "Calculated area (cm²)",
                            area_se: "Area fit error (cm²)",
                            doping: "Doping (cm⁻³)",
                            doping_se: "Doping · fit standard error (cm⁻³)",
                            intercept_v: "Voltage-axis intercept (V)",
                            built_in_v:
                              "Built-in potential, intercept + kBT/q (V)",
                            richardson: "Richardson A** (A cm⁻² K⁻²)",
                          }[k] ?? k}
                        </span>
                        <strong>{fmt(v as number)}</strong>
                      </div>
                    ))}
                </div>
                <p>
                  Fit: {calculation.fit.count} points · R²{" "}
                  {fmt(calculation.fit.r2)} · slope {fmt(calculation.fit.slope)}{" "}
                  ± {fmt(calculation.fit.slope_se)} · intercept{" "}
                  {fmt(calculation.fit.intercept)} ±{" "}
                  {fmt(calculation.fit.intercept_se)} (one standard error).
                </p>
                {calculation.fit.r2 < 0.995 && (
                  <p className="warning">
                    The selected region has visible curvature. Review residuals
                    and try a narrower exponential/depletion region.
                  </p>
                )}
                <details
                  onToggle={(e) => setResidualsOpen(e.currentTarget.open)}
                >
                  <summary>Residuals and equations</summary>
                  {residualsOpen && (
                    <Suspense fallback={<p>Loading…</p>}>
                      <Chart
                        curves={[
                          {
                            name: "Fit residual",
                            points: calculation.fit.residuals,
                          },
                        ]}
                        yLabel={
                          data.quantity === "current"
                            ? "ln(I) residual"
                            : "1/C² residual"
                        }
                      />
                    </Suspense>
                  )}
                  <p>
                    {data.quantity === "current"
                      ? "ln I = V/(n kBT/q) + ln Is; Is = Area × A** × T² × exp(−φb/(kBT/q)). One I–V curve identifies n and Is, not area and barrier independently. Supply one to calculate the other. Low-voltage −1 effects and high-current series resistance can bias this fit."
                      : "1/C² = 2(Vbi − V − kBT/q)/(q ε ND Area²). The voltage intercept equals Vbi − kBT/q; add thermal voltage to infer Vbi. Assumes uniform silicon doping and depletion capacitance."}
                  </p>
                  <p>
                    Fit errors describe regression uncertainty only.
                    Temperature, area, effective mass, and model uncertainty are
                    separate. Emission mass is not necessarily the
                    density-of-states mass used in the electrostatic model.
                  </p>
                </details>
              </>
            )}
          </section>
          <details
            className="lab-card"
            onToggle={(e) => setRawOpen(e.currentTarget.open)}
          >
            <summary>Raw data table</summary>
            {rawOpen && (
              <div className="raw-table">
                <table>
                  <thead>
                    <tr>
                      <th>Voltage (V)</th>
                      <th>Value ({data.unit})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.points.slice(0, 1000).map((p, i) => (
                      <tr key={i}>
                        <td>{p.x}</td>
                        <td>{p.y}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data.points.length > 1000 && (
              <p>Showing first 1,000 rows. Export includes every row.</p>
            )}
          </details>
        </>
      )}
    </div>
  );
}
