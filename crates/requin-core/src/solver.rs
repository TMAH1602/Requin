use crate::{materials::material, model::*};
use nalgebra::{DMatrix, SymmetricEigen};
use thiserror::Error;

const Q: f64 = 1.602_176_634e-19;
const EPS0: f64 = 8.854_187_812_8e-12;
const KB_EV: f64 = 8.617_333_262e-5;
const HBAR2_2M0_EV_NM2: f64 = 0.038_099_82;

#[derive(Debug, Error)]
pub enum SolveError {
    #[error("invalid project: {0}")]
    Invalid(String),
    #[error("numerical failure: {0}")]
    Numerical(String),
}

#[derive(Clone)]
struct Grid {
    x_nm: Vec<f64>,
    mat_name: Vec<String>,
    eps: Vec<f64>,
    ec0: Vec<f64>,
    eg: Vec<f64>,
    me: Vec<f64>,
    nc: Vec<f64>,
    nv: Vec<f64>,
    nd: Vec<f64>,
    na: Vec<f64>,
}

fn build_grid(project: &DeviceProject, quality: SolveQuality) -> Result<Grid, SolveError> {
    let scale = if quality == SolveQuality::Preview {
        project.solver.preview_scale.max(1.0)
    } else {
        1.0
    };
    let mut x_nm = Vec::new();
    let mut mat_name = Vec::new();
    let mut eps = Vec::new();
    let mut ec0 = Vec::new();
    let mut eg = Vec::new();
    let mut me = Vec::new();
    let mut nc = Vec::new();
    let mut nv = Vec::new();
    let mut nd = Vec::new();
    let mut na = Vec::new();
    let mut offset = 0.0;
    let first = project
        .layers
        .first()
        .ok_or_else(|| SolveError::Invalid("no layers".into()))?;
    let first_mat = material(&first.material, first.alloy_fraction, project.temperature_k)
        .ok_or_else(|| SolveError::Invalid(first.material.clone()))?;
    let reference_affinity = first_mat.electron_affinity_ev;
    for layer in &project.layers {
        let m = material(&layer.material, layer.alloy_fraction, project.temperature_k)
            .ok_or_else(|| SolveError::Invalid(format!("unknown material {}", layer.material)))?;
        let requested = layer.mesh_spacing_nm.unwrap_or(project.mesh_spacing_nm) * scale;
        let cells = (layer.thickness_nm / requested).ceil().max(1.0) as usize;
        let dx = layer.thickness_nm / cells as f64;
        for j in 0..cells {
            if !x_nm.is_empty() && j == 0 {
                continue;
            }
            let x = offset + j as f64 * dx;
            x_nm.push(x);
            mat_name.push(m.name.clone());
            eps.push(m.relative_permittivity);
            ec0.push(reference_affinity - m.electron_affinity_ev);
            eg.push(m.band_gap_ev);
            me.push(m.electron_mass.max(0.005));
            nc.push(m.nc_cm3);
            nv.push(m.nv_cm3);
            nd.push(layer.donors_cm3);
            na.push(layer.acceptors_cm3);
        }
        offset += layer.thickness_nm;
        x_nm.push(offset);
        mat_name.push(m.name.clone());
        eps.push(m.relative_permittivity);
        ec0.push(reference_affinity - m.electron_affinity_ev);
        eg.push(m.band_gap_ev);
        me.push(m.electron_mass.max(0.005));
        nc.push(m.nc_cm3);
        nv.push(m.nv_cm3);
        nd.push(layer.donors_cm3);
        na.push(layer.acceptors_cm3);
    }
    if x_nm.len() > 12_000 {
        return Err(SolveError::Invalid(
            "mesh exceeds 12,000 nodes; increase mesh spacing".into(),
        ));
    }
    Ok(Grid {
        x_nm,
        mat_name,
        eps,
        ec0,
        eg,
        me,
        nc,
        nv,
        nd,
        na,
    })
}

fn neutral_phi(grid: &Grid, index: usize, temperature_k: f64) -> f64 {
    let vt = KB_EV * temperature_k;
    let net = grid.nd[index] - grid.na[index];
    let ec_minus_ef = if net > 1.0 {
        vt * (grid.nc[index] / net).max(1e-40).ln()
    } else if net < -1.0 {
        grid.eg[index] - vt * (grid.nv[index] / -net).max(1e-40).ln()
    } else {
        0.5 * grid.eg[index] + 0.5 * vt * (grid.nc[index] / grid.nv[index].max(1.0)).ln()
    };
    grid.ec0[index] - ec_minus_ef
}

fn boundary_phi(contact: &Contact, grid: &Grid, index: usize, temperature_k: f64) -> f64 {
    match contact.kind {
        ContactKind::Schottky => grid.ec0[index] - contact.barrier_ev + contact.voltage_v,
        ContactKind::Ohmic => neutral_phi(grid, index, temperature_k) + contact.voltage_v,
        ContactKind::ZeroField => neutral_phi(grid, index, temperature_k) + contact.voltage_v,
    }
}

fn carriers(grid: &Grid, phi: &[f64], t: f64) -> (Vec<f64>, Vec<f64>, Vec<f64>) {
    let vt = KB_EV * t;
    let mut n = Vec::with_capacity(phi.len());
    let mut p = Vec::with_capacity(phi.len());
    let mut rho = Vec::with_capacity(phi.len());
    for i in 0..phi.len() {
        let ec = grid.ec0[i] - phi[i];
        let ev = ec - grid.eg[i];
        let ni = grid.nc[i] * (-ec / vt).clamp(-100.0, 80.0).exp();
        let pi = grid.nv[i] * (ev / vt).clamp(-100.0, 80.0).exp();
        n.push(ni);
        p.push(pi);
        rho.push(grid.nd[i] - grid.na[i] + pi - ni);
    }
    (n, p, rho)
}

fn thomas(lower: &[f64], diag: &[f64], upper: &[f64], rhs: &[f64]) -> Result<Vec<f64>, SolveError> {
    let n = diag.len();
    let c = upper.to_vec();
    let mut d = rhs.to_vec();
    let mut b = diag.to_vec();
    for i in 1..n {
        if b[i - 1].abs() < 1e-30 {
            return Err(SolveError::Numerical("singular Poisson matrix".into()));
        }
        let w = lower[i - 1] / b[i - 1];
        b[i] -= w * c[i - 1];
        d[i] -= w * d[i - 1];
    }
    let mut x = vec![0.0; n];
    x[n - 1] = d[n - 1] / b[n - 1];
    for i in (0..n - 1).rev() {
        x[i] = (d[i] - c[i] * x[i + 1]) / b[i];
    }
    Ok(x)
}

fn poisson(
    project: &DeviceProject,
    grid: &Grid,
    quality: SolveQuality,
) -> Result<(Vec<f64>, Vec<f64>, Vec<f64>, Vec<f64>, usize, f64, bool), SolveError> {
    let count = grid.x_nm.len();
    if count < 3 {
        return Err(SolveError::Invalid(
            "mesh requires at least three nodes".into(),
        ));
    }
    let left = boundary_phi(&project.surface, grid, 0, project.temperature_k);
    let right = boundary_phi(&project.substrate, grid, count - 1, project.temperature_k);
    let length = grid.x_nm[count - 1].max(1e-12);
    let mut phi: Vec<f64> = grid
        .x_nm
        .iter()
        .map(|x| left + (right - left) * x / length)
        .collect();
    let max_iter = if quality == SolveQuality::Preview {
        project.solver.max_iterations.min(120)
    } else {
        project.solver.max_iterations
    };
    let tolerance = if quality == SolveQuality::Preview {
        project.solver.tolerance.max(2e-5)
    } else {
        project.solver.tolerance
    };
    let mix = if quality == SolveQuality::Preview {
        0.3
    } else {
        project.solver.mixing.clamp(0.01, 1.0)
    };
    let mut residual = f64::INFINITY;
    let mut iterations = 0;
    for iter in 0..max_iter {
        let (_, _, rho_cm3) = carriers(grid, &phi, project.temperature_k);
        let inner = count - 2;
        let mut lo = vec![0.0; inner.saturating_sub(1)];
        let mut di = vec![0.0; inner];
        let mut up = vec![0.0; inner.saturating_sub(1)];
        let mut rhs = vec![0.0; inner];
        for row in 0..inner {
            let i = row + 1;
            let dx_l = (grid.x_nm[i] - grid.x_nm[i - 1]) * 1e-9;
            let dx_r = (grid.x_nm[i + 1] - grid.x_nm[i]) * 1e-9;
            let volume = 0.5 * (dx_l + dx_r);
            let e_l = EPS0 * 2.0 * grid.eps[i - 1] * grid.eps[i] / (grid.eps[i - 1] + grid.eps[i]);
            let e_r = EPS0 * 2.0 * grid.eps[i + 1] * grid.eps[i] / (grid.eps[i + 1] + grid.eps[i]);
            let al = e_l / dx_l;
            let ar = e_r / dx_r;
            di[row] = al + ar;
            if row > 0 {
                lo[row - 1] = -al;
            } else {
                rhs[row] += al * left;
            }
            if row + 1 < inner {
                up[row] = -ar;
            } else {
                rhs[row] += ar * right;
            }
            rhs[row] += Q * rho_cm3[i] * 1e6 * volume;
        }
        let solved = thomas(&lo, &di, &up, &rhs)?;
        residual = 0.0_f64;
        for (row, value) in solved.into_iter().enumerate() {
            let i = row + 1;
            let delta = (value - phi[i]).clamp(-0.25, 0.25);
            phi[i] += mix * delta;
            residual = residual.max((mix * delta).abs());
        }
        phi[0] = left;
        if project.surface.kind == ContactKind::ZeroField {
            phi[0] = phi[1];
        }
        phi[count - 1] = right;
        if project.substrate.kind == ContactKind::ZeroField {
            phi[count - 1] = phi[count - 2];
        }
        iterations = iter + 1;
        if residual < tolerance {
            break;
        }
    }
    let (n, p, rho) = carriers(grid, &phi, project.temperature_k);
    Ok((phi, n, p, rho, iterations, residual, residual < tolerance))
}

fn quantum_states(project: &DeviceProject, grid: &Grid, ec: &[f64]) -> Vec<Eigenstate> {
    let Some(region) = &project.quantum else {
        return Vec::new();
    };
    let indices: Vec<usize> = grid
        .x_nm
        .iter()
        .enumerate()
        .filter(|(_, x)| **x >= region.start_nm && **x <= region.stop_nm)
        .map(|(i, _)| i)
        .collect();
    if indices.len() < 4 || indices.len() > 1800 {
        return Vec::new();
    }
    let n = indices.len() - 2;
    let mut h = DMatrix::<f64>::zeros(n, n);
    for row in 0..n {
        let i = indices[row + 1];
        let dx_l = grid.x_nm[i] - grid.x_nm[i - 1];
        let dx_r = grid.x_nm[i + 1] - grid.x_nm[i];
        let ml = 2.0 * grid.me[i] * grid.me[i - 1] / (grid.me[i] + grid.me[i - 1]);
        let mr = 2.0 * grid.me[i] * grid.me[i + 1] / (grid.me[i] + grid.me[i + 1]);
        let al = HBAR2_2M0_EV_NM2 / (ml * dx_l * (0.5 * (dx_l + dx_r)));
        let ar = HBAR2_2M0_EV_NM2 / (mr * dx_r * (0.5 * (dx_l + dx_r)));
        h[(row, row)] = al + ar + ec[i];
        if row > 0 {
            h[(row, row - 1)] = -al;
        }
        if row + 1 < n {
            h[(row, row + 1)] = -ar;
        }
    }
    let eig = SymmetricEigen::new(h);
    let mut order: Vec<usize> = (0..n).collect();
    order.sort_by(|a, b| eig.eigenvalues[*a].total_cmp(&eig.eigenvalues[*b]));
    order
        .into_iter()
        .take(region.states.min(n))
        .enumerate()
        .map(|(state_index, col)| {
            let mut wf = vec![0.0; grid.x_nm.len()];
            let mut norm = 0.0;
            for row in 0..n {
                let value = eig.eigenvectors[(row, col)];
                wf[indices[row + 1]] = value;
                norm += value
                    * value
                    * (grid.x_nm[indices[row + 2]] - grid.x_nm[indices[row]]).abs()
                    * 0.5;
            }
            let scale = norm.sqrt().max(1e-30);
            for value in &mut wf {
                *value /= scale;
            }
            Eigenstate {
                index: state_index + 1,
                energy_ev: eig.eigenvalues[col],
                wavefunction: wf,
            }
        })
        .collect()
}

fn terminal_charge(grid: &Grid, rho_cm3: &[f64]) -> f64 {
    grid.x_nm
        .windows(2)
        .enumerate()
        .map(|(i, pair)| {
            let dx = (pair[1] - pair[0]) * 1e-9;
            Q * 1e6 * 0.5 * (rho_cm3[i] + rho_cm3[i + 1]) * dx
        })
        .sum()
}

fn current_density(project: &DeviceProject, voltage: f64) -> Option<f64> {
    let t = project.temperature_k;
    let vt = KB_EV * t;
    if project.surface.kind == ContactKind::Schottky {
        let first = project.layers.first()?;
        let m = material(&first.material, first.alloy_fraction, t)?;
        let js_a_cm2 = m.richardson_a_cm2_k2 * t * t * (-project.surface.barrier_ev / vt).exp();
        return Some(js_a_cm2 * 1e4 * ((voltage / vt).clamp(-80.0, 40.0).exp() - 1.0));
    }
    let nd = project
        .layers
        .iter()
        .map(|l| l.donors_cm3)
        .fold(0.0, f64::max);
    let na = project
        .layers
        .iter()
        .map(|l| l.acceptors_cm3)
        .fold(0.0, f64::max);
    if nd > 0.0 && na > 0.0 {
        let m = material(
            &project.layers[0].material,
            project.layers[0].alloy_fraction,
            t,
        )?;
        let ni2 = m.nc_cm3 * m.nv_cm3 * (-m.band_gap_ev / vt).exp();
        let tau = 1e-6;
        let dn = m.electron_mobility_cm2_vs * vt;
        let dp = m.hole_mobility_cm2_vs * vt;
        let ln = (dn * tau).sqrt();
        let lp = (dp * tau).sqrt();
        let js_a_cm2 = Q * ni2 * (dp / (lp * nd) + dn / (ln * na));
        return Some(js_a_cm2 * 1e4 * ((voltage / vt).clamp(-80.0, 40.0).exp() - 1.0));
    }
    None
}

fn sweep(project: &DeviceProject, quality: SolveQuality) -> Result<Vec<SweepPoint>, SolveError> {
    if !project.sweep.enabled || project.sweep.step_v == 0.0 {
        return Ok(Vec::new());
    }
    let direction = (project.sweep.stop_v - project.sweep.start_v).signum();
    if direction == 0.0 || project.sweep.step_v.signum() != direction {
        return Err(SolveError::Invalid(
            "sweep step must point from start to stop".into(),
        ));
    }
    let mut voltages = Vec::new();
    let mut v = project.sweep.start_v;
    while (v - project.sweep.stop_v) * direction <= 1e-12 && voltages.len() < 501 {
        voltages.push(v);
        v += project.sweep.step_v;
    }
    let mut points = Vec::new();
    for voltage in voltages {
        let mut p = project.clone();
        p.sweep.enabled = false;
        p.surface.voltage_v = voltage;
        let grid = build_grid(&p, quality)?;
        let (_, _, _, rho, _, _, _) = poisson(&p, &grid, quality)?;
        points.push(SweepPoint {
            voltage_v: voltage,
            charge_c_m2: terminal_charge(&grid, &rho),
            capacitance_f_m2: None,
            current_a_m2: current_density(&p, voltage),
        });
    }
    if points.len() >= 2 {
        let charges: Vec<f64> = points.iter().map(|p| p.charge_c_m2).collect();
        for i in 0..points.len() {
            let (a, b) = if i == 0 {
                (0, 1)
            } else if i + 1 == points.len() {
                (i - 1, i)
            } else {
                (i - 1, i + 1)
            };
            points[i].capacitance_f_m2 =
                Some((charges[b] - charges[a]) / (points[b].voltage_v - points[a].voltage_v));
        }
    }
    Ok(points)
}

pub fn solve(
    project: &DeviceProject,
    quality: SolveQuality,
) -> Result<SimulationResult, SolveError> {
    project
        .validate()
        .map_err(|e| SolveError::Invalid(e.join("; ")))?;
    let grid = build_grid(project, quality)?;
    let (phi, n, p, rho, iterations, residual, converged) = poisson(project, &grid, quality)?;
    let ec: Vec<f64> = grid
        .ec0
        .iter()
        .zip(&phi)
        .map(|(base, potential)| base - potential)
        .collect();
    let ev: Vec<f64> = ec.iter().zip(&grid.eg).map(|(c, gap)| c - gap).collect();
    let mut field = vec![0.0; phi.len()];
    for i in 1..phi.len() {
        field[i] = -(phi[i] - phi[i - 1]) / ((grid.x_nm[i] - grid.x_nm[i - 1]) * 1e-7);
    }
    if field.len() > 1 {
        field[0] = field[1];
    }
    let states = quantum_states(project, &grid, &ec);
    let mut warnings = Vec::new();
    if !converged {
        warnings.push(
            "Poisson iteration did not reach the requested tolerance; curves are diagnostic only"
                .into(),
        );
    }
    if project.quantum.is_some() && states.is_empty() {
        warnings.push(
            "No quantum states were returned; check the quantum window or mesh density".into(),
        );
    }
    Ok(SimulationResult {
        position_nm: grid.x_nm,
        potential_v: phi,
        electric_field_v_cm: field,
        conduction_band_ev: ec,
        valence_band_ev: ev,
        electron_cm3: n,
        hole_cm3: p,
        net_charge_cm3: rho,
        material: grid.mat_name,
        eigenstates: states,
        sweep: sweep(project, quality)?,
        convergence: ConvergenceReport {
            converged,
            iterations,
            residual,
            quality,
            warnings,
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn solves_uniform_silicon() {
        let p = DeviceProject {
            mesh_spacing_nm: 10.0,
            layers: vec![Layer {
                thickness_nm: 100.0,
                ..Layer::default()
            }],
            ..DeviceProject::default()
        };
        let r = solve(&p, SolveQuality::Full).unwrap();
        assert!(r.position_nm.len() >= 10);
        assert!(r.potential_v.iter().all(|v| v.is_finite()));
    }
    #[test]
    fn square_well_states_are_ordered() {
        let p = DeviceProject {
            mesh_spacing_nm: 0.5,
            layers: vec![Layer {
                thickness_nm: 20.0,
                material: "GaAs".into(),
                acceptors_cm3: 0.0,
                ..Layer::default()
            }],
            quantum: Some(QuantumRegion {
                start_nm: 0.0,
                stop_nm: 20.0,
                states: 3,
            }),
            ..DeviceProject::default()
        };
        let r = solve(&p, SolveQuality::Preview).unwrap();
        assert_eq!(r.eigenstates.len(), 3);
        assert!(r.eigenstates[0].energy_ev < r.eigenstates[1].energy_ev);
    }
}
