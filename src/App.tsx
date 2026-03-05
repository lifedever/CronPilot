import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { DashboardPage } from "@/pages/DashboardPage";
import { JobsPage } from "@/pages/JobsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { UpdateToast } from "@/components/UpdateToast";
import { useAppStore } from "@/store/appStore";
import { check } from "@tauri-apps/plugin-updater";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  const setUpdateAvailable = useAppStore((s) => s.setUpdateAvailable);

  useEffect(() => {
    // Auto-check for updates on startup (delay 3s to not block UI)
    const timer = setTimeout(async () => {
      try {
        const update = await check();
        if (update) {
          setUpdateAvailable(update.version);
        }
      } catch {
        // Silently ignore — user can still check manually
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [setUpdateAvailable]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/jobs" element={<JobsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
        <UpdateToast />
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
