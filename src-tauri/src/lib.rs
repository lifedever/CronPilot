mod commands;
mod db;
mod error;
mod menu;
mod models;
mod runner;

use tauri::{Emitter, Manager};

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

            // Install/update the cron runner script
            if let Err(e) = runner::install_runner(&db_path) {
                eprintln!("Warning: failed to install runner: {}", e);
            }

            // Store db_path in settings for reference
            conn.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES ('db_path', ?1)",
                [db_path.display().to_string()],
            )
            .ok();

            // Check if this is the first run
            let is_first_run: bool = conn
                .query_row(
                    "SELECT COUNT(*) = 0 FROM settings WHERE key = 'first_run_done'",
                    [],
                    |row| row.get(0),
                )
                .unwrap_or(true);

            // Sync crontab on startup (re-sync to ensure consistency)
            if let Err(e) = commands::crontab::sync_to_crontab(&conn) {
                eprintln!("Warning: startup crontab sync failed: {}", e);
            }

            app.manage(DbState(std::sync::Mutex::new(conn)));

            menu::setup_menu(app)?;

            // Emit first-run event after window is ready
            if is_first_run {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(500));
                    let _ = handle.emit("first-run", ());
                });
            }

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
            commands::jobs::export_jobs_to_file,
            commands::jobs::import_jobs_from_backup,
            commands::settings::mark_first_run_done,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
