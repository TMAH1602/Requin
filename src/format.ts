export function n(v: number, digits = 3) {
  if (!Number.isFinite(v)) return "—";
  return Math.abs(v) >= 1e4 || (Math.abs(v) < 1e-2 && v !== 0)
    ? v.toExponential(2)
    : v.toFixed(digits);
}
const formatter = new Intl.NumberFormat("en-US", {
  maximumSignificantDigits: 4,
});
export const maxAbs = (values: number[]) =>
  values.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
export function compact(v: number) {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a === 0) return "0";
  if (a >= 1e9 || a < 1e-3) {
    const e = Math.floor(Math.log10(a));
    const m = v / 10 ** e;
    return `${m.toFixed(Math.abs(m) >= 10 ? 0 : 1)}e${e}`;
  }
  return formatter.format(v);
}
