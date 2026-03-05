import { useAppStore } from "@/store/appStore";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";

export function UpdateToast() {
  const { updateAvailable } = useAppStore();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const isZh = i18n.language?.startsWith("zh");

  const [visible, setVisible] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (updateAvailable) {
      setShow(true);
      // Trigger enter animation on next frame
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));

      // Auto dismiss after 8s
      const timer = setTimeout(() => dismiss(), 8000);
      return () => clearTimeout(timer);
    }
  }, [updateAvailable]);

  const dismiss = () => {
    setVisible(false);
    setTimeout(() => setShow(false), 250);
  };

  if (!show || !updateAvailable) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 3000,
        background: "hsl(var(--card))",
        border: "1px solid hsl(152 69% 31% / 0.35)",
        borderRadius: "var(--radius)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
        padding: "14px 18px",
        maxWidth: 300,
        transform: visible ? "translateX(0)" : "translateX(calc(100% + 24px))",
        opacity: visible ? 1 : 0,
        transition: "transform 0.3s ease-out, opacity 0.3s ease-out",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={{ fontSize: 14, color: "hsl(var(--foreground))" }}>
          🎉{" "}
          {isZh ? (
            <>发现新版本 <strong>v{updateAvailable}</strong></>
          ) : (
            <>New version <strong>v{updateAvailable}</strong> available</>
          )}
        </span>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={() => {
              dismiss();
              navigate("/settings");
            }}
            style={{
              padding: "5px 14px",
              borderRadius: "var(--radius)",
              fontSize: 13,
              cursor: "pointer",
              border: "none",
              background: "hsl(152 69% 31%)",
              color: "white",
              fontWeight: 500,
            }}
          >
            {isZh ? "立即更新" : "Update"}
          </button>
          <button
            onClick={dismiss}
            style={{
              padding: "5px 14px",
              borderRadius: "var(--radius)",
              fontSize: 13,
              cursor: "pointer",
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--secondary))",
              color: "hsl(var(--muted-foreground))",
            }}
          >
            {isZh ? "忽略" : "Dismiss"}
          </button>
        </div>
      </div>
    </div>
  );
}
