//! Normalized Fermi–Dirac integral F_1/2. Simpson quadrature in sqrt(energy)
//! removes the endpoint singularity; a shared table makes carrier updates cheap.
use std::sync::OnceLock;
fn integral(eta: f64) -> f64 {
    let end = (eta.max(0.0) + 40.0).sqrt();
    let h = end / 400.0;
    let mut sum = 0.0;
    for i in 0..=400 {
        let t = i as f64 * h;
        let value = 4.0 / std::f64::consts::PI.sqrt() * t * t / (1.0 + (t * t - eta).exp());
        sum += value
            * if i == 0 || i == 400 {
                1.0
            } else if i % 2 == 0 {
                2.0
            } else {
                4.0
            };
    }
    sum * h / 3.0
}
pub fn fermi_half(eta: f64) -> f64 {
    if eta < -12.0 {
        return eta.exp();
    }
    if eta > 40.0 {
        return 4.0 / (3.0 * std::f64::consts::PI.sqrt())
            * eta.powf(1.5)
            * (1.0 + std::f64::consts::PI.powi(2) / (8.0 * eta * eta));
    }
    static TABLE: OnceLock<Vec<f64>> = OnceLock::new();
    let table = TABLE.get_or_init(|| {
        (0..=5200)
            .map(|i| integral(-12.0 + i as f64 * 0.01))
            .collect()
    });
    let x = (eta + 12.0) * 100.0;
    let i = (x.floor() as usize).min(5199);
    table[i] + (table[i + 1] - table[i]) * (x - i as f64)
}
pub fn inverse_half(ratio: f64) -> f64 {
    let mut lo = -100.0;
    let mut hi = 10000.0;
    for _ in 0..70 {
        let mid = (lo + hi) * 0.5;
        if fermi_half(mid) > ratio {
            hi = mid;
        } else {
            lo = mid;
        }
    }
    (lo + hi) * 0.5
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn normalization_and_inverse() {
        assert!((fermi_half(0.0) - 0.7651470246).abs() < 1e-7);
        assert!((fermi_half(-15.0) / (-15.0_f64).exp() - 1.0).abs() < 1e-6);
        for value in [0.001, 0.1, 1.0, 10.0] {
            assert!((fermi_half(inverse_half(value)) / value - 1.0).abs() < 1e-8);
        }
    }
}
