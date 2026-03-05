use std::time::Instant;

use tauri::State;

use crate::db::DbState;
use crate::error::AppError;
use crate::models::{CreateJobRequest, ExecutionLog, Job, UpdateJobRequest};

#[tauri::command]
pub fn list_jobs(db: State<DbState>) -> Result<Vec<Job>, AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let mut stmt = conn.prepare(
        "SELECT id, name, cron_expression, command, description, is_enabled, is_synced, tags, created_at, updated_at
         FROM jobs ORDER BY created_at DESC"
    )?;

    let jobs = stmt
        .query_map([], |row| {
            let tags_str: String = row.get(7)?;
            let tags: Vec<String> =
                serde_json::from_str(&tags_str).unwrap_or_default();
            Ok(Job {
                id: row.get(0)?,
                name: row.get(1)?,
                cron_expression: row.get(2)?,
                command: row.get(3)?,
                description: row.get(4)?,
                is_enabled: row.get(5)?,
                is_synced: row.get(6)?,
                tags,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(jobs)
}

#[tauri::command]
pub fn create_job(job: CreateJobRequest, db: State<DbState>) -> Result<Job, AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let tags_json = serde_json::to_string(&job.tags).unwrap_or_else(|_| "[]".to_string());

    conn.execute(
        "INSERT INTO jobs (name, cron_expression, command, description, is_enabled, tags)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            job.name,
            job.cron_expression,
            job.command,
            job.description,
            job.is_enabled,
            tags_json,
        ],
    )?;

    let id = conn.last_insert_rowid();
    let mut stmt = conn.prepare(
        "SELECT id, name, cron_expression, command, description, is_enabled, is_synced, tags, created_at, updated_at
         FROM jobs WHERE id = ?1"
    )?;

    let created = stmt.query_row([id], |row| {
        let tags_str: String = row.get(7)?;
        let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
        Ok(Job {
            id: row.get(0)?,
            name: row.get(1)?,
            cron_expression: row.get(2)?,
            command: row.get(3)?,
            description: row.get(4)?,
            is_enabled: row.get(5)?,
            is_synced: row.get(6)?,
            tags,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        })
    })?;

    Ok(created)
}

#[tauri::command]
pub fn update_job(id: i64, job: UpdateJobRequest, db: State<DbState>) -> Result<Job, AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;

    // Build dynamic update
    let mut updates = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref name) = job.name {
        updates.push("name = ?");
        params.push(Box::new(name.clone()));
    }
    if let Some(ref expr) = job.cron_expression {
        updates.push("cron_expression = ?");
        params.push(Box::new(expr.clone()));
    }
    if let Some(ref cmd) = job.command {
        updates.push("command = ?");
        params.push(Box::new(cmd.clone()));
    }
    if let Some(ref desc) = job.description {
        updates.push("description = ?");
        params.push(Box::new(desc.clone()));
    }
    if let Some(enabled) = job.is_enabled {
        updates.push("is_enabled = ?");
        params.push(Box::new(enabled));
    }
    if let Some(ref tags) = job.tags {
        updates.push("tags = ?");
        params.push(Box::new(
            serde_json::to_string(tags).unwrap_or_else(|_| "[]".to_string()),
        ));
    }

    if updates.is_empty() {
        return Err(AppError::Internal("No fields to update".to_string()));
    }

    updates.push("updated_at = datetime('now')");
    params.push(Box::new(id));

    let sql = format!(
        "UPDATE jobs SET {} WHERE id = ?",
        updates.join(", ")
    );

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let rows = conn.execute(&sql, param_refs.as_slice())?;

    if rows == 0 {
        return Err(AppError::NotFound(format!("Job {} not found", id)));
    }

    let mut stmt = conn.prepare(
        "SELECT id, name, cron_expression, command, description, is_enabled, is_synced, tags, created_at, updated_at
         FROM jobs WHERE id = ?1"
    )?;

    let updated = stmt.query_row([id], |row| {
        let tags_str: String = row.get(7)?;
        let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
        Ok(Job {
            id: row.get(0)?,
            name: row.get(1)?,
            cron_expression: row.get(2)?,
            command: row.get(3)?,
            description: row.get(4)?,
            is_enabled: row.get(5)?,
            is_synced: row.get(6)?,
            tags,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        })
    })?;

    Ok(updated)
}

#[tauri::command]
pub fn delete_job(id: i64, db: State<DbState>) -> Result<(), AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let rows = conn.execute("DELETE FROM jobs WHERE id = ?1", [id])?;
    if rows == 0 {
        return Err(AppError::NotFound(format!("Job {} not found", id)));
    }
    Ok(())
}

#[tauri::command]
pub fn toggle_job(id: i64, db: State<DbState>) -> Result<Job, AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;

    let rows = conn.execute(
        "UPDATE jobs SET is_enabled = NOT is_enabled, updated_at = datetime('now') WHERE id = ?1",
        [id],
    )?;

    if rows == 0 {
        return Err(AppError::NotFound(format!("Job {} not found", id)));
    }

    let mut stmt = conn.prepare(
        "SELECT id, name, cron_expression, command, description, is_enabled, is_synced, tags, created_at, updated_at
         FROM jobs WHERE id = ?1"
    )?;

    let job = stmt.query_row([id], |row| {
        let tags_str: String = row.get(7)?;
        let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
        Ok(Job {
            id: row.get(0)?,
            name: row.get(1)?,
            cron_expression: row.get(2)?,
            command: row.get(3)?,
            description: row.get(4)?,
            is_enabled: row.get(5)?,
            is_synced: row.get(6)?,
            tags,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        })
    })?;

    Ok(job)
}

#[tauri::command]
pub fn get_job(id: i64, db: State<DbState>) -> Result<Job, AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;

    let mut stmt = conn.prepare(
        "SELECT id, name, cron_expression, command, description, is_enabled, is_synced, tags, created_at, updated_at
         FROM jobs WHERE id = ?1"
    )?;

    let job = stmt.query_row([id], |row| {
        let tags_str: String = row.get(7)?;
        let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
        Ok(Job {
            id: row.get(0)?,
            name: row.get(1)?,
            cron_expression: row.get(2)?,
            command: row.get(3)?,
            description: row.get(4)?,
            is_enabled: row.get(5)?,
            is_synced: row.get(6)?,
            tags,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        })
    }).map_err(|_| AppError::NotFound(format!("Job {} not found", id)))?;

    Ok(job)
}

#[tauri::command]
pub async fn run_job_now(id: i64, db: State<'_, DbState>) -> Result<ExecutionLog, AppError> {
    // 1. Look up the job
    let command_str = {
        let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
        let mut stmt = conn.prepare("SELECT command FROM jobs WHERE id = ?1")?;
        stmt.query_row([id], |row| row.get::<_, String>(0))
            .map_err(|_| AppError::NotFound(format!("Job {} not found", id)))?
    };

    // 2. Insert a "running" log entry
    let log_id = {
        let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
        conn.execute(
            "INSERT INTO execution_logs (job_id, started_at, status) VALUES (?1, datetime('now'), 'running')",
            [id],
        )?;
        conn.last_insert_rowid()
    };

    // 3. Execute the command
    let start = Instant::now();
    let output = tokio::process::Command::new("sh")
        .arg("-c")
        .arg(&command_str)
        .output()
        .await
        .map_err(|e| AppError::Io(e))?;

    let duration_ms = start.elapsed().as_millis() as i64;
    let exit_code = output.status.code().unwrap_or(-1);
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let status = if output.status.success() { "success" } else { "failed" };

    // 4. Update the log entry with results
    {
        let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
        conn.execute(
            "UPDATE execution_logs SET finished_at = datetime('now'), exit_code = ?1, stdout = ?2, stderr = ?3, duration_ms = ?4, status = ?5 WHERE id = ?6",
            rusqlite::params![exit_code, stdout, stderr, duration_ms, status, log_id],
        )?;
    }

    // 5. Return the completed log
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    let mut stmt = conn.prepare(
        "SELECT id, job_id, started_at, finished_at, exit_code, stdout, stderr, duration_ms, status FROM execution_logs WHERE id = ?1"
    )?;

    let log = stmt.query_row([log_id], |row| {
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
    })?;

    Ok(log)
}
