use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Material {
    pub name: String,
    pub family: String,
    pub band_gap_ev: f64,
    pub electron_affinity_ev: f64,
    pub relative_permittivity: f64,
    pub electron_mass: f64,
    pub hole_mass: f64,
    pub nc_cm3: f64,
    pub nv_cm3: f64,
    pub electron_mobility_cm2_vs: f64,
    pub hole_mobility_cm2_vs: f64,
    pub richardson_a_cm2_k2: f64,
    pub provenance: String,
}

struct Base(
    &'static str,
    &'static str,
    f64,
    f64,
    f64,
    f64,
    f64,
    f64,
    f64,
    f64,
    f64,
    f64,
);

// Representative 300 K defaults. The UI exposes source/provenance and project overrides;
// these values are intentionally centralized rather than hidden in solver code.
const BASE: &[Base] = &[
    Base(
        "Si", "group_iv", 1.124, 4.05, 11.7, 1.08, 0.56, 2.8e19, 1.04e19, 1350., 480., 112.,
    ),
    Base(
        "Ge", "group_iv", 0.661, 4.00, 16.0, 0.56, 0.29, 1.04e19, 6.0e18, 3900., 1900., 65.,
    ),
    Base(
        "SiO2", "oxide", 9.0, 0.95, 3.9, 0.5, 0.5, 1., 1., 0., 0., 0.,
    ),
    Base(
        "GaAs", "arsenide", 1.424, 4.07, 12.9, 0.067, 0.50, 4.7e17, 7.0e18, 8500., 400., 8.16,
    ),
    Base(
        "AlAs", "arsenide", 3.03, 3.50, 10.1, 0.15, 0.76, 1.0e18, 1.0e19, 200., 100., 3.0,
    ),
    Base(
        "InAs", "arsenide", 0.354, 4.90, 15.15, 0.023, 0.41, 8.7e16, 6.6e18, 30000., 500., 6.0,
    ),
    Base(
        "InP",
        "phosphide",
        1.344,
        4.38,
        12.5,
        0.080,
        0.60,
        5.7e17,
        1.1e19,
        5400.,
        200.,
        9.4,
    ),
    Base(
        "GaP",
        "phosphide",
        2.26,
        3.80,
        11.1,
        0.34,
        0.79,
        1.8e19,
        1.8e19,
        250.,
        150.,
        5.0,
    ),
    Base(
        "AlP",
        "phosphide",
        2.45,
        3.50,
        9.8,
        0.22,
        0.70,
        2.0e18,
        2.0e19,
        100.,
        50.,
        3.0,
    ),
    Base(
        "GaN", "nitride", 3.42, 4.10, 9.5, 0.20, 1.0, 2.3e18, 4.6e19, 1000., 30., 26.,
    ),
    Base(
        "AlN", "nitride", 6.12, 0.60, 8.5, 0.32, 1.5, 4.0e18, 8.0e19, 300., 10., 20.,
    ),
    Base(
        "InN", "nitride", 0.69, 5.80, 15.3, 0.07, 1.4, 9.0e17, 5.0e19, 2500., 50., 8.,
    ),
];

fn pure(name: &str) -> Option<Material> {
    let b = BASE.iter().find(|v| v.0.eq_ignore_ascii_case(name))?;
    Some(Material {
        name: b.0.into(),
        family: b.1.into(),
        band_gap_ev: b.2,
        electron_affinity_ev: b.3,
        relative_permittivity: b.4,
        electron_mass: b.5,
        hole_mass: b.6,
        nc_cm3: b.7,
        nv_cm3: b.8,
        electron_mobility_cm2_vs: b.9,
        hole_mobility_cm2_vs: b.10,
        richardson_a_cm2_k2: b.11,
        provenance: "Requin v1 curated defaults; verify or override parameters for publication use"
            .into(),
    })
}

fn mix(name: &str, a: Material, b: Material, x: f64, bowing: f64) -> Material {
    let lerp = |av: f64, bv: f64| av * x + bv * (1.0 - x);
    Material {
        name: format!("{name} (x={x:.4})"),
        family: a.family.clone(),
        band_gap_ev: lerp(a.band_gap_ev, b.band_gap_ev) - bowing * x * (1.0 - x),
        electron_affinity_ev: lerp(a.electron_affinity_ev, b.electron_affinity_ev),
        relative_permittivity: lerp(a.relative_permittivity, b.relative_permittivity),
        electron_mass: lerp(a.electron_mass, b.electron_mass),
        hole_mass: lerp(a.hole_mass, b.hole_mass),
        nc_cm3: lerp(a.nc_cm3, b.nc_cm3),
        nv_cm3: lerp(a.nv_cm3, b.nv_cm3),
        electron_mobility_cm2_vs: lerp(a.electron_mobility_cm2_vs, b.electron_mobility_cm2_vs),
        hole_mobility_cm2_vs: lerp(a.hole_mobility_cm2_vs, b.hole_mobility_cm2_vs),
        richardson_a_cm2_k2: lerp(a.richardson_a_cm2_k2, b.richardson_a_cm2_k2),
        provenance: format!(
            "Vegard interpolation with {bowing} eV band-gap bowing; verify for the selected phase and temperature"
        ),
    }
}

pub fn material(name: &str, x: Option<f64>, temperature_k: f64) -> Option<Material> {
    let canonical = name.replace(['-', '_', ' '], "").to_ascii_lowercase();
    let mut m = match canonical.as_str() {
        "algaas" => mix(
            "AlGaAs",
            pure("AlAs")?,
            pure("GaAs")?,
            x.unwrap_or(0.3),
            0.127,
        ),
        "ingaas" => mix(
            "InGaAs",
            pure("InAs")?,
            pure("GaAs")?,
            x.unwrap_or(0.53),
            0.477,
        ),
        "alinas" => mix(
            "AlInAs",
            pure("AlAs")?,
            pure("InAs")?,
            x.unwrap_or(0.48),
            0.70,
        ),
        "ingap" => mix("InGaP", pure("InP")?, pure("GaP")?, x.unwrap_or(0.49), 0.65),
        "algan" => mix("AlGaN", pure("AlN")?, pure("GaN")?, x.unwrap_or(0.25), 1.0),
        "ingan" => mix("InGaN", pure("InN")?, pure("GaN")?, x.unwrap_or(0.15), 1.4),
        "sige" => mix("SiGe", pure("Ge")?, pure("Si")?, x.unwrap_or(0.2), 0.21),
        _ => pure(name)?,
    };
    // First-order Varshni-like correction keeps temperature behavior explicit without
    // pretending every material shares one high-precision parameterization.
    m.band_gap_ev -= 4.5e-4 * (temperature_k - 300.0);
    let ratio = (temperature_k / 300.0).powf(1.5);
    m.nc_cm3 *= ratio;
    m.nv_cm3 *= ratio;
    Some(m)
}

pub fn names() -> &'static [&'static str] {
    &[
        "Si", "Ge", "SiGe", "SiO2", "GaAs", "AlAs", "InAs", "AlGaAs", "InGaAs", "AlInAs", "InP",
        "GaP", "AlP", "InGaP", "GaN", "AlN", "InN", "AlGaN", "InGaN",
    ]
}
