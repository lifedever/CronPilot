import { invoke } from "@tauri-apps/api/core";
import type { CronValidation, NextRun } from "@/types/job";

export const cronExprApi = {
  validate: (expr: string) =>
    invoke<CronValidation>("validate_cron", { expr }),
  getNextRuns: (expr: string, count: number = 5) =>
    invoke<NextRun[]>("get_next_runs", { expr, count }),
};
