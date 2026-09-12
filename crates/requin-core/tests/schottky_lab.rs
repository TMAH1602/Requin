use requin_core::{CarrierStatistics, SolveQuality, solve, template};
const Q: f64 = 1.602176634e-19;
const EPS: f64 = 11.7 * 8.8541878128e-14;
const VT: f64 = 8.617333262e-5 * 300.0;
fn profile(nd: f64, bias: f64, mesh: f64) -> requin_core::SimulationResult {
    let mut p = template("schottky").unwrap();
    p.sweep.enabled = false;
    p.layers[0].donors_cm3 = nd;
    p.surface.voltage_v = bias;
    p.mesh_spacing_nm = mesh;
    let r = solve(&p, SolveQuality::Full).unwrap();
    assert!(
        r.convergence.converged,
        "Nd={nd} V={bias} residual={}",
        r.convergence.residual
    );
    r
}
fn width(r: &requin_core::SimulationResult, nd: f64) -> f64 {
    r.position_nm
        .windows(2)
        .enumerate()
        .map(|(i, x)| (x[1] - x[0]) * (r.net_charge_cm3[i] + r.net_charge_cm3[i + 1]) / 2.0 / nd)
        .sum()
}
#[test]
fn analytic_reference_values() {
    let w = (2.0 * EPS * (0.6 - VT * (2.8e19 / 1e17_f64).ln()) / (Q * 1e17)).sqrt() * 1e7;
    let ld = (EPS * VT / (Q * 1e17)).sqrt() * 1e7;
    assert!((w - 76.6501).abs() < 0.001);
    assert!((ld - 12.9288).abs() < 0.001);
    // These are specifically the nondegenerate reference values, not FD targets.
    let w19 = (2.0 * EPS * (0.6 - VT * (2.8e19 / 1e19_f64).ln()) / (Q * 1e19)).sqrt() * 1e7;
    assert!((w19 - 8.61091).abs() < 0.001);
}
#[test]
fn all_lab_profiles_and_mesh_refinement() {
    for nd in [1e16, 1e17, 1e18, 1e19] {
        let mesh = (EPS * VT / (Q * nd)).sqrt() * 1e7 / 8.0;
        let a = profile(nd, 0.0, mesh.max(0.2));
        let b = profile(nd, 0.0, (mesh / 2.0).max(0.1));
        let wa = width(&a, nd);
        let wb = width(&b, nd);
        assert!(
            (wa - wb).abs() / wb < 0.02,
            "mesh refinement: Nd={nd} {wa} {wb}"
        );
        assert!(b.electron_cm3.last().unwrap() / nd > 0.999);
        println!(
            "Nd={nd:e} W_charge={wb:.5} nm mesh_error={:.4}%",
            100.0 * (wa - wb).abs() / wb
        );
    }
    let mut last = f64::INFINITY;
    for bias in [-0.5, -0.2, 0.0, 0.2, 0.5] {
        let r = profile(1e17, bias, 0.5);
        let w = width(&r, 1e17);
        assert!(w < last);
        last = w;
        println!("bias={bias} W_charge={w:.5} nm");
    }
}
#[test]
fn cv_slope_recovers_doping() {
    for statistics in [CarrierStatistics::Boltzmann, CarrierStatistics::FermiDirac] {
        for nd in [1e16, 1e18] {
            let mut p = template("schottky").unwrap();
            p.layers[0].donors_cm3 = nd;
            p.carrier_statistics = statistics;
            p.mesh_spacing_nm = if nd > 1e17 { 0.2 } else { 1.0 };
            let r = solve(&p, SolveQuality::Full).unwrap();
            assert_eq!(r.sweep.len(), 51);
            assert!(
                r.sweep
                    .iter()
                    .all(|s| s.converged && s.capacitance_f_m2.unwrap() > 0.0)
            );
            // Interior reverse-bias range avoids one-sided derivative endpoints.
            let points: Vec<_> = r
                .sweep
                .iter()
                .filter(|s| s.voltage_v >= -0.45 && s.voltage_v <= -0.1)
                .map(|s| {
                    (
                        s.voltage_v,
                        1.0 / (s.capacitance_f_m2.unwrap() / 1e4).powi(2),
                    )
                })
                .collect();
            let xm = points.iter().map(|p| p.0).sum::<f64>() / points.len() as f64;
            let ym = points.iter().map(|p| p.1).sum::<f64>() / points.len() as f64;
            let slope = points.iter().map(|p| (p.0 - xm) * (p.1 - ym)).sum::<f64>()
                / points.iter().map(|p| (p.0 - xm).powi(2)).sum::<f64>();
            let extracted = -2.0 / (Q * EPS * slope);
            println!("C–V {statistics:?} Nd={nd:e} extracted={extracted:e}");
            assert!((extracted / nd - 1.0).abs() < 0.02);
        }
    }
}
