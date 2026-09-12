# Changelog

## 0.2.0 — 2026-09-12

- Introduce labeled workflow navigation, responsive inspectors, professional keyboard-accessible selects, and replayable full/chapter tutorials in a safe practice workspace.
- Default to Delta, with selectable Wedge and a new anime-style Chibi; preserve themes, density, and font controls.
- Add portable v2 workspaces with embedded measurements, study definitions, and analysis settings; retain v1 and legacy-deck import.
- Add Schottky lab studies, C–V doping extraction, measurement import/unit confirmation, linear/log plots, graph-selected fit ranges, residuals, and conditional barrier/area calculations.
- Add Fermi–Dirac statistics, damped Newton charge updates, explicit majority-carrier approximation, and surface-displacement terminal capacitance with per-point convergence checks.
- Share solve scheduling across live results and studies; omit preview sweeps, retain study curves across navigation, defer equations/hidden tables/residual plots, and bound display sampling and study caches.
- Verify lab bias/doping profiles, mesh refinement, C–V doping recovery in both statistics modes, synthetic fits, and the complete tutorial. Document scientific boundaries in `docs/SCHOTTKY_VERIFICATION.md`.

## 0.1.1 — 2026-09-08

- Replace the mascot with the refined angular Wedge shark logo throughout the UI, favicon, README, and desktop icons.
- Dismiss menus on outside click, selection, focus loss, and Escape; add keyboard navigation.
- Improve numeric editing, field validation, spacing, focus states, themes, and empty-chart guidance.
- Use native save dialogs for desktop project/data exports, preserve SVG colors, and fix native report printing.
- Fix repeat imports and template selection; select newly added layers and expose contact controls.
- Serialize and debounce solves, skip obsolete requests, mark stale results, and prevent stale exports.
- Load charts separately, reduce unnecessary redraws, and avoid unused math font assets.
- Add automated UI regression checks alongside the numerical tests.

## 0.1.0

- Initial macOS release with fixed-charge electrostatics and MKC A1.4 analytic verification.
