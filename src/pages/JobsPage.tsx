import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Plus,
  Play,
  Pencil,
  Trash2,
  Terminal,
  CircleCheck,
  CirclePause,
  Briefcase,
  Download,
} from "lucide-react";
import { useJobs, useDeleteJob, useToggleJob, useRunJob } from "@/hooks/useJobs";
import { JobFormDialog } from "@/components/jobs/JobFormDialog";
import { RunLogDialog } from "@/components/jobs/RunLogDialog";
import type { Job, ExecutionLog } from "@/types/job";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { jobsApi } from "@/api/jobs";
import { useQueryClient } from "@tanstack/react-query";
import { confirm } from "@tauri-apps/plugin-dialog";

type FilterType = "all" | "enabled" | "disabled";

export function JobsPage() {
  const { t } = useTranslation("jobs");
  const { t: tc } = useTranslation();
  const { data: jobs, isLoading } = useJobs();
  const deleteJob = useDeleteJob();
  const toggleJob = useToggleJob();
  const runJob = useRunJob();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [importing, setImporting] = useState(false);
  const [runningJobId, setRunningJobId] = useState<number | null>(null);
  const [runLogOpen, setRunLogOpen] = useState(false);
  const [runLogJobName, setRunLogJobName] = useState("");
  const [runLog, setRunLog] = useState<ExecutionLog | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");

  // Filter and sort: enabled jobs first, then disabled
  const filteredJobs = useMemo(() => {
    if (!jobs) return [];
    let list = [...jobs];
    if (filter === "enabled") list = list.filter((j) => j.is_enabled);
    else if (filter === "disabled") list = list.filter((j) => !j.is_enabled);
    list.sort((a, b) => {
      if (a.is_enabled === b.is_enabled) return 0;
      return a.is_enabled ? -1 : 1;
    });
    return list;
  }, [jobs, filter]);

  const filterCounts = useMemo(() => {
    if (!jobs) return { all: 0, enabled: 0, disabled: 0 };
    return {
      all: jobs.length,
      enabled: jobs.filter((j) => j.is_enabled).length,
      disabled: jobs.filter((j) => !j.is_enabled).length,
    };
  }, [jobs]);

  const handleDelete = async (job: Job) => {
    const confirmed = await confirm(t("deleteConfirm", { name: job.name }), {
      title: "CronPilot",
      kind: "warning",
    });
    if (!confirmed) return;
    try {
      await deleteJob.mutateAsync(job.id);
      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
      toast.success(t("messages.deleted"));
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleToggle = async (job: Job) => {
    try {
      await toggleJob.mutateAsync(job.id);
      const action = job.is_enabled
        ? tc("actions.disable")
        : tc("actions.enable");
      toast.success(t("messages.toggled", { action }));
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleEdit = (job: Job) => {
    setEditingJob(job);
    setFormOpen(true);
  };

  const handleCreate = () => {
    setEditingJob(null);
    setFormOpen(true);
  };

  const handleRunNow = async (job: Job) => {
    setRunLogJobName(job.name);
    setRunLog(null);
    setRunLogOpen(true);
    setRunningJobId(job.id);
    try {
      const log = await runJob.mutateAsync(job.id);
      setRunLog(log);
    } catch (e) {
      toast.error(String(e));
      setRunLogOpen(false);
    } finally {
      setRunningJobId(null);
    }
  };

  const handleImport = async () => {
    try {
      setImporting(true);
      const result = await jobsApi.importFromCrontab();
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
      const isZh = tc("app.name") === "CronPilot" && tc("nav.jobs") === "定时任务";
      toast.success(
        isZh
          ? `已导入 ${result.imported} 个任务${result.skipped > 0 ? `，跳过 ${result.skipped} 个已存在` : ""}`
          : `Imported ${result.imported} job(s)${result.skipped > 0 ? `, skipped ${result.skipped} existing` : ""}`
      );
    } catch (e) {
      toast.error(String(e));
    } finally {
      setImporting(false);
    }
  };

  const FILTERS: { key: FilterType; label: string }[] = [
    { key: "all", label: `${tc("filter.all")} (${filterCounts.all})` },
    { key: "enabled", label: `${tc("filter.enabled")} (${filterCounts.enabled})` },
    { key: "disabled", label: `${tc("filter.disabled")} (${filterCounts.disabled})` },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Fixed Toolbar */}
      <div className="shrink-0 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors",
                  filter === f.key
                    ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                    : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleImport}
              disabled={importing}
              className="focus-ring inline-flex items-center gap-1.5 rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2.5 py-[5px] text-[14px] font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))] disabled:opacity-50"
            >
              {importing ? (
                <div className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
              ) : (
                <Download className="h-3 w-3" />
              )}
              {tc("nav.jobs") === "定时任务" ? "导入 Crontab" : "Import Crontab"}
            </button>
            <button
              onClick={handleCreate}
              className="focus-ring inline-flex items-center gap-1.5 rounded bg-[hsl(var(--primary))] px-2.5 py-[5px] text-[14px] font-medium text-[hsl(var(--primary-foreground))] transition-colors hover:opacity-90"
            >
              <Plus className="h-3 w-3" />
              {t("createJob")}
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable List */}
      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[hsl(var(--border))] border-t-[hsl(var(--primary))]" />
          </div>
        ) : !jobs || jobs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-[hsl(var(--border))] py-16">
            <Briefcase className="h-6 w-6 text-[hsl(var(--muted-foreground))] opacity-40" />
            <div className="text-center">
              <p className="text-[14px] text-[hsl(var(--muted-foreground))]">
                {tc("empty.noJobs")}
              </p>
              <p className="mt-0.5 text-[13px] text-[hsl(var(--muted-foreground))] opacity-60">
                {tc("empty.noJobsDesc")}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleImport}
                className="focus-ring inline-flex items-center gap-1.5 rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2.5 py-[5px] text-[14px] font-medium transition-colors hover:bg-[hsl(var(--secondary))]"
              >
                <Download className="h-3 w-3" />
                {tc("nav.jobs") === "定时任务" ? "导入 Crontab" : "Import Crontab"}
              </button>
              <button
                onClick={handleCreate}
                className="focus-ring inline-flex items-center gap-1.5 rounded bg-[hsl(var(--primary))] px-2.5 py-[5px] text-[14px] font-medium text-[hsl(var(--primary-foreground))] transition-colors hover:opacity-90"
              >
                <Plus className="h-3 w-3" />
                {t("createJob")}
              </button>
            </div>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16">
            <Briefcase className="h-6 w-6 text-[hsl(var(--muted-foreground))] opacity-40" />
            <p className="text-[14px] text-[hsl(var(--muted-foreground))]">
              {filter === "enabled"
                ? (tc("nav.jobs") === "定时任务" ? "暂无启用的任务" : "No enabled jobs")
                : (tc("nav.jobs") === "定时任务" ? "暂无禁用的任务" : "No disabled jobs")}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {filteredJobs.map((job) => (
              <div
                key={job.id}
                className={cn(
                  "group flex items-center gap-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2.5 transition-colors hover:bg-[hsl(var(--secondary))]",
                  !job.is_enabled && "opacity-50"
                )}
              >
                {/* Toggle */}
                <button
                  onClick={() => handleToggle(job)}
                  className={cn(
                    "focus-ring flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded transition-colors",
                    job.is_enabled
                      ? "text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/50"
                      : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"
                  )}
                  title={job.is_enabled ? tc("actions.disable") : tc("actions.enable")}
                >
                  {job.is_enabled ? (
                    <CircleCheck className="h-[14px] w-[14px]" />
                  ) : (
                    <CirclePause className="h-[14px] w-[14px]" />
                  )}
                </button>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-medium">{job.name}</span>
                    <code className="shrink-0 rounded bg-[hsl(var(--secondary))] px-1.5 py-px font-mono text-[12px] text-[hsl(var(--muted-foreground))]">
                      {job.cron_expression}
                    </code>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-[hsl(var(--muted-foreground))]">
                    <Terminal className="h-[10px] w-[10px]" />
                    <span className="max-w-[400px] truncate font-mono">{job.command}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => handleRunNow(job)}
                    disabled={runningJobId === job.id}
                    className="focus-ring inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] disabled:opacity-50"
                    title={tc("actions.runNow")}
                  >
                    {runningJobId === job.id ? (
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => handleEdit(job)}
                    className="focus-ring inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
                    title={tc("actions.edit")}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(job)}
                    className="focus-ring inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[hsl(var(--muted-foreground))] transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400"
                    title={tc("actions.delete")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <JobFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        job={editingJob}
      />

      <RunLogDialog
        open={runLogOpen}
        onOpenChange={setRunLogOpen}
        jobName={runLogJobName}
        log={runLog}
        running={runningJobId !== null}
      />
    </div>
  );
}
