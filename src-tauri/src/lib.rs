mod commands;
mod db;
mod error;
mod models;

use tauri::Manager;

use db::DbState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data directory");

            let db_path = db::get_db_path(&app_data_dir);
            let conn = db::init_db(&db_path).expect("Failed to initialize database");
            app.manage(DbState(std::sync::Mutex::new(conn)));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::jobs::list_jobs,
            commands::jobs::create_job,
            commands::jobs::update_job,
            commands::jobs::delete_job,
            commands::jobs::toggle_job,
            commands::jobs::get_job,
            commands::cron_expr::validate_cron,
            commands::cron_expr::get_next_runs,
            commands::logs::get_job_logs,
            commands::logs::get_job_stats,
            commands::logs::get_dashboard_stats,
            commands::logs::get_recent_logs,
            commands::crontab::import_from_crontab,
            commands::jobs::run_job_now,
            commands::jobs::validate_command,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
