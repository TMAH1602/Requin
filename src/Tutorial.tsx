import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PageId } from "./lab";
export interface TutorialChapter {
  id: string;
  title: string;
  page: PageId;
  steps: { target: string; title: string; body: string; click?: boolean }[];
}
export const chapters: TutorialChapter[] = [
  {
    id: "orientation",
    title: "Orientation & Home",
    page: "home",
    steps: [
      {
        target: "home",
        title: "Your scientific workspace",
        body: "Start with a template, reopen a saved workspace, or import measurements. The labeled navigation follows a device experiment from setup through analysis.",
      },
      {
        target: "nav-structure",
        title: "Open the device editor",
        body: "Click Device to inspect the surface-to-substrate layer stack.",
        click: true,
      },
    ],
  },
  {
    id: "projects",
    title: "Projects, templates & files",
    page: "project",
    steps: [
      {
        target: "project",
        title: "A portable experiment",
        body: "A saved workspace contains the device, imported measurements, study definitions, and fit settings. Version 1 projects and legacy 1D Poisson decks can still be opened.",
      },
      {
        target: "templates",
        title: "Choose a starting point",
        body: "Templates supply a complete device. The Schottky preset uses n-type Si, a 0.6 eV metal barrier, and an ohmic back contact. Open the menu to explore the options.",
        click: true,
      },
    ],
  },
  {
    id: "device",
    title: "Layers, materials & charge",
    page: "structure",
    steps: [
      {
        target: "structure",
        title: "Build from surface to substrate",
        body: "Each layer has a material, thickness, and charge model. Donors supply electrons; acceptors supply holes. Prescribed charge is useful for Gauss-law exercises.",
      },
      {
        target: "layer-editor",
        title: "Inspect a layer",
        body: "Thickness uses nm; donor and acceptor densities use cm⁻³. Sheet charge is signed elementary charges per cm² at the leading interface. Alloy fraction changes the material composition. Layer resolution optionally overrides the global mesh near narrow features.",
      },
    ],
  },
  {
    id: "experiment",
    title: "Contacts, mesh & convergence",
    page: "experiment",
    steps: [
      {
        target: "experiment",
        title: "Define the experiment",
        body: "A Schottky contact sets a barrier; an ohmic contact references neutral material. Fixed potential pins voltage; zero field sets a Neumann condition. Positive metal voltage is forward bias for an n-type Schottky diode.",
      },
      {
        target: "experiment",
        title: "Resolution and reliability",
        body: "Use a mesh much smaller than the Debye length. Requin first previews the profile, then refines it. Quantitative exports require a converged full result. Advanced settings control tolerance, mixing, and carrier statistics.",
      },
    ],
  },
  {
    id: "quantum",
    title: "Quantum states",
    page: "quantum",
    steps: [
      {
        target: "quantum",
        title: "Locate confined electrons",
        body: "Enable a Schrödinger window around a well or channel. Choose its bounds and the number of eigenstates. Wavefunctions are normalized; this electron-only calculation does not feed quantum charge back into Poisson.",
      },
    ],
  },
  {
    id: "studies",
    title: "Studies & comparisons",
    page: "studies",
    steps: [
      {
        target: "studies",
        title: "Compare repeatable cases",
        body: "Bias and doping studies preserve the base device and calculate each case in sequence. The lab buttons prepare the exact bias, doping, and C–V lists.",
      },
      {
        target: "run-study",
        title: "Run a comparison",
        body: "Click Save and run study. You can cancel between cases, toggle curves, inspect an individual device, and export the complete arrays.",
        click: true,
      },
    ],
  },
  {
    id: "results",
    title: "Results, graphs & derived values",
    page: "results",
    steps: [
      {
        target: "results",
        title: "Read the physical story",
        body: "Charge creates electric field; field is minus the potential gradient. Bands show electron energy, while carrier plots show mobile populations. Hover gives numerical values; grid, points, and analytic overlays aid interpretation.",
      },
      {
        target: "results",
        title: "Depletion and Debye length",
        body: "Schottky results include the depletion approximation, Debye length, a threshold-based recovery edge, and charge-equivalent width. The diffuse tail means these widths need not coincide. Check the stated definitions and convergence.",
      },
    ],
  },
  {
    id: "data",
    title: "Importing measurements",
    page: "data",
    steps: [
      {
        target: "import-data",
        title: "Bring in measured data",
        body: "Import CSV, TSV, or instrument text. Confirm columns and units in the preview. Headers and preambles are skipped, while duplicate samples and raw order are retained.",
      },
      {
        target: "import-data",
        title: "Try a practice measurement",
        body: "Click Load practice measurement, select amperes in the preview, then import. Practice data are synthetic and kept separate from your own project.",
      },
    ],
  },
  {
    id: "fitting",
    title: "I–V and C–V fitting",
    page: "data",
    steps: [
      {
        target: "fit",
        title: "Choose the physical region",
        body: "Linear plots preserve current sign; log plots show positive values. Select an exponential forward-current region using bounds or a graph drag. Automatic range selection is a suggestion that you should inspect.",
      },
      {
        target: "fit",
        title: "Understand the fitted parameters",
        body: "I–V gives ideality factor and saturation current. To find barrier height, supply area; to find area, supply barrier height. C–V analysis extracts doping from the 1/C² slope. Residuals and standard errors help assess the fit.",
      },
    ],
  },
  {
    id: "exports",
    title: "CSV, figures & reports",
    page: "results",
    steps: [
      {
        target: "export-menu",
        title: "Share reproducible results",
        body: "Open Export for full-resolution profile and sweep CSV, the current SVG figure, and a printable PDF report. Studies and Data have their own export actions. Saved workspaces preserve the experiment inputs.",
        click: true,
      },
    ],
  },
  {
    id: "appearance",
    title: "Appearance & logos",
    page: "settings",
    steps: [
      {
        target: "settings",
        title: "Make Requin comfortable",
        body: "Choose any existing color theme, font scale, and comfortable or compact density. Delta, Wedge, and the anime Chibi share the same visual identity. Runtime OS icons update where supported.",
      },
      {
        target: "tutorial-replay",
        title: "Return to any chapter",
        body: "The replay dropdown offers the full tutorial or an individual section. You can exit now and your original workspace will be restored.",
      },
    ],
  },
  {
    id: "limits",
    title: "Scientific model limits",
    page: "learn",
    steps: [
      {
        target: "learn",
        title: "Know what the model means",
        body: "Poisson computes one-dimensional electrostatics. C–V is quasi-static. I–V uses approximate diffusion or thermionic-emission models, not drift–diffusion transport. Read the handbook before interpreting high-bias, degenerate, or quantum results.",
      },
    ],
  },
];
export function Tutorial({
  chapter,
  navigate,
  onExit,
}: {
  chapter: string;
  navigate: (page: PageId, chapter?: string) => void;
  onExit: () => void;
}) {
  const list =
    chapter === "all" ? chapters : chapters.filter((c) => c.id === chapter);
  const steps = list.flatMap((c) =>
    c.steps.map((s) => ({
      ...s,
      page: c.page,
      chapter: c.title,
      chapterId: c.id,
    })),
  );
  const [index, setIndex] = useState(0),
    [done, setDone] = useState(false),
    [rect, setRect] = useState<DOMRect | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const step = steps[index];
  useEffect(() => {
    setDone(false);
    navigate(step.page, step.chapterId);
    localStorage.setItem(
      "requin.tour.progress",
      JSON.stringify({ chapter, index }),
    );
    let target: Element | null = null;
    const update = () => {
      target = document.querySelector(`[data-tour-id="${step.target}"]`);
      setRect(target?.getBoundingClientRect() ?? null);
    };
    const timer = setTimeout(() => {
      update();
      target?.scrollIntoView({ block: "nearest", behavior: "instant" });
      update();
      card.current?.focus();
    }, 120);
    const tick = setInterval(update, 400);
    const clicked = (e: Event) => {
      if ((e.target as Element)?.closest?.(`[data-tour-id="${step.target}"]`))
        setDone(true);
    };
    document.addEventListener("click", clicked);
    window.addEventListener("resize", update);
    return () => {
      clearTimeout(timer);
      clearInterval(tick);
      document.removeEventListener("click", clicked);
      window.removeEventListener("resize", update);
    };
  }, [index, chapter]);
  const finish = () => {
    localStorage.setItem("requin.tour.seen", "1");
    localStorage.removeItem("requin.tour.progress");
    onExit();
  };
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        !e.defaultPrevented &&
        !document.querySelector('[role="listbox"]')
      ) {
        e.preventDefault();
        finish();
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [onExit]);
  const top =
    rect && rect.bottom + 270 < innerHeight
      ? rect.bottom + 12
      : Math.max(12, innerHeight - 285);
  return createPortal(
    <div className="tour-layer">
      {rect && (
        <div
          className="tour-spotlight"
          style={{
            left: rect.left - 4,
            top: rect.top - 4,
            width: rect.width + 8,
            height: rect.height + 8,
          }}
        />
      )}
      <div
        className="tour-card"
        ref={card}
        role="dialog"
        aria-modal="false"
        aria-label="Interactive tutorial"
        tabIndex={-1}
        style={{
          top,
          left: Math.max(12, Math.min(rect?.left ?? 200, innerWidth - 420)),
        }}
      >
        <small>
          {step.chapter} · {index + 1}/{steps.length}
        </small>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        {step.click && !done && (
          <p className="tour-task">
            Try the highlighted control, then continue.
          </p>
        )}
        <div className="inline-actions">
          <button onClick={finish}>Exit tour</button>
          <button disabled={index === 0} onClick={() => setIndex(index - 1)}>
            Back
          </button>
          <button
            className="primary"
            disabled={step.click && !done}
            onClick={() =>
              index === steps.length - 1 ? finish() : setIndex(index + 1)
            }
          >
            {index === steps.length - 1 ? "Finish" : "Next"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
