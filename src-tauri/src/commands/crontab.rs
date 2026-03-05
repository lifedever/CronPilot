use rusqlite::Connection;
use serde::Serialize;
use std::io::Write;
use std::process::Command;
use tauri::State;

use crate::db::DbState;
use crate::error::AppError;
use crate::runner;

const CRONPILOT_BEGIN: &str = "# >>> CronPilot managed - DO NOT EDIT <<<";
const CRONPILOT_END: &str = "# >>> CronPilot end <<<";
const CRONPILOT_COMMENTED: &str = "# [CronPilot imported]";

#[derive(Serialize)]
pub struct ImportResult {
    pub imported: usize,
    pub skipped: usize,
}

/// Parse a single crontab line into (expression, command)
pub(crate) fn parse_crontab_line(line: &str) -> Option<(String, String)> {
    let line = line.trim();
    if line.is_empty() || line.starts_with('#') || line.contains('=') && !line.contains(' ') {
        return None;
    }
    if line.starts_with("SHELL=")
        || line.starts_with("PATH=")
        || line.starts_with("MAILTO=")
        || line.starts_with("HOME=")
    {
        return None;
    }

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
pub(crate) fn name_from_command(cmd: &str) -> String {
    let basename = cmd
        .split_whitespace()
        .next()
        .unwrap_or(cmd)
        .rsplit('/')
        .next()
        .unwrap_or(cmd);
    basename.to_string()
}

/// Read the current system crontab content (empty string if none)
fn read_system_crontab() -> String {
    let output = Command::new("crontab").arg("-l").output();
    match output {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).to_string(),
        _ => String::new(),
    }
}

/// Write content to system crontab via `crontab -`
fn write_system_crontab(content: &str) -> Result<(), AppError> {
    let mut child = Command::new("crontab")
        .arg("-")
        .stdin(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| AppError::Crontab(format!("Failed to spawn crontab: {}", e)))?;

    if let Some(ref mut stdin) = child.stdin {
        stdin
            .write_all(content.as_bytes())
            .map_err(|e| AppError::Crontab(format!("Failed to write to crontab stdin: {}", e)))?;
    }

    let status = child
        .wait()
        .map_err(|e| AppError::Crontab(format!("Failed to wait for crontab: {}", e)))?;

    if !status.success() {
        return Err(AppError::Crontab("crontab - failed".to_string()));
    }

    Ok(())
}

/// Build the CronPilot-managed block from enabled jobs in the database.
/// Each command is wrapped with the runner script for execution logging.
fn build_managed_block(conn: &Connection) -> Result<String, AppError> {
    let runner = runner::runner_path();
    let runner_str = runner.display().to_string();

    let mut stmt = conn.prepare(
        "SELECT id, cron_expression, command, name FROM jobs WHERE is_enabled = 1 ORDER BY id",
    )?;

    let lines: Vec<String> = stmt
        .query_map([], |row| {
            let id: i64 = row.get(0)?;
            let expr: String = row.get(1)?;
            let cmd: String = row.get(2)?;
            let name: String = row.get(3)?;
            Ok(format!(
                "# [{}]\n{} {} {} -- {}",
                name, expr, runner_str, id, cmd
            ))
        })?
        .filter_map(|r| r.ok())
        .collect();

    if lines.is_empty() {
        return Ok(String::new());
    }

    Ok(format!(
        "{}\n{}\n{}",
        CRONPILOT_BEGIN,
        lines.join("\n"),
        CRONPILOT_END
    ))
}

/// Sync all enabled jobs from the database to the system crontab.
/// Preserves any user-managed lines outside the CronPilot block.
pub fn sync_to_crontab(conn: &Connection) -> Result<(), AppError> {
    let current = read_system_crontab();
    let runner_str = runner::runner_path().display().to_string();

    // Collect all job commands from DB to detect duplicates in user section
    let mut managed_entries: Vec<(String, String)> = Vec::new();
    {
        let mut stmt = conn.prepare(
            "SELECT cron_expression, command FROM jobs",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        for row in rows {
            if let Ok(entry) = row {
                managed_entries.push(entry);
            }
        }
    }

    // Extract non-CronPilot lines (preserve user's own crontab entries)
    // Comment out lines that are already managed by CronPilot (instead of deleting)
    let mut user_lines: Vec<String> = Vec::new();
    let mut inside_block = false;
    for line in current.lines() {
        if line.trim() == CRONPILOT_BEGIN {
            inside_block = true;
            continue;
        }
        if line.trim() == CRONPILOT_END {
            inside_block = false;
            continue;
        }
        if !inside_block {
            // Skip lines already commented by CronPilot
            if line.starts_with(CRONPILOT_COMMENTED) {
                user_lines.push(line.to_string());
                continue;
            }
            if let Some((expr, cmd)) = parse_crontab_line(line) {
                // Runner-wrapped lines outside the block are stale CronPilot entries
                if cmd.contains(&runner_str) {
                    user_lines.push(format!("{} {}", CRONPILOT_COMMENTED, line.trim()));
                    continue;
                }
                // Check if this crontab line duplicates a DB-managed job
                let is_managed = managed_entries.iter().any(|(e, c)| *e == expr && *c == cmd);
                if is_managed {
                    user_lines.push(format!("{} {}", CRONPILOT_COMMENTED, line.trim()));
                    continue;
                }
            }
            user_lines.push(line.to_string());
        }
    }

    // Remove trailing empty lines from user section
    while user_lines.last().map_or(false, |l| l.trim().is_empty()) {
        user_lines.pop();
    }

    let managed_block = build_managed_block(conn)?;

    let mut final_content = user_lines.join("\n");
    if !managed_block.is_empty() {
        if !final_content.is_empty() {
            final_content.push('\n');
        }
        final_content.push_str(&managed_block);
    }
    final_content.push('\n');

    // Snapshot before writing
    conn.execute(
        "INSERT INTO crontab_snapshots (content, reason) VALUES (?1, 'sync')",
        [&current],
    )?;

    write_system_crontab(&final_content)?;

    // Mark all enabled jobs as synced
    conn.execute("UPDATE jobs SET is_synced = 1 WHERE is_enabled = 1", [])?;
    conn.execute("UPDATE jobs SET is_synced = 0 WHERE is_enabled = 0", [])?;

    Ok(())
}

/// Core import logic: scan crontab for entries not in DB, import them.
/// Returns (imported, skipped) counts.
fn import_crontab_entries(conn: &Connection, content: &str) -> Result<(usize, usize), AppError> {
    let runner_path = runner::runner_path().display().to_string();
    let mut imported = 0;
    let mut skipped = 0;

    // Only import lines outside the CronPilot managed block
    let mut inside_block = false;
    for line in content.lines() {
        if line.trim() == CRONPILOT_BEGIN {
            inside_block = true;
            continue;
        }
        if line.trim() == CRONPILOT_END {
            inside_block = false;
            continue;
        }
        if inside_block {
            continue;
        }

        // Skip lines already commented by CronPilot
        if line.starts_with(CRONPILOT_COMMENTED) {
            continue;
        }

        if let Some((expr, cmd)) = parse_crontab_line(line) {
            // Skip runner-wrapped commands (these are CronPilot's own entries
            // that ended up outside the block somehow)
            if cmd.contains(&runner_path) {
                continue;
            }

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
                "INSERT INTO jobs (name, cron_expression, command, description, is_enabled, is_synced)
                 VALUES (?1, ?2, ?3, ?4, 1, 1)",
                rusqlite::params![name, expr, cmd, ""],
            )?;
            imported += 1;
        }
    }

    Ok((imported, skipped))
}

/// Describes what kind of crontab inconsistency was detected.
#[derive(Debug, Serialize, Clone)]
pub struct CrontabDiff {
    /// New entries in crontab not in DB
    pub new_entries: Vec<(String, String)>,
    /// Whether the managed block is missing or outdated
    pub managed_block_outdated: bool,
}

/// Check if the system crontab is consistent with the DB.
/// Detects: new entries not in DB, and managed block mismatch.
/// Must be called BEFORE sync_to_crontab to see the real state.
pub fn check_crontab_changes(conn: &Connection) -> Result<CrontabDiff, AppError> {
    let content = read_system_crontab();
    if content.is_empty() {
        // No crontab at all; check if we have jobs that should be there
        let has_enabled_jobs: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM jobs WHERE is_enabled = 1",
                [],
                |row| row.get(0),
            )
            .unwrap_or(false);

        return Ok(CrontabDiff {
            new_entries: Vec::new(),
            managed_block_outdated: has_enabled_jobs,
        });
    }

    let runner_path = runner::runner_path().display().to_string();
    let mut new_entries: Vec<(String, String)> = Vec::new();

    // 1. Scan for new entries outside the managed block
    let mut inside_block = false;
    for line in content.lines() {
        if line.trim() == CRONPILOT_BEGIN {
            inside_block = true;
            continue;
        }
        if line.trim() == CRONPILOT_END {
            inside_block = false;
            continue;
        }
        if inside_block {
            continue;
        }
        if line.starts_with(CRONPILOT_COMMENTED) {
            continue;
        }

        if let Some((expr, cmd)) = parse_crontab_line(line) {
            if cmd.contains(&runner_path) {
                continue;
            }

            let exists: bool = conn
                .query_row(
                    "SELECT COUNT(*) > 0 FROM jobs WHERE command = ?1",
                    [&cmd],
                    |row| row.get(0),
                )
                .unwrap_or(false);

            if !exists {
                new_entries.push((expr, cmd));
            }
        }
    }

    // 2. Check if managed block matches what we'd generate
    let expected_block = build_managed_block(conn)?;
    let managed_block_outdated = if expected_block.is_empty() {
        // No enabled jobs, managed block should be absent
        content.contains(CRONPILOT_BEGIN)
    } else {
        // Extract current managed block from crontab
        let mut current_block = String::new();
        let mut in_block = false;
        for line in content.lines() {
            if line.trim() == CRONPILOT_BEGIN {
                in_block = true;
                current_block.push_str(line);
                current_block.push('\n');
                continue;
            }
            if line.trim() == CRONPILOT_END {
                current_block.push_str(line);
                in_block = false;
                continue;
            }
            if in_block {
                current_block.push_str(line);
                current_block.push('\n');
            }
        }
        current_block.trim() != expected_block.trim()
    };

    Ok(CrontabDiff {
        new_entries,
        managed_block_outdated,
    })
}

/// Check if the crontab conflict lock is active.
pub fn is_conflict_locked(conn: &Connection) -> bool {
    conn.query_row(
        "SELECT value FROM settings WHERE key = 'conflict_locked'",
        [],
        |row| row.get::<_, String>(0),
    )
    .map(|v| v == "1")
    .unwrap_or(false)
}

/// Set or clear the conflict lock.
pub fn set_conflict_locked(conn: &Connection, locked: bool) -> Result<(), AppError> {
    if locked {
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('conflict_locked', '1')",
            [],
        )?;
    } else {
        conn.execute("DELETE FROM settings WHERE key = 'conflict_locked'", [])?;
    }
    Ok(())
}

/// Guard: returns ConflictLocked error if there's an unresolved conflict.
pub fn require_no_conflict(conn: &Connection) -> Result<(), AppError> {
    if is_conflict_locked(conn) {
        return Err(AppError::ConflictLocked(
            "Crontab conflict must be resolved before modifying jobs".to_string(),
        ));
    }
    Ok(())
}

#[derive(Serialize)]
pub struct CrontabChangeEntry {
    pub expression: String,
    pub command: String,
}

#[derive(Serialize)]
pub struct CrontabSyncStatus {
    pub new_entries: Vec<CrontabChangeEntry>,
    pub managed_block_outdated: bool,
    pub needs_sync: bool,
    pub conflict_locked: bool,
}

/// Frontend calls this on mount to check conflict state (replaces flaky event timing).
#[tauri::command]
pub fn check_crontab_sync(db: State<DbState>) -> Result<CrontabSyncStatus, AppError> {
    let conn = db
        .0
        .lock()
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let locked = is_conflict_locked(&conn);
    let diff = check_crontab_changes(&conn)?;
    let needs_sync = !diff.new_entries.is_empty() || diff.managed_block_outdated;
    Ok(CrontabSyncStatus {
        new_entries: diff
            .new_entries
            .into_iter()
            .map(|(expression, command)| CrontabChangeEntry {
                expression,
                command,
            })
            .collect(),
        managed_block_outdated: diff.managed_block_outdated,
        needs_sync,
        conflict_locked: locked,
    })
}

/// Resolve conflict: keep local crontab as source of truth.
/// Import all new entries from crontab, then overwrite managed block.
#[tauri::command]
pub fn resolve_use_local(db: State<DbState>) -> Result<ImportResult, AppError> {
    let conn = db
        .0
        .lock()
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let content = read_system_crontab();

    // Delete all existing jobs and re-import everything from crontab
    conn.execute("DELETE FROM jobs", [])?;

    let mut imported = 0;
    let runner_path = runner::runner_path().display().to_string();

    // Extract lines outside the managed block (the "real" user crontab)
    let mut inside_block = false;
    for line in content.lines() {
        if line.trim() == CRONPILOT_BEGIN {
            inside_block = true;
            continue;
        }
        if line.trim() == CRONPILOT_END {
            inside_block = false;
            continue;
        }
        if inside_block {
            continue;
        }
        if line.starts_with(CRONPILOT_COMMENTED) {
            continue;
        }
        if let Some((expr, cmd)) = parse_crontab_line(line) {
            if cmd.contains(&runner_path) {
                continue;
            }
            let name = name_from_command(&cmd);
            conn.execute(
                "INSERT INTO jobs (name, cron_expression, command, description, is_enabled, is_synced)
                 VALUES (?1, ?2, ?3, '', 1, 0)",
                rusqlite::params![name, expr, cmd],
            )?;
            imported += 1;
        }
    }

    // Now sync back (rewrites managed block)
    sync_to_crontab(&conn)?;
    set_conflict_locked(&conn, false)?;

    Ok(ImportResult { imported, skipped: 0 })
}

/// Resolve conflict: keep app (DB) as source of truth.
/// Overwrite crontab with what the DB says. New crontab entries are ignored.
#[tauri::command]
pub fn resolve_use_app(db: State<DbState>) -> Result<(), AppError> {
    let conn = db
        .0
        .lock()
        .map_err(|e| AppError::Internal(e.to_string()))?;

    sync_to_crontab(&conn)?;
    set_conflict_locked(&conn, false)?;

    Ok(())
}

/// Resolve conflict: merge both.
/// Import new crontab entries into DB, then sync everything back.
#[tauri::command]
pub fn resolve_merge(db: State<DbState>) -> Result<ImportResult, AppError> {
    let conn = db
        .0
        .lock()
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let content = read_system_crontab();
    let (imported, skipped) = if !content.is_empty() {
        import_crontab_entries(&conn, &content)?
    } else {
        (0, 0)
    };

    sync_to_crontab(&conn)?;
    set_conflict_locked(&conn, false)?;

    Ok(ImportResult { imported, skipped })
}

/// Resolve conflict: skip (do nothing now, keep the lock active).
#[tauri::command]
pub fn resolve_skip() -> Result<(), AppError> {
    // Lock stays — CRUD remains blocked until user resolves
    Ok(())
}

#[tauri::command]
pub fn import_from_crontab(db: State<DbState>) -> Result<ImportResult, AppError> {
    let conn = db
        .0
        .lock()
        .map_err(|e| AppError::Internal(e.to_string()))?;
    require_no_conflict(&conn)?;

    let output = Command::new("crontab")
        .arg("-l")
        .output()
        .map_err(|e| AppError::Crontab(format!("Failed to run crontab -l: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("no crontab") {
            return Ok(ImportResult {
                imported: 0,
                skipped: 0,
            });
        }
        return Err(AppError::Crontab(format!("crontab -l failed: {}", stderr)));
    }

    let content = String::from_utf8_lossy(&output.stdout);

    let (imported, skipped) = import_crontab_entries(&conn, &content)?;

    if imported > 0 {
        sync_to_crontab(&conn)?;
    }

    Ok(ImportResult { imported, skipped })
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- parse_crontab_line ---

    #[test]
    fn test_parse_valid_crontab_line() {
        let result = parse_crontab_line("0 0 * * * /usr/bin/backup.sh");
        assert_eq!(
            result,
            Some(("0 0 * * *".to_string(), "/usr/bin/backup.sh".to_string()))
        );
    }

    #[test]
    fn test_parse_crontab_line_with_args() {
        let result = parse_crontab_line("*/5 * * * * /usr/bin/cmd --flag arg1 arg2");
        assert_eq!(
            result,
            Some((
                "*/5 * * * *".to_string(),
                "/usr/bin/cmd --flag arg1 arg2".to_string()
            ))
        );
    }

    #[test]
    fn test_parse_crontab_line_empty() {
        assert_eq!(parse_crontab_line(""), None);
        assert_eq!(parse_crontab_line("   "), None);
    }

    #[test]
    fn test_parse_crontab_line_comment() {
        assert_eq!(parse_crontab_line("# this is a comment"), None);
        assert_eq!(parse_crontab_line("  # indented comment"), None);
    }

    #[test]
    fn test_parse_crontab_line_env_vars() {
        assert_eq!(parse_crontab_line("SHELL=/bin/bash"), None);
        assert_eq!(parse_crontab_line("PATH=/usr/bin:/bin"), None);
        assert_eq!(parse_crontab_line("MAILTO=user@example.com"), None);
        assert_eq!(parse_crontab_line("HOME=/home/user"), None);
    }

    #[test]
    fn test_parse_crontab_line_too_few_fields() {
        assert_eq!(parse_crontab_line("0 0 * * *"), None); // 5 fields, no command
        assert_eq!(parse_crontab_line("0 0 *"), None);
    }

    #[test]
    fn test_parse_crontab_line_with_leading_whitespace() {
        let result = parse_crontab_line("  0 0 * * * /usr/bin/cmd");
        assert_eq!(
            result,
            Some(("0 0 * * *".to_string(), "/usr/bin/cmd".to_string()))
        );
    }

    // --- name_from_command ---

    #[test]
    fn test_name_from_absolute_path() {
        assert_eq!(name_from_command("/usr/bin/backup.sh"), "backup.sh");
        assert_eq!(name_from_command("/usr/local/bin/python3"), "python3");
    }

    #[test]
    fn test_name_from_command_with_args() {
        assert_eq!(
            name_from_command("/usr/bin/python3 /path/to/script.py --verbose"),
            "python3"
        );
    }

    #[test]
    fn test_name_from_simple_command() {
        assert_eq!(name_from_command("echo hello"), "echo");
        assert_eq!(name_from_command("ls"), "ls");
    }

    #[test]
    fn test_name_from_empty_command() {
        assert_eq!(name_from_command(""), "");
    }
}
