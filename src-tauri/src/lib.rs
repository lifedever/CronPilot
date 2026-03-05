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

            // Check crontab consistency BEFORE syncing
            let crontab_diff = commands::crontab::check_crontab_changes(&conn);
            let needs_user_sync = match &crontab_diff {
                Ok(diff) => !diff.new_entries.is_empty() || diff.managed_block_outdated,
                Err(e) => {
                    eprintln!("CronPilot: crontab check failed: {}", e);
                    false
                }
            };

            if needs_user_sync {
                // Set conflict lock — blocks all CRUD until user resolves
                if let Err(e) = commands::crontab::set_conflict_locked(&conn, true) {
                    eprintln!("CronPilot: failed to set conflict lock: {}", e);
                }
            } else {
                // No discrepancies — clear any stale lock and sync silently
                let _ = commands::crontab::set_conflict_locked(&conn, false);
                if let Err(e) = commands::crontab::sync_to_crontab(&conn) {
                    eprintln!("Warning: startup crontab sync failed: {}", e);
                }
            }

            app.manage(DbState(std::sync::Mutex::new(conn)));

            menu::setup_menu(app)?;

            // Emit first-run event after window is ready
            if is_first_run {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(1500));
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
            commands::logs::clear_logs,
            commands::crontab::import_from_crontab,
            commands::crontab::check_crontab_sync,
            commands::crontab::resolve_use_local,
            commands::crontab::resolve_use_app,
            commands::crontab::resolve_merge,
            commands::crontab::resolve_skip,
            commands::jobs::run_job_now,
            commands::jobs::validate_command,
            commands::jobs::export_jobs_to_file,
            commands::jobs::import_jobs_from_backup,
            commands::jobs::check_cron_access,
            commands::jobs::copy_script_to_safe_dir,
            commands::jobs::open_fda_settings,
            commands::logs::check_cron_permission,
            commands::logs::fix_cron_permission,
            commands::settings::mark_first_run_done,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
