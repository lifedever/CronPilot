use rusqlite::Connection;

/// Create an in-memory database with the same schema as the real app
fn setup_test_db() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn.pragma_update(None, "foreign_keys", "ON").unwrap();

    conn.execute_batch(
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
        );",
    )
    .unwrap();

    conn
}

fn insert_test_job(conn: &Connection, name: &str, cron: &str, command: &str, enabled: bool) -> i64 {
    conn.execute(
        "INSERT INTO jobs (name, cron_expression, command, description, is_enabled, tags)
         VALUES (?1, ?2, ?3, '', ?4, '[]')",
        rusqlite::params![name, cron, command, enabled],
    )
    .unwrap();
    conn.last_insert_rowid()
}

fn insert_test_log(
    conn: &Connection,
    job_id: i64,
    status: &str,
    duration_ms: Option<i64>,
    started_at: &str,
) {
    conn.execute(
        "INSERT INTO execution_logs (job_id, started_at, finished_at, exit_code, stdout, stderr, duration_ms, status)
         VALUES (?1, ?2, datetime(?2, '+1 second'), ?3, '', '', ?4, ?5)",
        rusqlite::params![
            job_id,
            started_at,
            if status == "success" { 0 } else { 1 },
            duration_ms,
            status,
        ],
    )
    .unwrap();
}

// =====================
// Job CRUD Tests
// =====================

#[test]
fn test_create_and_list_jobs() {
    let conn = setup_test_db();

    insert_test_job(&conn, "Backup", "0 0 * * *", "/usr/bin/backup.sh", true);
    insert_test_job(&conn, "Cleanup", "0 3 * * *", "/usr/bin/cleanup.sh", false);

    let mut stmt = conn
        .prepare("SELECT id, name, cron_expression, command, is_enabled FROM jobs ORDER BY id")
        .unwrap();

    let jobs: Vec<(i64, String, String, String, bool)> = stmt
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
            ))
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();

    assert_eq!(jobs.len(), 2);
    assert_eq!(jobs[0].1, "Backup");
    assert!(jobs[0].4); // enabled
    assert_eq!(jobs[1].1, "Cleanup");
    assert!(!jobs[1].4); // disabled
}

#[test]
fn test_update_job() {
    let conn = setup_test_db();
    let id = insert_test_job(&conn, "Old Name", "0 0 * * *", "/usr/bin/cmd", true);

    conn.execute(
        "UPDATE jobs SET name = ?1, cron_expression = ?2, updated_at = datetime('now') WHERE id = ?3",
        rusqlite::params!["New Name", "*/5 * * * *", id],
    )
    .unwrap();

    let (name, cron): (String, String) = conn
        .query_row("SELECT name, cron_expression FROM jobs WHERE id = ?1", [id], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })
        .unwrap();

    assert_eq!(name, "New Name");
    assert_eq!(cron, "*/5 * * * *");
}

#[test]
fn test_delete_job() {
    let conn = setup_test_db();
    let id = insert_test_job(&conn, "To Delete", "0 0 * * *", "/usr/bin/cmd", true);

    let rows = conn.execute("DELETE FROM jobs WHERE id = ?1", [id]).unwrap();
    assert_eq!(rows, 1);

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM jobs WHERE id = ?1", [id], |row| row.get(0))
        .unwrap();
    assert_eq!(count, 0);
}

#[test]
fn test_delete_nonexistent_job() {
    let conn = setup_test_db();
    let rows = conn.execute("DELETE FROM jobs WHERE id = ?1", [9999]).unwrap();
    assert_eq!(rows, 0);
}

#[test]
fn test_toggle_job() {
    let conn = setup_test_db();
    let id = insert_test_job(&conn, "Toggle Me", "0 0 * * *", "/usr/bin/cmd", true);

    conn.execute(
        "UPDATE jobs SET is_enabled = NOT is_enabled WHERE id = ?1",
        [id],
    )
    .unwrap();

    let enabled: bool = conn
        .query_row("SELECT is_enabled FROM jobs WHERE id = ?1", [id], |row| row.get(0))
        .unwrap();
    assert!(!enabled);

    // Toggle back
    conn.execute(
        "UPDATE jobs SET is_enabled = NOT is_enabled WHERE id = ?1",
        [id],
    )
    .unwrap();

    let enabled: bool = conn
        .query_row("SELECT is_enabled FROM jobs WHERE id = ?1", [id], |row| row.get(0))
        .unwrap();
    assert!(enabled);
}

#[test]
fn test_job_tags_json() {
    let conn = setup_test_db();

    let tags = serde_json::to_string(&vec!["web", "backup"]).unwrap();
    conn.execute(
        "INSERT INTO jobs (name, cron_expression, command, tags) VALUES ('Tagged', '0 0 * * *', '/bin/cmd', ?1)",
        [&tags],
    )
    .unwrap();

    let tags_str: String = conn
        .query_row("SELECT tags FROM jobs WHERE name = 'Tagged'", [], |row| row.get(0))
        .unwrap();
    let parsed: Vec<String> = serde_json::from_str(&tags_str).unwrap();
    assert_eq!(parsed, vec!["web", "backup"]);
}

// =====================
// Execution Log Tests
// =====================

#[test]
fn test_cascade_delete_logs() {
    let conn = setup_test_db();
    let id = insert_test_job(&conn, "Job", "0 0 * * *", "/usr/bin/cmd", true);

    insert_test_log(&conn, id, "success", Some(100), "2026-03-05 10:00:00");
    insert_test_log(&conn, id, "failed", Some(200), "2026-03-05 11:00:00");

    let log_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM execution_logs WHERE job_id = ?1", [id], |row| row.get(0))
        .unwrap();
    assert_eq!(log_count, 2);

    // Delete job — logs should cascade
    conn.execute("DELETE FROM jobs WHERE id = ?1", [id]).unwrap();

    let log_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM execution_logs WHERE job_id = ?1", [id], |row| row.get(0))
        .unwrap();
    assert_eq!(log_count, 0);
}

#[test]
fn test_log_status_constraint() {
    let conn = setup_test_db();
    let id = insert_test_job(&conn, "Job", "0 0 * * *", "/usr/bin/cmd", true);

    // Valid statuses
    for status in &["running", "success", "failed", "timeout"] {
        let result = conn.execute(
            "INSERT INTO execution_logs (job_id, started_at, status) VALUES (?1, datetime('now'), ?2)",
            rusqlite::params![id, status],
        );
        assert!(result.is_ok(), "Status '{}' should be valid", status);
    }

    // Invalid status
    let result = conn.execute(
        "INSERT INTO execution_logs (job_id, started_at, status) VALUES (?1, datetime('now'), 'invalid')",
        [id],
    );
    assert!(result.is_err(), "Status 'invalid' should be rejected");
}

// =====================
// Stats Query Tests
// =====================

#[test]
fn test_job_stats_with_logs() {
    let conn = setup_test_db();
    let id = insert_test_job(&conn, "Stats Job", "0 0 * * *", "/usr/bin/cmd", true);

    insert_test_log(&conn, id, "success", Some(100), "2026-03-05 10:00:00");
    insert_test_log(&conn, id, "success", Some(200), "2026-03-05 11:00:00");
    insert_test_log(&conn, id, "failed", Some(300), "2026-03-05 12:00:00");

    let (total, success, failure, avg_ms): (i64, i64, i64, f64) = conn
        .query_row(
            "SELECT
                COUNT(*) as total_runs,
                COALESCE(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0),
                AVG(CASE WHEN duration_ms IS NOT NULL THEN duration_ms END)
             FROM execution_logs WHERE job_id = ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .unwrap();

    assert_eq!(total, 3);
    assert_eq!(success, 2);
    assert_eq!(failure, 1);
    assert!((avg_ms - 200.0).abs() < 0.01);
}

#[test]
fn test_job_stats_no_logs() {
    let conn = setup_test_db();
    let id = insert_test_job(&conn, "Empty Job", "0 0 * * *", "/usr/bin/cmd", true);

    let (total, success, failure): (i64, i64, i64) = conn
        .query_row(
            "SELECT
                COUNT(*),
                COALESCE(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0)
             FROM execution_logs WHERE job_id = ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .unwrap();

    assert_eq!(total, 0);
    assert_eq!(success, 0);
    assert_eq!(failure, 0);
}

#[test]
fn test_dashboard_stats() {
    let conn = setup_test_db();

    let id1 = insert_test_job(&conn, "Active 1", "0 0 * * *", "/usr/bin/cmd1", true);
    let id2 = insert_test_job(&conn, "Active 2", "0 1 * * *", "/usr/bin/cmd2", true);
    let _id3 = insert_test_job(&conn, "Disabled", "0 2 * * *", "/usr/bin/cmd3", false);

    // Add a recent failure
    insert_test_log(&conn, id1, "failed", Some(100), "2026-03-05 10:00:00");
    // Add another recent failure for a different job
    insert_test_log(&conn, id2, "failed", Some(100), "2026-03-05 10:00:00");
    // Add a success
    insert_test_log(&conn, id1, "success", Some(50), "2026-03-05 11:00:00");

    let (total_jobs, active_jobs): (i64, i64) = conn
        .query_row(
            "SELECT
                (SELECT COUNT(*) FROM jobs),
                (SELECT COUNT(*) FROM jobs WHERE is_enabled = 1)",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();

    assert_eq!(total_jobs, 3);
    assert_eq!(active_jobs, 2);
}

#[test]
fn test_recent_logs_with_job_name() {
    let conn = setup_test_db();
    let id = insert_test_job(&conn, "Named Job", "0 0 * * *", "/usr/bin/cmd", true);

    insert_test_log(&conn, id, "success", Some(100), "2026-03-05 10:00:00");

    let mut stmt = conn
        .prepare(
            "SELECT e.id, j.name, e.status
             FROM execution_logs e
             LEFT JOIN jobs j ON j.id = e.job_id
             ORDER BY e.started_at DESC
             LIMIT 10",
        )
        .unwrap();

    let logs: Vec<(i64, Option<String>, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();

    assert_eq!(logs.len(), 1);
    assert_eq!(logs[0].1, Some("Named Job".to_string()));
    assert_eq!(logs[0].2, "success");
}

// =====================
// Duplicate Detection Tests (Import Logic)
// =====================

#[test]
fn test_duplicate_command_detection() {
    let conn = setup_test_db();
    insert_test_job(&conn, "Existing", "0 0 * * *", "/usr/bin/backup.sh", true);

    // Same command should be detected as duplicate
    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM jobs WHERE command = ?1",
            ["/usr/bin/backup.sh"],
            |row| row.get(0),
        )
        .unwrap();
    assert!(exists);

    // Different command should not be duplicate
    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM jobs WHERE command = ?1",
            ["/usr/bin/other.sh"],
            |row| row.get(0),
        )
        .unwrap();
    assert!(!exists);
}

// =====================
// Dynamic Update SQL Tests
// =====================

#[test]
fn test_partial_update_only_name() {
    let conn = setup_test_db();
    let id = insert_test_job(&conn, "Original", "0 0 * * *", "/usr/bin/cmd", true);

    // Simulate partial update (only name)
    conn.execute(
        "UPDATE jobs SET name = ?1, updated_at = datetime('now') WHERE id = ?2",
        rusqlite::params!["Updated", id],
    )
    .unwrap();

    let (name, cron, command): (String, String, String) = conn
        .query_row(
            "SELECT name, cron_expression, command FROM jobs WHERE id = ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .unwrap();

    assert_eq!(name, "Updated");
    assert_eq!(cron, "0 0 * * *"); // unchanged
    assert_eq!(command, "/usr/bin/cmd"); // unchanged
}

#[test]
fn test_update_nonexistent_job_returns_zero_rows() {
    let conn = setup_test_db();
    let rows = conn
        .execute(
            "UPDATE jobs SET name = 'X' WHERE id = ?1",
            [99999],
        )
        .unwrap();
    assert_eq!(rows, 0);
}
