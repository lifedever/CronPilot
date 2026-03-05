import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

interface DonationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DonationDialog({ open, onOpenChange }: DonationDialogProps) {
  const { i18n } = useTranslation();
  const isZh = i18n.language?.startsWith("zh");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="backdrop-overlay absolute inset-0"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative w-full max-w-[560px] rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-4 py-2.5">
          <h2 className="text-[15px] font-semibold">
            {isZh ? "捐助支持" : "Support Us"}
          </h2>
          <button
            onClick={() => onOpenChange(false)}
            className="focus-ring inline-flex h-6 w-6 items-center justify-center rounded text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--secondary))]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 py-4">
          <p className="mb-4 text-center text-[14px] text-[hsl(var(--muted-foreground))]">
            {isZh
              ? "如果 CronPilot 对你有帮助，可以请我喝杯咖啡 ☕"
              : "If CronPilot helps you, consider buying me a coffee ☕"}
          </p>
          <div className="grid grid-cols-2 gap-5">
            {/* Alipay */}
            <div className="flex flex-col items-center gap-2">
              <span className="text-[13px] font-medium text-[hsl(var(--foreground))]">
                {isZh ? "支付宝" : "Alipay"}
              </span>
              <div className="overflow-hidden rounded-lg border border-[hsl(var(--border))]">
                <img
                  src="/alipay.PNG"
                  alt="Alipay"
                  className="w-full object-contain"
                />
              </div>
            </div>
            {/* WeChat Pay */}
            <div className="flex flex-col items-center gap-2">
              <span className="text-[13px] font-medium text-[hsl(var(--foreground))]">
                {isZh ? "微信支付" : "WeChat Pay"}
              </span>
              <div className="overflow-hidden rounded-lg border border-[hsl(var(--border))]">
                <img
                  src="/wechatpay.JPG"
                  alt="WeChat Pay"
                  className="w-full object-contain"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
