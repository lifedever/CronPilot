use rusqlite::Connection;
use rusqlite_migration::{Migrations, M};
use std::path::PathBuf;
use std::sync::Mutex;

use crate::error::AppError;

pub struct DbState(pub Mutex<Connection>);

pub fn get_db_path(app_data_dir: &PathBuf) -> PathBuf {
    app_data_dir.join("cronpilot.db")
}

pub fn init_db(db_path: &PathBuf) -> Result<Connection, AppError> {
    std::fs::create_dir_all(db_path.parent().unwrap())?;

    let mut conn = Connection::open(db_path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;

    let migrations = Migrations::new(vec![
        M::up(
            "CREATE TABLE IF NOT EXISTS jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                cron_expression TEXT NOT NULL,
                command TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                is_enabled INTEGER NOT NULL DEFAULT 1,
                is_synced INTEGER NOT NULL DEFAULT 0,
                tags TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS execution_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
                started_at TEXT NOT NULL,
                finished_at TEXT,
                exit_code INTEGER,
                stdout TEXT NOT NULL DEFAULT '',
                stderr TEXT NOT NULL DEFAULT '',
                duration_ms INTEGER,
                status TEXT NOT NULL DEFAULT 'running'
                    CHECK(status IN ('running','success','failed','timeout'))
            );

            CREATE INDEX IF NOT EXISTS idx_logs_job_id ON execution_logs(job_id);
            CREATE INDEX IF NOT EXISTS idx_logs_started_at ON execution_logs(started_at);
            CREATE INDEX IF NOT EXISTS idx_logs_status ON execution_logs(status);
            CREATE INDEX IF NOT EXISTS idx_jobs_is_enabled ON jobs(is_enabled);

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS crontab_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT NOT NULL,
                reason TEXT NOT NULL DEFAULT 'manual',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );"
        ),
        // Migration 2: add trigger_type column to distinguish manual vs cron execution
        M::up(
            "ALTER TABLE execution_logs ADD COLUMN trigger_type TEXT NOT NULL DEFAULT 'cron';"
        ),
    ]);

    migrations.to_latest(&mut conn).map_err(|e| {
        AppError::Database(rusqlite::Error::SqliteFailure(
            rusqlite::ffi::Error::new(1),
            Some(format!("Migration failed: {}", e)),
        ))
    })?;

    Ok(conn)
}
