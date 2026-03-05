import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { AppLayout } from "@/components/layout/AppLayout";
import { DashboardPage } from "@/pages/DashboardPage";
import { JobsPage } from "@/pages/JobsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { HelpPage } from "@/pages/HelpPage";
import { UpdateToast } from "@/components/UpdateToast";
import { HowItWorksDialog } from "@/components/HowItWorksDialog";
import { ReconcileDialog } from "@/components/ReconcileDialog";
import { useAppStore } from "@/store/appStore";
import { useMenuEvents } from "@/hooks/useMenuEvents";
import { check } from "@tauri-apps/plugin-updater";
import { getVersion } from "@tauri-apps/api/app";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

interface CrontabSyncStatus {
  new_entries: { expression: string; command: string }[];
  managed_block_outdated: boolean;
  needs_sync: boolean;
  conflict_locked: boolean;
}

function AppRoutes() {
  useMenuEvents();
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [showReconcile, setShowReconcile] = useState(false);
  const setConflictLocked = useAppStore((s) => s.setConflictLocked);


  useEffect(() => {
    const unlisteners: (() => void)[] = [];

    const setup = async () => {
      // First-run: show welcome dialog
      unlisteners.push(
        await listen("first-run", () => {
          setShowHowItWorks(true);
          invoke("mark_first_run_done").catch(() => {});
        })
      );

      // Menu: Help > How It Works
      unlisteners.push(
        await listen("menu-how-it-works", () => {
          setShowHowItWorks(true);
        })
      );

      // Check crontab conflict state on mount (replaces flaky backend event)
      try {
        const status = await invoke<CrontabSyncStatus>("check_crontab_sync");
        if (status.conflict_locked || status.needs_sync) {
          setConflictLocked(true);
          setShowReconcile(true);
        }
      } catch {
        // Silently ignore
      }


    };

    setup();
    return () => unlisteners.forEach((u) => u());
  }, [setConflictLocked]);

  return (
    <>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/help" element={<HelpPage />} />
        </Route>
      </Routes>
      <UpdateToast />
      <HowItWorksDialog
        open={showHowItWorks}
        onOpenChange={setShowHowItWorks}
      />
      <ReconcileDialog
        open={showReconcile}
        onOpenChange={setShowReconcile}
      />
    </>
  );
}

function App() {
  const setUpdateAvailable = useAppStore((s) => s.setUpdateAvailable);
  const setAppVersion = useAppStore((s) => s.setAppVersion);

  useEffect(() => {
    getVersion().then((v) => setAppVersion(v)).catch(() => {});
  }, [setAppVersion]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const update = await check();
        if (update) {
          setUpdateAvailable(update.version);
        }
      } catch {
        // Silently ignore
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [setUpdateAvailable]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
      <Toaster
        position="top-center"
        offset={16}
        toastOptions={{
          duration: 2000,
          style: {
            background: "rgba(30, 30, 30, 0.88)",
            backdropFilter: "blur(12px)",
            color: "rgba(255,255,255,0.9)",
            border: "none",
            borderRadius: "var(--radius)",
            padding: "8px 16px",
            fontSize: "13px",
            minHeight: "unset",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            width: "fit-content",
          },
        }}
      />
    </QueryClientProvider>
  );
}

export default App;
