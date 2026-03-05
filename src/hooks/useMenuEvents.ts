import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { check } from "@tauri-apps/plugin-updater";
import { save, open as openFile } from "@tauri-apps/plugin-dialog";
import { jobsApi } from "@/api/jobs";
import { useAppStore } from "@/store/appStore";

export function useMenuEvents() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setUpdateAvailable = useAppStore((s) => s.setUpdateAvailable);
  const isZh = typeof navigator !== "undefined" && navigator.language?.startsWith("zh");

  useEffect(() => {
    const unlisteners: (() => void)[] = [];

    const setup = async () => {
      unlisteners.push(
        await listen<string>("menu-navigate", (event) => {
          navigate(`/${event.payload}`);
        })
      );

      unlisteners.push(
        await listen("menu-check-update", async () => {
          try {
            const update = await check();
            if (update) {
              setUpdateAvailable(update.version);
              navigate("/settings");
            } else {
              toast.success(isZh ? "已是最新版本" : "You're up to date");
            }
          } catch (e) {
            toast.error(String(e));
          }
        })
      );

      unlisteners.push(
        await listen("menu-import-crontab", async () => {
          try {
            const result = await jobsApi.importFromCrontab();
            queryClient.invalidateQueries({ queryKey: ["jobs"] });
            queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
            toast.success(
              isZh
                ? `已导入 ${result.imported} 个任务${result.skipped > 0 ? `，跳过 ${result.skipped} 个` : ""}`
                : `Imported ${result.imported} job(s)${result.skipped > 0 ? `, skipped ${result.skipped}` : ""}`
            );
          } catch (e) {
            toast.error(String(e));
          }
        })
      );

      unlisteners.push(
        await listen("menu-export-backup", async () => {
          try {
            const filePath = await save({
              title: isZh ? "导出任务" : "Export Jobs",
              defaultPath: `cronpilot-backup-${new Date().toISOString().slice(0, 10)}.json`,
              filters: [{ name: "JSON", extensions: ["json"] }],
            });
            if (!filePath) return;
            const count = await jobsApi.exportJobsToFile(filePath);
            toast.success(isZh ? `已导出 ${count} 个任务` : `Exported ${count} job(s)`);
          } catch (e) {
            toast.error(String(e));
          }
        })
      );

      unlisteners.push(
        await listen("menu-import-backup", async () => {
          try {
            const filePath = await openFile({
              title: isZh ? "导入备份" : "Import Backup",
              multiple: false,
              filters: [{ name: "JSON", extensions: ["json"] }],
            });
            if (!filePath) return;
            const result = await jobsApi.importJobsFromBackup(String(filePath));
            queryClient.invalidateQueries({ queryKey: ["jobs"] });
            queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
            toast.success(
              isZh
                ? `已导入 ${result.imported} 个任务${result.skipped > 0 ? `，跳过 ${result.skipped} 个已存在` : ""}`
                : `Imported ${result.imported} job(s)${result.skipped > 0 ? `, skipped ${result.skipped} existing` : ""}`
            );
          } catch (e) {
            toast.error(String(e));
          }
        })
      );
    };

    setup();

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [navigate, queryClient, setUpdateAvailable, isZh]);
}
