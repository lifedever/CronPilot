import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { logsApi } from "@/api/logs";
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  Activity,
  CalendarClock,
} from "lucide-react";
import { cn } from "@/lib/utils";

function timeAgo(dateStr: string, isZh: boolean): string {
  const now = Date.now();
  const date = new Date(dateStr.replace(" ", "T")).getTime();
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
  const { data: stats } = useQuery({
    queryKey: ["dashboardStats"],
    queryFn: logsApi.getDashboardStats,
  });
  const { data: recentLogs } = useQuery({
    queryKey: ["recentLogs"],
    queryFn: () => logsApi.getRecentLogs(10),
  });

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
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
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

      {/* Recent Activity */}
      <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <div className="flex items-center gap-2 border-b border-[hsl(var(--border))] px-4 py-2.5">
          <Activity className="h-[14px] w-[14px] text-[hsl(var(--muted-foreground))]" />
          <h2 className="text-[14px] font-semibold">
            {t("empty.noLogs") === "暂无执行日志" ? "最近活动" : "Recent Activity"}
          </h2>
        </div>
        <div>
          {!recentLogs || recentLogs.length === 0 ? (
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
              {recentLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-[hsl(var(--secondary))]"
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
                  <span className="shrink-0 font-mono text-[12px] text-[hsl(var(--muted-foreground))]">
                    Job#{log.job_id}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                    {log.job_name || "Unknown"}
                  </span>
                  {log.duration_ms != null && (
                    <span className="shrink-0 text-[13px] tabular-nums text-[hsl(var(--muted-foreground))]">
                      {log.duration_ms < 1000
                        ? `${log.duration_ms}ms`
                        : `${(log.duration_ms / 1000).toFixed(1)}s`}
                    </span>
                  )}
                  <span
                    className="shrink-0 text-[12px] tabular-nums text-[hsl(var(--muted-foreground))] opacity-50"
                    title={log.started_at}
                  >
                    {timeAgo(log.started_at, isZh)}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-px text-[12px] font-medium",
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
