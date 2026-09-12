# Schottky lab readiness

Scope: the supplied `field/schottky.png` assignment (Lab 2.4, parts a–j) and
`field/diodesweep.txt`. These private coursework files are not bundled with Requin.
The application provides reusable tools; it does not generate a student's written
discussion or claim general TCAD validation.

## Assignment-to-feature map

| Parts | Workflow | Evidence / boundary |
| --- | --- | --- |
| a | Schottky template → Results reference cards | Depletion approximation and bulk band/Fermi separation at 300 K; Boltzmann reference explicitly distinguished from Fermi–Dirac simulation. |
| b–c | Results: charge, field, bands; depletion metrics | Analytic width, Debye length, adjustable carrier-recovery edge, charge-equivalent width. Different width definitions need not agree. |
| d–e | Studies: lab bias list | 0, +0.2, +0.5, −0.2, −0.5 V; compare charge, field, Ec/Ev or potential; export full arrays/figures. |
| f | Studies: lab doping list | 10¹⁶, 10¹⁷, 10¹⁸, 10¹⁹ cm⁻³; per-case mesh based on Debye length; togglable overlays. |
| g | Studies: lab C–V list → Fit 1/C² | Two donor densities (10¹⁶, 10¹⁸), 51 points from −0.5 to 0 V in 0.01 V steps, capacitance-density and inverse plots, slope-derived doping. |
| h | Data: import measurement | Preview, explicit voltage/current units, all finite numeric samples retained, linear and positive-only log plots. |
| i–j | Data: forward fit | Suggested/adjustable bounds or graph drag; ideality, saturation current, regression errors/residuals; supplied area → barrier or supplied barrier → area, using material Richardson constant or emission effective mass. |

## Numerical checks

Run `cargo test --workspace --locked`. The Schottky integration tests require
converged profiles for every listed bias/doping case and compare charge-equivalent
widths after halving the mesh. The tolerance is 2%; the checked cases were below
0.002% in the local run. This is mesh consistency, not experimental accuracy.

With εᵣ = 11.7, Nc = 2.8×10¹⁹ cm⁻³, T = 300 K and barrier = 0.6 eV, the
independent nondegenerate references are W = 76.6501 nm and LD = 12.9288 nm at
10¹⁷ cm⁻³, and W = 8.61091 nm at 10¹⁹ cm⁻³. High-doping Fermi–Dirac results
are not forced to match the latter Boltzmann reference.

The C–V regression test runs both Boltzmann and Fermi–Dirac modes at both lab
dopings. It checks 51 converged points, positive capacitance and doping recovery
within 2%, fitting interior reverse-bias points (−0.45 to −0.1 V) to avoid the
one-sided derivative endpoints. The preset uses majority carriers only; allowing
equilibrium inversion gives a different capacitance model. The surface electrode
charge is displacement flux, not total integrated device charge.

At +0.5 V, the n-type device can enter accumulation. A negative signed
charge-equivalent width must not be described as a negative physical depletion
thickness. Carrier-recovery and depletion-reference outputs show their definitions
and limitations in the interface.

## Measurement checks and identifiability

Run `npm run test:ui`. Besides real React interaction tests (mocked desktop IPC),
pure analysis tests recover known synthetic I–V and C–V parameters. A local-only
test reads the private measurement file and is skipped when the file is absent.

The supplied file has 161 numeric pairs. Its bracketed instrument preamble and
header are skipped. The file does not establish units: interpreting columns as V
and A requires user confirmation. Under that interpretation, the automatic
suggestion selects five forward points from about 0.03546 to 0.31074 V, giving
n ≈ 1.056 and R² ≈ 0.9944. The interface warns about visible curvature below
R² = 0.995; inspect residuals and change the range before accepting this fit.

A single forward I–V curve determines n and Is, but cannot independently identify
both barrier and junction area. The calculator therefore requires one as an input.
The default 0.6 eV barrier is an assumption, not a measurement of the physical
part. Emission mass is not necessarily the density-of-states mass. Temperature,
contact area, series resistance, low-voltage −1 effects, tunneling and barrier
inhomogeneity can dominate the reported regression-only uncertainties.

The measured diode fit and simulated ideal I–V estimate are separate outputs.
Requin has no drift–diffusion continuity solver, frequency-dependent capacitance,
or quantum-charge feedback. Native dialogs and platform icon behavior still need
a manual desktop smoke test; browser mocks do not validate those OS interactions.
