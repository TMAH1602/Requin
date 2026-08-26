use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct DeviceProject {
    pub schema_version: u32,
    pub name: String,
    pub description: String,
    pub temperature_k: f64,
    pub mesh_spacing_nm: f64,
    pub fully_ionized: bool,
    pub layers: Vec<Layer>,
    pub surface: Contact,
    pub substrate: Contact,
    pub quantum: Option<QuantumRegion>,
    pub sweep: Sweep,
    pub solver: SolverSettings,
}

impl Default for DeviceProject {
    fn default() -> Self {
        Self {
            schema_version: 1,
            name: "Untitled device".into(),
            description: String::new(),
            temperature_k: 300.0,
            mesh_spacing_nm: 1.0,
            fully_ionized: true,
            layers: vec![Layer::default()],
            surface: Contact::default(),
            substrate: Contact {
                kind: ContactKind::Ohmic,
                barrier_ev: 0.0,
                voltage_v: 0.0,
            },
            quantum: None,
            sweep: Sweep::default(),
            solver: SolverSettings::default(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct Layer {
    pub name: String,
    pub material: String,
    pub thickness_nm: f64,
    pub alloy_fraction: Option<f64>,
    pub donors_cm3: f64,
    pub acceptors_cm3: f64,
    pub sheet_charge_cm2: f64,
    pub mesh_spacing_nm: Option<f64>,
}

impl Default for Layer {
    fn default() -> Self {
        Self {
            name: "Silicon".into(),
            material: "Si".into(),
            thickness_nm: 500.0,
            alloy_fraction: None,
            donors_cm3: 0.0,
            acceptors_cm3: 1e16,
            sheet_charge_cm2: 0.0,
            mesh_spacing_nm: None,
        }
    }
}

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ContactKind {
    Schottky,
    #[default]
    Ohmic,
    ZeroField,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct Contact {
    pub kind: ContactKind,
    pub barrier_ev: f64,
    pub voltage_v: f64,
}
impl Default for Contact {
    fn default() -> Self {
        Self {
            kind: ContactKind::Schottky,
            barrier_ev: 0.7,
            voltage_v: 0.0,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct QuantumRegion {
    pub start_nm: f64,
    pub stop_nm: f64,
    #[serde(default = "default_states")]
    pub states: usize,
}
fn default_states() -> usize {
    4
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct Sweep {
    pub enabled: bool,
    pub start_v: f64,
    pub stop_v: f64,
    pub step_v: f64,
}
impl Default for Sweep {
    fn default() -> Self {
        Self {
            enabled: false,
            start_v: -1.0,
            stop_v: 1.0,
            step_v: 0.1,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct SolverSettings {
    pub max_iterations: usize,
    pub tolerance: f64,
    pub mixing: f64,
    pub preview_scale: f64,
}
impl Default for SolverSettings {
    fn default() -> Self {
        Self {
            max_iterations: 400,
            tolerance: 1e-7,
            mixing: 0.18,
            preview_scale: 4.0,
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SolveQuality {
    Preview,
    Full,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Eigenstate {
    pub index: usize,
    pub energy_ev: f64,
    pub wavefunction: Vec<f64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SweepPoint {
    pub voltage_v: f64,
    pub charge_c_m2: f64,
    pub capacitance_f_m2: Option<f64>,
    pub current_a_m2: Option<f64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ConvergenceReport {
    pub converged: bool,
    pub iterations: usize,
    pub residual: f64,
    pub quality: SolveQuality,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SimulationResult {
    pub position_nm: Vec<f64>,
    pub potential_v: Vec<f64>,
    pub electric_field_v_cm: Vec<f64>,
    pub conduction_band_ev: Vec<f64>,
    pub valence_band_ev: Vec<f64>,
    pub electron_cm3: Vec<f64>,
    pub hole_cm3: Vec<f64>,
    pub net_charge_cm3: Vec<f64>,
    pub material: Vec<String>,
    pub eigenstates: Vec<Eigenstate>,
    pub sweep: Vec<SweepPoint>,
    pub convergence: ConvergenceReport,
}

impl DeviceProject {
    pub fn validate(&self) -> Result<(), Vec<String>> {
        let mut errors = Vec::new();
        if self.schema_version != 1 {
            errors.push(format!(
                "unsupported schema version {}",
                self.schema_version
            ));
        }
        if self.layers.is_empty() {
            errors.push("at least one layer is required".into());
        }
        if !(0.1..=2000.0).contains(&self.temperature_k) {
            errors.push("temperature must be between 0.1 K and 2000 K".into());
        }
        if self.mesh_spacing_nm <= 0.0 {
            errors.push("mesh spacing must be positive".into());
        }
        for (i, layer) in self.layers.iter().enumerate() {
            if layer.thickness_nm <= 0.0 {
                errors.push(format!("layer {} thickness must be positive", i + 1));
            }
            if let Some(x) = layer.alloy_fraction {
                if !(0.0..=1.0).contains(&x) {
                    errors.push(format!("layer {} alloy fraction must be in [0, 1]", i + 1));
                }
            }
            if crate::materials::material(&layer.material, layer.alloy_fraction, self.temperature_k)
                .is_none()
            {
                errors.push(format!(
                    "layer {} uses unknown material {}",
                    i + 1,
                    layer.material
                ));
            }
        }
        if let Some(q) = &self.quantum {
            let length: f64 = self.layers.iter().map(|l| l.thickness_nm).sum();
            if q.start_nm < 0.0 || q.stop_nm <= q.start_nm || q.stop_nm > length {
                errors.push("quantum region must lie inside the device".into());
            }
        }
        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors)
        }
    }

    pub fn to_toml(&self) -> Result<String, toml::ser::Error> {
        toml::to_string_pretty(self)
    }
    pub fn from_toml(value: &str) -> Result<Self, toml::de::Error> {
        toml::from_str(value)
    }
}
