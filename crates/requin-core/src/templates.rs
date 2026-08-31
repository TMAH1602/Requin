use crate::model::*;

fn layer(name: &str, material: &str, thickness_nm: f64, nd: f64, na: f64, x: Option<f64>) -> Layer {
    Layer {
        name: name.into(),
        material: material.into(),
        thickness_nm,
        donors_cm3: nd,
        acceptors_cm3: na,
        alloy_fraction: x,
        sheet_charge_cm2: 0.0,
        charge_mode: ChargeMode::MobileCarriers,
        fixed_charge_c_cm3: 0.0,
        mesh_spacing_nm: None,
    }
}

pub fn template(kind: &str) -> Option<DeviceProject> {
    let mut p = DeviceProject::default();
    match kind {
        "pn" => {
            p.name = "Silicon PN diode".into();
            p.surface.kind = ContactKind::Ohmic;
            p.layers = vec![
                layer("P region", "Si", 500., 0., 1e16, None),
                layer("N region", "Si", 500., 1e16, 0., None),
            ];
            p.sweep = Sweep {
                enabled: true,
                start_v: -1.,
                stop_v: 0.7,
                step_v: 0.1,
            };
            p.mesh_spacing_nm = 5.;
        }
        "schottky" => {
            p.name = "Silicon Schottky diode".into();
            p.layers = vec![layer("P-type silicon", "Si", 200., 0., 1e17, None)];
            p.sweep = Sweep {
                enabled: true,
                start_v: -1.,
                stop_v: 0.6,
                step_v: 0.1,
            };
            p.mesh_spacing_nm = 1.;
        }
        "mos" => {
            p.name = "Silicon MOS capacitor".into();
            p.surface = Contact {
                kind: ContactKind::Schottky,
                barrier_ev: 7.5,
                voltage_v: 0.,
            };
            p.layers = vec![
                layer("Gate oxide", "SiO2", 50., 0., 0., None),
                layer("P-type silicon", "Si", 500., 0., 1e17, None),
            ];
            p.sweep = Sweep {
                enabled: true,
                start_v: -3.,
                stop_v: 3.,
                step_v: 0.25,
            };
            p.mesh_spacing_nm = 2.;
        }
        "mkc_a1_4" | "fixed_mos" => {
            p.name = if kind == "mkc_a1_4" {
                "MKC A1.4 — MOS Gauss Law".into()
            } else {
                "Fixed-charge MOS electrostatics".into()
            };
            p.description = "Metal / SiO2 / prescribed-charge silicon electrostatics".into();
            p.surface = Contact {
                kind: ContactKind::FixedPotential,
                barrier_ev: 0.0,
                voltage_v: 0.0,
            };
            p.substrate = Contact {
                kind: ContactKind::ZeroField,
                barrier_ev: 0.0,
                voltage_v: 0.0,
            };
            let mut oxide = layer("Oxide", "SiO2", 20., 0., 0., None);
            oxide.charge_mode = ChargeMode::FixedVolume;
            let mut silicon = layer("Charged silicon", "Si", 100., 0., 0., None);
            silicon.charge_mode = ChargeMode::FixedVolume;
            silicon.fixed_charge_c_cm3 = 1.602_176_634e-4;
            let mut neutral_silicon = layer("Neutral silicon tail", "Si", 50., 0., 0., None);
            neutral_silicon.charge_mode = ChargeMode::FixedVolume;
            p.layers = vec![oxide, silicon, neutral_silicon];
            p.mesh_spacing_nm = 1.0;
            p.sweep.enabled = false;
            p.analytic_verification = true;
        }
        "hemt" => {
            p.name = "GaAs / AlGaAs HEMT".into();
            p.surface = Contact {
                kind: ContactKind::Schottky,
                barrier_ev: 0.6,
                voltage_v: 0.,
            };
            p.layers = vec![
                layer("Cap", "AlGaAs", 2., 0., 0., Some(0.3)),
                layer("Donor barrier", "AlGaAs", 5., 2e19, 0., Some(0.3)),
                layer("Spacer", "AlGaAs", 3., 0., 0., Some(0.3)),
                layer("Channel", "GaAs", 15., 0., 0., None),
                layer("Buffer", "AlGaAs", 10., 0., 0., Some(0.3)),
            ];
            p.quantum = Some(QuantumRegion {
                start_nm: 2.,
                stop_nm: 33.,
                states: 4,
            });
            p.sweep = Sweep {
                enabled: true,
                start_v: -1.,
                stop_v: 0.4,
                step_v: 0.1,
            };
            p.mesh_spacing_nm = 0.2;
        }
        "well" => {
            p.name = "GaAs quantum well".into();
            p.layers = vec![
                layer("Left barrier", "AlGaAs", 10., 0., 0., Some(0.3)),
                layer("Quantum well", "GaAs", 15., 0., 0., None),
                layer("Right barrier", "AlGaAs", 10., 0., 0., Some(0.3)),
            ];
            p.surface.kind = ContactKind::ZeroField;
            p.substrate.kind = ContactKind::ZeroField;
            p.quantum = Some(QuantumRegion {
                start_nm: 0.,
                stop_nm: 35.,
                states: 5,
            });
            p.mesh_spacing_nm = 0.25;
        }
        "heterojunction" => {
            p.name = "GaAs / AlGaAs heterojunction".into();
            p.layers = vec![
                layer("GaAs", "GaAs", 50., 1e17, 0., None),
                layer("AlGaAs", "AlGaAs", 50., 1e17, 0., Some(0.3)),
            ];
            p.surface.kind = ContactKind::Ohmic;
            p.mesh_spacing_nm = 1.;
        }
        _ => return None,
    }
    Some(p)
}
