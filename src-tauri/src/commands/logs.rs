use serde::Serialize;
use tauri::State;

use crate::db::DbState;
use crate::error::AppError;
use crate::models::{DashboardStats, ExecutionLog, JobStats, NextRunInfo};
use crate::runner;

#[derive(Serialize)]
pub struct PermissionCheck {
    pub has_issue: bool,
    pub affected_jobs: Vec<AffectedJob>,
}

#[derive(Serialize)]
pub struct AffectedJob {
    pub job_id: i64,
    pub job_name: String,
}

/// Check recent execution logs for "Operation not permitted" errors,
/// which indicates cron lacks Full Disk Access on macOS.
#[tauri::command]
pub fn check_cron_permission(db: State<DbState>) -> Result<PermissionCheck, AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;

    let mut stmt = conn.prepare(
        "SELECT DISTINCT e.job_id, j.name
         FROM execution_logs e
         JOIN jobs j ON j.id = e.job_id
         WHERE e.status = 'failed'
           AND e.stderr LIKE '%Operation not permitted%'
           AND e.started_at >= datetime('now', '-72 hours')
         ORDER BY e.started_at DESC",
    )?;

    let affected: Vec<AffectedJob> = stmt
        .query_map([], |row| {
            Ok(AffectedJob {
                job_id: row.get(0)?,
                job_name: row.get::<_, String>(1)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(PermissionCheck {
        has_issue: !affected.is_empty(),
        affected_jobs: affected,
    })
}

/// Fix "Operation not permitted" by clearing macOS extended attributes
/// (com.apple.provenance / com.apple.quarantine) from runner.sh and
/// all script files referenced by affected jobs.
#[tauri::command]
pub fn fix_cron_permission(db: State<DbState>) -> Result<(), AppError> {
    // 1. Clear xattr from runner.sh
    let runner = runner::runner_path();
    let _ = std::process::Command::new("xattr")
        .arg("-c")
        .arg(&runner)
        .output();

    // 2. Clear xattr from scripts referenced by jobs that had permission errors
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let mut stmt = conn.prepare(
        "SELECT DISTINCT j.command
         FROM execution_logs e
         JOIN jobs j ON j.id = e.job_id
         WHERE e.status = 'failed'
           AND e.stderr LIKE '%Operation not permitted%'
           AND e.started_at >= datetime('now', '-72 hours')",
    )?;

    let commands: Vec<String> = stmt
        .query_map([], |row| row.get::<_, String>(0))?
        .filter_map(|r| r.ok())
        .collect();

    for cmd in &commands {
        // Extract the script path (first token, or path after /bin/bash etc.)
        let tokens: Vec<&str> = cmd.split_whitespace().collect();
        for token in &tokens {
            let path = std::path::Path::new(token);
            if path.is_absolute() && path.exists() {
                let _ = std::process::Command::new("xattr")
                    .arg("-c")
                    .arg(token)
                    .output();
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub fn get_job_logs(
    job_id: i64,
    limit: Option<i64>,
    db: State<DbState>,
) -> Result<Vec<ExecutionLog>, AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let limit = limit.unwrap_or(50);

    let mut stmt = conn.prepare(
        "SELECT id, job_id, started_at, finished_at, exit_code, stdout, stderr, duration_ms, status, trigger_type
         FROM execution_logs
         WHERE job_id = ?1
         ORDER BY started_at DESC
         LIMIT ?2",
    )?;

    let logs = stmt
        .query_map(rusqlite::params![job_id, limit], |row| {
            Ok(ExecutionLog {
                id: row.get(0)?,
                job_id: row.get(1)?,
                job_name: None,
                started_at: row.get(2)?,
                finished_at: row.get(3)?,
                exit_code: row.get(4)?,
                stdout: row.get(5)?,
                stderr: row.get(6)?,
                duration_ms: row.get(7)?,
                status: row.get(8)?,
                trigger_type: row.get(9)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(logs)
}

#[tauri::command]
pub fn get_job_stats(job_id: i64, db: State<DbState>) -> Result<JobStats, AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;

    let stats = conn.query_row(
        "SELECT
            COUNT(*) as total_runs,
            COALESCE(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END), 0) as success_count,
            COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) as failure_count,
            AVG(CASE WHEN duration_ms IS NOT NULL THEN duration_ms END) as avg_duration_ms,
            MAX(started_at) as last_run_at,
            (SELECT status FROM execution_logs WHERE job_id = ?1 ORDER BY started_at DESC LIMIT 1) as last_status
         FROM execution_logs WHERE job_id = ?1",
        [job_id],
        |row| {
            Ok(JobStats {
                total_runs: row.get(0)?,
                success_count: row.get(1)?,
                failure_count: row.get(2)?,
                avg_duration_ms: row.get(3)?,
                last_run_at: row.get(4)?,
                last_status: row.get(5)?,
            })
        },
    )?;

    Ok(stats)
}

#[tauri::command]
pub fn get_dashboard_stats(db: State<DbState>) -> Result<DashboardStats, AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;

    let (total_jobs, active_jobs, failed_recent) = conn.query_row(
        "SELECT
            (SELECT COUNT(*) FROM jobs) as total_jobs,
            (SELECT COUNT(*) FROM jobs WHERE is_enabled = 1) as active_jobs,
            (SELECT COUNT(DISTINCT job_id) FROM execution_logs
             WHERE status = 'failed' AND started_at >= datetime('now', '-24 hours')) as failed_recent
        ",
        [],
        |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?, row.get::<_, i64>(2)?)),
    )?;

    // Compute next upcoming run across all enabled jobs
    let next_run = compute_next_run(&conn);

    Ok(DashboardStats {
        total_jobs,
        active_jobs,
        failed_recent,
        next_run,
    })
}

fn compute_next_run(conn: &rusqlite::Connection) -> Option<NextRunInfo> {
    use chrono::{Local, Utc};
    use croner::Cron;

    let mut stmt = conn
        .prepare("SELECT name, cron_expression FROM jobs WHERE is_enabled = 1")
        .ok()?;

    let jobs: Vec<(String, String)> = stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
        .ok()?
        .filter_map(|r| r.ok())
        .collect();

    let now = Utc::now();
    let mut earliest: Option<(String, chrono::DateTime<Utc>)> = None;

    for (name, expr) in &jobs {
        if let Ok(cron) = Cron::new(expr).parse() {
            if let Some(next) = cron.iter_from(now).next() {
                match &earliest {
                    None => earliest = Some((name.clone(), next)),
                    Some((_, t)) if next < *t => earliest = Some((name.clone(), next)),
                    _ => {}
                }
            }
        }
    }

    earliest.map(|(job_name, next_time)| {
        let duration = next_time - now;
        let secs = duration.num_seconds();
        let relative = if secs < 60 {
            format!("{}s", secs)
        } else if secs < 3600 {
            format!("{}m", secs / 60)
        } else if secs < 86400 {
            let h = secs / 3600;
            let m = (secs % 3600) / 60;
            if m > 0 { format!("{}h{}m", h, m) } else { format!("{}h", h) }
        } else {
            let d = secs / 86400;
            let h = (secs % 86400) / 3600;
            if h > 0 { format!("{}d{}h", d, h) } else { format!("{}d", d) }
        };
        let local_time = next_time.with_timezone(&Local);
        NextRunInfo {
            job_name,
            datetime: local_time.format("%Y-%m-%d %H:%M:%S").to_string(),
            relative,
        }
    })
}

#[tauri::command]
pub fn get_recent_logs(
    limit: Option<i64>,
    db: State<DbState>,
) -> Result<Vec<ExecutionLog>, AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let limit = limit.unwrap_or(20);

    let mut stmt = conn.prepare(
        "SELECT e.id, e.job_id, j.name, e.started_at, e.finished_at, e.exit_code, e.stdout, e.stderr, e.duration_ms, e.status, e.trigger_type
         FROM execution_logs e
         LEFT JOIN jobs j ON j.id = e.job_id
         ORDER BY e.started_at DESC
         LIMIT ?1",
    )?;

    let logs = stmt
        .query_map([limit], |row| {
            Ok(ExecutionLog {
                id: row.get(0)?,
                job_id: row.get(1)?,
                job_name: row.get(2)?,
                started_at: row.get(3)?,
                finished_at: row.get(4)?,
                exit_code: row.get(5)?,
                stdout: row.get(6)?,
                stderr: row.get(7)?,
                duration_ms: row.get(8)?,
                status: row.get(9)?,
                trigger_type: row.get(10)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(logs)
}

#[derive(Serialize)]
pub struct ClearLogsResult {
    pub deleted: usize,
}

/// Clear execution logs.
/// `before_days`: if Some(n), only delete logs older than n days. If None, delete all.
#[tauri::command]
pub fn clear_logs(
    before_days: Option<i64>,
    db: State<DbState>,
) -> Result<ClearLogsResult, AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;

    let deleted = match before_days {
        Some(days) => conn.execute(
            "DELETE FROM execution_logs WHERE started_at < datetime('now', ?1)",
            [format!("-{} days", days)],
        )?,
        None => conn.execute("DELETE FROM execution_logs", [])?,
    };

    Ok(ClearLogsResult { deleted })
}
