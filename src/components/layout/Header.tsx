import { useTranslation } from "react-i18next";
import { Moon, Sun, Globe, ArrowUpCircle } from "lucide-react";
import { useAppStore } from "@/store/appStore";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const pageTitles: Record<string, { en: string; zh: string }> = {
  "/": { en: "Dashboard", zh: "仪表盘" },
  "/jobs": { en: "Cron Jobs", zh: "定时任务" },
  "/settings": { en: "Settings", zh: "设置" },
};

export function Header() {
  const { i18n } = useTranslation();
  const { theme, setTheme, updateAvailable } = useAppStore();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else if (theme === "light") {
      root.classList.remove("dark");
    } else {
      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.toggle("dark", isDark);
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const toggleLanguage = () => {
    const nextLang = i18n.language?.startsWith("zh") ? "en" : "zh";
    i18n.changeLanguage(nextLang);
  };

  const isZh = i18n.language?.startsWith("zh");
  const titleObj = pageTitles[location.pathname] || pageTitles["/"];
  const pageTitle = isZh ? titleObj.zh : titleObj.en;

  return (
    <header className="flex h-[46px] shrink-0 items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4">
      <h1 className="text-[15px] font-semibold">{pageTitle}</h1>

      <div className="flex items-center gap-0.5">
        {updateAvailable && (
          <button
            onClick={() => navigate("/settings")}
            className="focus-ring relative mr-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[12px] font-medium text-emerald-700 transition-colors hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 dark:hover:bg-emerald-950/60"
            title={isZh ? `发现新版本 v${updateAvailable}` : `v${updateAvailable} available`}
          >
            <ArrowUpCircle className="h-3 w-3" />
            v{updateAvailable}
          </button>
        )}
        <button
          onClick={toggleLanguage}
          className="focus-ring inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]"
          title={isZh ? "Switch to English" : "切换到中文"}
        >
          <Globe className="h-[14px] w-[14px]" />
        </button>
        <button
          onClick={toggleTheme}
          className="focus-ring inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]"
          title="Toggle Theme"
        >
          {theme === "dark" ? (
            <Sun className="h-[14px] w-[14px]" />
          ) : (
            <Moon className="h-[14px] w-[14px]" />
          )}
        </button>
      </div>
    </header>
  );
}
