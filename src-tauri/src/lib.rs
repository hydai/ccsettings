pub mod appconfig;
pub mod backup;
pub mod cascade;
pub mod commands;
pub mod discovery;
pub mod layers;
pub mod mcp;
pub mod paths;
pub mod plugins;
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
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            commands::list_workspaces,
            commands::add_workspace,
            commands::remove_workspace,
            commands::rename_workspace,
            commands::discover_workspaces_from_history,
            commands::get_cascade,
            commands::get_layer_content,
            commands::save_layer,
            commands::read_memory_file,
            commands::save_memory_file,
            commands::get_plugins_state,
            commands::get_mcp_state,
            commands::list_backups_for_layer,
            commands::list_backups_for_memory,
            commands::restore_backup,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
