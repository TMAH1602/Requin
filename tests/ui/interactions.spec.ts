import { test, expect, type Page } from "@playwright/test";

// Exercise the real React UI with deterministic IPC responses. The physics core
// is tested separately by cargo test; this suite covers frontend behavior.
async function start(page: Page, delay = 25) {
  await page.addInitScript(
    ({ delay }) => {
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
      localStorage.setItem("requin.tour.seen", "1");
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
    { delay },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Device", exact: true }).click();
}
async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
const menu = (page: Page, label: string) =>
  page
    .getByRole("navigation", { name: "Application menu" })
    .getByRole("button", { name: label, exact: true });
const settled = (page: Page) =>
  expect(page.locator(".status")).toContainText("Converged");

test("menus close outside, switch exclusively, select, and dismiss with Escape", async ({
  page,
}) => {
  await start(page);
  await settled(page);
  await menu(page, "File").click();
  await expect(page.getByRole("menu", { name: "File" })).toBeVisible();
  await page
    .getByRole("heading", {
      name: "Electrostatic and quantum analysis",
      exact: true,
    })
    .click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await menu(page, "File").click();
  await menu(page, "View").click();
  await expect(page.getByRole("menu")).toHaveCount(1);
  await page.getByRole("menuitem", { name: "Potential", exact: true }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Electrostatic potential" }),
  ).toBeVisible();
  await menu(page, "File").focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitem", { name: "New project" }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Import…" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu(page, "File")).toBeFocused();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await menu(page, "File").click();
  await page.getByLabel("Thickness", { exact: true }).focus();
  await expect(page.getByRole("menu")).toHaveCount(0);
});

test("numeric drafts permit exponents, restore invalid values, and metadata does not solve", async ({
  page,
}) => {
  await start(page);
  await settled(page);
  const before = await page.evaluate(
    () =>
      (window as any).calls.filter((c: any) => c.command === "run_simulation")
        .length,
  );
  const donors = page.getByLabel("Donors Nᴅ", { exact: true });
  await donors.fill("1e");
  await expect(donors).toHaveValue("1e");
  await donors.fill("1e17");
  await donors.press("Enter");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).calls.filter(
            (c: any) => c.command === "run_simulation",
          ).length,
      ),
    )
    .toBeGreaterThan(before);
  await settled(page);
  await donors.fill("");
  await donors.press("Tab");
  await expect(donors).toHaveAttribute("aria-invalid", "true");
  await expect(donors).toHaveValue("1e+17");
  const count = await page.evaluate(
    () =>
      (window as any).calls.filter((c: any) => c.command === "run_simulation")
        .length,
  );
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByLabel("Project name", { exact: true }).fill("Renamed diode");
  await page.waitForTimeout(650);
  expect(
    await page.evaluate(
      () =>
        (window as any).calls.filter((c: any) => c.command === "run_simulation")
          .length,
    ),
  ).toBe(count);
});

test("save, CSV, SVG, sweep CSV, and native print are actionable", async ({
  page,
}) => {
  await start(page);
  await settled(page);
  await expect(page.locator(".recharts-surface")).toBeVisible();
  await menu(page, "File").click();
  await page.getByRole("menuitem", { name: "Save project" }).click();
  await expect(page.locator(".notice")).toContainText("Project saved");
  for (const label of [
    "Data as CSV",
    "Sweep as CSV",
    "Current figure as SVG",
    "Report as PDF…",
  ]) {
    await menu(page, "Export").click();
    await page.getByRole("menuitem", { name: label, exact: true }).click();
    await expect(page.getByRole("menu")).toHaveCount(0);
  }
  const calls = await page.evaluate(() => (window as any).calls);
  const exports = calls
    .filter((c: any) => c.command === "save_export")
    .map((c: any) => c.args);
  expect(exports).toHaveLength(4);
  expect(
    exports.find((x: any) => x.name.endsWith("_sweep.csv")).content.split("\n"),
  ).toHaveLength(3);
  const svg = exports.find((x: any) => x.name.endsWith(".svg")).content;
  expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  expect(svg).toContain("rgb(");
  expect(calls.some((c: any) => c.command === "print_report")).toBe(true);
  await page.evaluate(() => ((window as any).failSave = true));
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Disk full");
});

test("empty figures lead to settings, new layers select themselves, and imports can repeat", async ({
  page,
}) => {
  await start(page);
  await settled(page);
  await page
    .getByRole("button", { name: "Wavefunctions", exact: true })
    .click();
  await expect(page.getByText("No quantum states to display")).toBeVisible();
  await page.getByRole("button", { name: "Open quantum settings" }).click();
  await expect(page.getByText("Enable Schrödinger solve")).toBeVisible();
  await page.getByRole("button", { name: "Device", exact: true }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator(".editor-head")).toContainText("Layer 3");
  await page.getByRole("button", { name: "Delete selected layer" }).click();
  await expect(page.locator(".layers > button")).toHaveCount(2);
  const file = {
    name: "test.requin",
    mimeType: "text/plain",
    buffer: Buffer.from('name = "PN diode"'),
  };
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.locator(".notice")).toContainText("Workspace opened");
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).calls.filter(
            (c: any) => c.command === "parse_workspace",
          ).length,
      ),
    )
    .toBe(2);
});

test("templates can be selected again and failures are visible", async ({
  page,
}) => {
  await start(page);
  await settled(page);
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "Projects", exact: true }).click();
    await choose(page, "Device template", "PN diode");
    await expect(page.locator(".notice")).toContainText("Template loaded");
  }
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await choose(page, "Device template", "GaAs / AlGaAs HEMT");
  await expect(page.getByRole("alert")).toContainText("Template unavailable");
});

test("solves are serialized, old results are marked, and stale exports are blocked", async ({
  page,
}) => {
  await start(page, 700);
  await page.getByRole("button", { name: "Experiment", exact: true }).click();
  await settled(page);
  await page.getByLabel("Surface potential / bias", { exact: true }).fill("1");
  await page
    .getByLabel("Surface potential / bias", { exact: true })
    .press("Enter");
  await expect(page.locator(".status")).toContainText("previous result");
  await menu(page, "Export").click();
  await expect(
    page.getByRole("menuitem", { name: "Data as CSV", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await page.getByLabel("Surface potential / bias", { exact: true }).fill("2");
  await page
    .getByLabel("Surface potential / bias", { exact: true })
    .press("Enter");
  await settled(page);
  expect(await page.evaluate(() => (window as any).maxActiveSolves)).toBe(1);
  const calls = await page.evaluate(() =>
    (window as any).calls.filter((c: any) => c.command === "run_simulation"),
  );
  expect(calls.at(-1).args.project.surface.voltage_v).toBe(2);
  expect(calls.at(-1).args.quality).toBe("full");
});

test("layout fits the minimum desktop width and light theme", async ({
  page,
}) => {
  await start(page);
  await settled(page);
  await expect(page.locator(".recharts-surface")).toBeVisible();
  await page.screenshot({ path: "test-results/requin-dark.png" });
  await page.setViewportSize({ width: 1040, height: 700 });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await choose(page, "Color theme", "Catppuccin Latte");
  expect(
    await page
      .locator(".workspace")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: "test-results/requin-light-compact.png" });
});

test("print uses a white report for every theme and cancelled saves give feedback", async ({
  page,
}) => {
  await start(page);
  await settled(page);
  await page.evaluate(() => ((window as any).cancelSave = true));
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".notice")).toContainText("Save cancelled");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  for (const theme of ["mocha", "latte", "macchiato", "tokyo", "gruvbox"]) {
    await page.emulateMedia({ media: "screen" });
    await choose(
      page,
      "Color theme",
      (
        {
          mocha: "Catppuccin Mocha",
          latte: "Catppuccin Latte",
          macchiato: "Catppuccin Macchiato",
          tokyo: "Tokyo Night",
          gruvbox: "Gruvbox",
        } as Record<string, string>
      )[theme],
    );
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".menubar")).toBeHidden();
    await expect(page.locator(".report")).toBeVisible();
    expect(
      await page
        .locator(".report")
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe("rgb(255, 255, 255)");
  }
});
