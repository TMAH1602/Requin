import {
  memo,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  createContext,
  useContext,
  type CSSProperties,
} from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  Activity,
  Atom,
  BookOpen,
  Download,
  FileUp,
  Layers3,
  Plus,
  Settings2,
  Trash2,
  Waves,
  RotateCw,
  X,
  Save,
} from "lucide-react";
const Plot = lazy(() => import("./Plot"));
const LazyMathText = lazy(() => import("./MathText"));
import type { Layer, Project, ChartKind } from "./types";
import { compact, n, maxAbs } from "./format";
import { MenuBar } from "./MenuBar";
import { useSimulation } from "./useSimulation";
import { saveText, serializeFigure } from "./exports";
import { VERSION } from "./version";
import { Select } from "./Select";
import { DataPanel, StudiesPanel, SchottkyMetrics } from "./LabPanel";
import { Tutorial, chapters } from "./Tutorial";
import {
  defaultAnalysis,
  parseTable,
  suggestRange,
  type Dataset,
  type Study,
  type StudyCase,
  type AnalysisConfig,
  type WorkspaceProject,
  type LogoVariant,
  type PageId,
} from "./lab";
const LogoContext = createContext<LogoVariant>("delta");
const logos = {
  delta: new URL("./assets/logos/delta.png", import.meta.url).href,
  wedge: new URL("./assets/logos/wedge.png", import.meta.url).href,
  chibi: new URL("./assets/logos/chibi.png", import.meta.url).href,
};
const practice =
  "Voltage_V Current_A\n" +
  Array.from({ length: 101 }, (_, i) => {
    const v = -0.5 + i * 0.008;
    return `${v} ${1e-8 * Math.expm1(v / (1.1 * 0.025852))}`;
  }).join("\n");

const materials = [
  "Si",
  "Ge",
  "SiGe",
  "SiO2",
  "GaAs",
  "AlAs",
  "InAs",
  "AlGaAs",
  "InGaAs",
  "AlInAs",
  "InP",
  "GaP",
  "AlP",
  "InGaP",
  "GaN",
  "AlN",
  "InN",
  "AlGaN",
  "InGaN",
];
const fallback: Project = {
  schema_version: 1,
  name: "PN diode",
  description: "One-dimensional silicon junction",
  temperature_k: 300,
  mesh_spacing_nm: 5,
  fully_ionized: true,
  layers: [
    {
      name: "P region",
      material: "Si",
      thickness_nm: 500,
      alloy_fraction: null,
      donors_cm3: 0,
      acceptors_cm3: 1e16,
      sheet_charge_cm2: 0,
      charge_mode: "mobile_carriers",
      fixed_charge_c_cm3: 0,
      mesh_spacing_nm: null,
    },
    {
      name: "N region",
      material: "Si",
      thickness_nm: 500,
      alloy_fraction: null,
      donors_cm3: 1e16,
      acceptors_cm3: 0,
      sheet_charge_cm2: 0,
      charge_mode: "mobile_carriers",
      fixed_charge_c_cm3: 0,
      mesh_spacing_nm: null,
    },
  ],
  surface: { kind: "ohmic", barrier_ev: 0, voltage_v: 0 },
  substrate: { kind: "ohmic", barrier_ev: 0, voltage_v: 0 },
  quantum: null,
  sweep: { enabled: true, start_v: -1, stop_v: 0.7, step_v: 0.1 },
  solver: {
    max_iterations: 400,
    tolerance: 1e-7,
    mixing: 0.18,
    preview_scale: 4,
  },
  analytic_verification: false,
};

type Theme = "mocha" | "latte" | "macchiato" | "tokyo" | "gruvbox";

type Pane = PageId;

function SharkLogo() {
  const logo = useContext(LogoContext);
  return (
    <img
      className="shark-logo"
      src={logos[logo]}
      alt="Requin angular shark logo"
      width="48"
      height="48"
    />
  );
}

function MathText(props: { tex: string; display?: boolean }) {
  return (
    <Suspense fallback={<span>{props.tex}</span>}>
      <LazyMathText {...props} />
    </Suspense>
  );
}
const inputNumber = (value: number) =>
  value !== 0 && (Math.abs(value) >= 1e6 || Math.abs(value) < 1e-3)
    ? value.toExponential()
    : String(value);
function NumberInput({
  label,
  value,
  onChange,
  unit,
  step = "any",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  step?: number | string;
}) {
  const [draft, setDraft] = useState(inputNumber(value));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setDraft(inputNumber(value));
    setInvalid(false);
  }, [value]);
  const commit = () => {
    const next = Number(draft);
    if (!draft.trim() || !Number.isFinite(next)) {
      setDraft(inputNumber(value));
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (next !== value) onChange(next);
  };
  return (
    <label className="field">
      <span>{label}</span>
      <div>
        <input
          type="text"
          inputMode="decimal"
          aria-label={label}
          aria-invalid={invalid}
          title="Enter a number; press Enter or leave the field to apply"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setInvalid(false);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setDraft(inputNumber(value));
              setInvalid(false);
            }
            if (
              (e.key === "ArrowUp" || e.key === "ArrowDown") &&
              step !== "any"
            ) {
              e.preventDefault();
              const next =
                Number(draft) + Number(step) * (e.key === "ArrowUp" ? 1 : -1);
              if (Number.isFinite(next)) {
                setDraft(String(next));
                onChange(next);
              }
            }
          }}
        />
        {unit && <em>{unit}</em>}
      </div>
      {invalid && (
        <span className="input-error">
          Enter a finite number. Previous value restored.
        </span>
      )}
    </label>
  );
}

function App() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [studies, setStudies] = useState<Study[]>([]);
  const [studyCases, setStudyCases] = useState<StudyCase[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisConfig>({
    ...defaultAnalysis,
  });
  const [logo, setLogo] = useState<LogoVariant>(() => {
    const l = localStorage.getItem("requin.logo");
    return l === "wedge" || l === "chibi" ? l : "delta";
  });
  const [welcome, setWelcome] = useState(
    () => !localStorage.getItem("requin.tour.seen"),
  );
  const [tour, setTour] = useState<string | null>(null);
  useEffect(() => {
    document.body.dataset.tutorial = tour ? "active" : "";
    return () => {
      delete document.body.dataset.tutorial;
    };
  }, [tour]);
  const [replay, setReplay] = useState("all");
  const [recent, setRecent] = useState<string | null>(() =>
    localStorage.getItem("requin.recent"),
  );
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const tourBackup = useRef<{
    project: Project;
    datasets: Dataset[];
    studies: Study[];
    studyCases: StudyCase[];
    analysis: AnalysisConfig;
    pane: Pane;
    logo: LogoVariant;
    theme: Theme;
    fontScale: number;
    density: "comfortable" | "compact";
    selected: number;
    chart: ChartKind;
  } | null>(null);
  useEffect(() => {
    localStorage.setItem("requin.logo", logo);
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (link) link.href = logos[logo];
    if (isTauri()) void invoke("set_logo", { variant: logo }).catch(() => {});
  }, [logo]);
  const [project, setProject] = useState<Project>(fallback);
  const [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const { result, resultProject, status, solveError, stale, exportReady } =
    useSimulation(project, ready, revision);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const actionLock = useRef(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [error, setError] = useState("");
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("requin.theme") as Theme) || "mocha",
  );
  const [fontScale, setFontScale] = useState(
    () => Number(localStorage.getItem("requin.fontScale")) || 100,
  );
  const [density, setDensity] = useState<"comfortable" | "compact">(() =>
    localStorage.getItem("requin.density") === "compact"
      ? "compact"
      : "comfortable",
  );
  const [pane, setPane] = useState<Pane>("home");
  useEffect(() => setInspectorOpen(true), [pane]);
  const startTour = (chapter: string) => {
    loadGeneration.current++;
    tourBackup.current = {
      project: structuredClone(project),
      datasets: structuredClone(datasets),
      studies: structuredClone(studies),
      studyCases,
      analysis: { ...analysis },
      pane,
      logo,
      theme,
      fontScale,
      density,
      selected,
      chart,
    };
    setProject(structuredClone(fallback));
    setSelected(0);
    setDatasets([]);
    setStudies([]);
    setStudyCases([]);
    setAnalysis({ ...defaultAnalysis });
    setWelcome(false);
    setTour(chapter);
  };
  const endTour = () => {
    loadGeneration.current++;
    const b = tourBackup.current;
    if (b) {
      setProject(b.project);
      setDatasets(b.datasets);
      setStudies(b.studies);
      setStudyCases(b.studyCases);
      setAnalysis(b.analysis);
      setPane(b.pane);
      setLogo(b.logo);
      setTheme(b.theme);
      setFontScale(b.fontScale);
      setDensity(b.density);
      setSelected(b.selected);
      setChart(b.chart);
    }
    setTour(null);
    tourBackup.current = null;
  };
  const tourNavigate = (page: PageId, chapter?: string) => {
    setPane(page);
    if (chapter === "fitting" && !datasets.length) {
      const d: Dataset = {
        id: "tutorial-practice",
        name: "Synthetic tutorial measurement",
        source: "Synthetic thermionic model",
        quantity: "current",
        unit: "A",
        headers: [],
        skipped: 0,
        points: parseTable(practice).rows.map((r) => ({ x: r[0], y: r[1] })),
      };
      const [min, max] = suggestRange(d);
      setDatasets([d]);
      setAnalysis({ ...defaultAnalysis, dataset_id: d.id, min, max });
    }
  };
  const [chart, setChart] = useState<ChartKind>("bands");
  const [showGrid, setShowGrid] = useState(true);
  const [showMarkers, setShowMarkers] = useState(false);
  const [showReference, setShowReference] = useState(true);
  const [selected, setSelected] = useState(0);
  const loadGeneration = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const generation = ++loadGeneration.current;
    invoke<Project>("default_project")
      .then((p) => {
        if (generation === loadGeneration.current) setProject(p);
      })
      .catch(() => {
        if (generation === loadGeneration.current) setProject(fallback);
      })
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    localStorage.setItem("requin.theme", theme);
    localStorage.setItem("requin.fontScale", String(fontScale));
    localStorage.setItem("requin.density", density);
    const root = document.querySelector("main");
    if (root) {
      const styles = getComputedStyle(root);
      for (const key of [
        "--bg",
        "--panel",
        "--surface",
        "--border",
        "--text",
        "--muted",
        "--accent",
      ])
        document.body.style.setProperty(key, styles.getPropertyValue(key));
    }
  }, [theme, fontScale, density]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  const perform = async (action: () => Promise<string | null | void>) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    try {
      const message = await action();
      if (message) setNotice(message);
    } catch (e) {
      setError(String(e));
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };
  const loadProject = async (kind?: string) => {
    const id = ++loadGeneration.current;
    try {
      const p = await invoke<Project>(
        kind ? "project_template" : "default_project",
        kind ? { kind } : {},
      );
      if (id !== loadGeneration.current) return;
      if (!tour) {
        const snapshot = JSON.stringify({
          schema_version: 2,
          device: project,
          datasets,
          studies,
          analysis,
        });
        try {
          localStorage.setItem("requin.recent", snapshot);
          setRecent(snapshot);
        } catch {
          /* Saving to disk remains available if browser storage is full. */
        }
      }
      setProject(p);
      setSelected(0);
      setPane("structure");
      setChart(
        p.analytic_verification ? "potential" : p.quantum ? "wave" : "bands",
      );
      setError("");
      setNotice(kind ? "Template loaded" : "New project created");
    } catch (e) {
      setError(String(e));
    }
  };
  const selectChart = (kind: ChartKind) => {
    setChart(kind);
    if (["learn", "home", "studies", "data"].includes(pane)) setPane("results");
  };
  const noChartData =
    (chart === "wave" && !result?.eigenstates.length) ||
    (chart === "sweep" &&
      !result?.sweep.some(
        (p) => p.current_a_m2 != null || p.capacitance_f_m2 != null,
      ));
  const isProfilePage = !["home", "studies", "data", "learn"].includes(pane);
  const canExportFigure = exportReady && isProfilePage && !noChartData;
  const summary = useMemo(
    () =>
      result
        ? {
            field: maxAbs(result.electric_field_v_cm),
            charge: maxAbs(result.charge_density_c_cm3),
            low: result.potential_v.reduce((a, b) => Math.min(a, b), Infinity),
            high: result.potential_v.reduce(
              (a, b) => Math.max(a, b),
              -Infinity,
            ),
          }
        : null,
    [result],
  );
  const patch = (p: Partial<Project>) => setProject((v) => ({ ...v, ...p }));
  const patchLayer = (i: number, p: Partial<Layer>) =>
    setProject((v) => ({
      ...v,
      layers: v.layers.map((l, j) => (j === i ? { ...l, ...p } : l)),
    }));
  const layer = project.layers[selected] ?? project.layers[0];
  const importFile = async (file: File) => {
    const generation = ++loadGeneration.current;
    try {
      const source = await file.text();
      if (/\.(toml|requin)$/i.test(file.name)) {
        const workspace = await invoke<WorkspaceProject>("parse_workspace", {
          source,
        });
        if (generation !== loadGeneration.current) return;
        setProject(workspace.device);
        setDatasets(workspace.datasets ?? []);
        setStudies(workspace.studies ?? []);
        setStudyCases([]);
        setAnalysis({ ...defaultAnalysis, ...workspace.analysis });
        setSelected(0);
        setPane("structure");
        setError("");
        setNotice("Workspace opened");
        return;
      }
      const value = /\.(toml|requin)$/i.test(file.name)
        ? await invoke<Project>("parse_project_toml", { source })
        : (
            await invoke<{ project: Project; warnings: string[] }>(
              "import_legacy_deck",
              { source, name: file.name.replace(/\.[^.]+$/, "") },
            )
          ).project;
      if (generation !== loadGeneration.current) return;
      setProject(value);
      setSelected(0);
      setChart(value.analytic_verification ? "potential" : "bands");
      setPane("structure");
      setError("");
      setNotice("Project imported");
    } catch (e) {
      setError(String(e));
    }
  };
  const save = () =>
    perform(async () => {
      const path = await saveText(
        `${project.name}.requin.toml`,
        await invoke<string>("serialize_workspace", {
          workspace: {
            schema_version: 2,
            device: project,
            datasets,
            studies,
            analysis,
          },
        }),
      );
      if (path && !tour) {
        const snapshot = JSON.stringify({
          schema_version: 2,
          device: project,
          datasets,
          studies,
          analysis,
        });
        try {
          localStorage.setItem("requin.recent", snapshot);
          setRecent(snapshot);
        } catch {
          setNotice("Saved to disk; recent-workspace storage is full");
        }
      }
      return path ? "Project saved" : "Save cancelled";
    });
  const csv = () =>
    perform(async () => {
      if (!result) return;
      const rows = [
        "position_nm,potential_v,analytic_potential_v,potential_error_v,electric_field_v_cm,analytic_field_v_cm,field_error_v_cm,charge_density_c_cm3,conduction_band_ev,valence_band_ev,electron_cm3,hole_cm3,net_charge_cm3,material",
        ...result.position_nm.map((x, i) =>
          [
            x,
            result.potential_v[i],
            result.analytic?.potential_v[i] ?? "",
            result.analytic
              ? result.potential_v[i] - result.analytic.potential_v[i]
              : "",
            result.electric_field_v_cm[i],
            result.analytic?.electric_field_v_cm[i] ?? "",
            result.analytic
              ? result.electric_field_v_cm[i] -
                result.analytic.electric_field_v_cm[i]
              : "",
            result.charge_density_c_cm3[i],
            result.conduction_band_ev[i],
            result.valence_band_ev[i],
            result.electron_cm3[i],
            result.hole_cm3[i],
            result.net_charge_cm3[i],
            JSON.stringify(result.material[i]),
          ].join(","),
        ),
      ];
      const path = await saveText(
        `${project.name}_profiles.csv`,
        rows.join("\n"),
        "text/csv",
      );
      return path ? "Profile data exported" : "Export cancelled";
    });
  const svg = () =>
    perform(async () => {
      const node = document.querySelector<SVGSVGElement>(
        ".figure .recharts-surface",
      );
      if (!node || !canExportFigure)
        throw new Error(
          "Choose a figure with current results before exporting.",
        );
      const path = await saveText(
        `${project.name}_${chart}.svg`,
        serializeFigure(node),
        "image/svg+xml",
      );
      return path ? "Figure exported" : "Export cancelled";
    });
  const pdf = () =>
    perform(async () => {
      if (tour)
        return "Practice report ready · native printing is available outside the tutorial";
      if (isTauri()) await invoke("print_report");
      else window.print();
    });
  const sweepCsv = () =>
    perform(async () => {
      if (!result?.sweep.length) return;
      const rows = [
        "voltage_v,charge_c_m2,capacitance_f_m2,current_a_m2",
        ...result.sweep.map((p) =>
          [
            p.voltage_v,
            p.charge_c_m2,
            p.capacitance_f_m2 ?? "",
            p.current_a_m2 ?? "",
          ].join(","),
        ),
      ];
      const path = await saveText(
        `${project.name}_sweep.csv`,
        rows.join("\n"),
        "text/csv",
      );
      return path ? "Sweep data exported" : "Export cancelled";
    });
  const paneTitles: Record<Pane, [string, string]> = {
    home: ["WELCOME", "Your next experiment"],
    experiment: ["EXPERIMENT", "Contacts, bias and resolution"],
    studies: ["STUDIES", "Compare repeatable cases"],
    data: ["DATA", "Measured data and extraction"],
    results: ["RESULTS", "Profiles and interpretation"],
    project: ["PROJECT", "Files and starting points"],
    structure: ["STRUCTURE", "Layer stack and experiment"],
    quantum: ["QUANTUM", "Effective-mass states"],
    settings: ["SETTINGS", "Appearance and learning"],
    learn: ["LEARN / ABOUT", "Using Requin"],
  };
  return (
    <LogoContext.Provider value={logo}>
      <main
        inert={welcome ? true : undefined}
        data-inspector={inspectorOpen ? "open" : "closed"}
        data-page={pane}
        data-theme={theme}
        data-density={density}
        style={{ "--font-scale": fontScale / 100 } as CSSProperties}
      >
        <aside className="rail">
          <div className="brand" title="Requin">
            <SharkLogo />
          </div>
          <div className="brand-name">
            Requin<small>Semiconductor physics</small>
          </div>
          {(
            [
              ["home", "Home"],
              ["project", "Projects"],
              ["structure", "Device"],
              ["experiment", "Experiment"],
              ["quantum", "Quantum"],
              ["studies", "Studies"],
              ["data", "Data"],
              ["results", "Results"],
              ["learn", "Learn"],
              ["settings", "Settings"],
            ] as [Pane, string][]
          ).map(([id, label], i) => (
            <button
              key={id}
              data-tour-id={`nav-${id}`}
              className={pane === id ? "active" : ""}
              aria-label={label}
              onClick={() => setPane(id)}
            >
              <span className="nav-number">
                {String(i + 1).padStart(2, "0")}
              </span>
              {label}
            </button>
          ))}
        </aside>
        <input
          ref={input}
          hidden
          type="file"
          accept=".txt,.toml,.requin"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void importFile(file);
          }}
        />
        <section
          className="sidebar"
          data-tour-id={
            ["home", "studies", "data", "results", "learn"].includes(pane)
              ? undefined
              : pane
          }
        >
          <header className="pane-header">
            <div>
              <small>{paneTitles[pane][0]}</small>
              <b>{paneTitles[pane][1]}</b>
            </div>
            <button
              className="inspector-toggle"
              onClick={() => setInspectorOpen(false)}
              aria-label="Close inspector"
            >
              <X />
            </button>
          </header>
          {pane === "project" && (
            <div className="pane-content">
              <label className="field">
                <span>Project name</span>
                <div>
                  <input
                    value={project.name}
                    onChange={(e) => patch({ name: e.target.value })}
                  />
                </div>
              </label>
              <label className="field">
                <span>Description</span>
                <div>
                  <input
                    value={project.description}
                    placeholder="What is being studied?"
                    onChange={(e) => patch({ description: e.target.value })}
                  />
                </div>
              </label>
              <div className="template" data-tour-id="templates">
                <small>DEVICE TEMPLATE</small>
                <Select
                  value=""
                  aria-label="Device template"
                  onChange={(e) => {
                    if (e.target.value) void loadProject(e.target.value);
                  }}
                >
                  <option value="" disabled>
                    Choose a starting point…
                  </option>
                  <option value="mkc_a1_4">MKC A1.4 · MOS Gauss law</option>
                  <option value="fixed_mos">Fixed-charge MOS</option>
                  <option value="pn">PN diode</option>
                  <option value="schottky">Schottky diode</option>
                  <option value="mos">Self-consistent MOS capacitor</option>
                  <option value="hemt">GaAs / AlGaAs HEMT</option>
                  <option value="well">Quantum well</option>
                  <option value="heterojunction">Heterojunction</option>
                </Select>
              </div>
              <div className="side-actions">
                <button onClick={() => input.current?.click()}>
                  <FileUp /> Import deck or project
                </button>
                <button onClick={save} disabled={busy}>
                  <Download /> Save project
                </button>
              </div>
              <div className="info-card">
                <small>CURRENT DEVICE</small>
                <b>
                  {project.layers.length} layers ·{" "}
                  {n(
                    project.layers.reduce((s, l) => s + l.thickness_nm, 0),
                    1,
                  )}{" "}
                  nm
                </b>
                <p>
                  {project.analytic_verification
                    ? "Analytic verification enabled"
                    : project.quantum
                      ? "Quantum region enabled"
                      : "Classical electrostatics"}{" "}
                  ·{" "}
                  {project.sweep.enabled
                    ? "voltage sweep enabled"
                    : "single bias"}
                </p>
              </div>
            </div>
          )}
          {pane === "structure" && (
            <>
              {project.analytic_verification && (
                <div className="homework-card">
                  <small>GAUSS-LAW WORKSPACE</small>
                  <b>MKC A1.4-compatible setup</b>
                  <p>
                    Enter signed volume charge. The metal is held at φ(0)=0 and
                    the far silicon boundary has zero field.
                  </p>
                  <MathText tex={"\\sigma_m=-\\rho x_d"} />
                  <button
                    onClick={() =>
                      patch({
                        mesh_spacing_nm: Math.max(
                          0.1,
                          Math.min(
                            ...project.layers.map((l) => l.thickness_nm),
                          ) / 100,
                        ),
                      })
                    }
                  >
                    Use recommended mesh
                  </button>
                </div>
              )}
              <div className="section-title">
                <span>Layer stack</span>
                <button
                  onClick={() => {
                    setSelected(project.layers.length);
                    setProject((v) => ({
                      ...v,
                      layers: [
                        ...v.layers,
                        {
                          ...fallback.layers[0],
                          name: `Layer ${v.layers.length + 1}`,
                          charge_mode: v.analytic_verification
                            ? "fixed_volume"
                            : "mobile_carriers",
                          fixed_charge_c_cm3: 0,
                        },
                      ],
                    }));
                  }}
                >
                  <Plus /> Add
                </button>
              </div>
              <div className="layers">
                {project.layers.map((l, i) => (
                  <button
                    key={i}
                    className={selected === i ? "selected" : ""}
                    onClick={() => setSelected(i)}
                  >
                    <i
                      style={{
                        background: l.material.includes("Ga")
                          ? "var(--mauve)"
                          : l.material.includes("O2")
                            ? "var(--blue)"
                            : "var(--green)",
                      }}
                    />
                    <span>
                      <b>{l.name}</b>
                      <small>
                        {l.material} · {n(l.thickness_nm, 1)} nm ·{" "}
                        {l.charge_mode === "fixed_volume"
                          ? "fixed ρ"
                          : "mobile carriers"}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
              {layer && (
                <div
                  className="editor"
                  key={selected}
                  data-tour-id="layer-editor"
                >
                  <div className="editor-head">
                    <b>Layer {selected + 1}</b>
                    <button
                      aria-label="Delete selected layer"
                      title="Delete selected layer"
                      disabled={project.layers.length < 2}
                      onClick={() => {
                        setProject((v) => ({
                          ...v,
                          layers: v.layers.filter((_, i) => i !== selected),
                        }));
                        setSelected(Math.max(0, selected - 1));
                      }}
                    >
                      <Trash2 />
                    </button>
                  </div>
                  <label className="field">
                    <span>Name</span>
                    <div>
                      <input
                        value={layer.name}
                        onChange={(e) =>
                          patchLayer(selected, { name: e.target.value })
                        }
                      />
                    </div>
                  </label>
                  <label className="field">
                    <span>Material</span>
                    <div>
                      <Select
                        aria-label="Material"
                        value={layer.material}
                        onChange={(e) =>
                          patchLayer(selected, { material: e.target.value })
                        }
                      >
                        {materials.map((m) => (
                          <option key={m}>{m}</option>
                        ))}
                      </Select>
                    </div>
                  </label>
                  <NumberInput
                    label="Thickness"
                    value={layer.thickness_nm}
                    unit="nm"
                    onChange={(v) => patchLayer(selected, { thickness_nm: v })}
                  />
                  <details className="settings-group">
                    <summary>Layer resolution</summary>
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={layer.mesh_spacing_nm != null}
                        onChange={(e) =>
                          patchLayer(selected, {
                            mesh_spacing_nm: e.target.checked
                              ? project.mesh_spacing_nm
                              : null,
                          })
                        }
                      />
                      Override global mesh
                    </label>
                    {layer.mesh_spacing_nm != null && (
                      <NumberInput
                        label="Layer mesh spacing"
                        value={layer.mesh_spacing_nm}
                        unit="nm"
                        onChange={(v) =>
                          patchLayer(selected, { mesh_spacing_nm: v })
                        }
                      />
                    )}
                    <p className="muted-copy">
                      Use finer spacing near narrow depletion regions or quantum
                      wells. Turn off to inherit Experiment settings.
                    </p>
                  </details>
                  {/(AlGa|InGa|AlIn|SiGe)/.test(layer.material) && (
                    <NumberInput
                      label="Alloy fraction"
                      value={layer.alloy_fraction ?? 0.3}
                      onChange={(v) =>
                        patchLayer(selected, { alloy_fraction: v })
                      }
                    />
                  )}{" "}
                  {/* charge configuration */}
                  <label className="field">
                    <span>Charge model</span>
                    <div>
                      <Select
                        aria-label="Charge model"
                        value={layer.charge_mode}
                        disabled={project.analytic_verification}
                        onChange={(e) =>
                          patchLayer(selected, {
                            charge_mode: e.target.value as Layer["charge_mode"],
                          })
                        }
                      >
                        <option value="mobile_carriers">
                          Mobile carriers + dopants
                        </option>
                        <option value="fixed_volume">
                          Prescribed volume charge
                        </option>
                      </Select>
                    </div>
                  </label>
                  {layer.charge_mode === "fixed_volume" ? (
                    <>
                      <NumberInput
                        label="Signed charge ρ"
                        value={layer.fixed_charge_c_cm3}
                        unit="C/cm³"
                        onChange={(v) =>
                          patchLayer(selected, { fixed_charge_c_cm3: v })
                        }
                      />
                      <p className="unit-hint">
                        Equivalent:{" "}
                        {compact(layer.fixed_charge_c_cm3 / 1.602176634e-19)}{" "}
                        elementary charges/cm³
                      </p>
                    </>
                  ) : (
                    <>
                      <NumberInput
                        label="Donors Nᴅ"
                        value={layer.donors_cm3}
                        unit="cm⁻³"
                        onChange={(v) =>
                          patchLayer(selected, { donors_cm3: v })
                        }
                      />
                      <NumberInput
                        label="Acceptors Nₐ"
                        value={layer.acceptors_cm3}
                        unit="cm⁻³"
                        onChange={(v) =>
                          patchLayer(selected, { acceptors_cm3: v })
                        }
                      />
                    </>
                  )}
                  <NumberInput
                    label="Leading sheet charge"
                    value={layer.sheet_charge_cm2}
                    unit="q/cm²"
                    onChange={(v) =>
                      patchLayer(selected, { sheet_charge_cm2: v })
                    }
                  />
                </div>
              )}
            </>
          )}
          {pane === "experiment" && (
            <>
              <div className="editor compact">
                <b>Experiment</b>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={!!project.majority_carriers_only}
                    onChange={(e) =>
                      patch({ majority_carriers_only: e.target.checked })
                    }
                  />
                  <span>Majority carriers only (Schottky depletion)</span>
                </label>
                <p className="muted-copy">
                  Suppresses equilibrium minority-carrier inversion. Use this
                  approximation for the Schottky depletion lab; disable it for
                  equilibrium MOS inversion.
                </p>
                <NumberInput
                  label="Temperature"
                  value={project.temperature_k}
                  unit="K"
                  onChange={(v) => patch({ temperature_k: v })}
                />
                <NumberInput
                  label="Mesh"
                  value={project.mesh_spacing_nm}
                  unit="nm"
                  onChange={(v) => patch({ mesh_spacing_nm: v })}
                />
                <NumberInput
                  label="Surface potential / bias"
                  value={project.surface.voltage_v}
                  unit="V"
                  step={0.05}
                  onChange={(v) =>
                    patch({ surface: { ...project.surface, voltage_v: v } })
                  }
                />
                {!project.analytic_verification && (
                  <>
                    <label className="field">
                      <span>Surface boundary</span>
                      <div>
                        <Select
                          aria-label="Surface boundary"
                          value={project.surface.kind}
                          onChange={(e) =>
                            patch({
                              surface: {
                                ...project.surface,
                                kind: e.target
                                  .value as Project["surface"]["kind"],
                              },
                            })
                          }
                        >
                          <option value="ohmic">Ohmic</option>
                          <option value="schottky">Schottky</option>
                          <option value="fixed_potential">
                            Fixed potential
                          </option>
                          <option value="zero_field">Zero field</option>
                        </Select>
                      </div>
                    </label>
                    <label className="field">
                      <span>Substrate boundary</span>
                      <div>
                        <Select
                          aria-label="Substrate boundary"
                          value={project.substrate.kind}
                          onChange={(e) =>
                            patch({
                              substrate: {
                                ...project.substrate,
                                kind: e.target
                                  .value as Project["substrate"]["kind"],
                              },
                            })
                          }
                        >
                          <option value="ohmic">Ohmic</option>
                          <option value="fixed_potential">
                            Fixed potential
                          </option>
                          <option value="zero_field">Zero field</option>
                        </Select>
                      </div>
                    </label>
                  </>
                )}
                {project.surface.kind === "schottky" && (
                  <NumberInput
                    label="Surface barrier"
                    value={project.surface.barrier_ev}
                    unit="eV"
                    onChange={(v) =>
                      patch({ surface: { ...project.surface, barrier_ev: v } })
                    }
                  />
                )}
                {project.substrate.kind !== "zero_field" && (
                  <NumberInput
                    label="Substrate potential / bias"
                    value={project.substrate.voltage_v}
                    unit="V"
                    onChange={(v) =>
                      patch({
                        substrate: { ...project.substrate, voltage_v: v },
                      })
                    }
                  />
                )}
                {project.substrate.kind === "schottky" && (
                  <NumberInput
                    label="Substrate barrier"
                    value={project.substrate.barrier_ev}
                    unit="eV"
                    onChange={(v) =>
                      patch({
                        substrate: { ...project.substrate, barrier_ev: v },
                      })
                    }
                  />
                )}
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={project.sweep.enabled}
                    onChange={(e) =>
                      patch({
                        sweep: { ...project.sweep, enabled: e.target.checked },
                      })
                    }
                  />
                  <span>Voltage sweep</span>
                </label>
                {project.sweep.enabled && (
                  <div className="field-grid">
                    <NumberInput
                      label="Start"
                      value={project.sweep.start_v}
                      unit="V"
                      onChange={(v) =>
                        patch({ sweep: { ...project.sweep, start_v: v } })
                      }
                    />
                    <NumberInput
                      label="Stop"
                      value={project.sweep.stop_v}
                      unit="V"
                      onChange={(v) =>
                        patch({ sweep: { ...project.sweep, stop_v: v } })
                      }
                    />
                    <NumberInput
                      label="Step"
                      value={project.sweep.step_v}
                      unit="V"
                      onChange={(v) =>
                        patch({ sweep: { ...project.sweep, step_v: v } })
                      }
                    />
                  </div>
                )}
              </div>
            </>
          )}
          {pane === "experiment" && (
            <details className="editor">
              <summary>Advanced numerical settings</summary>
              <label className="field">
                <span>Carrier statistics</span>
                <Select
                  aria-label="Carrier statistics"
                  value={project.carrier_statistics ?? "boltzmann"}
                  onChange={(e) =>
                    patch({
                      carrier_statistics: e.target
                        .value as Project["carrier_statistics"],
                    })
                  }
                >
                  <option value="boltzmann">Boltzmann · legacy</option>
                  <option value="fermi_dirac">
                    Fermi–Dirac · includes degeneracy
                  </option>
                </Select>
              </label>
              <NumberInput
                label="Maximum iterations"
                value={project.solver.max_iterations}
                onChange={(v) =>
                  patch({
                    solver: {
                      ...project.solver,
                      max_iterations: Math.round(v),
                    },
                  })
                }
              />
              <NumberInput
                label="Tolerance"
                value={project.solver.tolerance}
                onChange={(v) =>
                  patch({ solver: { ...project.solver, tolerance: v } })
                }
              />
              <NumberInput
                label="Mixing"
                value={project.solver.mixing}
                onChange={(v) =>
                  patch({ solver: { ...project.solver, mixing: v } })
                }
              />
              <NumberInput
                label="Preview mesh scale"
                value={project.solver.preview_scale}
                unit="×"
                onChange={(v) =>
                  patch({ solver: { ...project.solver, preview_scale: v } })
                }
              />
            </details>
          )}
          {pane === "quantum" && (
            <div className="pane-content">
              <div className="info-card accent">
                <Atom />
                <div>
                  <b>Electron quantum states</b>
                  <p>
                    Solves the position-dependent effective-mass Hamiltonian
                    inside the selected window.
                  </p>
                </div>
              </div>
              <label className="toggle prominent">
                <input
                  type="checkbox"
                  checked={!!project.quantum}
                  onChange={(e) =>
                    patch({
                      quantum: e.target.checked
                        ? {
                            start_nm: 0,
                            stop_nm: project.layers.reduce(
                              (s, l) => s + l.thickness_nm,
                              0,
                            ),
                            states: 4,
                          }
                        : null,
                    })
                  }
                />
                <span>Enable Schrödinger solve</span>
              </label>
              {project.quantum ? (
                <>
                  <NumberInput
                    label="Window start"
                    value={project.quantum.start_nm}
                    unit="nm"
                    onChange={(v) =>
                      patch({ quantum: { ...project.quantum!, start_nm: v } })
                    }
                  />
                  <NumberInput
                    label="Window stop"
                    value={project.quantum.stop_nm}
                    unit="nm"
                    onChange={(v) =>
                      patch({ quantum: { ...project.quantum!, stop_nm: v } })
                    }
                  />
                  <NumberInput
                    label="Requested states"
                    value={project.quantum.states}
                    onChange={(v) =>
                      patch({
                        quantum: {
                          ...project.quantum!,
                          states: Math.max(1, Math.round(v)),
                        },
                      })
                    }
                  />
                  <div className="state-list">
                    <small>COMPUTED STATES</small>
                    {result?.eigenstates.length ? (
                      result.eigenstates.map((s) => (
                        <div key={s.index}>
                          <span>ψ{s.index}</span>
                          <b>{n(s.energy_ev, 4)} eV</b>
                        </div>
                      ))
                    ) : (
                      <p>No states in the current result.</p>
                    )}
                  </div>
                </>
              ) : (
                <p className="muted-copy">
                  Enable this for quantum wells, heterostructure channels, and
                  HEMT subband analysis. Keep the window around the region of
                  interest for faster solves.
                </p>
              )}
            </div>
          )}
          {pane === "settings" && (
            <div className="pane-content">
              <div className="settings-group">
                <small>APPEARANCE</small>
                <div
                  className="logo-choices"
                  role="radiogroup"
                  aria-label="Logo"
                >
                  {(["delta", "wedge", "chibi"] as LogoVariant[]).map((l) => (
                    <button
                      key={l}
                      role="radio"
                      aria-checked={logo === l}
                      className={logo === l ? "active" : ""}
                      onClick={() => setLogo(l)}
                    >
                      <img src={logos[l]} alt="" />
                      {l[0].toUpperCase() + l.slice(1)}
                    </button>
                  ))}
                </div>
                <p className="muted-copy">
                  Your logo appears throughout Requin and in the running app
                  icon where supported. Installed app and launcher icons remain
                  Delta.
                </p>
                <label className="field">
                  <span>Color theme</span>
                  <div>
                    <Select
                      aria-label="Color theme"
                      value={theme}
                      onChange={(e) => setTheme(e.target.value as Theme)}
                    >
                      <option value="mocha">Catppuccin Mocha</option>
                      <option value="macchiato">Catppuccin Macchiato</option>
                      <option value="latte">Catppuccin Latte</option>
                      <option value="tokyo">Tokyo Night</option>
                      <option value="gruvbox">Gruvbox</option>
                    </Select>
                  </div>
                </label>
                <NumberInput
                  label="Font scale"
                  value={fontScale}
                  unit="%"
                  step={5}
                  onChange={(v) => setFontScale(Math.min(125, Math.max(85, v)))}
                />
                <div className="segmented">
                  <button
                    className={density === "comfortable" ? "active" : ""}
                    onClick={() => setDensity("comfortable")}
                  >
                    Comfortable
                  </button>
                  <button
                    className={density === "compact" ? "active" : ""}
                    onClick={() => setDensity("compact")}
                  >
                    Compact
                  </button>
                </div>
              </div>
              <div className="settings-group">
                <small>LEARNING</small>
                <div data-tour-id="tutorial-replay">
                  <label className="field">
                    <span>Replay tutorial</span>
                    <Select
                      aria-label="Replay tutorial"
                      value={replay}
                      onChange={(e) => setReplay(e.target.value)}
                    >
                      <option value="all">Whole tutorial</option>
                      {chapters.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <button disabled={!!tour} onClick={() => startTour(replay)}>
                    Start tutorial
                  </button>
                  <button
                    onClick={() => {
                      localStorage.removeItem("requin.tour.seen");
                      localStorage.removeItem("requin.tour.progress");
                      setNotice("Tutorial progress reset");
                    }}
                  >
                    Reset progress
                  </button>
                </div>
              </div>
            </div>
          )}
          {pane === "learn" && (
            <div className="learn-pane">
              <div className="about-shark">
                <SharkLogo />
                <div>
                  <h3>Requin</h3>
                  <p>1D semiconductor analysis · v{VERSION}</p>
                </div>
              </div>
              <h4>Quick start</h4>
              <ol>
                <li>Choose a device template or import a legacy deck.</li>
                <li>Build the layer stack from surface to substrate.</li>
                <li>Set contacts, bias, temperature, and mesh.</li>
                <li>Enable a quantum window when confinement matters.</li>
                <li>Read the convergence status before using a curve.</li>
              </ol>
              <h4>What happens under the hood</h4>
              <div className="learn-equation">
                <MathText tex="\nabla\cdot(\varepsilon\nabla\phi)=-\rho" />
                <p>
                  Poisson’s equation converts charge into electrostatic
                  potential and band bending.
                </p>
              </div>
              <div className="learn-equation">
                <MathText tex="\hat H\psi_i=E_i\psi_i" />
                <p>
                  The effective-mass Schrödinger equation finds confined
                  electron energies and wavefunctions.
                </p>
              </div>
              <h4>Reading the report</h4>
              <p>
                <b>Bands</b> show allowed electron and hole energies.{" "}
                <b>Carriers</b> show mobile charge. <b>Field</b> is the spatial
                derivative of potential. <b>Wavefunctions</b> show confinement
                probability. <b>I–V/C–V</b> summarizes voltage sweeps.
              </p>
              <h4>Model limits</h4>
              <p>
                Requin is an engineering preview. Current curves are first-order
                PN diffusion and Schottky thermionic estimates. HEMT analysis is
                vertical electrostatics and confinement, not drain transport.
                Unconverged results are diagnostic only.
              </p>
            </div>
          )}
        </section>
        <section className="workspace">
          <MenuBar
            menus={[
              {
                label: "File",
                items: [
                  {
                    label: "New project",
                    action: () => {
                      void loadProject();
                    },
                  },
                  { label: "Import…", action: () => input.current?.click() },
                  { label: "Save project", action: save, disabled: busy },
                ],
              },
              {
                label: "Export",
                items: [
                  {
                    label: "Data as CSV",
                    action: csv,
                    disabled: !exportReady || !isProfilePage || busy,
                  },
                  {
                    label: "Sweep as CSV",
                    action: sweepCsv,
                    disabled:
                      !exportReady ||
                      !isProfilePage ||
                      !result?.sweep.length ||
                      busy,
                  },
                  {
                    label: "Current figure as SVG",
                    action: svg,
                    disabled: !canExportFigure || busy,
                  },
                  {
                    label: "Report as PDF…",
                    action: pdf,
                    disabled:
                      busy ||
                      ["home", "learn"].includes(pane) ||
                      (isProfilePage && !exportReady) ||
                      (pane === "data" && !datasets.length) ||
                      (pane === "studies" && !studies.length),
                  },
                ],
              },
              {
                label: "View",
                items: (
                  [
                    "potential",
                    "field",
                    "charge",
                    "bands",
                    "carriers",
                    "wave",
                    "sweep",
                  ] as ChartKind[]
                ).map((k) => ({
                  label:
                    k === "wave"
                      ? "Wavefunctions"
                      : k === "sweep"
                        ? "I–V / C–V sweep"
                        : k[0].toUpperCase() + k.slice(1),
                  action: () => selectChart(k),
                })),
              },
              {
                label: "Help",
                items: [
                  { label: "Requin guide", action: () => setPane("learn") },
                ],
              },
            ]}
          />
          <header className="topbar">
            <div>
              <small>ONE-DIMENSIONAL DEVICE ANALYSIS</small>
              <h1>{project.name}</h1>
            </div>
            <div className="actions">
              {!["home", "studies", "data", "results", "learn"].includes(
                pane,
              ) && (
                <button
                  className="inspector-toggle"
                  onClick={() => setInspectorOpen(!inspectorOpen)}
                >
                  Device controls
                </button>
              )}
              <button onClick={save} disabled={busy} title="Save project">
                <Save /> Save
              </button>
              <button
                className="primary"
                onClick={() => setRevision((v) => v + 1)}
                disabled={!ready || status.startsWith("Solving")}
                title="Recalculate the current device"
              >
                <RotateCw /> Recalculate
              </button>
            </div>
          </header>
          {pane === "home" && (
            <div className="lab-page home-page" data-tour-id="home">
              <header>
                <small>MAKE SENSE OF YOUR DEVICE</small>
                <h2>From structure to understanding.</h2>
                <p>
                  Build a semiconductor, explore its electrostatics, and compare
                  it with the measurements on your bench.
                </p>
              </header>
              {recent && (
                <button
                  className="resume-workspace"
                  onClick={() => {
                    try {
                      const w = JSON.parse(recent) as WorkspaceProject;
                      setProject(w.device);
                      setDatasets(w.datasets ?? []);
                      setStudies(w.studies ?? []);
                      setStudyCases([]);
                      setAnalysis({ ...defaultAnalysis, ...w.analysis });
                      setSelected(0);
                      setPane("results");
                    } catch {
                      setError(
                        "This recent-workspace copy could not be opened. Import the saved file instead.",
                      );
                    }
                  }}
                >
                  Resume recent workspace
                </button>
              )}
              <div className="home-grid">
                <button onClick={() => setPane("project")}>
                  <Layers3 />
                  <h3>Build a device</h3>
                  <p>Start from a template or import a 1D Poisson deck.</p>
                </button>
                <button onClick={() => input.current?.click()}>
                  <FileUp />
                  <h3>Open workspace</h3>
                  <p>Restore a device, measurements, studies, and analysis.</p>
                </button>
                <button onClick={() => setPane("data")}>
                  <Activity />
                  <h3>Analyze measurements</h3>
                  <p>Import instrument data and extract diode parameters.</p>
                </button>
                <button onClick={() => startTour("all")}>
                  <BookOpen />
                  <h3>Learn by doing</h3>
                  <p>A guided tour with a safe practice workspace.</p>
                </button>
              </div>
              <section className="lab-card">
                <small>GUIDED EXPERIMENT</small>
                <h3>Schottky diode · Lab 2.4</h3>
                <p>
                  Silicon, n-type, 0.6 eV barrier. Explore depletion, forward
                  and reverse bias, doping, capacitance, and measured I–V.
                </p>
                <button
                  className="primary"
                  onClick={() => void loadProject("schottky")}
                >
                  Start Schottky lab
                </button>
                <ol className="lab-checklist">
                  <li>
                    <button onClick={() => setPane("results")}>
                      a–c · Inspect charge, field, bands, depletion width, and
                      Debye length
                    </button>
                  </li>
                  <li>
                    <button onClick={() => setPane("studies")}>
                      d–f · Compare bias and doping cases
                    </button>
                  </li>
                  <li>
                    <button onClick={() => setPane("studies")}>
                      g · Run C–V and 1/C² comparisons
                    </button>
                  </li>
                  <li>
                    <button onClick={() => setPane("data")}>
                      h–j · Import measured I–V and fit device parameters
                    </button>
                  </li>
                </ol>
              </section>
            </div>
          )}
          {pane === "studies" && (
            <StudiesPanel
              key={tour ?? "user"}
              project={project}
              studies={studies}
              setStudies={setStudies}
              cases={studyCases}
              setCases={setStudyCases}
              onAnalyze={(d) => {
                setDatasets([...datasets, d]);
                setAnalysis({
                  ...analysis,
                  dataset_id: d.id,
                  min: -0.45,
                  max: -0.1,
                });
                setPane("data");
              }}
              onAdopt={(p) => {
                setProject(p);
                setPane("results");
              }}
            />
          )}
          {pane === "data" && (
            <DataPanel
              datasets={datasets}
              setDatasets={setDatasets}
              config={analysis}
              setConfig={setAnalysis}
              sample={practice}
            />
          )}
          {(error || solveError) && (
            <div className="error-banner" role="alert">
              <span>{error || solveError}</span>
              {error && (
                <button aria-label="Dismiss error" onClick={() => setError("")}>
                  <X />
                </button>
              )}
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <X />
              </button>
            </div>
          )}
          {pane !== "learn" && (
            <div className="status" role="status" aria-live="polite">
              <span className={status === "Converged" && !stale ? "ok" : ""} />
              {stale ? "Inputs changed · showing previous result" : status}
              {result && !stale && (
                <>
                  <i /> {result.convergence.iterations} iterations <i />{" "}
                  residual {result.convergence.residual.toExponential(2)}
                </>
              )}
            </div>
          )}
          {pane === "learn" && (
            <article className="guide" data-tour-id="learn">
              <header>
                <small>REQUIN HANDBOOK</small>
                <h2>From layer stack to trustworthy result</h2>
                <p>
                  A practical guide to the physical models, controls, figures,
                  and limits of Requin.
                </p>
              </header>
              <section className="guide-grid">
                <div>
                  <small>01 · BUILD</small>
                  <h3>Describe the device</h3>
                  <p>
                    Layers are ordered from the exposed surface to the
                    substrate. Give every layer a material, thickness, and donor
                    or acceptor concentration. Alloy fraction{" "}
                    <MathText tex="x" /> controls ternary materials such as{" "}
                    <MathText tex="Al_xGa_{1-x}As" />.
                  </p>
                </div>
                <div>
                  <small>02 · CONSTRAIN</small>
                  <h3>Set the experiment</h3>
                  <p>
                    Contacts establish boundary conditions. Temperature controls
                    carrier statistics. A smaller mesh resolves narrow depletion
                    or quantum regions but takes longer to solve.
                  </p>
                </div>
                <div>
                  <small>03 · SOLVE</small>
                  <h3>Watch convergence</h3>
                  <p>
                    Every edit starts a coarse preview, followed by a full
                    solve. Use results quantitatively only when the status reads
                    Converged and review any warnings below the figure.
                  </p>
                </div>
              </section>
              <section className="theory">
                <div>
                  <h3>Electrostatics</h3>
                  <MathText
                    display
                    tex="\frac{d}{dx}\!\left(\varepsilon(x)\frac{d\phi}{dx}\right)=-q\left(N_D^+-N_A^-+p-n\right)"
                  />
                  <p>
                    Requin discretizes Poisson’s equation conservatively across
                    material interfaces. The potential <MathText tex="\phi" />{" "}
                    shifts conduction and valence band edges; carrier densities
                    then change the charge, so the solver iterates to
                    consistency.
                  </p>
                </div>
                <div>
                  <h3>Quantum confinement</h3>
                  <MathText
                    display
                    tex="-\frac{\hbar^2}{2}\frac{d}{dx}\!\left(\frac{1}{m^*(x)}\frac{d\psi_i}{dx}\right)+E_c(x)\psi_i=E_i\psi_i"
                  />
                  <p>
                    The single-band, position-dependent effective-mass
                    Hamiltonian returns bound electron energies and normalized
                    wavefunctions inside the quantum window.
                  </p>
                </div>
              </section>
              <section className="reading-guide">
                <h3>How to read each figure</h3>
                <div>
                  <b>Band diagram</b>
                  <p>
                    <MathText tex="E_c" /> and <MathText tex="E_v" /> reveal
                    barriers, wells, depletion, and band bending. Abrupt steps
                    usually come from electron-affinity or band-gap changes at a
                    heterointerface.
                  </p>
                </div>
                <div>
                  <b>Carrier density</b>
                  <p>
                    <MathText tex="n" /> and <MathText tex="p" /> use
                    logarithmic scaling. Compare them with doping to identify
                    accumulation, depletion, and inversion.
                  </p>
                </div>
                <div>
                  <b>Electric field</b>
                  <p>
                    The sign gives direction; peaks identify strong space-charge
                    regions. Requin automatically switches between V/cm, kV/cm,
                    and MV/cm.
                  </p>
                </div>
                <div>
                  <b>Wavefunctions</b>
                  <p>
                    The amplitude shows spatial confinement. The computed-state
                    list in Quantum reports each eigenenergy.
                  </p>
                </div>
                <div>
                  <b>I–V and C–V</b>
                  <p>
                    Current uses mA/cm² and capacitance uses µF/cm² on separate
                    axes. These curves require an enabled voltage sweep.
                  </p>
                </div>
              </section>
              <section className="limits">
                <h3>Scientific limits</h3>
                <p>
                  The current implementation uses a single-band electron model,
                  quasi-static capacitance, ideal PN diffusion current, and
                  Schottky thermionic emission. It does not yet include
                  multiband k·p, tunneling/NEGF, avalanche, transient heating,
                  or lateral MOSFET/HEMT drain transport. Built-in material
                  values are curated defaults and should be overridden with
                  source-specific parameters for publication work.
                </p>
              </section>
            </article>
          )}
          {!["learn", "home", "studies", "data"].includes(pane) && (
            <article
              className="report"
              data-tour-id="results"
              style={{
                display: ["learn", "home", "studies", "data"].includes(pane)
                  ? "none"
                  : undefined,
              }}
            >
              <div className="report-title">
                <div>
                  <small>
                    REQUIN COMPUTATIONAL REPORT ·{" "}
                    {new Date().toLocaleDateString()}
                  </small>
                  <h2>
                    {project.analytic_verification
                      ? "Gauss-law verification"
                      : "Electrostatic and quantum analysis"}
                  </h2>
                  <p>
                    {project.layers.length} layers ·{" "}
                    {n(
                      project.layers.reduce((s, l) => s + l.thickness_nm, 0),
                      1,
                    )}{" "}
                    nm · {project.temperature_k} K
                  </p>
                </div>
                <div className="equation">
                  <MathText
                    tex={"\\nabla\\cdot(\\varepsilon\\nabla\\phi)=-\\rho"}
                  />
                </div>
              </div>
              <div className="metrics">
                <div>
                  <small>STATUS</small>
                  <b>
                    {stale
                      ? "Outdated"
                      : solveError
                        ? "Failed"
                        : result?.convergence.quality === "preview"
                          ? "Preview"
                          : result
                            ? result.convergence.converged
                              ? "Converged"
                              : "Not converged"
                            : "Pending"}
                  </b>
                </div>
                <div>
                  <small>SURFACE BIAS</small>
                  <b>{n(project.surface.voltage_v)} V</b>
                </div>
                <div>
                  <small>GRID POINTS</small>
                  <b>{result?.position_nm.length ?? "—"}</b>
                </div>
                <div>
                  <small>BOUND STATES</small>
                  <b>{result?.eigenstates.length ?? "—"}</b>
                </div>
              </div>
              <SchottkyMetrics
                project={resultProject}
                result={stale ? null : result}
                threshold={analysis.depletion_threshold}
                onThreshold={(depletion_threshold) =>
                  setAnalysis({ ...analysis, depletion_threshold })
                }
              />
              <nav className="tabs">
                {(
                  [
                    "potential",
                    "field",
                    "charge",
                    "bands",
                    "carriers",
                    "wave",
                    "sweep",
                  ] as ChartKind[]
                ).map((k) => (
                  <button
                    className={chart === k ? "active" : ""}
                    onClick={() => selectChart(k)}
                    key={k}
                  >
                    {k === "wave"
                      ? "Wavefunctions"
                      : k === "sweep"
                        ? "I–V / C–V"
                        : k[0].toUpperCase() + k.slice(1)}
                  </button>
                ))}
              </nav>
              <section className="figure">
                <div className="figure-head">
                  <div>
                    <small>FIGURE 01</small>
                    <h3>
                      {chart === "potential"
                        ? "Electrostatic potential"
                        : chart === "charge"
                          ? "Signed volume-charge density"
                          : chart === "bands"
                            ? "Energy-band diagram"
                            : chart === "carriers"
                              ? "Mobile carrier concentrations"
                              : chart === "field"
                                ? "Electric field"
                                : chart === "wave"
                                  ? "Lowest electron wavefunction"
                                  : "Voltage sweep"}
                    </h3>
                  </div>
                  <div className="graph-controls">
                    {result?.analytic &&
                      (chart === "potential" || chart === "field") && (
                        <label>
                          <input
                            type="checkbox"
                            checked={showReference}
                            onChange={(e) => setShowReference(e.target.checked)}
                          />{" "}
                          Analytic
                        </label>
                      )}
                    <label>
                      <input
                        type="checkbox"
                        checked={showGrid}
                        onChange={(e) => setShowGrid(e.target.checked)}
                      />{" "}
                      Grid
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={showMarkers}
                        onChange={(e) => setShowMarkers(e.target.checked)}
                      />{" "}
                      Points
                    </label>
                  </div>
                </div>
                <div className="series-strip">
                  <span className="blue" />
                  <MathText
                    tex={
                      chart === "potential"
                        ? "\\phi"
                        : chart === "charge"
                          ? "\\rho"
                          : chart === "bands"
                            ? "E_c"
                            : chart === "carriers"
                              ? "n"
                              : chart === "field"
                                ? "E"
                                : chart === "wave"
                                  ? "\\psi_1"
                                  : "J"
                    }
                  />
                  {(chart === "bands" ||
                    chart === "carriers" ||
                    chart === "sweep") && (
                    <>
                      <span className="mauve" />
                      <MathText
                        tex={
                          chart === "bands"
                            ? "E_v"
                            : chart === "carriers"
                              ? "p"
                              : "C"
                        }
                      />
                    </>
                  )}
                  {showReference &&
                    result?.analytic &&
                    (chart === "potential" || chart === "field") && (
                      <>
                        <span className="reference" /> analytic reference
                      </>
                    )}
                </div>
                {noChartData ? (
                  <div className="empty">
                    <Atom />
                    <h4>
                      {chart === "wave"
                        ? "No quantum states to display"
                        : "No sweep data to display"}
                    </h4>
                    <p>
                      {chart === "wave"
                        ? "Enable a quantum window to calculate electron states."
                        : "Enable a voltage sweep in the experiment settings."}
                    </p>
                    <button
                      onClick={() => {
                        setPane(chart === "wave" ? "quantum" : "structure");
                        requestAnimationFrame(() =>
                          document
                            .querySelector(
                              chart === "wave"
                                ? ".prominent"
                                : ".editor.compact",
                            )
                            ?.scrollIntoView({
                              block: "center",
                              behavior: "smooth",
                            }),
                        );
                      }}
                    >
                      Open {chart === "wave" ? "quantum" : "experiment"}{" "}
                      settings
                    </button>
                  </div>
                ) : result ? (
                  <Suspense
                    fallback={<div className="empty">Loading chart…</div>}
                  >
                    <Plot
                      kind={chart}
                      result={result}
                      project={resultProject}
                      showGrid={showGrid}
                      showMarkers={showMarkers}
                      showReference={showReference}
                    />
                  </Suspense>
                ) : (
                  <div className="empty">
                    <Waves />
                    Waiting for the numerical core…
                  </div>
                )}
                <p className="caption">
                  Position increases from the metal toward the semiconductor.
                  Dashed vertical markers show every layer or charge-region
                  boundary. Voltage-drop cards use the textbook convention: left
                  endpoint potential minus right endpoint potential.
                </p>
              </section>
              {result?.analytic && (
                <>
                  <div className="verification-grid">
                    <div>
                      <small>OXIDE Δφₒ = φ(0) − φ(xₒ)</small>
                      <b>{compact(result.analytic.oxide_voltage_v ?? NaN)} V</b>
                    </div>
                    <div>
                      <small>SILICON Δφ𝒹 = φ(xₒ) − φ(xₒ+x𝒹)</small>
                      <b>
                        {compact(
                          result.analytic.semiconductor_voltage_v ?? NaN,
                        )}{" "}
                        V
                      </b>
                    </div>
                    <div>
                      <small>OXIDE FIELD</small>
                      <b>
                        {compact(result.analytic.oxide_field_v_cm ?? NaN)} V/cm
                      </b>
                    </div>
                    <div>
                      <small>METAL σ</small>
                      <b>
                        {compact(result.analytic.balancing_sheet_charge_c_cm2)}{" "}
                        C/cm²
                      </b>
                    </div>
                    <div>
                      <small>MAX φ ERROR</small>
                      <b>{compact(result.analytic.max_potential_error_v)} V</b>
                    </div>
                    <div>
                      <small>MAX E ERROR</small>
                      <b>
                        {compact(result.analytic.max_field_error_v_cm)} V/cm
                      </b>
                    </div>
                  </div>
                  <details className="derivation">
                    <summary>
                      Equations, superposition, and sign convention
                    </summary>
                    <div>
                      <MathText
                        display
                        tex={
                          "E(x)=\\begin{cases}0,&x<0\\\\-\\rho x_d/\\varepsilon_{ox},&0<x<x_o\\\\\\rho(x-x_o-x_d)/\\varepsilon_s,&x_o<x<x_o+x_d\\\\0,&x>x_o+x_d\\end{cases}"
                        }
                      />
                      <MathText
                        display
                        tex={
                          "\\phi(x)=\\begin{cases}0,&x\\le0\\\\\\rho x_d x/\\varepsilon_{ox},&0<x<x_o\\\\\\rho x_d x_o/\\varepsilon_{ox}+\\frac{\\rho}{2\\varepsilon_s}[x_d^2-(x_o+x_d-x)^2],&x_o<x<x_o+x_d\\\\\\rho x_d x_o/\\varepsilon_{ox}+\\rho x_d^2/(2\\varepsilon_s),&x>x_o+x_d\\end{cases}"
                        }
                      />
                      <MathText
                        display
                        tex={
                          "\\Delta\\phi_o=\\phi(0)-\\phi(x_o)=-\\frac{\\rho x_d x_o}{\\varepsilon_{ox}}"
                        }
                      />
                      <MathText
                        display
                        tex={
                          "\\Delta\\phi_d=\\phi(x_o)-\\phi(x_o+x_d)=-\\frac{\\rho x_d^2}{2\\varepsilon_s}"
                        }
                      />
                      <p>
                        The potential reference is φ(0)=0; adding any constant
                        gives an equivalent solution. Potential is continuous.
                        With no interface sheet charge, normal displacement D is
                        continuous even though E changes at the SiO₂/Si
                        boundary. The displayed metal charge balances the
                        integrated semiconductor charge. The same result follows
                        by superposing the field of the metal sheet and the
                        uniformly charged silicon slab region by region.
                      </p>
                    </div>
                  </details>
                </>
              )}
              {result && (
                <>
                  <div className="analysis-strip">
                    <div>
                      <small>PEAK FIELD</small>
                      <b>{compact(summary!.field / 1000)} kV/cm</b>
                    </div>
                    <div>
                      <small>POTENTIAL RANGE</small>
                      <b>
                        {compact(summary!.low)} to {compact(summary!.high)} V
                      </b>
                    </div>
                    <div>
                      <small>PEAK |ρ|</small>
                      <b>{compact(summary!.charge)} C/cm³</b>
                    </div>
                  </div>
                  <details
                    className="data-browser"
                    onToggle={(e) => setDataOpen(e.currentTarget.open)}
                  >
                    <summary>
                      Data browser{" "}
                      <span>
                        {result.position_nm.length.toLocaleString()} points
                      </span>
                    </summary>
                    <div>
                      {dataOpen && (
                        <table>
                          <thead>
                            <tr>
                              <th>Position (nm)</th>
                              <th>Potential (V)</th>
                              <th>Field (V/cm)</th>
                              <th>ρ (C/cm³)</th>
                              <th>Material</th>
                            </tr>
                          </thead>
                          <tbody>
                            {result.position_nm.slice(0, 250).map((x, i) => (
                              <tr key={i}>
                                <td>{compact(x)}</td>
                                <td>{compact(result.potential_v[i])}</td>
                                <td>
                                  {compact(result.electric_field_v_cm[i])}
                                </td>
                                <td>
                                  {compact(result.charge_density_c_cm3[i])}
                                </td>
                                <td>{result.material[i]}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      {result.position_nm.length > 250 && (
                        <p>
                          Showing the first 250 points. Export → Data as CSV
                          writes the complete numerical and analytic data.
                        </p>
                      )}
                    </div>
                  </details>
                </>
              )}
              {result?.convergence.warnings.map((w, i) => (
                <div className="warning" key={i}>
                  {w}
                </div>
              ))}
            </article>
          )}
        </section>
      </main>
      {welcome && (
        <div className="welcome-overlay">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Welcome to Requin"
            className="welcome-card"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setWelcome(false);
                localStorage.setItem("requin.tour.seen", "1");
              }
              if (e.key === "Tab") {
                const buttons = [
                  ...e.currentTarget.querySelectorAll<HTMLButtonElement>(
                    "button:not(:disabled)",
                  ),
                ];
                const index = buttons.indexOf(
                  document.activeElement as HTMLButtonElement,
                );
                if (e.shiftKey && index <= 0) {
                  e.preventDefault();
                  buttons.at(-1)?.focus();
                } else if (!e.shiftKey && index === buttons.length - 1) {
                  e.preventDefault();
                  buttons[0]?.focus();
                }
              }
            }}
          >
            <SharkLogo />
            <small>WELCOME TO REQUIN</small>
            <h2>A clearer view of semiconductor physics.</h2>
            <p>
              Follow a hands-on tour through device setup, calculations, plots,
              and lab data. Your own workspace stays safe while you practice.
            </p>
            <div className="inline-actions">
              <button className="primary" onClick={() => startTour("all")}>
                Start interactive tour
              </button>
              <button
                onClick={() => {
                  setWelcome(false);
                  localStorage.setItem("requin.tour.seen", "1");
                  setPane("project");
                }}
              >
                Quick start
              </button>
              <button
                onClick={() => {
                  setWelcome(false);
                  localStorage.setItem("requin.tour.seen", "1");
                }}
              >
                Skip for now
              </button>
            </div>
          </section>
        </div>
      )}
      {tour && (
        <Tutorial chapter={tour} navigate={tourNavigate} onExit={endTour} />
      )}
    </LogoContext.Provider>
  );
}
export default App;
