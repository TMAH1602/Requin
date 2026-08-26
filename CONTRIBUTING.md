# Contributing to Requin

Thank you for helping make semiconductor simulation more approachable and reproducible.

## Good contributions

- Analytic or published benchmark structures with clear expected values and citations.
- Numerical stability, convergence, meshing, or performance improvements.
- Material parameters with primary-source provenance, temperature range, crystal phase, and units.
- Legacy input compatibility and representative test decks.
- Scientific visualization, accessibility, documentation, and Linux portability improvements.

Avoid presenting a model as validated without a reproducible comparison and explicit tolerance.

## Development setup

Install Rust, Node.js, npm, and the platform-specific [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), then run:

```bash
npm install
npm run tauri dev
```

## Before submitting a pull request

```bash
cargo fmt --all --check
cargo test -p requin-core
cargo check -p requin
npm run build
```

Please include tests for numerical or parsing changes, units and provenance for physics changes, and before/after images for visible UI work. Keep the Rust numerical core independent of the Tauri webview; TypeScript must not become the authoritative implementation of physical calculations.

