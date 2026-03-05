import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import { LayoutDashboard, Clock, Settings, Timer } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { key: "dashboard", path: "/", icon: LayoutDashboard },
  { key: "jobs", path: "/jobs", icon: Clock },
  { key: "settings", path: "/settings", icon: Settings },
];

export function Sidebar() {
  const { t } = useTranslation();

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
      <div className="px-4 py-3">
        <p className="text-[12px] text-[hsl(var(--sidebar-fg))] opacity-40">v1.0.0</p>
      </div>
    </aside>
  );
}
