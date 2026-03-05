use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Job {
    pub id: i64,
    pub name: String,
    pub cron_expression: String,
    pub command: String,
    pub description: String,
    pub is_enabled: bool,
    pub is_synced: bool,
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateJobRequest {
    pub name: String,
    pub cron_expression: String,
    pub command: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_true")]
    pub is_enabled: bool,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateJobRequest {
    pub name: Option<String>,
    pub cron_expression: Option<String>,
    pub command: Option<String>,
    pub description: Option<String>,
    pub is_enabled: Option<bool>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionLog {
    pub id: i64,
    pub job_id: i64,
    pub job_name: Option<String>,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub duration_ms: Option<i64>,
    pub status: String,
    pub trigger_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobStats {
    pub total_runs: i64,
    pub success_count: i64,
    pub failure_count: i64,
    pub avg_duration_ms: Option<f64>,
    pub last_run_at: Option<String>,
    pub last_status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardStats {
    pub total_jobs: i64,
    pub active_jobs: i64,
    pub failed_recent: i64,
    pub next_run: Option<String>,
}

fn default_true() -> bool {
    true
}
