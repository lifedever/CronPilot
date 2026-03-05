import { X, Shield, Terminal, Database, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

interface HowItWorksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HowItWorksDialog({
  open,
  onOpenChange,
}: HowItWorksDialogProps) {
  const { i18n } = useTranslation();
  const isZh = i18n.language?.startsWith("zh");

  if (!open) return null;

  const sections = isZh
    ? [
        {
          icon: Terminal,
          title: "Crontab 管理",
          desc: "CronPilot 通过读写系统 crontab 来管理定时任务。你在 App 中创建或修改的任务会自动同步到系统 crontab 中。",
        },
        {
          icon: Database,
          title: "执行日志",
          desc: "每个任务通过 runner 脚本包装执行，自动记录执行结果（退出码、输出、耗时）到本地数据库，方便排查问题。",
        },
        {
          icon: RefreshCw,
          title: "启动同步",
          desc: "每次打开 App 时会自动同步 crontab，确保 App 内状态与系统一致。如果你在终端手动修改了 crontab，App 会自动校正。",
        },
        {
          icon: Shield,
          title: "安全保障",
          desc: "导入的 crontab 原始命令会被注释保留（不会删除）。CronPilot 管理的区域有明确标记，不会影响你自己的 crontab 条目。runner 脚本即使出错也会正常执行原始命令。",
        },
      ]
    : [
        {
          icon: Terminal,
          title: "Crontab Management",
          desc: "CronPilot manages scheduled tasks by reading and writing the system crontab. Jobs created or modified in the app are automatically synced to your system crontab.",
        },
        {
          icon: Database,
          title: "Execution Logging",
          desc: "Each job runs through a runner script that captures execution results (exit code, output, duration) into a local database for easy debugging.",
        },
        {
          icon: RefreshCw,
          title: "Startup Sync",
          desc: "The app syncs with your system crontab on every launch to ensure consistency. If you've manually edited crontab in the terminal, the app will reconcile automatically.",
        },
        {
          icon: Shield,
          title: "Safety Guarantees",
          desc: "Imported crontab entries are commented out (never deleted). CronPilot's managed section is clearly marked and won't interfere with your own crontab entries. The runner script falls back to running commands directly if anything goes wrong.",
        },
      ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="backdrop-overlay absolute inset-0"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative w-full max-w-[520px] rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-4 py-2.5">
          <h2 className="text-[15px] font-semibold">
            {isZh ? "CronPilot 工作原理" : "How CronPilot Works"}
          </h2>
          <button
            onClick={() => onOpenChange(false)}
            className="focus-ring inline-flex h-6 w-6 items-center justify-center rounded text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--secondary))]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-3 px-4 py-4">
          {sections.map((section, i) => (
            <div key={i} className="flex gap-3">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--secondary))]">
                <section.icon className="h-3.5 w-3.5 text-[hsl(var(--foreground))]" />
              </div>
              <div>
                <h3 className="text-[13px] font-medium text-[hsl(var(--foreground))]">
                  {section.title}
                </h3>
                <p className="mt-0.5 text-[12px] leading-relaxed text-[hsl(var(--muted-foreground))]">
                  {section.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-[hsl(var(--border))] px-4 py-3">
          <button
            onClick={() => onOpenChange(false)}
            className="focus-ring w-full rounded-md bg-[hsl(var(--primary))] px-3 py-1.5 text-[13px] font-medium text-[hsl(var(--primary-foreground))] transition-colors hover:opacity-90"
          >
            {isZh ? "我知道了" : "Got it"}
          </button>
        </div>
      </div>
    </div>
  );
}
