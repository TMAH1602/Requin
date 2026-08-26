# Requin

Requin is a desktop 1D semiconductor device simulator. Its Rust core handles layered material models, nonlinear Poisson electrostatics, effective-mass Schrödinger eigenstates, voltage sweeps, quasi-static C–V, and first-order PN/Schottky I–V models. A Tauri interface provides live preview/full solves and report-style interactive plots.

> Requin 0.1 is an engineering preview, not yet a validated replacement for a commercial TCAD package. Every unconverged result is marked diagnostic, and built-in material values should be checked or overridden for publication work.

## Run

Prerequisites are a current Rust toolchain, Node.js, and the [Tauri system prerequisites](https://v2.tauri.app/start/prerequisites/) for your operating system.

```sh
npm install
npm run tauri dev
```

The four files in `demo files/` can be imported directly. Requin also saves projects as versioned `.requin.toml` files.

## Verify

```sh
cargo test -p requin-core
npm run build
cargo check -p requin
```

## Current model boundary

- Equilibrium and biased 1D band diagrams, carrier densities, potential, and field.
- Single-band electron effective-mass quantum states in a selected region.
- Quasi-static C–V from converged charge sweeps.
- PN ideal-diffusion and Schottky thermionic-emission I–V estimates.
- HEMT support is vertical electrostatics/quantum confinement only; no drain transport.
- Multiband k·p, NEGF, transient/self-heating, avalanche, and transistor drain-current models are not included.

