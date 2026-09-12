use requin_core::workspace::WorkspaceProject;
use requin_core::{
    DeviceProject, LegacyImport, SimulationResult, SolveQuality, import_legacy, solve, template,
};
#[tauri::command]
fn parse_workspace(source: String) -> Result<WorkspaceProject, String> {
    WorkspaceProject::parse(&source)
}
#[tauri::command]
fn serialize_workspace(workspace: WorkspaceProject) -> Result<String, String> {
    workspace.serialize()
}
#[tauri::command]
fn set_logo(window: tauri::WebviewWindow, variant: String) -> Result<(), String> {
    let bytes: &[u8] = match variant.as_str() {
        "delta" => include_bytes!("../../src/assets/logos/delta.png"),
        "wedge" => include_bytes!("../../src/assets/logos/wedge.png"),
        "chibi" => include_bytes!("../../src/assets/logos/chibi.png"),
        _ => return Err("Unknown logo".into()),
    };
    let image = tauri::image::Image::from_bytes(bytes).map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    window
        .run_on_main_thread(move || {
            use objc2::{AllocAnyThread, MainThreadMarker};
            use objc2_app_kit::{NSApplication, NSImage};
            use objc2_foundation::NSData;
            if let Some(mtm) = MainThreadMarker::new() {
                let data = NSData::with_bytes(bytes);
                if let Some(icon) = NSImage::initWithData(NSImage::alloc(), &data) {
                    // The application and image are alive, and this closure runs on AppKit's main thread.
                    unsafe {
                        NSApplication::sharedApplication(mtm).setApplicationIconImage(Some(&icon));
                    }
                }
            }
        })
        .map_err(|e| e.to_string())?;
    window.set_icon(image).map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct Validation {
    valid: bool,
    errors: Vec<String>,
}

#[tauri::command]
fn default_project() -> DeviceProject {
    let mut project = template("pn").expect("built-in PN template");
    project.carrier_statistics = requin_core::CarrierStatistics::FermiDirac;
    project
}

#[tauri::command]
fn project_template(kind: String) -> Result<DeviceProject, String> {
    template(&kind).ok_or_else(|| format!("unknown template {kind}"))
}

#[tauri::command]
fn parse_project_toml(source: String) -> Result<DeviceProject, String> {
    DeviceProject::from_toml(&source).map_err(|e| e.to_string())
}

#[tauri::command]
fn serialize_project(project: DeviceProject) -> Result<String, String> {
    project.to_toml().map_err(|e| e.to_string())
}

#[tauri::command]
fn validate_project(project: DeviceProject) -> Validation {
    match project.validate() {
        Ok(()) => Validation {
            valid: true,
            errors: Vec::new(),
        },
        Err(errors) => Validation {
            valid: false,
            errors,
        },
    }
}

#[tauri::command]
fn import_legacy_deck(source: String, name: String) -> Result<LegacyImport, String> {
    import_legacy(&source, &name)
}

#[tauri::command]
async fn run_simulation(
    project: DeviceProject,
    quality: SolveQuality,
) -> Result<SimulationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        solve(&project, quality).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn save_export(name: String, content: String) -> Result<Option<String>, String> {
    let extension = std::path::Path::new(&name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("txt");
    let file = rfd::AsyncFileDialog::new()
        .set_title("Save Requin export")
        .set_file_name(&name)
        .add_filter("Export file", &[extension])
        .save_file()
        .await;
    let Some(file) = file else { return Ok(None) };
    let path = file.path().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::write(&path, content).map_err(|e| format!("Could not save file: {e}"))?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn print_report(window: tauri::WebviewWindow) -> Result<(), String> {
    window
        .print()
        .map_err(|e| format!("Could not open the print dialog: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            default_project,
            parse_workspace,
            serialize_workspace,
            set_logo,
            project_template,
            parse_project_toml,
            serialize_project,
            validate_project,
            import_legacy_deck,
            run_simulation,
            save_export,
            print_report
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Requin");
}
