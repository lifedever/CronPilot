import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/store/appStore";
import { Sun, Moon, Monitor, Heart, RefreshCw, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { DonationDialog } from "@/components/DonationDialog";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { toast } from "sonner";

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme, updateAvailable, setUpdateAvailable } = useAppStore();

  const isZh = i18n.language?.startsWith("zh");
  const [donationOpen, setDonationOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const themeOptions = [
    { value: "light" as const, label: isZh ? "浅色" : "Light", icon: Sun },
    { value: "dark" as const, label: isZh ? "深色" : "Dark", icon: Moon },
    { value: "system" as const, label: isZh ? "跟随系统" : "System", icon: Monitor },
  ];

  const handleCheckUpdate = async () => {
    setChecking(true);
    try {
      const update = await check();
      if (update) {
        setUpdateAvailable(update.version);
      } else {
        toast.success(isZh ? "已是最新版本" : "You're up to date");
      }
    } catch (e) {
      toast.error(String(e));
    } finally {
      setChecking(false);
    }
  };

  const handleDownloadAndInstall = async () => {
    setDownloading(true);
    setDownloadProgress(0);
    try {
      const update = await check();
      if (!update) return;

      let totalLength = 0;
      let downloaded = 0;

      await update.downloadAndInstall((event) => {
        if (event.event === "Started" && event.data.contentLength) {
          totalLength = event.data.contentLength;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (totalLength > 0) {
            setDownloadProgress(Math.round((downloaded / totalLength) * 100));
          }
        } else if (event.event === "Finished") {
          setDownloadProgress(100);
        }
      });

      toast.success(isZh ? "更新完成，即将重启" : "Update complete, restarting...");
      await relaunch();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Language */}
      <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="text-[14px] font-medium">{isZh ? "语言" : "Language"}</span>
          <div className="flex gap-1">
            {[
              { value: "en", label: "English" },
              { value: "zh", label: "中文" },
            ].map((opt) => {
              const isActive = opt.value === "zh" ? isZh : !isZh;
              return (
                <button
                  key={opt.value}
                  onClick={() => i18n.changeLanguage(opt.value)}
                  className={cn(
                    "focus-ring cursor-pointer rounded px-2.5 py-1 text-[13px] font-medium transition-colors",
                    isActive
                      ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                      : "bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Theme */}
      <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="text-[14px] font-medium">{isZh ? "主题" : "Theme"}</span>
          <div className="flex gap-1">
            {themeOptions.map((opt) => {
              const isActive = theme === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setTheme(opt.value)}
                  className={cn(
                    "focus-ring cursor-pointer inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[13px] font-medium transition-colors",
                    isActive
                      ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                      : "bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                  )}
                >
                  <opt.icon className="h-3 w-3" />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Update */}
      <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div>
            <span className="text-[14px] font-medium">{isZh ? "检查更新" : "Check for Updates"}</span>
            {updateAvailable && (
              <p className="mt-0.5 text-[13px] text-emerald-600 dark:text-emerald-400">
                {isZh ? `发现新版本 v${updateAvailable}` : `v${updateAvailable} available`}
              </p>
            )}
            {downloading && (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1.5 w-32 overflow-hidden rounded-full bg-[hsl(var(--secondary))]">
                  <div
                    className="h-full rounded-full bg-[hsl(var(--primary))] transition-all"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
                <span className="text-[12px] tabular-nums text-[hsl(var(--muted-foreground))]">
                  {downloadProgress}%
                </span>
              </div>
            )}
          </div>
          {updateAvailable && !downloading ? (
            <button
              onClick={handleDownloadAndInstall}
              className="focus-ring cursor-pointer inline-flex items-center gap-1.5 rounded bg-emerald-600 px-2.5 py-1 text-[13px] font-medium text-white transition-colors hover:bg-emerald-700"
            >
              <Download className="h-3 w-3" />
              {isZh ? "下载安装" : "Install"}
            </button>
          ) : (
            <button
              onClick={handleCheckUpdate}
              disabled={checking || downloading}
              className="focus-ring cursor-pointer inline-flex items-center gap-1.5 rounded bg-[hsl(var(--secondary))] px-2.5 py-1 text-[13px] font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))] disabled:opacity-50"
            >
              {checking ? (
                <RefreshCw className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              {checking
                ? (isZh ? "检查中..." : "Checking...")
                : (isZh ? "检查更新" : "Check")}
            </button>
          )}
        </div>
      </div>

      {/* About */}
      <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div>
            <p className="text-[14px] font-medium">{t("app.name")}</p>
            <p className="mt-0.5 text-[13px] text-[hsl(var(--muted-foreground))]">
              v1.0.0 · {isZh ? "本地 Crontab 可视化管理" : "Local crontab visual manager"}
            </p>
          </div>
          <button
            onClick={() => setDonationOpen(true)}
            className="focus-ring cursor-pointer inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[13px] font-medium text-rose-500 transition-colors hover:bg-rose-50 dark:hover:bg-rose-950/30"
          >
            <Heart className="h-3.5 w-3.5" />
            {isZh ? "捐助" : "Donate"}
          </button>
        </div>
      </div>

      <DonationDialog open={donationOpen} onOpenChange={setDonationOpen} />
    </div>
  );
}
