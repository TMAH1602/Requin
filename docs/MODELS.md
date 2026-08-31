# Requin model guide

This document describes what Requin 0.1 computes and, equally importantly, what it does not yet compute.

## Coordinates and mesh

Projects use convenient semiconductor units such as nm, eV, cm⁻³, and V. Each layer is divided according to the global or layer-specific mesh spacing. Material interfaces and endpoints are explicit. Preview solves multiply the requested spacing by the configured preview scale; full solves use the requested spacing.

## Electrostatics

Requin discretizes one-dimensional Poisson electrostatics using a conservative finite-volume formulation and harmonic interface permittivity. Its nonlinear loop updates Boltzmann electron and hole populations from local band edges and applies damped potential updates.

Supported endpoint conditions are:

- **Ohmic:** potential follows the adjacent layer's approximate neutral Fermi-level relation and applied voltage.
- **Schottky:** barrier height and applied voltage define the contact potential.
- **Zero field:** a Neumann condition sets the outward electric-field flux to zero.
- **Fixed potential:** an ideal metal or external reference fixes the electrostatic potential directly.

Zero-field endpoints are assembled as Neumann flux conditions. For prescribed-charge layers, the boundary half-cell is integrated explicitly rather than approximated as a second fixed-potential endpoint.

## Prescribed charge and analytic verification

Each layer can use either the self-consistent mobile-carrier model or a signed, prescribed volume charge in C/cm³. Prescribed-charge layers set mobile electron and hole populations to zero for the electrostatic solve. A layer's sheet charge is a signed count of elementary charges per cm² at its surface-facing boundary and produces the corresponding displacement-field jump.

The MKC A1.4 and fixed-charge MOS presets use a fixed-potential metal, SiO₂, charged silicon, and a zero-field semiconductor endpoint. Requin independently integrates the piecewise charge and permittivity profile to provide analytic potential and field curves, voltage differences, total semiconductor charge, balancing metal charge, and numerical error metrics.

The current release treats dopants as fully ionized even though the project schema retains the intended model setting.

## Materials and heterojunctions

The built-in database supplies representative band gap, electron affinity, dielectric constant, density of states, effective masses, mobility, and Richardson constant. Ternary alloys use Vegard-style interpolation with a band-gap bowing term.

These defaults are useful for exploration but are not a certified materials reference. Parameters vary with source, crystal phase, strain, temperature, doping, and fabrication. Publication work should record and validate every relevant parameter.

## Schrödinger equation

Inside an enabled quantum window, Requin builds a single-conduction-band effective-mass Hamiltonian. Harmonic averaging of adjacent effective masses implements a BenDaniel–Duke-style interface treatment. Symmetric eigendecomposition returns the lowest requested eigenpairs, and wavefunctions are normalized over position.

Current limitations include electron-only states, no multiband coupling or non-parabolicity, and no quantum charge fed back into Poisson.

## Voltage sweeps, C–V, and I–V

Each voltage point receives an electrostatic solve. Terminal charge is integrated over the device, and quasi-static capacitance is estimated by centered or endpoint finite differences.

PN current is an ideal diffusion estimate derived from equilibrium material and doping parameters. Schottky current uses thermionic emission. These are useful for qualitative exploration but are not solutions of the electron and hole continuity equations.

## Convergence

A result records quality, iteration count, maximum potential update, convergence status, and warnings. A preview can be visually useful, but it is not a substitute for a converged full-quality result. Mesh-refinement and parameter-sensitivity checks remain the user's responsibility.
