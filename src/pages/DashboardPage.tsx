import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { logsApi } from "@/api/logs";
import type { ExecutionLog, DashboardStats } from "@/types/job";
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  Activity,
  CalendarClock,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronsDown,
  Hand,
  Timer,
} from "lucide-react";
import { cn, parseUTCDate, formatLocalTime } from "@/lib/utils";
import { RunLogDialog } from "@/components/jobs/RunLogDialog";
import { toast } from "sonner";

const PAGE_SIZE = 10;

function timeAgo(dateStr: string, isZh: boolean): string {
  const now = Date.now();
  const date = parseUTCDate(dateStr).getTime();
  const diff = Math.max(0, Math.floor((now - date) / 1000));

  if (diff < 60) return isZh ? "刚刚" : "just now";
  const mins = Math.floor(diff / 60);
  if (mins < 60) return isZh ? `${mins}分钟前` : `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return isZh ? `${hours}小时前` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return isZh ? `${days}天前` : `${days}d ago`;
  const months = Math.floor(days / 30);
  return isZh ? `${months}个月前` : `${months}mo ago`;
}

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language?.startsWith("zh");
  const queryClient = useQueryClient();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedLog, setSelectedLog] = useState<ExecutionLog | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [clearMenuOpen, setClearMenuOpen] = useState(false);
  const clearMenuRef = useRef<HTMLDivElement>(null);

  // Initial load + auto refresh
  const loadInitial = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([
        logsApi.getDashboardStats(),
        logsApi.getRecentLogs(PAGE_SIZE),
      ]);
      setStats(s);
      setLogs(l);
      setHasMore(l.length >= PAGE_SIZE);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadInitial();
    const timer = setInterval(loadInitial, 30000);
    return () => clearInterval(timer);
  }, [loadInitial]);

  // Close clear menu on outside click
  useEffect(() => {
    if (!clearMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (clearMenuRef.current && !clearMenuRef.current.contains(e.target as Node)) {
        setClearMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [clearMenuOpen]);

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = logs.length + PAGE_SIZE;
      const all = await logsApi.getRecentLogs(nextPage);
      setLogs(all);
      setHasMore(all.length >= nextPage);
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadInitial();
    setTimeout(() => setRefreshing(false), 500);
  };

  const handleClear = async (beforeDays?: number) => {
    setClearMenuOpen(false);
    try {
      const result = await logsApi.clearLogs(beforeDays);
      await loadInitial();
      queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
      const msg = isZh
        ? `已清除 ${result.deleted} 条日志`
        : `Cleared ${result.deleted} log(s)`;
      toast.success(msg);
    } catch {
      toast.error(isZh ? "清除失败" : "Failed to clear");
    }
  };

  const clearOptions: { label: string; days?: number }[] = [
    { label: isZh ? "1 天前" : "Older than 1 day", days: 1 },
    { label: isZh ? "7 天前" : "Older than 7 days", days: 7 },
    { label: isZh ? "30 天前" : "Older than 30 days", days: 30 },
    { label: isZh ? "清空全部" : "Clear all" },
  ];

  const cards = [
    {
      label: t("nav.jobs"),
      value: stats?.total_jobs ?? 0,
      icon: Clock,
      color: "text-blue-600 dark:text-blue-400",
    },
    {
      label: t("status.enabled"),
      value: stats?.active_jobs ?? 0,
      icon: CheckCircle2,
      color: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: t("status.failed") + " (24h)",
      value: stats?.failed_recent ?? 0,
      icon: AlertTriangle,
      color: "text-rose-600 dark:text-rose-400",
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* Stats - fixed height */}
      <div className="shrink-0 grid grid-cols-3 gap-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3"
          >
            <div className="flex items-center justify-between">
              <p className="text-[14px] text-[hsl(var(--muted-foreground))]">
                {card.label}
              </p>
              <card.icon className={cn("h-[14px] w-[14px]", card.color)} />
            </div>
            <p className="mt-1 text-[24px] font-semibold tabular-nums">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Recent Activity - fills remaining height, scrolls internally */}
      <div className="flex min-h-0 shrink flex-col overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <div className="flex shrink-0 items-center justify-between border-b border-[hsl(var(--border))] px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Activity className="h-[14px] w-[14px] text-[hsl(var(--muted-foreground))]" />
            <h2 className="text-[14px] font-semibold">
              {isZh ? "最近活动" : "Recent Activity"}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleRefresh}
              className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]"
              title={isZh ? "刷新" : "Refresh"}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            </button>
            <div className="relative" ref={clearMenuRef}>
              <button
                onClick={() => setClearMenuOpen(!clearMenuOpen)}
                disabled={logs.length === 0}
                className="focus-ring inline-flex h-7 items-center gap-0.5 rounded px-1.5 text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))] disabled:opacity-40 disabled:pointer-events-none"
                title={isZh ? "清除日志" : "Clear logs"}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <ChevronDown className="h-3 w-3" />
              </button>
              {clearMenuOpen && (
                <div className="absolute right-0 top-full z-10 mt-1 min-w-[160px] rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-1 shadow-lg">
                  {clearOptions.map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => handleClear(opt.days)}
                      className={cn(
                        "flex w-full items-center px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-[hsl(var(--secondary))]",
                        !opt.days && "text-rose-600 dark:text-rose-400"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable log list */}
        <div className="min-h-0 flex-1 overflow-auto">
          {logs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12">
              <CalendarClock className="h-6 w-6 text-[hsl(var(--muted-foreground))] opacity-40" />
              <p className="text-[14px] text-[hsl(var(--muted-foreground))]">
                {t("empty.noLogs")}
              </p>
              <p className="text-[13px] text-[hsl(var(--muted-foreground))] opacity-60">
                {t("empty.noLogsDesc")}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[hsl(var(--border))]">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex cursor-pointer items-center gap-3 px-4 py-2 transition-colors hover:bg-[hsl(var(--secondary))]"
                  onClick={() => setSelectedLog(log)}
                >
                  <span
                    className={cn(
                      "h-[6px] w-[6px] shrink-0 rounded-full",
                      log.status === "success" && "bg-emerald-500",
                      log.status === "failed" && "bg-rose-500",
                      log.status === "running" && "bg-amber-500 animate-pulse-glow",
                      log.status === "timeout" && "bg-orange-500"
                    )}
                  />
                  <span
                    className="shrink-0"
                    title={log.trigger_type === "manual"
                      ? (isZh ? "手动执行" : "Manual run")
                      : (isZh ? "定时自动执行" : "Scheduled (cron)")}
                  >
                    {log.trigger_type === "manual" ? (
                      <Hand className="h-3 w-3 text-violet-500 dark:text-violet-400" />
                    ) : (
                      <Timer className="h-3 w-3 text-sky-500 dark:text-sky-400" />
                    )}
                  </span>
                  <span className="shrink-0 font-mono text-[12px] text-[hsl(var(--muted-foreground))]">
                    Job#{log.job_id}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                    {log.job_name || "Unknown"}
                  </span>
                  <span className="w-[60px] shrink-0 text-right text-[13px] tabular-nums text-[hsl(var(--muted-foreground))]">
                    {log.duration_ms != null
                      ? (log.duration_ms < 1000
                          ? `${log.duration_ms}ms`
                          : `${(log.duration_ms / 1000).toFixed(1)}s`)
                      : "—"}
                  </span>
                  <span
                    className="w-[72px] shrink-0 text-right text-[12px] tabular-nums text-[hsl(var(--muted-foreground))] opacity-50"
                    title={formatLocalTime(log.started_at)}
                  >
                    {timeAgo(log.started_at, isZh)}
                  </span>
                  <span
                    className={cn(
                      "w-[44px] shrink-0 rounded px-1.5 py-px text-center text-[12px] font-medium",
                      log.status === "success" && "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
                      log.status === "failed" && "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400",
                      log.status === "running" && "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
                      log.status === "timeout" && "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400"
                    )}
                  >
                    {t(`status.${log.status}`)}
                  </span>
                </div>
              ))}

              {/* Load more */}
              {hasMore && (
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="flex w-full items-center justify-center gap-1.5 py-2.5 text-[13px] text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))] disabled:opacity-50"
                >
                  {loadingMore ? (
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
                  ) : (
                    <ChevronsDown className="h-3.5 w-3.5" />
                  )}
                  {loadingMore
                    ? (isZh ? "加载中..." : "Loading...")
                    : (isZh ? "加载更多" : "Load more")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <RunLogDialog
        open={selectedLog !== null}
        onOpenChange={(open) => { if (!open) setSelectedLog(null); }}
        jobName={selectedLog?.job_name || `Job#${selectedLog?.job_id ?? ""}`}
        log={selectedLog}
        running={false}
      />
    </div>
  );
}
