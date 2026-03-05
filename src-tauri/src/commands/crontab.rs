use serde::Serialize;
use std::process::Command;
use tauri::State;

use crate::db::DbState;
use crate::error::AppError;

#[derive(Serialize)]
pub struct ImportResult {
    pub imported: usize,
    pub skipped: usize,
}

/// Parse a single crontab line into (expression, command)
fn parse_crontab_line(line: &str) -> Option<(String, String)> {
    let line = line.trim();
    // Skip empty lines, comments, and variable assignments
    if line.is_empty() || line.starts_with('#') || line.contains('=') && !line.contains(' ') {
        return None;
    }
    // Skip lines like SHELL=, PATH=, MAILTO=
    if line.starts_with("SHELL=")
        || line.starts_with("PATH=")
        || line.starts_with("MAILTO=")
        || line.starts_with("HOME=")
    {
        return None;
    }

    // Standard crontab: 5 fields + command
    let parts: Vec<&str> = line.splitn(6, char::is_whitespace).collect();
    if parts.len() < 6 {
        return None;
    }

    let expr = parts[0..5].join(" ");
    let cmd = parts[5].trim().to_string();

    if cmd.is_empty() {
        return None;
    }

    Some((expr, cmd))
}

/// Generate a short name from the command
fn name_from_command(cmd: &str) -> String {
    let basename = cmd
        .split_whitespace()
        .next()
        .unwrap_or(cmd)
        .rsplit('/')
        .next()
        .unwrap_or(cmd);
    basename.to_string()
}

#[tauri::command]
pub fn import_from_crontab(db: State<DbState>) -> Result<ImportResult, AppError> {
    // Run `crontab -l`
    let output = Command::new("crontab")
        .arg("-l")
        .output()
        .map_err(|e| AppError::Crontab(format!("Failed to run crontab -l: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // "no crontab for user" is not an error, just means empty
        if stderr.contains("no crontab") {
            return Ok(ImportResult {
                imported: 0,
                skipped: 0,
            });
        }
        return Err(AppError::Crontab(format!("crontab -l failed: {}", stderr)));
    }

    let content = String::from_utf8_lossy(&output.stdout);
    let conn = db
        .0
        .lock()
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let mut imported = 0;
    let mut skipped = 0;

    for line in content.lines() {
        if let Some((expr, cmd)) = parse_crontab_line(line) {
            // Check if this command already exists
            let exists: bool = conn
                .query_row(
                    "SELECT COUNT(*) > 0 FROM jobs WHERE command = ?1",
                    [&cmd],
                    |row| row.get(0),
                )
                .unwrap_or(false);

            if exists {
                skipped += 1;
                continue;
            }

            let name = name_from_command(&cmd);
            conn.execute(
                "INSERT INTO jobs (name, cron_expression, command, description, is_enabled)
                 VALUES (?1, ?2, ?3, ?4, 1)",
                rusqlite::params![name, expr, cmd, ""],
            )?;
            imported += 1;
        }
    }

    Ok(ImportResult { imported, skipped })
}
