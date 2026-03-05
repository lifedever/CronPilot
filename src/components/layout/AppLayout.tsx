import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { ConflictBanner } from "./ConflictBanner";

export function AppLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-[hsl(var(--background))]">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <ConflictBanner />
        <main className="flex flex-1 flex-col overflow-hidden p-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
