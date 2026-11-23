mod auth;
mod commands;
mod files;
mod secrets;

use tauri_plugin_autostart::MacosLauncher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .manage(commands::AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::get_oauth_client,
            commands::set_oauth_client,
            commands::start_sign_in,
            commands::get_access_token,
            commands::remove_account,
            commands::read_json,
            commands::write_json,
            commands::delete_json,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
