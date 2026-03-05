import { AlertTriangle, GitBranch } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/store/appStore";
import { useState } from "react";
import { ReconcileDialog } from "@/components/ReconcileDialog";

export function ConflictBanner() {
  const conflictLocked = useAppStore((s) => s.conflictLocked);
  const { i18n } = useTranslation();
  const isZh = i18n.language?.startsWith("zh");
  const [showDialog, setShowDialog] = useState(false);

  if (!conflictLocked) return null;

  return (
    <>
      <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 dark:border-amber-800 dark:bg-amber-950/40">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="flex-1 text-[13px] text-amber-800 dark:text-amber-200">
          {isZh
            ? "Crontab 冲突未解决 — 任务编辑已锁定"
            : "Crontab conflict unresolved — job editing is locked"}
        </p>
        <button
          onClick={() => setShowDialog(true)}
          className="flex items-center gap-1 rounded-md bg-amber-600 px-2.5 py-1 text-[12px] font-medium text-white transition-colors hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600"
        >
          <GitBranch className="h-3 w-3" />
          {isZh ? "解决冲突" : "Resolve"}
        </button>
      </div>
      <ReconcileDialog
        open={showDialog}
        onOpenChange={setShowDialog}
      />
    </>
  );
}
