pub mod appconfig;
pub mod cascade;
pub mod commands;
pub mod discovery;
pub mod layers;
pub mod paths;
pub mod writers;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .try_init();

    let state = commands::AppState::load();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            commands::list_workspaces,
            commands::add_workspace,
            commands::remove_workspace,
            commands::rename_workspace,
            commands::discover_workspaces_from_history,
            commands::get_cascade,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
