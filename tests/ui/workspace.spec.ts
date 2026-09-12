import { test, expect } from "@playwright/test";
import { start, choose } from "./support";
import { chapters } from "../../src/Tutorial";
test("every navigation section has tutorial coverage", () => {
  for (const page of [
    "home",
    "project",
    "structure",
    "experiment",
    "quantum",
    "studies",
    "data",
    "results",
    "learn",
    "settings",
  ])
    expect(chapters.some((c) => c.page === page)).toBeTruthy();
});
test("welcome, hands-on tour, and workspace restoration", async ({ page }) => {
  await start(page, 25, true);
  await expect(
    page.getByRole("dialog", { name: "Welcome to Requin" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start interactive tour" }).click();
  await expect(
    page.getByRole("dialog", { name: "Interactive tutorial" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Next", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Device", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Next", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Exit tour" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await choose(page, "Replay tutorial", "Quantum states");
  await page
    .getByRole("button", { name: "Start tutorial", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Locate confined electrons",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("main")).toHaveAttribute("data-page", "settings");
});
test("logo preferences, clean selects, and all themes", async ({ page }) => {
  await start(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("radio", { name: "Chibi", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Chibi" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.getByRole("combobox", { name: "Color theme" }).click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page
    .getByRole("heading", { name: "Electrostatic and quantum analysis" })
    .click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await page.getByRole("combobox", { name: "Color theme" }).focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toHaveAttribute("data-theme", "gruvbox");
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Chibi" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.screenshot({ path: "test-results/workspace-home.png" });
});
test("measured data preview requires units, fitting and v2 save retain data", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("button", { name: "Data", exact: true }).click();
  await page.getByRole("button", { name: "Load practice measurement" }).click();
  await page.getByRole("button", { name: "Import confirmed data" }).click();
  await expect(page.getByRole("alert")).toContainText("Confirm");
  await choose(page, "Measurement unit", "A");
  await page.getByRole("button", { name: "Import confirmed data" }).click();
  await expect(
    page.getByRole("heading", { name: "Thermionic-emission fit" }),
  ).toBeVisible();
  await expect(
    page.getByText("Ideality factor n", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Log (positive values)", exact: true })
    .click();
  const oldMaximum = await page.getByLabel("Fit maximum voltage").inputValue();
  const plot = page.locator(".analysis-chart .recharts-wrapper").first();
  await plot.scrollIntoViewIfNeeded();
  const box = (await plot.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.92, box.y + box.height * 0.5, {
    steps: 12,
  });
  await page.mouse.up();
  await expect(page.getByLabel("Fit maximum voltage")).not.toHaveValue(
    oldMaximum,
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const saved = await page.evaluate(
    () =>
      (window as any).calls.findLast(
        (c: any) => c.command === "serialize_workspace",
      ).args.workspace,
  );
  expect(saved.datasets).toHaveLength(1);
  expect(saved.datasets[0].points).toHaveLength(101);
  expect(saved.schema_version).toBe(2);
  await page.screenshot({
    path: "test-results/workspace-data.png",
    fullPage: true,
  });
});
test("study cases serialize and complete through the shared queue", async ({
  page,
}) => {
  await start(page);
  await expect(page.locator(".status")).toContainText("Converged");
  await page.getByRole("button", { name: "Studies", exact: true }).click();
  await page.getByLabel("Study values").fill("0, 0.2");
  await page.getByRole("button", { name: "Save and run study" }).click();
  await expect(page.getByText("Study complete", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).maxActiveSolves)).toBe(1);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const saved = await page.evaluate(
    () =>
      (window as any).calls.findLast(
        (c: any) => c.command === "serialize_workspace",
      ).args.workspace,
  );
  expect(saved.studies[0].values).toEqual([0, 0.2]);
  await page.getByRole("button", { name: "Results", exact: true }).click();
  await page.getByRole("button", { name: "Studies", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Inspect device" }),
  ).toHaveCount(2);
});

test("the whole tutorial reaches every chapter and restores the user workspace", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByLabel("Project name", { exact: true }).fill("My real device");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Start tutorial", exact: true })
    .click();
  for (let i = 0; i < 30; i++) {
    const card = page.getByRole("dialog", { name: "Interactive tutorial" });
    if (!(await card.count())) break;
    const next = card.getByRole("button", { name: /^(Next|Finish)$/ });
    if (await next.isDisabled()) {
      const heading = await card.getByRole("heading").innerText();
      if (heading === "Open the device editor")
        await page.getByRole("button", { name: "Device", exact: true }).click();
      else if (heading === "Choose a starting point") {
        await page.getByRole("combobox", { name: "Device template" }).click();
        await page.keyboard.press("Escape");
      } else if (heading === "Run a comparison")
        await page.getByRole("button", { name: "Save and run study" }).click();
      else if (heading === "Share reproducible results") {
        await page
          .getByRole("navigation", { name: "Application menu" })
          .getByRole("button", { name: "Export", exact: true })
          .click();
      }
    }
    await expect(next).toBeEnabled();
    await next.click();
  }
  await expect(
    page.getByRole("dialog", { name: "Interactive tutorial" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await expect(page.getByLabel("Project name", { exact: true })).toHaveValue(
    "My real device",
  );
});
