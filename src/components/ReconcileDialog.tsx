import { X, AlertTriangle, Terminal, GitBranch, Monitor, AppWindow, Merge, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/store/appStore";
import { cn } from "@/lib/utils";

interface CrontabChangeEntry {
  expression: string;
  command: string;
}

interface CrontabSyncStatus {
  new_entries: CrontabChangeEntry[];
  managed_block_outdated: boolean;
  needs_sync: boolean;
  conflict_locked: boolean;
}

type Strategy = "use_local" | "use_app" | "merge" | "skip";

interface ReconcileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReconcileDialog({
  open,
  onOpenChange,
}: ReconcileDialogProps) {
  const { i18n } = useTranslation();
  const isZh = i18n.language?.startsWith("zh");
  const queryClient = useQueryClient();
  const setConflictLocked = useAppStore((s) => s.setConflictLocked);
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<CrontabSyncStatus | null>(null);
  const [selected, setSelected] = useState<Strategy>("merge");

  useEffect(() => {
    if (open) {
      invoke<CrontabSyncStatus>("check_crontab_sync")
        .then(setDetails)
        .catch(() => setDetails(null));
    } else {
      setDetails(null);
      setSelected("merge");
    }
  }, [open]);

  if (!open) return null;

  const handleResolve = async () => {
    setLoading(true);
    try {
      let msg: string;

      switch (selected) {
        case "use_local": {
          const result = await invoke<{ imported: number }>("resolve_use_local");
          msg = isZh
            ? `已同步，从 crontab 导入了 ${result.imported} 条任务`
            : `Synced, imported ${result.imported} job(s) from crontab`;
          break;
        }
        case "use_app": {
          await invoke("resolve_use_app");
          msg = isZh
            ? "已同步，以 App 数据为准覆盖了 crontab"
            : "Synced, overwrote crontab with App data";
          break;
        }
        case "merge": {
          const result = await invoke<{ imported: number }>("resolve_merge");
          msg = result.imported > 0
            ? (isZh ? `已合并，导入了 ${result.imported} 条新任务` : `Merged, imported ${result.imported} new job(s)`)
            : (isZh ? "已合并同步" : "Merged and synced");
          break;
        }
        case "skip": {
          await invoke("resolve_skip");
          msg = isZh
            ? "已跳过，任务编辑已锁定，请尽快处理冲突"
            : "Skipped — job editing is locked until conflict is resolved";
          toast.warning(msg);
          onOpenChange(false);
          setLoading(false);
          return;
        }
      }

      toast.success(msg);
      setConflictLocked(false);
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
      queryClient.invalidateQueries({ queryKey: ["recentLogs"] });
      onOpenChange(false);
    } catch {
      toast.error(isZh ? "同步失败" : "Sync failed");
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = async () => {
    // Dismissing = skip, keep lock
    await invoke("resolve_skip").catch(() => {});
    onOpenChange(false);
  };

  const strategies: { key: Strategy; icon: typeof Monitor; title: string; desc: string }[] = [
    {
      key: "use_local",
      icon: Monitor,
      title: isZh ? "以本地 Crontab 为准" : "Use Local Crontab",
      desc: isZh
        ? "清空 App 数据，从系统 crontab 重新导入所有任务"
        : "Clear App data and re-import all jobs from system crontab",
    },
    {
      key: "use_app",
      icon: AppWindow,
      title: isZh ? "以 App 数据为准" : "Use App Data",
      desc: isZh
        ? "用 App 中的任务覆盖系统 crontab，本地新增条目会被注释保留"
        : "Overwrite system crontab with App data. Local entries will be commented out",
    },
    {
      key: "merge",
      icon: Merge,
      title: isZh ? "合并两者" : "Merge Both",
      desc: isZh
        ? "导入本地新增的条目到 App，然后同步写入 crontab"
        : "Import new local entries into App, then sync everything to crontab",
    },
    {
      key: "skip",
      icon: Clock,
      title: isZh ? "暂不处理" : "Skip for Now",
      desc: isZh
        ? "保持现状，但在解决冲突前无法新建、编辑或删除任务"
        : "Keep as-is, but creating, editing, or deleting jobs is blocked until resolved",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="backdrop-overlay absolute inset-0"
        onClick={handleDismiss}
      />
      <div className="relative w-full max-w-[520px] rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-4 py-2.5">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-amber-500" />
            <h2 className="text-[15px] font-semibold">
              {isZh ? "检测到 Crontab 冲突" : "Crontab Conflict Detected"}
            </h2>
          </div>
          <button
            onClick={handleDismiss}
            className="focus-ring inline-flex h-6 w-6 items-center justify-center rounded text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--secondary))]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 py-4 space-y-3">
          <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 dark:bg-amber-950/30">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-[13px] text-amber-800 dark:text-amber-200">
              {isZh
                ? "系统 crontab 与 App 数据不一致。请选择解决方式，类似 Git 冲突解决。在解决之前，任务的新建、编辑、删除操作将被锁定。"
                : "System crontab is out of sync with App data. Choose a resolution strategy (similar to Git conflict resolution). Job creation, editing, and deletion are locked until resolved."}
            </p>
          </div>

          {/* Show what changed */}
          {details && details.new_entries.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[13px] font-medium text-[hsl(var(--foreground))]">
                {isZh
                  ? `本地新增 ${details.new_entries.length} 条不在 App 中的条目：`
                  : `${details.new_entries.length} local entry(s) not in App:`}
              </p>
              <div className="max-h-[120px] overflow-auto rounded-md bg-[hsl(var(--secondary))] p-2.5 space-y-1.5">
                {details.new_entries.map((entry, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Terminal className="mt-0.5 h-3 w-3 shrink-0 text-[hsl(var(--muted-foreground))]" />
                    <div className="min-w-0">
                      <span className="font-mono text-[11px] text-[hsl(var(--muted-foreground))]">
                        {entry.expression}
                      </span>
                      <span className="ml-2 truncate font-mono text-[12px] text-[hsl(var(--foreground))]">
                        {entry.command}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {details && details.managed_block_outdated && details.new_entries.length === 0 && (
            <p className="text-[13px] text-[hsl(var(--muted-foreground))]">
              {isZh
                ? "App 管理的 crontab 区块与系统中的内容不匹配。"
                : "The CronPilot managed block in crontab doesn't match the App state."}
            </p>
          )}

          {/* Strategy selection */}
          <div className="space-y-1.5">
            {strategies.map((s) => (
              <button
                key={s.key}
                onClick={() => setSelected(s.key)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors",
                  selected === s.key
                    ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.05)]"
                    : "border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary))]"
                )}
              >
                <s.icon className={cn(
                  "mt-0.5 h-4 w-4 shrink-0",
                  selected === s.key
                    ? "text-[hsl(var(--primary))]"
                    : "text-[hsl(var(--muted-foreground))]"
                )} />
                <div className="min-w-0">
                  <p className={cn(
                    "text-[13px] font-medium",
                    selected === s.key
                      ? "text-[hsl(var(--primary))]"
                      : "text-[hsl(var(--foreground))]"
                  )}>
                    {s.title}
                  </p>
                  <p className="mt-0.5 text-[12px] text-[hsl(var(--muted-foreground))]">
                    {s.desc}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-[hsl(var(--border))] px-4 py-3">
          <button
            onClick={handleResolve}
            disabled={loading}
            className={cn(
              "focus-ring rounded-md px-4 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-50",
              selected === "skip"
                ? "bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] hover:opacity-90"
                : "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"
            )}
          >
            {loading
              ? (isZh ? "处理中..." : "Processing...")
              : selected === "skip"
                ? (isZh ? "暂不处理" : "Skip")
                : (isZh ? "确认解决" : "Resolve")}
          </button>
        </div>
      </div>
    </div>
  );
}
