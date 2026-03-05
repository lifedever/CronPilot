use rusqlite::Connection;
use serde::Serialize;
use std::io::Write;
use std::process::Command;
use tauri::State;

use crate::db::DbState;
use crate::error::AppError;

const CRONPILOT_BEGIN: &str = "# >>> CronPilot managed - DO NOT EDIT <<<";
const CRONPILOT_END: &str = "# >>> CronPilot end <<<";

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

/// Build the CronPilot-managed block from enabled jobs in the database
fn build_managed_block(conn: &Connection) -> Result<String, AppError> {
    let mut stmt = conn.prepare(
        "SELECT cron_expression, command, name FROM jobs WHERE is_enabled = 1 ORDER BY id",
    )?;

    let lines: Vec<String> = stmt
        .query_map([], |row| {
            let expr: String = row.get(0)?;
            let cmd: String = row.get(1)?;
            let name: String = row.get(2)?;
            Ok(format!("# [{}]\n{} {}", name, expr, cmd))
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
    // but skip lines that are already managed by CronPilot (in DB)
    let mut user_lines: Vec<&str> = Vec::new();
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
            // Check if this crontab line duplicates a DB-managed job
            if let Some((expr, cmd)) = parse_crontab_line(line) {
                let is_managed = managed_entries.iter().any(|(e, c)| *e == expr && *c == cmd);
                if is_managed {
                    continue; // skip — will appear in managed block
                }
            }
            user_lines.push(line);
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

#[tauri::command]
pub fn import_from_crontab(db: State<DbState>) -> Result<ImportResult, AppError> {
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
    let conn = db
        .0
        .lock()
        .map_err(|e| AppError::Internal(e.to_string()))?;

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

        if let Some((expr, cmd)) = parse_crontab_line(line) {
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

    // Sync immediately so the crontab reflects the managed block
    // and removes duplicates from the user section
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
