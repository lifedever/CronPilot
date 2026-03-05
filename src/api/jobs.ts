import { invoke } from "@tauri-apps/api/core";
import type { Job, CreateJobRequest, UpdateJobRequest, ExecutionLog } from "@/types/job";

export interface CommandValidation {
  executable_found: boolean;
  executable_path: string | null;
  warnings: string[];
}

export interface CronAccessCheck {
  needs_attention: boolean;
  protected_paths: string[];
  cron_has_fda: boolean;
  safe_dir: string;
}

export const jobsApi = {
  list: () => invoke<Job[]>("list_jobs"),
  get: (id: number) => invoke<Job>("get_job", { id }),
  create: (job: CreateJobRequest) => invoke<Job>("create_job", { job }),
  update: (id: number, job: UpdateJobRequest) =>
    invoke<Job>("update_job", { id, job }),
  delete: (id: number) => invoke<void>("delete_job", { id }),
  toggle: (id: number) => invoke<Job>("toggle_job", { id }),
  runNow: (id: number) => invoke<ExecutionLog>("run_job_now", { id }),
  importFromCrontab: () =>
    invoke<{ imported: number; skipped: number }>("import_from_crontab"),
  validateCommand: (command: string) =>
    invoke<CommandValidation>("validate_command", { command }),
  exportJobsToFile: (path: string) => invoke<number>("export_jobs_to_file", { path }),
  importJobsFromBackup: (path: string) =>
    invoke<{ imported: number; skipped: number }>("import_jobs_from_backup", { path }),
  checkCronAccess: (command: string) =>
    invoke<CronAccessCheck>("check_cron_access", { command }),
  copyScriptToSafeDir: (scriptPath: string) =>
    invoke<string>("copy_script_to_safe_dir", { scriptPath }),
};
