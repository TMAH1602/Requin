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
    face_eps: Vec<f64>,
    face_charge_mode: Vec<ChargeMode>,
    face_fixed_charge_c_cm3: Vec<f64>,
    ec0: Vec<f64>,
    eg: Vec<f64>,
    me: Vec<f64>,
    nc: Vec<f64>,
    nv: Vec<f64>,
    nd: Vec<f64>,
    na: Vec<f64>,
    charge_mode: Vec<ChargeMode>,
    fixed_charge_c_cm3: Vec<f64>,
    sheet_charge_cm2: Vec<f64>,
}

fn build_grid(project: &DeviceProject, quality: SolveQuality) -> Result<Grid, SolveError> {
    let scale = if quality == SolveQuality::Preview {
        project.solver.preview_scale.max(1.0)
    } else {
        1.0
    };
    let mut x_nm = Vec::new();
    let mut mat_name = Vec::new();
    let mut face_eps = Vec::new();
    let mut face_charge_mode = Vec::new();
    let mut face_fixed_charge_c_cm3 = Vec::new();
    let mut ec0 = Vec::new();
    let mut eg = Vec::new();
    let mut me = Vec::new();
    let mut nc = Vec::new();
    let mut nv = Vec::new();
    let mut nd = Vec::new();
    let mut na = Vec::new();
    let mut charge_mode = Vec::new();
    let mut fixed_charge_c_cm3 = Vec::new();
    let mut sheet_charge_cm2 = Vec::new();
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
        if x_nm.is_empty() {
            let x = offset;
            x_nm.push(x);
            mat_name.push(m.name.clone());
            ec0.push(reference_affinity - m.electron_affinity_ev);
            eg.push(m.band_gap_ev);
            me.push(m.electron_mass.max(0.005));
            nc.push(m.nc_cm3);
            nv.push(m.nv_cm3);
            nd.push(layer.donors_cm3);
            na.push(layer.acceptors_cm3);
            charge_mode.push(layer.charge_mode);
            fixed_charge_c_cm3.push(layer.fixed_charge_c_cm3);
            sheet_charge_cm2.push(layer.sheet_charge_cm2);
        } else {
            // The shared interface node takes the material/charge model on its right;
            // face_eps retains the exact material of each interval.
            let i = x_nm.len() - 1;
            mat_name[i] = m.name.clone();
            ec0[i] = reference_affinity - m.electron_affinity_ev;
            eg[i] = m.band_gap_ev;
            me[i] = m.electron_mass.max(0.005);
            nc[i] = m.nc_cm3;
            nv[i] = m.nv_cm3;
            nd[i] = layer.donors_cm3;
            na[i] = layer.acceptors_cm3;
            charge_mode[i] = layer.charge_mode;
            fixed_charge_c_cm3[i] = layer.fixed_charge_c_cm3;
            sheet_charge_cm2[i] += layer.sheet_charge_cm2;
        }
        for j in 1..=cells {
            x_nm.push(offset + j as f64 * dx);
            face_eps.push(m.relative_permittivity);
            face_charge_mode.push(layer.charge_mode);
            face_fixed_charge_c_cm3.push(layer.fixed_charge_c_cm3);
            mat_name.push(m.name.clone());
            ec0.push(reference_affinity - m.electron_affinity_ev);
            eg.push(m.band_gap_ev);
            me.push(m.electron_mass.max(0.005));
            nc.push(m.nc_cm3);
            nv.push(m.nv_cm3);
            nd.push(layer.donors_cm3);
            na.push(layer.acceptors_cm3);
            charge_mode.push(layer.charge_mode);
            fixed_charge_c_cm3.push(layer.fixed_charge_c_cm3);
            sheet_charge_cm2.push(0.0);
        }
        offset += layer.thickness_nm;
    }
    if x_nm.len() > 12_000 {
        return Err(SolveError::Invalid(
            "mesh exceeds 12,000 nodes; increase mesh spacing".into(),
        ));
    }
    Ok(Grid {
        x_nm,
        mat_name,
        face_eps,
        face_charge_mode,
        face_fixed_charge_c_cm3,
        ec0,
        eg,
        me,
        nc,
        nv,
        nd,
        na,
        charge_mode,
        fixed_charge_c_cm3,
        sheet_charge_cm2,
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
        ContactKind::FixedPotential => contact.voltage_v,
    }
}

fn carriers(grid: &Grid, phi: &[f64], t: f64) -> (Vec<f64>, Vec<f64>, Vec<f64>) {
    let vt = KB_EV * t;
    let mut n = Vec::with_capacity(phi.len());
    let mut p = Vec::with_capacity(phi.len());
    let mut rho = Vec::with_capacity(phi.len());
    for i in 0..phi.len() {
        if grid.charge_mode[i] == ChargeMode::FixedVolume {
            n.push(0.0);
            p.push(0.0);
            rho.push(grid.fixed_charge_c_cm3[i] / Q);
            continue;
        }
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
    let both_neumann = project.surface.kind == ContactKind::ZeroField
        && project.substrate.kind == ContactKind::ZeroField;
    let left_neumann = project.surface.kind == ContactKind::ZeroField && !both_neumann;
    let right_neumann = project.substrate.kind == ContactKind::ZeroField;
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
    let fixed_problem = grid
        .face_charge_mode
        .iter()
        .all(|mode| *mode == ChargeMode::FixedVolume);
    let mix = if fixed_problem {
        1.0
    } else if quality == SolveQuality::Preview {
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
            let e_l = EPS0 * grid.face_eps[i - 1];
            let e_r = EPS0 * grid.face_eps[i];
            let al = e_l / dx_l;
            let ar = e_r / dx_r;
            di[row] = al + ar;
            if row > 0 {
                lo[row - 1] = -al;
            } else if left_neumann {
                di[row] -= al;
                let boundary_rho = if grid.face_charge_mode[i - 1] == ChargeMode::FixedVolume {
                    grid.face_fixed_charge_c_cm3[i - 1] / Q
                } else {
                    rho_cm3[i]
                };
                rhs[row] += Q * 1e6 * 0.5 * boundary_rho * dx_l;
            } else {
                rhs[row] += al * left;
            }
            if row + 1 < inner {
                up[row] = -ar;
            } else if right_neumann {
                di[row] -= ar;
                let boundary_rho = if grid.face_charge_mode[i] == ChargeMode::FixedVolume {
                    grid.face_fixed_charge_c_cm3[i] / Q
                } else {
                    rho_cm3[i]
                };
                rhs[row] += Q * 1e6 * 0.5 * boundary_rho * dx_r;
            } else {
                rhs[row] += ar * right;
            }
            let rho_l = if grid.face_charge_mode[i - 1] == ChargeMode::FixedVolume {
                grid.face_fixed_charge_c_cm3[i - 1] / Q
            } else {
                rho_cm3[i]
            };
            let rho_r = if grid.face_charge_mode[i] == ChargeMode::FixedVolume {
                grid.face_fixed_charge_c_cm3[i] / Q
            } else {
                rho_cm3[i]
            };
            rhs[row] += Q * 1e6 * 0.5 * (rho_l * dx_l + rho_r * dx_r);
            rhs[row] += Q * grid.sheet_charge_cm2[i] * 1e4;
        }
        let solved = thomas(&lo, &di, &up, &rhs)?;
        residual = 0.0_f64;
        for (row, value) in solved.into_iter().enumerate() {
            let i = row + 1;
            let delta = if fixed_problem {
                value - phi[i]
            } else {
                (value - phi[i]).clamp(-0.25, 0.25)
            };
            phi[i] += mix * delta;
            residual = residual.max((mix * delta).abs());
        }
        phi[0] = left;
        if left_neumann {
            let dx = (grid.x_nm[1] - grid.x_nm[0]) * 1e-9;
            let rho = if grid.face_charge_mode[0] == ChargeMode::FixedVolume {
                grid.face_fixed_charge_c_cm3[0] * 1e6
            } else {
                Q * rho_cm3[0] * 1e6
            };
            phi[0] = phi[1] + rho * dx * dx / (2.0 * EPS0 * grid.face_eps[0]);
        }
        phi[count - 1] = right;
        if project.substrate.kind == ContactKind::ZeroField {
            let face = count - 2;
            let dx = (grid.x_nm[count - 1] - grid.x_nm[count - 2]) * 1e-9;
            let rho = if grid.face_charge_mode[face] == ChargeMode::FixedVolume {
                grid.face_fixed_charge_c_cm3[face] * 1e6
            } else {
                Q * rho_cm3[count - 1] * 1e6
            };
            phi[count - 1] = phi[count - 2] + rho * dx * dx / (2.0 * EPS0 * grid.face_eps[face]);
        }
        iterations = iter + 1;
        if residual < tolerance {
            break;
        }
    }
    let (n, p, rho) = carriers(grid, &phi, project.temperature_k);
    Ok((phi, n, p, rho, iterations, residual, residual < tolerance))
}

fn analytic_verification(
    project: &DeviceProject,
    grid: &Grid,
    numerical_phi: &[f64],
    numerical_field: &[f64],
) -> Option<AnalyticVerification> {
    if !project.analytic_verification {
        return None;
    }
    let n = grid.x_nm.len();
    let mut d_plus = vec![0.0; n];
    let mut d_minus = vec![0.0; n];
    d_plus[n - 1] = 0.0;
    d_minus[n - 1] = d_plus[n - 1] - Q * grid.sheet_charge_cm2[n - 1] * 1e4;
    for i in (0..n - 1).rev() {
        let dx_m = (grid.x_nm[i + 1] - grid.x_nm[i]) * 1e-9;
        let rho_c_m3 = grid.face_fixed_charge_c_cm3[i] * 1e6;
        d_plus[i] = d_minus[i + 1] - rho_c_m3 * dx_m;
        d_minus[i] = d_plus[i] - Q * grid.sheet_charge_cm2[i] * 1e4;
    }
    let mut phi = vec![project.surface.voltage_v; n];
    let mut field = vec![0.0; n];
    for i in 0..n - 1 {
        let dx_m = (grid.x_nm[i + 1] - grid.x_nm[i]) * 1e-9;
        let e_avg_v_m = 0.5 * (d_plus[i] + d_minus[i + 1]) / (EPS0 * grid.face_eps[i]);
        phi[i + 1] = phi[i] - e_avg_v_m * dx_m;
        field[i + 1] = e_avg_v_m / 100.0;
    }
    if n > 1 {
        field[0] = field[1];
    }
    let max_potential_error_v = phi
        .iter()
        .zip(numerical_phi)
        .map(|(a, b)| (a - b).abs())
        .fold(0.0, f64::max);
    let max_field_error_v_cm = field
        .iter()
        .zip(numerical_field)
        .map(|(a, b)| (a - b).abs())
        .fold(0.0, f64::max);

    let oxide_end = project.layers.first().map(|l| l.thickness_nm);
    let oxide_index = oxide_end.and_then(|x| grid.x_nm.iter().position(|v| (*v - x).abs() < 1e-8));
    let end = n - 1;
    // MKC A1.4 defines each voltage drop as the left endpoint potential
    // minus the right endpoint potential.
    let oxide_voltage_v = oxide_index.map(|i| phi[0] - phi[i]);
    let semiconductor_voltage_v = oxide_index.map(|i| phi[i] - phi[end]);
    let oxide_field_v_cm = if project
        .layers
        .first()
        .is_some_and(|l| l.material.eq_ignore_ascii_case("SiO2"))
    {
        field.get(1).copied()
    } else {
        None
    };
    let peak_semiconductor_field_v_cm =
        oxide_index.map(|i| field[i..].iter().copied().map(f64::abs).fold(0.0, f64::max));
    let semiconductor_charge_c_cm2 = oxide_index.map(|i| {
        (i..n - 1)
            .map(|j| {
                let dx_cm = (grid.x_nm[j + 1] - grid.x_nm[j]) * 1e-7;
                grid.face_fixed_charge_c_cm3[j] * dx_cm
            })
            .sum()
    });
    Some(AnalyticVerification {
        potential_v: phi,
        electric_field_v_cm: field,
        max_potential_error_v,
        max_field_error_v_cm,
        oxide_voltage_v,
        semiconductor_voltage_v,
        oxide_field_v_cm,
        peak_semiconductor_field_v_cm,
        semiconductor_charge_c_cm2,
        balancing_sheet_charge_c_cm2: d_plus[0] / 1e4,
    })
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
    let analytic = analytic_verification(project, &grid, &phi, &field);
    let charge_density_c_cm3: Vec<f64> = rho.iter().map(|value| Q * value).collect();
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
    if project.analytic_verification {
        let smallest_layer = project
            .layers
            .iter()
            .map(|layer| layer.thickness_nm)
            .fold(f64::INFINITY, f64::min);
        if project.mesh_spacing_nm > smallest_layer / 20.0 {
            warnings.push("The mesh is coarse for analytic verification; use at least 20 cells across the thinnest layer".into());
        }
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
        charge_density_c_cm3,
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
        analytic,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;
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

    #[test]
    fn mkc_a1_4_matches_gauss_law() {
        let p = crate::template("mkc_a1_4").unwrap();
        let r = solve(&p, SolveQuality::Full).unwrap();
        let a = r.analytic.as_ref().unwrap();
        let rho = p.layers[1].fixed_charge_c_cm3;
        let xo_cm = p.layers[0].thickness_nm * 1e-7;
        let xd_cm = p.layers[1].thickness_nm * 1e-7;
        let eps_ox_c_v_cm = EPS0 * 1e-2 * 3.9;
        let eps_si_c_v_cm = EPS0 * 1e-2 * 11.7;
        assert_relative_eq!(
            a.oxide_field_v_cm.unwrap(),
            -rho * xd_cm / eps_ox_c_v_cm,
            max_relative = 1e-12
        );
        assert_relative_eq!(
            a.oxide_voltage_v.unwrap(),
            -rho * xd_cm * xo_cm / eps_ox_c_v_cm,
            max_relative = 1e-12
        );
        assert_relative_eq!(
            a.semiconductor_voltage_v.unwrap(),
            -rho * xd_cm * xd_cm / (2.0 * eps_si_c_v_cm),
            max_relative = 1e-12
        );
        assert_relative_eq!(
            a.balancing_sheet_charge_c_cm2,
            -rho * xd_cm,
            max_relative = 1e-12
        );
        assert_relative_eq!(
            a.semiconductor_charge_c_cm2.unwrap(),
            rho * xd_cm,
            max_relative = 1e-12
        );
        let voltage_scale = a
            .potential_v
            .iter()
            .copied()
            .map(f64::abs)
            .fold(0.0, f64::max);
        assert!(
            a.max_potential_error_v / voltage_scale < 0.005,
            "potential error was {}",
            a.max_potential_error_v / voltage_scale
        );
        let field_scale = a
            .electric_field_v_cm
            .iter()
            .copied()
            .map(f64::abs)
            .fold(0.0, f64::max);
        assert!(a.max_field_error_v_cm / field_scale < 0.005);
        let charged_end_nm = p.layers[0].thickness_nm + p.layers[1].thickness_nm;
        let tail: Vec<usize> = r
            .position_nm
            .iter()
            .enumerate()
            .filter_map(|(i, x)| (*x > charged_end_nm + 1e-9).then_some(i))
            .collect();
        assert!(
            !tail.is_empty(),
            "the preset must show the field-free region beyond x_o+x_d"
        );
        assert!(tail.iter().all(|i| r.electric_field_v_cm[*i].abs() < 1e-5));
        assert!(
            tail.iter()
                .all(|i| (r.potential_v[*i] - r.potential_v[*tail.first().unwrap()]).abs() < 1e-9)
        );
    }

    #[test]
    fn fixed_charge_sign_reverses_solution() {
        let positive = crate::template("mkc_a1_4").unwrap();
        let mut negative = positive.clone();
        negative.layers[1].fixed_charge_c_cm3 *= -1.0;
        let rp = solve(&positive, SolveQuality::Full).unwrap();
        let rn = solve(&negative, SolveQuality::Full).unwrap();
        assert_relative_eq!(
            *rp.potential_v.last().unwrap(),
            -*rn.potential_v.last().unwrap(),
            epsilon = 2e-6
        );
        assert_relative_eq!(
            rp.analytic.unwrap().balancing_sheet_charge_c_cm2,
            -rn.analytic.unwrap().balancing_sheet_charge_c_cm2,
            max_relative = 1e-12
        );
    }

    #[test]
    fn interface_sheet_charge_creates_displacement_jump() {
        let mut p = crate::template("fixed_mos").unwrap();
        p.analytic_verification = false;
        p.substrate.kind = ContactKind::FixedPotential;
        p.layers[0].material = "Si".into();
        p.layers[0].fixed_charge_c_cm3 = 0.0;
        p.layers[1].fixed_charge_c_cm3 = 0.0;
        p.layers[1].sheet_charge_cm2 = 1e11;
        let r = solve(&p, SolveQuality::Full).unwrap();
        let interface = r
            .position_nm
            .iter()
            .position(|x| (*x - p.layers[0].thickness_nm).abs() < 1e-9)
            .unwrap();
        let eps_c_v_cm = EPS0 * 1e-2 * 11.7;
        let jump =
            eps_c_v_cm * (r.electric_field_v_cm[interface + 1] - r.electric_field_v_cm[interface]);
        assert_relative_eq!(jump, Q * 1e11, max_relative = 5e-5);
    }
}
