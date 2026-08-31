<div align="center">
  <img src="src-tauri/icons/icon.svg" width="112" alt="Requin shark logo">

# Requin

**Interactive one-dimensional semiconductor simulation without the traditional TCAD friction.**

[![CI](https://github.com/TMAH1602/Requin/actions/workflows/ci.yml/badge.svg)](https://github.com/TMAH1602/Requin/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-00a6a6.svg)](LICENSE)
[![Rust](https://img.shields.io/badge/core-Rust-101820.svg?logo=rust)](https://www.rust-lang.org/)
[![Tauri](https://img.shields.io/badge/desktop-Tauri_v2-24c8db.svg?logo=tauri)](https://tauri.app/)

[Features](#features) · [Install](#install-and-run) · [Using Requin](#using-requin) · [Physics](#physics-and-model-boundaries) · [Contributing](CONTRIBUTING.md)
</div>

> [!IMPORTANT]
> Requin is an early engineering preview. It is not yet a validated replacement for commercial TCAD. Treat unconverged output as diagnostic, and verify built-in material parameters before publication or device-design decisions.

## Why Requin?

Established semiconductor solvers are powerful, but exploring a simple heterostructure can still mean editing brittle input decks, launching separate plotting software, and repeatedly exporting data just to understand how one parameter changes a device.

Requin aims to make one-dimensional semiconductor research more immediate:

- Build a PN junction, Schottky diode, MOS capacitor, quantum well, or HEMT layer stack visually.
- Change thickness, composition, doping, voltage, or temperature and see a fast preview followed by a refined solution.
- Keep the numerical implementation inspectable in a standalone Rust library.
- Present results as readable scientific reports with appropriate units, convergence information, and reproducible data export.
- Preserve useful legacy 1D Poisson input decks while providing a modern project format.

The goal is not to hide the physics. It is to remove the interface friction between a researcher and the physics.

## Features

### Device construction

- Ordered surface-to-substrate layer editor.
- Built-in PN, Schottky, MOS, GaAs/AlGaAs HEMT, quantum-well, and heterojunction templates.
- Si/Ge/SiGe, oxide, arsenide, phosphide, nitride, and common ternary-alloy material defaults.
- Donor/acceptor doping, alloy composition, contact, mesh, temperature, quantum-window, and voltage-sweep controls.
- Prescribed signed volume charge and interface sheet charge for textbook Gauss-law electrostatics.
- MKC A1.4 and general fixed-charge MOS presets with numerical-versus-analytic verification.
- Import of the four included legacy 1D Poisson demonstration decks.
- Versioned, human-readable `.requin.toml` project files.

### Numerical core

- Interface-aware, finite-volume nonlinear Poisson solver.
- Fixed-potential and true zero-field boundary conditions with exact dielectric-interface placement.
- Boltzmann carrier populations and complete-ionization doping model.
- Ohmic, Schottky, and zero-field boundaries.
- Position-dependent effective-mass electron Schrödinger eigenstates.
- Voltage sweeps and quasi-static terminal-charge C–V.
- First-order ideal-diffusion PN and thermionic-emission Schottky I–V estimates.
- Preview/full solve scheduling with convergence residuals and warnings.

### Scientific workspace

- Band, carrier-density, electric-field, wavefunction, and I–V/C–V figures.
- Potential and physical charge-density figures, analytic overlays, voltage-drop cards, and homework-ready reports.
- Adaptive nm/µm, V/cm/kV/cm/MV/cm, mA/cm², and µF/cm² presentation.
- Logarithmic carrier plots, hover readouts, grid/point controls, derived extrema, and a numerical data browser.
- LaTeX-style equations rendered as native MathML.
- CSV data, SVG figure, printable PDF report, and project export under the application menu.
- Catppuccin, Tokyo Night, and Gruvbox themes with persistent font and density preferences.
- In-application handbook explaining the workflow, equations, plots, and model limitations.

## Install and run

Requin currently targets macOS and Linux. Building requires:

- A current [Rust toolchain](https://rustup.rs/).
- Node.js 20 or newer and npm.
- The platform dependencies required by [Tauri v2](https://v2.tauri.app/start/prerequisites/).

Clone the repository:

```bash
git clone https://github.com/TMAH1602/Requin.git
cd Requin
npm install
```

### macOS

Install Apple command-line tools if needed:

```bash
xcode-select --install
```

Start the development application:

```bash
npm run tauri dev
```

### Homebrew on macOS

Install the current release from the Requin tap:

```bash
brew install --cask tmah1602/requin/requin
```

Requin currently ships unsigned Apple Silicon and Intel builds. The explicit
The current binaries are not Apple-notarized. If macOS blocks the first launch,
open **System Settings → Privacy & Security** and choose **Open Anyway** for
Requin. This is only needed once.

### Debian or Ubuntu

Install Tauri's Linux prerequisites:

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

Then start Requin:

```bash
npm run tauri dev
```

For other distributions, use the package list in the [official Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

## Using Requin

1. Open **Project** in the left rail and choose a device template, or select **File → Import** to load a legacy `.txt` deck or `.requin.toml` project.
2. Open **Structure** and define layers from the exposed surface down to the substrate. Set thickness, material, alloy fraction, and donor/acceptor concentration.
3. Configure temperature, mesh spacing, surface bias, and—when needed—a voltage sweep.
4. Open **Quantum** to enable a Schrödinger window around a well or channel and choose the requested number of states.
5. Wait for the coarse preview to be replaced by the full solve. Confirm the status reads **Converged** before interpreting the result quantitatively.
6. Move among Bands, Carriers, Field, Wavefunctions, and I–V/C–V. Hover over curves for exact values and open the data browser for underlying samples.
7. Save or export through the **File** and **Export** menus.

The included [`demo files`](demo%20files) provide legacy examples for a silicon PN diode, silicon Schottky diode, silicon MOS structure, and GaAs/AlGaAs HEMT.

## Physics and model boundaries

Requin solves one-dimensional Poisson electrostatics on an interface-aligned mesh:

$$
\frac{d}{dx}\left(\varepsilon(x)\frac{d\phi}{dx}\right)
=-q\left(N_D^+-N_A^-+p-n\right).
$$

Inside an optional quantum window, it solves a single-band position-dependent effective-mass equation:

$$
-\frac{\hbar^2}{2}\frac{d}{dx}\left(\frac{1}{m^*(x)}\frac{d\psi_i}{dx}\right)
+E_c(x)\psi_i=E_i\psi_i.
$$

Current limitations are deliberate and visible in the application:

- Quantum states are electron-only and evaluated from the converged electrostatic potential; a fully coupled quantum-charge loop is planned.
- C–V is quasi-static rather than frequency-dependent small-signal analysis.
- PN and Schottky current curves are first-order analytical estimates, not full drift-diffusion transport.
- HEMT support covers vertical band structure and confinement, not lateral drain transport.
- Multiband k·p, tunneling/NEGF, avalanche, self-heating, and transient simulation are not implemented.
- Built-in material parameters are representative defaults with limited temperature correction, not a certified parameter database.

See [docs/MODELS.md](docs/MODELS.md) for more detail.

## Build and verify

```bash
cargo test -p requin-core
npm run build
cargo check -p requin
```

Build a native bundle or installer for the current platform:

```bash
npm run tauri build
```

Tauri builds installers on the target operating system; public distribution generally also requires platform code signing. See the [Tauri distribution guide](https://v2.tauri.app/distribute/).

## Project structure

```text
crates/requin-core/  Rust project model, materials, legacy parser, and solvers
src-tauri/           Native Tauri application host and packaging
src/                 React scientific workspace and report interface
demo files/          Legacy 1D Poisson-compatible example decks
docs/                Physics and implementation documentation
```

## Roadmap

- Self-consistent quantum charge in the Poisson–Schrödinger loop.
- Conservative Scharfetter–Gummel drift-diffusion transport.
- Incomplete ionization and improved Fermi–Dirac statistics.
- Source-cited, temperature-dependent material parameter sets and project overrides.
- Automated scientific benchmarks against analytic and published reference structures.
- Signed macOS and Linux release artifacts.

## Contributing

Contributions are welcome, especially numerical validation cases, material-data provenance, solver improvements, and accessibility work. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## License

Requin is available under the [MIT License](LICENSE).
