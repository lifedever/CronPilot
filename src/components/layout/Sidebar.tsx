import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Clock,
  Settings,
  Timer,
  HelpCircle,
  Lightbulb,
} from "lucide-react";
import { emit } from "@tauri-apps/api/event";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/appStore";

const navItems = [
  { key: "dashboard", path: "/", icon: LayoutDashboard },
  { key: "jobs", path: "/jobs", icon: Clock },
  { key: "settings", path: "/settings", icon: Settings },
];

export function Sidebar() {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language?.startsWith("zh");
  const appVersion = useAppStore((s) => s.appVersion);

  return (
    <aside className="flex h-full w-[180px] shrink-0 flex-col border-r border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-bg))]">
      {/* Brand */}
      <div className="flex h-[46px] items-center gap-2 px-4">
        <Timer className="h-[18px] w-[18px] text-[hsl(var(--sidebar-accent))]" />
        <span className="text-[15px] font-semibold text-[hsl(var(--sidebar-fg-active))]">
          {t("app.name")}
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 pt-1">
        <div className="space-y-0.5">
          {navItems.map((item) => (
            <NavLink
              key={item.key}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded px-2.5 py-[7px] text-[14px] font-medium transition-colors",
                  isActive
                    ? "bg-[hsl(var(--sidebar-hover))] text-[hsl(var(--sidebar-fg-active))]"
                    : "text-[hsl(var(--sidebar-fg))] hover:bg-[hsl(var(--sidebar-hover))] hover:text-[hsl(var(--sidebar-fg-active))]"
                )
              }
              end={item.path === "/"}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {t(`nav.${item.key}`)}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Footer */}
      <div className="space-y-0.5 px-2 pb-3">
        <NavLink
          to="/help"
          className={({ isActive }) =>
            cn(
              "flex w-full items-center gap-2.5 rounded px-2.5 py-[7px] text-[13px] transition-colors",
              isActive
                ? "bg-[hsl(var(--sidebar-hover))] text-[hsl(var(--sidebar-fg-active))]"
                : "text-[hsl(var(--sidebar-fg))] hover:bg-[hsl(var(--sidebar-hover))] hover:text-[hsl(var(--sidebar-fg-active))]"
            )
          }
        >
          <HelpCircle className="h-4 w-4 shrink-0" />
          {t("nav.help")}
        </NavLink>
        <button
          onClick={() => emit("menu-how-it-works")}
          className="flex w-full items-center gap-2.5 rounded px-2.5 py-[7px] text-[13px] text-[hsl(var(--sidebar-fg))] transition-colors hover:bg-[hsl(var(--sidebar-hover))] hover:text-[hsl(var(--sidebar-fg-active))]"
        >
          <Lightbulb className="h-4 w-4 shrink-0" />
          {isZh ? "工作原理" : "How It Works"}
        </button>
        <p className="px-2.5 pt-1 text-[12px] text-[hsl(var(--sidebar-fg))] opacity-40">
          {appVersion ? `v${appVersion}` : ""}
        </p>
      </div>
    </aside>
  );
}
