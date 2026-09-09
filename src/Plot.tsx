import { memo, useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Project, Result, ChartKind } from "./types";
import { compact, maxAbs } from "./format";
const Plot = memo(function Plot({
  kind,
  result,
  project,
  showGrid = true,
  showMarkers = false,
  showReference = true,
}: {
  kind: ChartKind;
  result: Result;
  project: Project;
  showGrid?: boolean;
  showMarkers?: boolean;
  showReference?: boolean;
}) {
  const xMicrons = (result.position_nm.at(-1) ?? 0) >= 1000;
  const maxField = useMemo(() => maxAbs(result.electric_field_v_cm), [result]);
  const fieldScale = maxField >= 1e6 ? 1e-6 : maxField >= 1e3 ? 1e-3 : 1;
  const fieldUnit =
    maxField >= 1e6 ? "MV/cm" : maxField >= 1e3 ? "kV/cm" : "V/cm";
  const data = useMemo(() => {
    if (kind === "sweep")
      return result.sweep.map((p) => ({
        x: p.voltage_v,
        a: p.current_a_m2 == null ? null : p.current_a_m2 * 0.1,
        b: p.capacitance_f_m2 == null ? null : p.capacitance_f_m2 * 100,
      }));
    const stride = Math.max(1, Math.ceil(result.position_nm.length / 1200));
    return result.position_nm.flatMap((x, i) =>
      i % stride &&
      i !== result.position_nm.length - 1 &&
      result.material[i] === result.material[i - 1] &&
      result.material[i] === result.material[i + 1] &&
      // Keep either side of a prescribed-charge step, including Si/Si regions.
      !(
        result.charge_density_c_cm3[i] !== result.charge_density_c_cm3[i - 1] &&
        result.charge_density_c_cm3[i] === result.charge_density_c_cm3[i + 1]
      ) &&
      !(
        result.charge_density_c_cm3[i] !== result.charge_density_c_cm3[i + 1] &&
        result.charge_density_c_cm3[i] === result.charge_density_c_cm3[i - 1]
      )
        ? []
        : [
            {
              x: xMicrons ? x / 1000 : x,
              a:
                kind === "potential"
                  ? result.potential_v[i]
                  : kind === "charge"
                    ? result.charge_density_c_cm3[i]
                    : kind === "bands"
                      ? result.conduction_band_ev[i]
                      : kind === "carriers"
                        ? Math.max(result.electron_cm3[i], 1)
                        : kind === "field"
                          ? result.electric_field_v_cm[i] * fieldScale
                          : (result.eigenstates[0]?.wavefunction[i] ?? 0),
              b:
                kind === "bands"
                  ? result.valence_band_ev[i]
                  : kind === "carriers"
                    ? Math.max(result.hole_cm3[i], 1)
                    : null,
              c:
                kind === "potential"
                  ? result.analytic?.potential_v[i]
                  : kind === "field" && result.analytic
                    ? result.analytic.electric_field_v_cm[i] * fieldScale
                    : null,
            },
          ],
    );
  }, [kind, result, xMicrons, fieldScale]);
  const log = kind === "carriers";
  const labels =
    kind === "potential"
      ? ["Potential", "Analytic potential"]
      : kind === "charge"
        ? ["Charge density", ""]
        : kind === "bands"
          ? ["Conduction band", "Valence band"]
          : kind === "carriers"
            ? ["n", "p"]
            : kind === "field"
              ? ["Field", "Analytic field"]
              : kind === "wave"
                ? ["ψ₁", ""]
                : ["J", "C"];
  let boundaryPosition = 0;
  const boundaries = project.layers.slice(0, -1).map((layer) => {
    boundaryPosition += layer.thickness_nm;
    return xMicrons ? boundaryPosition / 1000 : boundaryPosition;
  });
  return (
    <div className="plot">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 18, right: 24, bottom: 24, left: 18 }}
        >
          {showGrid && <CartesianGrid stroke="var(--grid)" vertical={false} />}
          <XAxis
            dataKey="x"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={compact}
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            label={{
              value:
                kind === "sweep"
                  ? "Voltage (V)"
                  : `Position (${xMicrons ? "µm" : "nm"})`,
              position: "insideBottom",
              offset: -15,
              fill: "var(--muted)",
            }}
          />
          <YAxis
            yAxisId="left"
            scale={log ? "log" : "auto"}
            domain={["auto", "auto"]}
            tickFormatter={compact}
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            width={72}
            label={{
              value:
                kind === "potential"
                  ? "Potential (V)"
                  : kind === "charge"
                    ? "Charge (C/cm³)"
                    : kind === "bands"
                      ? "Energy (eV)"
                      : kind === "carriers"
                        ? "Density (cm⁻³)"
                        : kind === "field"
                          ? fieldUnit
                          : kind === "wave"
                            ? "ψ (nm⁻¹ᐟ²)"
                            : "J (mA/cm²)",
              angle: -90,
              position: "insideLeft",
              fill: "var(--muted)",
            }}
          />
          {kind === "sweep" && (
            <YAxis
              yAxisId="right"
              orientation="right"
              tickFormatter={compact}
              tick={{ fill: "var(--muted)", fontSize: 11 }}
              width={66}
              label={{
                value: "C (µF/cm²)",
                angle: 90,
                position: "insideRight",
                fill: "var(--muted)",
              }}
            />
          )}
          <Tooltip
            formatter={(value) => compact(Number(value))}
            contentStyle={{
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: 8,
            }}
          />
          {!log && (
            <ReferenceLine yAxisId="left" y={0} stroke="var(--border)" />
          )}
          {kind !== "sweep" &&
            boundaries.map((x) => (
              <ReferenceLine
                key={x}
                yAxisId="left"
                x={x}
                stroke="var(--muted)"
                strokeDasharray="2 5"
              />
            ))}
          <Line
            isAnimationActive={false}
            yAxisId="left"
            type="linear"
            dataKey="a"
            name={labels[0]}
            stroke="var(--blue)"
            dot={showMarkers ? { r: 2 } : false}
            strokeWidth={2}
          />
          {data.some((d) => d.b != null) && (
            <Line
              isAnimationActive={false}
              yAxisId={kind === "sweep" ? "right" : "left"}
              type="linear"
              dataKey="b"
              name={labels[1]}
              stroke="var(--mauve)"
              dot={showMarkers ? { r: 2 } : false}
              strokeWidth={2}
            />
          )}{" "}
          {showReference && data.some((d) => "c" in d && d.c != null) && (
            <Line
              isAnimationActive={false}
              yAxisId="left"
              type="linear"
              dataKey="c"
              name={labels[1]}
              stroke="var(--green)"
              strokeDasharray="7 5"
              dot={false}
              strokeWidth={2}
            />
          )}{" "}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});
export default Plot;
