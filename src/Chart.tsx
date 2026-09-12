import { memo, useMemo, useRef } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceArea,
} from "recharts";
export interface Curve {
  name: string;
  points: { x: number; y: number | null }[];
  dashed?: boolean;
}
export default memo(function Chart({
  curves,
  xLabel = "Voltage (V)",
  yLabel,
  log = false,
  range,
  onRange,
}: {
  curves: Curve[];
  xLabel?: string;
  yLabel: string;
  log?: boolean;
  range?: [number, number];
  onRange?: (range: [number, number]) => void;
}) {
  const prepared = useMemo(
    () =>
      curves.map((c) => ({
        ...c,
        points: c.points
          .filter((p) => Number.isFinite(p.x))
          .map((p) => ({
            ...p,
            y:
              p.y !== null && Number.isFinite(p.y) && (!log || p.y > 0)
                ? p.y
                : null,
          }))
          .filter(
            (_, i, a) =>
              a.length < 2400 ||
              i % Math.ceil(a.length / 2400) === 0 ||
              i === a.length - 1,
          ),
      })),
    [curves, log],
  );
  const colors = [
    "var(--blue)",
    "var(--mauve)",
    "var(--green)",
    "var(--accent)",
    "var(--red)",
    "#e5af67",
  ];
  const anchor = useRef<number | null>(null);
  return (
    <div className="analysis-chart figure">
      <ResponsiveContainer width="100%" height={360}>
        <LineChart
          margin={{ top: 15, right: 25, left: 30, bottom: 25 }}
          onMouseDown={(e) => {
            anchor.current = Number(e.activeLabel);
          }}
          onMouseUp={(e) => {
            const end = Number(e.activeLabel);
            if (
              onRange &&
              anchor.current !== null &&
              Number.isFinite(anchor.current) &&
              Number.isFinite(end) &&
              anchor.current !== end
            )
              onRange([
                Math.min(anchor.current, end),
                Math.max(anchor.current, end),
              ]);
            anchor.current = null;
          }}
        >
          <CartesianGrid stroke="var(--grid)" />
          <XAxis
            dataKey="x"
            type="number"
            domain={["dataMin", "dataMax"]}
            allowDuplicatedCategory={false}
            tickFormatter={(v) => Number(v).toPrecision(3)}
            label={{ value: xLabel, position: "insideBottom", offset: -15 }}
          />
          <YAxis
            scale={log ? "log" : "auto"}
            domain={["auto", "auto"]}
            tickFormatter={(v) => Number(v).toExponential(1)}
            width={85}
            label={{
              value: yLabel,
              angle: -90,
              position: "insideLeft",
              offset: -15,
            }}
          />
          <Tooltip
            contentStyle={{
              background: "var(--panel)",
              border: "1px solid var(--border)",
            }}
            formatter={(v) => Number(v).toExponential(5)}
          />
          <Legend verticalAlign="top" />
          {range && (
            <ReferenceArea
              x1={range[0]}
              x2={range[1]}
              fill="var(--accent)"
              fillOpacity={0.1}
            />
          )}
          {prepared.map((c, i) => (
            <Line
              key={c.name}
              data={c.points}
              name={c.name}
              dataKey="y"
              type="linear"
              stroke={colors[i % colors.length]}
              strokeDasharray={c.dashed ? "5 5" : undefined}
              dot={c.points.length < 200 ? { r: 2 } : false}
              isAnimationActive={false}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});
