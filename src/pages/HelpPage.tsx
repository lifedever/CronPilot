import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import {
  ShieldCheck,
  FolderLock,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function HelpPage() {
  const { i18n } = useTranslation();
  const isZh = i18n.language?.startsWith("zh");

  const handleOpenSettings = async () => {
    try {
      await invoke("open_fda_settings");
    } catch {
      // ignore
    }
  };

  const sections = isZh
    ? [
        {
          icon: FolderLock,
          color: "text-amber-600 dark:text-amber-400",
          bg: "bg-amber-50 dark:bg-amber-950/40",
          title: "macOS 受保护目录",
          content: [
            "macOS 对以下用户目录实施了 TCC 保护：",
            "~/Documents/、~/Desktop/、~/Downloads/、~/Library/",
            "未获授权的程序（包括 cron）访问这些目录中的文件时会收到「Operation not permitted」错误。即使脚本本身不在受保护目录，只要脚本内部读写了这些目录下的文件，同样会失败。",
          ],
        },
        {
          icon: ShieldCheck,
          color: "text-blue-600 dark:text-blue-400",
          bg: "bg-blue-50 dark:bg-blue-950/40",
          title: "为 cron 授予完全磁盘访问权限",
          content: [
            "如果你的定时任务需要访问上述目录，按以下步骤操作：",
          ],
          steps: [
            "打开「系统设置」→「隐私与安全性」→「完全磁盘访问权限」",
            "点击「+」，按 Cmd+Shift+G 输入 /usr/sbin/cron，回车并添加",
            "确保 cron 右侧的开关已开启",
            "打开终端执行 sudo pkill cron 重启 cron 服务",
          ],
          note: "授权后必须重启 cron 服务才能生效。",
        },
      ]
    : [
        {
          icon: FolderLock,
          color: "text-amber-600 dark:text-amber-400",
          bg: "bg-amber-50 dark:bg-amber-950/40",
          title: "macOS Protected Directories",
          content: [
            "macOS enforces TCC protection on these user directories:",
            "~/Documents/, ~/Desktop/, ~/Downloads/, ~/Library/",
            "Unauthorized programs (including cron) will receive \"Operation not permitted\" when accessing files in these directories. Even if the script itself is outside a protected directory, it will fail if it reads/writes files inside one.",
          ],
        },
        {
          icon: ShieldCheck,
          color: "text-blue-600 dark:text-blue-400",
          bg: "bg-blue-50 dark:bg-blue-950/40",
          title: "Grant Full Disk Access to cron",
          content: [
            "If your scheduled jobs need to access the directories above, follow these steps:",
          ],
          steps: [
            "Open System Settings > Privacy & Security > Full Disk Access",
            "Click \"+\", press Cmd+Shift+G, type /usr/sbin/cron, then add it",
            "Make sure the toggle next to cron is enabled",
            "Open Terminal and run: sudo pkill cron",
          ],
          note: "You must restart the cron service after granting access for it to take effect.",
        },
      ];

  return (
    <div className="mx-auto h-full max-w-[640px] space-y-4 overflow-auto">
      {/* Header */}
      <div>
        <h1 className="text-[18px] font-semibold">
          {isZh ? "macOS 权限说明" : "macOS Permissions"}
        </h1>
        <p className="mt-1 text-[13px] text-[hsl(var(--muted-foreground))]">
          {isZh
            ? "了解如何解决 cron 定时任务的权限问题。"
            : "Learn how to resolve cron permission issues."}
        </p>
      </div>

      {/* Quick action */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="text-[13px] leading-relaxed text-amber-900 dark:text-amber-200">
          {isZh
            ? "如果任务报错「Operation not permitted」，请为 cron 授予完全磁盘访问权限。"
            : "If jobs fail with \"Operation not permitted\", grant cron Full Disk Access."}
          <button
            onClick={handleOpenSettings}
            className="ml-2 inline-flex items-center gap-1 rounded bg-amber-600 px-2 py-0.5 text-[12px] font-medium text-white transition-colors hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600"
          >
            <ExternalLink className="h-3 w-3" />
            {isZh ? "去授权" : "Open Settings"}
          </button>
        </div>
      </div>

      {/* Sections */}
      {sections.map((section, i) => (
        <div
          key={i}
          className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]"
        >
          <div className="flex items-center gap-2.5 border-b border-[hsl(var(--border))] px-4 py-2.5">
            <div
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-md",
                section.bg
              )}
            >
              <section.icon className={cn("h-3.5 w-3.5", section.color)} />
            </div>
            <h2 className="text-[14px] font-semibold">{section.title}</h2>
          </div>
          <div className="space-y-2 px-4 py-3">
            {section.content.map((text, j) => (
              <p
                key={j}
                className={cn(
                  "text-[13px] leading-relaxed",
                  j === 1 && section.icon === FolderLock
                    ? "rounded bg-[hsl(var(--secondary))] px-3 py-1.5 font-mono text-[12px]"
                    : "text-[hsl(var(--muted-foreground))]"
                )}
              >
                {text}
              </p>
            ))}
            {"steps" in section && section.steps && (
              <ol className="ml-1 mt-2 space-y-1.5">
                {section.steps.map((step, k) => (
                  <li
                    key={k}
                    className="flex items-start gap-2 text-[13px] text-[hsl(var(--muted-foreground))]"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--secondary))] text-[11px] font-semibold">
                      {k + 1}
                    </span>
                    <span className="pt-px leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
            )}
            {"note" in section && section.note && (
              <p className="mt-2 text-[12px] font-medium text-amber-600 dark:text-amber-400">
                {section.note}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
