import { X, CheckCircle2, XCircle, Loader2, Clock, Terminal } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ExecutionLog } from "@/types/job";
import { cn, formatLocalTime } from "@/lib/utils";

interface RunLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobName: string;
  log: ExecutionLog | null;
  running: boolean;
}

export function RunLogDialog({
  open,
  onOpenChange,
  jobName,
  log,
  running,
}: RunLogDialogProps) {
  const { t } = useTranslation();
  const isZh = t("nav.jobs") === "定时任务";

  if (!open) return null;

  const isSuccess = log?.status === "success";
  const isFailed = log?.status === "failed";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="backdrop-overlay absolute inset-0"
        onClick={() => !running && onOpenChange(false)}
      />

      <div className="relative w-full max-w-[560px] rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-4 py-2.5">
          <div className="flex items-center gap-2">
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
            ) : isSuccess ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : isFailed ? (
              <XCircle className="h-4 w-4 text-rose-500" />
            ) : null}
            <div>
              <h2 className="text-[15px] font-semibold">
                {running
                  ? (isZh ? `正在执行「${jobName}」...` : `Running "${jobName}"...`)
                  : (isZh ? `「${jobName}」执行结果` : `"${jobName}" Result`)}
              </h2>
              {!running && log?.started_at && (
                <p className="text-[12px] text-[hsl(var(--muted-foreground))]">
                  {formatLocalTime(log.started_at)}
                </p>
              )}
            </div>
          </div>
          {!running && (
            <button
              onClick={() => onOpenChange(false)}
              className="focus-ring inline-flex h-6 w-6 items-center justify-center rounded text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--secondary))]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="px-4 py-3 space-y-3">
          {running && !log && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--primary))]" />
              <p className="text-[14px] text-[hsl(var(--muted-foreground))]">
                {isZh ? "正在执行命令..." : "Executing command..."}
              </p>
            </div>
          )}

          {log && (
            <>
              {/* Status bar */}
              <div className="flex items-center gap-3 rounded-md bg-[hsl(var(--secondary))] px-3 py-2">
                <div className="flex items-center gap-4 text-[13px]">
                  <span className="flex items-center gap-1.5">
                    <span className={cn(
                      "font-medium",
                      isSuccess && "text-emerald-600 dark:text-emerald-400",
                      isFailed && "text-rose-600 dark:text-rose-400"
                    )}>
                      {isSuccess
                        ? (isZh ? "成功" : "Success")
                        : (isZh ? "失败" : "Failed")}
                    </span>
                  </span>
                  {log.exit_code != null && (
                    <span className="text-[hsl(var(--muted-foreground))]">
                      Exit: <span className="font-mono">{log.exit_code}</span>
                    </span>
                  )}
                  {log.duration_ms != null && (
                    <span className="flex items-center gap-1 text-[hsl(var(--muted-foreground))]">
                      <Clock className="h-3 w-3" />
                      {log.duration_ms < 1000
                        ? `${log.duration_ms}ms`
                        : `${(log.duration_ms / 1000).toFixed(2)}s`}
                    </span>
                  )}
                </div>
              </div>

              {/* stdout */}
              {log.stdout && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[13px] font-medium text-[hsl(var(--muted-foreground))]">
                    <Terminal className="h-3 w-3" />
                    stdout
                  </div>
                  <pre className="max-h-[200px] overflow-auto rounded-md bg-[hsl(var(--secondary))] p-3 font-mono text-[13px] leading-relaxed text-[hsl(var(--foreground))]">
                    {log.stdout}
                  </pre>
                </div>
              )}

              {/* stderr */}
              {log.stderr && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[13px] font-medium text-rose-600 dark:text-rose-400">
                    <Terminal className="h-3 w-3" />
                    stderr
                  </div>
                  <pre className="max-h-[200px] overflow-auto rounded-md bg-rose-50 p-3 font-mono text-[13px] leading-relaxed text-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
                    {log.stderr}
                  </pre>
                </div>
              )}

              {/* No output */}
              {!log.stdout && !log.stderr && (
                <p className="py-4 text-center text-[14px] text-[hsl(var(--muted-foreground))]">
                  {isZh ? "无输出" : "No output"}
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {log && (
          <div className="flex justify-end border-t border-[hsl(var(--border))] px-4 py-2.5">
            <button
              onClick={() => onOpenChange(false)}
              className="focus-ring rounded bg-[hsl(var(--primary))] px-3 py-[5px] text-[14px] font-medium text-[hsl(var(--primary-foreground))] transition-colors hover:opacity-90"
            >
              {isZh ? "关闭" : "Close"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
