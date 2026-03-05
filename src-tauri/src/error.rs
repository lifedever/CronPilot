use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Crontab error: {0}")]
    Crontab(String),

    #[error("Cron expression error: {0}")]
    CronExpression(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("CONFLICT_LOCKED:{0}")]
    ConflictLocked(String),

    #[error("{0}")]
    Internal(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
