use tauri::State;

use crate::db::DbState;
use crate::error::AppError;
use crate::models::{DashboardStats, ExecutionLog, JobStats};

#[tauri::command]
pub fn get_job_logs(
    job_id: i64,
    limit: Option<i64>,
    db: State<DbState>,
) -> Result<Vec<ExecutionLog>, AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let limit = limit.unwrap_or(50);

    let mut stmt = conn.prepare(
        "SELECT id, job_id, started_at, finished_at, exit_code, stdout, stderr, duration_ms, status
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

    let stats = conn.query_row(
        "SELECT
            (SELECT COUNT(*) FROM jobs) as total_jobs,
            (SELECT COUNT(*) FROM jobs WHERE is_enabled = 1) as active_jobs,
            (SELECT COUNT(DISTINCT job_id) FROM execution_logs
             WHERE status = 'failed' AND started_at >= datetime('now', '-24 hours')) as failed_recent
        ",
        [],
        |row| {
            Ok(DashboardStats {
                total_jobs: row.get(0)?,
                active_jobs: row.get(1)?,
                failed_recent: row.get(2)?,
                next_run: None,
            })
        },
    )?;

    Ok(stats)
}

#[tauri::command]
pub fn get_recent_logs(
    limit: Option<i64>,
    db: State<DbState>,
) -> Result<Vec<ExecutionLog>, AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let limit = limit.unwrap_or(20);

    let mut stmt = conn.prepare(
        "SELECT e.id, e.job_id, j.name, e.started_at, e.finished_at, e.exit_code, e.stdout, e.stderr, e.duration_ms, e.status
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
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(logs)
}
