import { type Page } from "@playwright/test";

// Exercise the real React UI with deterministic IPC responses. The physics core
// is tested separately by cargo test; this suite covers frontend behavior.
export async function start(page: Page, delay = 25, welcome = false) {
  await page.addInitScript(
    ({ delay, welcome }) => {
      const layer = {
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
      };
      const project = {
        schema_version: 1,
        name: "PN diode",
        description: "Silicon junction",
        temperature_k: 300,
        mesh_spacing_nm: 5,
        fully_ionized: true,
        layers: [
          layer,
          { ...layer, name: "N region", donors_cm3: 1e16, acceptors_cm3: 0 },
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
      if (!welcome) localStorage.setItem("requin.tour.seen", "1");
      const w = window as any;
      w.calls = [];
      w.activeSolves = 0;
      w.maxActiveSolves = 0;
      w.failSave = false;
      w.cancelSave = false;
      w.isTauri = true;
      w.__TAURI_INTERNALS__ = {
        invoke: async (command: string, args: any = {}) => {
          w.calls.push({ command, args: structuredClone(args) });
          if (command === "set_logo") return;
          if (command === "parse_workspace")
            return {
              schema_version: 2,
              device: structuredClone(project),
              datasets: [],
              studies: [],
              analysis: {},
            };
          if (command === "serialize_workspace") return "schema_version = 2";
          if (command === "default_project") return structuredClone(project);
          if (command === "project_template") {
            if (args.kind === "hemt") throw "Template unavailable";
            const p = structuredClone(project);
            if (args.kind === "mkc_a1_4") {
              p.name = "MKC A1.4";
              p.analytic_verification = true;
              p.layers.forEach((l) => (l.charge_mode = "fixed_volume"));
            }
            return p;
          }
          if (command === "parse_project_toml") return structuredClone(project);
          if (command === "serialize_project") return 'name = "PN diode"';
          if (command === "save_export") {
            if (w.failSave) throw "Disk full";
            return w.cancelSave ? null : `/tmp/${args.name}`;
          }
          if (command === "print_report") return;
          if (command === "run_simulation") {
            w.activeSolves++;
            w.maxActiveSolves = Math.max(w.maxActiveSolves, w.activeSolves);
            await new Promise((resolve) => setTimeout(resolve, delay));
            w.activeSolves--;
            if (args.project.mesh_spacing_nm <= 0)
              throw "mesh spacing must be positive";
            const size = 301;
            const points = Array.from(
              { length: size },
              (_, i) => (i * 1000) / (size - 1),
            );
            const potential = points.map(
              (x) =>
                args.project.surface.voltage_v +
                0.6 / (1 + Math.exp(-(x - 500) / 60)),
            );
            return {
              position_nm: points,
              potential_v: potential,
              electric_field_v_cm: points.map(
                (x) => -22000 * Math.exp(-(((x - 500) / 120) ** 2)),
              ),
              charge_density_c_cm3: points.map((x) =>
                x < 500 ? -0.001 : 0.001,
              ),
              conduction_band_ev: potential.map((x) => 1 - x),
              valence_band_ev: potential.map((x) => -0.1 - x),
              electron_cm3: points.map((x) => 1e4 + (1e16 * x) / 1000),
              hole_cm3: points.map((x) => 1e4 + 1e16 * (1 - x / 1000)),
              net_charge_cm3: points.map(() => 0),
              material: points.map(() => "Si"),
              eigenstates: [],
              sweep: args.project.sweep.enabled
                ? [
                    {
                      voltage_v: 0,
                      charge_c_m2: 0,
                      capacitance_f_m2: 0.1,
                      current_a_m2: null,
                    },
                    {
                      voltage_v: 0.1,
                      charge_c_m2: 0.01,
                      capacitance_f_m2: 0.1,
                      current_a_m2: 0.2,
                    },
                  ]
                : [],
              analytic: null,
              convergence: {
                converged: true,
                iterations: 6,
                residual: 1e-9,
                quality: args.quality,
                warnings: [],
              },
            };
          }
          throw `Unexpected command: ${command}`;
        },
      };
    },
    { delay, welcome },
  );
  await page.goto("/");
  if (!welcome)
    await page.getByRole("button", { name: "Device", exact: true }).click();
}
export async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
