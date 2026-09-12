import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import {
  analyze,
  defaultAnalysis,
  parseTable,
  regression,
  suggestRange,
  type Dataset,
  EPS,
  Q,
  KB,
} from "../../src/lab";
test("instrument preambles, delimiters, duplicates and raw order survive import", () => {
  const t = parseTable(
    "[0, 0, 0]\r\nVoltage Current\r\n0.2\t2e-5\r\n0.1\t1e-6\r\n0.1\t1e-6\r\nbad row\n",
  );
  expect(t.rows).toEqual([
    [0.2, 2e-5],
    [0.1, 1e-6],
    [0.1, 1e-6],
  ]);
  expect(t.skipped).toBe(3);
  expect(parseTable("V,I\n0,1\n1,2\n2,3").rows).toHaveLength(3);
  expect(() => parseTable("nothing useful")).toThrow();
});
test("synthetic thermionic parameters and conditional barrier/area extraction", () => {
  const temperature = 300,
    n = 1.2,
    area = 1e-4,
    barrier = 0.6,
    richardson = 112,
    is =
      area *
      richardson *
      temperature ** 2 *
      Math.exp(-barrier / (KB * temperature));
  const data: Dataset = {
    id: "synthetic",
    name: "synthetic",
    source: "test",
    quantity: "current",
    unit: "A",
    headers: [],
    skipped: 0,
    points: Array.from({ length: 100 }, (_, i) => {
      const x = 0.1 + i * 0.001;
      return {
        x,
        y:
          is * Math.exp(x / (n * KB * temperature)) * (1 + 0.002 * Math.sin(i)),
      };
    }),
  };
  const result = analyze(data, {
    ...defaultAnalysis,
    min: 0.1,
    max: 0.2,
    area,
    known: "area",
  });
  expect(result.ideality!).toBeCloseTo(n, 2);
  expect(result.barrier!).toBeCloseTo(barrier, 3);
  expect(result.fit.r2).toBeGreaterThan(0.999);
  const areaFit = analyze(data, {
    ...defaultAnalysis,
    min: 0.1,
    max: 0.2,
    barrier,
    known: "barrier",
  });
  expect(areaFit.area! / area).toBeCloseTo(1, 2);
  const [min, max] = suggestRange(data);
  expect(max).toBeGreaterThan(min);
  expect(() =>
    analyze(data, { ...defaultAnalysis, min: 0.1, max: 0.102 }),
  ).toThrow("five");
});
test("C-V regression recovers doping with area normalization", () => {
  const doping = 1e17,
    area = 2e-4;
  const data: Dataset = {
    id: "cv",
    name: "cv",
    source: "test",
    quantity: "capacitance",
    unit: "F",
    headers: [],
    skipped: 0,
    points: Array.from({ length: 51 }, (_, i) => {
      const x = -0.5 + 0.01 * i;
      return { x, y: area * Math.sqrt((Q * EPS * doping) / (2 * (0.6 - x))) };
    }),
  };
  const result = analyze(data, { ...defaultAnalysis, min: -0.5, max: 0, area });
  expect(result.doping! / doping).toBeCloseTo(1, 10);
  expect(result.intercept_v).toBeCloseTo(0.6, 10);
  expect(() =>
    regression([
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 1, y: 3 },
    ]),
  ).toThrow("distinct");
});
test("local Field measurement imports and produces a transparent fit", () => {
  test.skip(
    !existsSync("field/diodesweep.txt"),
    "Private coursework file is not distributed with Requin.",
  );
  const t = parseTable(readFileSync("field/diodesweep.txt", "utf8"));
  expect(t.rows).toHaveLength(161);
  const data: Dataset = {
    id: "field",
    name: "field",
    source: "field",
    quantity: "current",
    unit: "A",
    headers: t.headers,
    skipped: t.skipped,
    points: t.rows.map((r) => ({ x: r[0], y: r[1] })),
  };
  const [min, max] = suggestRange(data),
    r = analyze(data, { ...defaultAnalysis, min, max });
  expect(r.fit.count).toBe(5);
  expect(r.ideality).toBeCloseTo(1.056, 2);
  expect(r.fit.r2).toBeGreaterThan(0.99);
  expect(r.fit.r2).toBeLessThan(0.995);
});
