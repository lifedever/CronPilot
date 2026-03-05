use tauri::State;

use crate::db::DbState;
use crate::error::AppError;

#[tauri::command]
pub fn mark_first_run_done(db: State<DbState>) -> Result<(), AppError> {
    let conn = db.0.lock().map_err(|e| AppError::Internal(e.to_string()))?;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('first_run_done', '1')",
        [],
    )?;
    Ok(())
}
