use std::path::PathBuf;

use crate::error::AppError;

const RUNNER_DIR: &str = ".cronpilot";
const RUNNER_FILENAME: &str = "runner.sh";

/// Get the runner directory path (~/.cronpilot/)
fn runner_dir() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    PathBuf::from(home).join(RUNNER_DIR)
}

/// Get the runner script path (~/.cronpilot/runner.sh)
pub fn runner_path() -> PathBuf {
    runner_dir().join(RUNNER_FILENAME)
}

/// Install or update the runner script.
/// The script wraps cron commands to capture execution logs into CronPilot's database.
pub fn install_runner(db_path: &PathBuf) -> Result<(), AppError> {
    let dir = runner_dir();
    std::fs::create_dir_all(&dir)?;

    let db_path_str = db_path.display();
    let script = format!(
        r##"#!/bin/sh
# CronPilot Runner - wraps cron commands with execution logging
# This script is managed by CronPilot. Do not edit manually.
# https://github.com/lifedever/CronPilot

DB_PATH="{db_path_str}"
JOB_ID="$1"
shift
[ "$1" = "--" ] && shift

# Safety: if anything goes wrong with logging, still run the command
if [ -z "$JOB_ID" ] || [ $# -eq 0 ]; then
    "$@"
    exit $?
fi

# Check sqlite3 is available
if ! command -v sqlite3 >/dev/null 2>&1; then
    "$@"
    exit $?
fi

# Check DB exists
if [ ! -f "$DB_PATH" ]; then
    "$@"
    exit $?
fi

STARTED_AT=$(date -u +"%Y-%m-%d %H:%M:%S")
START_MS=$(python3 -c 'import time; print(int(time.time()*1000))' 2>/dev/null || echo 0)

# Capture output to temp files
TMPOUT=$(mktemp /tmp/cronpilot_out.XXXXXX)
TMPERR=$(mktemp /tmp/cronpilot_err.XXXXXX)

# Execute the command.
# If $1 is a text script file (not a binary), run via its shebang interpreter
# to avoid macOS TCC blocking exec() on files in protected folders.
# Only apply this for actual scripts — skip binaries like /bin/bash.
if [ -f "$1" ] && [ -r "$1" ] && head -c 2 "$1" | grep -q '^#!'; then
    INTERP=$(head -1 "$1" | sed -n 's/^#![[:space:]]*\([^ ]*\).*/\1/p')
    ${{INTERP:-/bin/sh}} "$@" >"$TMPOUT" 2>"$TMPERR"
else
    "$@" >"$TMPOUT" 2>"$TMPERR"
fi
EXIT_CODE=$?

END_MS=$(python3 -c 'import time; print(int(time.time()*1000))' 2>/dev/null || echo 0)
if [ "$START_MS" -gt 0 ] && [ "$END_MS" -gt 0 ]; then
    DURATION_MS=$(( END_MS - START_MS ))
else
    DURATION_MS=0
fi
FINISHED_AT=$(date -u +"%Y-%m-%d %H:%M:%S")

[ $EXIT_CODE -eq 0 ] && STATUS="success" || STATUS="failed"

# Replay output so cron's mail mechanism still works
cat "$TMPOUT"
cat "$TMPERR" >&2

# Truncate to 64KB, escape single quotes for SQL
STDOUT=$(head -c 65536 "$TMPOUT" | tr -d '\0' | sed "s/'/''/g")
STDERR=$(head -c 65536 "$TMPERR" | tr -d '\0' | sed "s/'/''/g")
rm -f "$TMPOUT" "$TMPERR"

# Write execution log to database (best-effort, don't fail the job)
sqlite3 "$DB_PATH" "INSERT INTO execution_logs (job_id, started_at, finished_at, exit_code, stdout, stderr, duration_ms, status, trigger_type) VALUES ($JOB_ID, '$STARTED_AT', '$FINISHED_AT', $EXIT_CODE, '$STDOUT', '$STDERR', $DURATION_MS, '$STATUS', 'cron');" 2>/dev/null || true

exit $EXIT_CODE
"##
    );

    let path = runner_path();
    std::fs::write(&path, script)?;

    // chmod +x
    std::process::Command::new("chmod")
        .arg("+x")
        .arg(&path)
        .output()
        .map_err(|e| AppError::Io(e))?;

    // Remove macOS extended attributes (provenance/quarantine) so cron can execute the script.
    // Unsigned apps cause macOS to tag created files, which blocks execution in cron.
    let _ = std::process::Command::new("xattr")
        .arg("-c")
        .arg(&path)
        .output();

    Ok(())
}
