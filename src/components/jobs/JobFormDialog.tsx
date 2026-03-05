import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { X, CheckCircle2, AlertCircle, FolderOpen, ExternalLink, TriangleAlert, FileCode, Terminal } from "lucide-react";
import { useCreateJob, useUpdateJob } from "@/hooks/useJobs";
import { cronExprApi } from "@/api/cronExpr";
import { jobsApi, type CommandValidation } from "@/api/jobs";
import type { Job, CronValidation, NextRun } from "@/types/job";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

interface JobFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
}

const PRESETS = [
  { label: "everyMinute", value: "* * * * *" },
  { label: "every5Minutes", value: "*/5 * * * *" },
  { label: "every15Minutes", value: "*/15 * * * *" },
  { label: "every30Minutes", value: "*/30 * * * *" },
  { label: "hourly", value: "0 * * * *" },
  { label: "daily", value: "0 0 * * *" },
  { label: "weekly", value: "0 0 * * 1" },
  { label: "monthly", value: "0 0 1 * *" },
];

type CommandMode = "command" | "script";

/** Detect if a command is a script wrapped in `/bin/bash -c '...'` or `/bin/sh -c '...'` */
function parseScriptCommand(cmd: string): { isScript: boolean; script: string } {
  const match = cmd.match(/^\/bin\/(?:ba)?sh\s+-c\s+(['"])([\s\S]*)\1$/);
  if (match) {
    return { isScript: true, script: match[2] };
  }
  return { isScript: false, script: "" };
}

/** Wrap script content into a crontab-compatible command */
function wrapScript(script: string): string {
  // Escape single quotes in script by replacing ' with '\''
  const escaped = script.replace(/'/g, "'\\''");
  return `/bin/bash -c '${escaped}'`;
}

export function JobFormDialog({ open, onOpenChange, job }: JobFormDialogProps) {
  const { t } = useTranslation("jobs");
  const { t: tc } = useTranslation("cronBuilder");
  const { t: tCommon } = useTranslation();
  const createJob = useCreateJob();
  const updateJob = useUpdateJob();

  const [name, setName] = useState("");
  const [cronExpression, setCronExpression] = useState("* * * * *");
  const [command, setCommand] = useState("");
  const [description, setDescription] = useState("");
  const [validation, setValidation] = useState<CronValidation | null>(null);
  const [nextRuns, setNextRuns] = useState<NextRun[]>([]);
  const [cmdValidation, setCmdValidation] = useState<CommandValidation | null>(null);
  const [mode, setMode] = useState<CommandMode>("command");
  const [script, setScript] = useState("");

  useEffect(() => {
    if (job) {
      setName(job.name);
      setCronExpression(job.cron_expression);
      setDescription(job.description);
      const parsed = parseScriptCommand(job.command);
      if (parsed.isScript) {
        setMode("script");
        setScript(parsed.script);
        setCommand(job.command);
      } else {
        setMode("command");
        setCommand(job.command);
        setScript("");
      }
    } else {
      setName("");
      setCronExpression("* * * * *");
      setCommand("");
      setDescription("");
      setMode("command");
      setScript("");
    }
  }, [job, open]);

  useEffect(() => {
    if (!cronExpression) return;
    const timer = setTimeout(async () => {
      try {
        const v = await cronExprApi.validate(cronExpression);
        setValidation(v);
        if (v.is_valid) {
          const runs = await cronExprApi.getNextRuns(cronExpression, 5);
          setNextRuns(runs);
        } else {
          setNextRuns([]);
        }
      } catch {
        setValidation(null);
        setNextRuns([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [cronExpression]);

  // Validate the effective command (command mode: raw command, script mode: wrapped script)
  const effectiveCommand = mode === "script" ? wrapScript(script) : command;

  useEffect(() => {
    const cmdToValidate = mode === "script" ? (script.trim() ? "/bin/bash" : "") : command;
    if (!cmdToValidate.trim()) {
      setCmdValidation(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const v = await jobsApi.validateCommand(cmdToValidate);
        setCmdValidation(v);
      } catch {
        setCmdValidation(null);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [command, script, mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const finalCommand = mode === "script" ? wrapScript(script) : command;
      if (job) {
        await updateJob.mutateAsync({
          id: job.id,
          job: { name, cron_expression: cronExpression, command: finalCommand, description },
        });
        toast.success(t("messages.updated"));
      } else {
        await createJob.mutateAsync({
          name,
          cron_expression: cronExpression,
          command: finalCommand,
          description,
        });
        toast.success(t("messages.created"));
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(String(e));
    }
  };

  if (!open) return null;

  const isPending = createJob.isPending || updateJob.isPending;
  const hasCommand = mode === "script" ? script.trim().length > 0 : command.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="backdrop-overlay absolute inset-0"
        onClick={() => onOpenChange(false)}
      />

      <div className="relative w-full max-w-[640px] rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-4 py-2.5">
          <h2 className="text-[15px] font-semibold">
            {job ? t("editJob") : t("createJob")}
          </h2>
          <button
            onClick={() => onOpenChange(false)}
            className="focus-ring inline-flex h-6 w-6 items-center justify-center rounded text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--secondary))]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-4 py-3">
          {/* Row 1: Name + Cron Expression side by side */}
          <div className="flex gap-3">
            <div className="flex-1 space-y-1">
              <label className="text-[13px] font-medium text-[hsl(var(--muted-foreground))]">
                {t("fields.name")}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("fields.namePlaceholder")}
                required
                className="focus-ring w-full rounded border border-[hsl(var(--input))] bg-transparent px-2.5 py-[5px] text-[14px] placeholder:text-[hsl(var(--muted-foreground))]/40"
              />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-[13px] font-medium text-[hsl(var(--muted-foreground))]">
                {t("fields.description")}
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("fields.descriptionPlaceholder")}
                className="focus-ring w-full rounded border border-[hsl(var(--input))] bg-transparent px-2.5 py-[5px] text-[14px] placeholder:text-[hsl(var(--muted-foreground))]/40"
              />
            </div>
          </div>

          {/* Cron Expression */}
          <div className="mt-3 space-y-1.5">
            <label className="text-[13px] font-medium text-[hsl(var(--muted-foreground))]">
              {t("fields.cronExpression")}
            </label>

            <div className="flex flex-wrap gap-1">
              {PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setCronExpression(preset.value)}
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[12px] font-medium transition-colors",
                    cronExpression === preset.value
                      ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                      : "bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                  )}
                >
                  {tc(`presets.${preset.label}`)}
                </button>
              ))}
            </div>

            <div className="relative">
              <input
                type="text"
                value={cronExpression}
                onChange={(e) => setCronExpression(e.target.value)}
                required
                className={cn(
                  "focus-ring w-full rounded border bg-transparent px-2.5 py-[5px] font-mono text-[14px] transition-colors",
                  validation
                    ? validation.is_valid
                      ? "border-emerald-400 dark:border-emerald-600"
                      : "border-rose-400 dark:border-rose-600"
                    : "border-[hsl(var(--input))]"
                )}
              />
              {validation && (
                <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
                  {validation.is_valid ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5 text-rose-500" />
                  )}
                </div>
              )}
            </div>

            {validation?.human_readable && (
              <p className="text-[13px] text-emerald-600 dark:text-emerald-400">
                {validation.human_readable}
              </p>
            )}
            {validation?.error && (
              <p className="text-[13px] text-rose-500">{validation.error}</p>
            )}

            {nextRuns.length > 0 && (
              <div className="rounded bg-[hsl(var(--secondary))] px-2.5 py-1.5">
                <p className="mb-0.5 text-[12px] font-medium text-[hsl(var(--muted-foreground))]">
                  {tc("preview.nextRuns", { count: 5 })}
                </p>
                {nextRuns.map((run, i) => (
                  <p
                    key={i}
                    className="text-[12px] tabular-nums text-[hsl(var(--muted-foreground))]"
                  >
                    {run.datetime}{" "}
                    <span className="opacity-50">({run.relative})</span>
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Command / Script */}
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[13px] font-medium text-[hsl(var(--muted-foreground))]">
                {mode === "command" ? t("fields.command") : t("fields.scriptMode")}
              </label>
              <div className="flex rounded border border-[hsl(var(--border))] bg-[hsl(var(--secondary))]">
                <button
                  type="button"
                  onClick={() => setMode("command")}
                  className={cn(
                    "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[12px] font-medium transition-colors",
                    mode === "command"
                      ? "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm"
                      : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                  )}
                >
                  <Terminal className="h-3 w-3" />
                  {t("fields.commandMode")}
                </button>
                <button
                  type="button"
                  onClick={() => setMode("script")}
                  className={cn(
                    "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[12px] font-medium transition-colors",
                    mode === "script"
                      ? "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm"
                      : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                  )}
                >
                  <FileCode className="h-3 w-3" />
                  {t("fields.scriptMode")}
                </button>
              </div>
            </div>

            {mode === "command" ? (
              <>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    placeholder={t("fields.commandPlaceholder")}
                    required
                    className="focus-ring min-w-0 flex-1 rounded border border-[hsl(var(--input))] bg-transparent px-2.5 py-[5px] font-mono text-[14px] placeholder:text-[hsl(var(--muted-foreground))]/40"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const selected = await openFileDialog({
                          multiple: false,
                          title: tCommon("actions.browseFile"),
                        });
                        if (selected) {
                          setCommand(String(selected));
                        }
                      } catch (e) {
                        toast.error(String(e));
                      }
                    }}
                    className="focus-ring inline-flex h-[30px] w-[30px] shrink-0 cursor-pointer items-center justify-center rounded border border-[hsl(var(--input))] text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]"
                    title={tCommon("actions.browseFile")}
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                  </button>
                  {command && /^\//.test(command.trim()) && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await revealItemInDir(command.trim());
                        } catch (e) {
                          toast.error(String(e));
                        }
                      }}
                      className="focus-ring inline-flex h-[30px] w-[30px] shrink-0 cursor-pointer items-center justify-center rounded border border-[hsl(var(--input))] text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]"
                      title={tCommon("actions.revealInFinder")}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </>
            ) : (
              <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder={t("fields.scriptPlaceholder")}
                rows={5}
                spellCheck={false}
                className="focus-ring w-full resize-none rounded border border-[hsl(var(--input))] bg-[hsl(var(--secondary))]/50 px-2.5 py-2 font-mono text-[13px] leading-relaxed placeholder:text-[hsl(var(--muted-foreground))]/40"
              />
            )}

            {cmdValidation && (
              <div className="space-y-0.5">
                {cmdValidation.executable_found ? (
                  <p className="flex items-center gap-1 text-[12px] text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                    {cmdValidation.executable_path}
                  </p>
                ) : cmdValidation.warnings.length > 0 && !cmdValidation.warnings.some(w => w.startsWith("\u26a0")) ? (
                  <p className="flex items-center gap-1 text-[12px] text-amber-600 dark:text-amber-400">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    {cmdValidation.warnings[0]}
                  </p>
                ) : null}
                {cmdValidation.warnings.filter(w => w.startsWith("\u26a0")).map((w, i) => (
                  <p key={i} className="flex items-center gap-1 text-[12px] text-rose-500">
                    <TriangleAlert className="h-3 w-3 shrink-0" />
                    {w.replace("\u26a0 ", "")}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-3 flex items-center justify-end gap-1.5 border-t border-[hsl(var(--border))] pt-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="focus-ring rounded px-3 py-[5px] text-[14px] font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--secondary))]"
            >
              {tCommon("actions.cancel")}
            </button>
            <button
              type="submit"
              disabled={!validation?.is_valid || !hasCommand || isPending}
              className="focus-ring inline-flex items-center gap-1.5 rounded bg-[hsl(var(--primary))] px-3 py-[5px] text-[14px] font-medium text-[hsl(var(--primary-foreground))] transition-colors hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
            >
              {isPending && (
                <div className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
              )}
              {tCommon("actions.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
