export interface Job {
  id: number;
  name: string;
  cron_expression: string;
  command: string;
  description: string;
  is_enabled: boolean;
  is_synced: boolean;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateJobRequest {
  name: string;
  cron_expression: string;
  command: string;
  description?: string;
  is_enabled?: boolean;
  tags?: string[];
}

export interface UpdateJobRequest {
  name?: string;
  cron_expression?: string;
  command?: string;
  description?: string;
  is_enabled?: boolean;
  tags?: string[];
}

export interface CronValidation {
  is_valid: boolean;
  error: string | null;
  human_readable: string | null;
}

export interface NextRun {
  datetime: string;
  relative: string;
}

export interface ExecutionLog {
  id: number;
  job_id: number;
  job_name: string | null;
  started_at: string;
  finished_at: string | null;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  duration_ms: number | null;
  status: "running" | "success" | "failed" | "timeout";
  trigger_type: "manual" | "cron";
}

export interface JobStats {
  total_runs: number;
  success_count: number;
  failure_count: number;
  avg_duration_ms: number | null;
  last_run_at: string | null;
  last_status: string | null;
}

export interface DashboardStats {
  total_jobs: number;
  active_jobs: number;
  failed_recent: number;
  next_run: string | null;
}
