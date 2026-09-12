use crate::DeviceProject;
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct DataPoint {
    pub x: f64,
    pub y: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Dataset {
    pub id: String,
    pub name: String,
    pub source: String,
    pub quantity: String,
    pub unit: String,
    pub points: Vec<DataPoint>,
    #[serde(default)]
    pub headers: Vec<String>,
    #[serde(default)]
    pub skipped: usize,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Study {
    pub id: String,
    pub name: String,
    pub parameter: String,
    pub values: Vec<f64>,
    pub device: DeviceProject,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WorkspaceProject {
    pub schema_version: u32,
    pub device: DeviceProject,
    #[serde(default)]
    pub datasets: Vec<Dataset>,
    #[serde(default)]
    pub studies: Vec<Study>,
    #[serde(default = "empty_analysis")]
    pub analysis: serde_json::Value,
}
fn empty_analysis() -> serde_json::Value {
    serde_json::json!({})
}
impl WorkspaceProject {
    pub fn parse(source: &str) -> Result<Self, String> {
        let table: toml::Value = toml::from_str(source).map_err(|e| e.to_string())?;
        let value = if table.get("device").is_some() {
            let w: Self = toml::from_str(source).map_err(|e| e.to_string())?;
            if w.schema_version != 2 {
                return Err("Unsupported workspace version".into());
            }
            w
        } else {
            Self {
                schema_version: 2,
                device: DeviceProject::from_toml(source).map_err(|e| e.to_string())?,
                datasets: vec![],
                studies: vec![],
                analysis: serde_json::json!({}),
            }
        };
        value.device.validate().map_err(|e| e.join("; "))?;
        if !value.analysis.is_object() {
            return Err("Analysis settings must be a table".into());
        }
        for d in &value.datasets {
            if !["current", "capacitance", "capacitance_density"].contains(&d.quantity.as_str())
                || d.points
                    .iter()
                    .any(|p| !p.x.is_finite() || !p.y.is_finite())
            {
                return Err(format!("Invalid quantity or numeric samples in {}", d.name));
            }
            let unit = match d.quantity.as_str() {
                "current" => "A",
                "capacitance" => "F",
                _ => "F/cm²",
            };
            if d.unit != unit {
                return Err(format!("{} must store normalized {} samples", d.name, unit));
            }
        }
        for s in &value.studies {
            s.device.validate().map_err(|e| e.join("; "))?;
            if !["bias", "doping", "cv"].contains(&s.parameter.as_str())
                || s.values.is_empty()
                || s.values.len() > 24
                || s.values
                    .iter()
                    .any(|v| !v.is_finite() || (s.parameter != "bias" && *v <= 0.0))
            {
                return Err(format!("Invalid cases in study {}", s.name));
            }
        }
        Ok(value)
    }
    pub fn serialize(&self) -> Result<String, String> {
        toml::to_string_pretty(self).map_err(|e| e.to_string())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn migration_and_embedded_round_trip() {
        let mut w = WorkspaceProject::parse(&DeviceProject::default().to_toml().unwrap()).unwrap();
        assert_eq!(
            w.device.carrier_statistics,
            crate::CarrierStatistics::Boltzmann
        );
        w.datasets.push(Dataset {
            id: "test".into(),
            name: "measurement".into(),
            source: "synthetic".into(),
            quantity: "current".into(),
            unit: "A".into(),
            headers: vec![],
            skipped: 0,
            points: vec![DataPoint { x: 0.1, y: 1e-6 }],
        });
        w.studies.push(Study {
            id: "bias-test".into(),
            name: "Bias comparison".into(),
            parameter: "bias".into(),
            values: vec![-0.5, 0.0, 0.2],
            device: crate::template("schottky").unwrap(),
        });
        w.analysis =
            serde_json::json!({"min": 0.1, "max": 0.3, "known": "barrier", "barrier": 0.6});
        let reread = WorkspaceProject::parse(&w.serialize().unwrap()).unwrap();
        assert_eq!(w.datasets, reread.datasets);
        assert_eq!(w.analysis, reread.analysis);
        assert_eq!(w.studies[0].values, reread.studies[0].values);
        assert_eq!(reread.studies[0].device.surface.barrier_ev, 0.6);
    }
}
