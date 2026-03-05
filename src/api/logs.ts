import { invoke } from "@tauri-apps/api/core";
import type { ExecutionLog, JobStats, DashboardStats } from "@/types/job";

export const logsApi = {
  getJobLogs: (jobId: number, limit?: number) =>
    invoke<ExecutionLog[]>("get_job_logs", { jobId, limit }),
  getJobStats: (jobId: number) =>
    invoke<JobStats>("get_job_stats", { jobId }),
  getDashboardStats: () =>
    invoke<DashboardStats>("get_dashboard_stats"),
  getRecentLogs: (limit?: number) =>
    invoke<ExecutionLog[]>("get_recent_logs", { limit }),
  clearLogs: (beforeDays?: number) =>
    invoke<{ deleted: number }>("clear_logs", { beforeDays }),
};
