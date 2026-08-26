use crate::model::*;

#[derive(Clone, Debug, serde::Serialize)]
pub struct LegacyImport {
    pub project: DeviceProject,
    pub warnings: Vec<String>,
}

fn number(value: &str) -> Option<f64> {
    let cleaned = value
        .trim()
        .trim_end_matches(|c: char| c.is_ascii_alphabetic() || c == 'Å');
    cleaned.parse().ok()
}

fn kv<'a>(tokens: &'a [&'a str], key: &str) -> Option<&'a str> {
    tokens.iter().find_map(|t| {
        t.split_once('=')
            .filter(|(k, _)| k.eq_ignore_ascii_case(key))
            .map(|(_, v)| v)
    })
}

fn parse_contact(tokens: &[&str]) -> Contact {
    let mut contact = Contact::default();
    if tokens.iter().any(|t| t.eq_ignore_ascii_case("ohmic")) {
        contact.kind = ContactKind::Ohmic;
        contact.barrier_ev = 0.0;
    }
    if tokens.iter().any(|t| t.eq_ignore_ascii_case("slope=0")) {
        contact.kind = ContactKind::ZeroField;
        contact.barrier_ev = 0.0;
    }
    if let Some(v) = kv(tokens, "schottky").and_then(number) {
        contact.kind = ContactKind::Schottky;
        contact.barrier_ev = v;
    }
    contact
}

pub fn import_legacy(text: &str, name: &str) -> Result<LegacyImport, String> {
    let normalized = text.replace('\r', "\n");
    let mut project = DeviceProject {
        name: name.into(),
        layers: Vec::new(),
        ..DeviceProject::default()
    };
    let mut warnings = Vec::new();
    let mut in_layers = false;
    let mut q_start = None;
    let mut q_stop = None;
    for (line_no, raw) in normalized.lines().enumerate() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let tokens: Vec<&str> = line.split_whitespace().collect();
        let command = tokens[0].to_ascii_lowercase();
        match command.as_str() {
            "surface" => {
                project.surface = parse_contact(&tokens[1..]);
                in_layers = true;
            }
            "substrate" => {
                project.substrate = parse_contact(&tokens[1..]);
                in_layers = false;
            }
            "fullyionized" => project.fully_ionized = true,
            c if c.starts_with("temp=") => {
                project.temperature_k = c
                    .split_once('=')
                    .and_then(|(_, v)| number(v))
                    .ok_or_else(|| format!("invalid temperature on line {}", line_no + 1))?
            }
            c if c.starts_with("dy=") => {
                let raw = c.split_once('=').map(|v| v.1).unwrap_or_default();
                project.mesh_spacing_nm = number(raw)
                    .ok_or_else(|| format!("invalid mesh spacing on line {}", line_no + 1))?
                    * 0.1;
            }
            c if c.starts_with("schrodingerstart=") => {
                q_start = c
                    .split_once('=')
                    .and_then(|(_, v)| number(v))
                    .map(|a| a * 0.1)
            }
            c if c.starts_with("schrodingerstop=") => {
                q_stop = c
                    .split_once('=')
                    .and_then(|(_, v)| number(v))
                    .map(|a| a * 0.1)
            }
            c if c.starts_with('v') && c[1..].chars().all(|v| v.is_ascii_digit()) => {
                if let Some(v) = tokens.get(1).and_then(|v| number(v)) {
                    project.surface.voltage_v = v;
                }
                if tokens.len() >= 4 {
                    project.sweep = Sweep {
                        enabled: true,
                        start_v: number(tokens[1]).unwrap_or(0.0),
                        stop_v: number(tokens[2]).unwrap_or(0.0),
                        step_v: number(tokens[3]).unwrap_or(0.1),
                    };
                }
            }
            _ if in_layers => {
                let thickness_a = kv(&tokens[1..], "t")
                    .and_then(number)
                    .ok_or_else(|| format!("layer missing thickness on line {}", line_no + 1))?;
                project.layers.push(Layer {
                    name: tokens[0].into(),
                    material: tokens[0].into(),
                    thickness_nm: thickness_a * 0.1,
                    alloy_fraction: kv(&tokens[1..], "x").and_then(number),
                    donors_cm3: kv(&tokens[1..], "Nd").and_then(number).unwrap_or(0.0),
                    acceptors_cm3: kv(&tokens[1..], "Na").and_then(number).unwrap_or(0.0),
                    sheet_charge_cm2: kv(&tokens[1..], "sheetcharge")
                        .and_then(number)
                        .unwrap_or(0.0),
                    mesh_spacing_nm: kv(&tokens[1..], "dy").and_then(number).map(|v| v * 0.1),
                });
            }
            _ => warnings.push(format!("line {} was not imported: {}", line_no + 1, line)),
        }
    }
    if let (Some(start_nm), Some(stop_nm)) = (q_start, q_stop) {
        project.quantum = Some(QuantumRegion {
            start_nm,
            stop_nm,
            states: 4,
        });
    }
    project.validate().map_err(|e| e.join("; "))?;
    Ok(LegacyImport { project, warnings })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn imports_crlf_deck() {
        let deck = "surface schottky=.6 v1\rGaAs t=150 Nd=1e18\rAlGaAs t=50 x=.3\rsubstrate\rfullyionized\rv1 -0.2\rtemp=300K\rdy=10\r";
        let imported = import_legacy(deck, "test").unwrap();
        assert_eq!(imported.project.layers.len(), 2);
        assert_eq!(imported.project.layers[0].thickness_nm, 15.0);
        assert_eq!(imported.project.mesh_spacing_nm, 1.0);
    }

    #[test]
    fn imports_all_supplied_demos() {
        let demos = [
            ("pn", include_str!("../../../demo files/demo_pn_diode.txt")),
            (
                "schottky",
                include_str!("../../../demo files/demo_schottky.txt"),
            ),
            ("mos", include_str!("../../../demo files/demo_mos.txt")),
            (
                "hemt",
                include_str!("../../../demo files/demo_gaas_hemt.txt"),
            ),
        ];
        for (name, source) in demos {
            let mut imported =
                import_legacy(source, name).unwrap_or_else(|e| panic!("{name}: {e}"));
            assert!(!imported.project.layers.is_empty(), "{name}");
            imported.project.sweep.enabled = false;
            let result = crate::solve(&imported.project, SolveQuality::Preview)
                .unwrap_or_else(|e| panic!("{name}: {e}"));
            assert!(
                result.potential_v.iter().all(|value| value.is_finite()),
                "{name}"
            );
        }
    }
}
