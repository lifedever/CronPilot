import { create } from "zustand";

interface AppState {
  sidebarOpen: boolean;
  theme: "light" | "dark" | "system";
  updateAvailable: string | null;
  conflictLocked: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setTheme: (theme: "light" | "dark" | "system") => void;
  setUpdateAvailable: (version: string | null) => void;
  setConflictLocked: (locked: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidebarOpen: true,
  theme: (localStorage.getItem("theme") as "light" | "dark" | "system") || "system",
  updateAvailable: null,
  conflictLocked: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setTheme: (theme) => {
    localStorage.setItem("theme", theme);
    set({ theme });
  },
  setUpdateAvailable: (version) => set({ updateAvailable: version }),
  setConflictLocked: (locked) => set({ conflictLocked: locked }),
}));
