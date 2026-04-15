import { X, CheckCircle, AlertCircle, AlertTriangle, Info, Sprout, Leaf, Lock, Unlock } from "lucide-react";
import { cn } from "@/lib/utils";
import { getFruitColor } from "@/lib/fruitColors";
import { useUiStore, type Toast } from "@/stores/uiStore";

const iconMap = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
  stem: Sprout,
  leaf: Leaf,
  stake: Lock,
  unstake: Unlock,
};

const variantStyles = {
  success: "border-success/30 bg-success/10",
  error: "border-destructive/30 bg-destructive/10",
  warning: "border-warning/30 bg-warning/10",
  info: "border-info/30 bg-info/10",
  stem: "border-emerald-500/30 bg-gradient-to-br from-emerald-500/20 via-green-500/15 to-teal-500/10",
  leaf: "border-amber-500/30 bg-gradient-to-br from-amber-600/25 via-orange-400/15 via-[60%] to-yellow-600/10",
  stake: "border-violet-500/30 bg-gradient-to-br from-violet-500/20 via-purple-500/15 to-fuchsia-500/10",
  unstake: "border-sky-500/30 bg-gradient-to-br from-sky-500/20 via-cyan-500/15 to-blue-500/10",
};

const iconStyles = {
  success: "text-success",
  error: "text-destructive",
  warning: "text-warning",
  info: "text-info",
  stem: "text-emerald-400",
  leaf: "text-amber-400",
  stake: "text-violet-400",
  unstake: "text-sky-400",
};

function ToastItem({ toast }: { toast: Toast }) {
  const { removeToast } = useUiStore();
  const isFruitToast = toast.type === "fruit" && toast.fruitType;

  // Get styling based on toast type
  const getStyles = () => {
    if (isFruitToast) {
      const fruitColors = getFruitColor(toast.fruitType!);
      return {
        container: cn("bg-gradient-to-br", fruitColors.bg, fruitColors.border, "shadow-md", fruitColors.glow),
        icon: fruitColors.icon,
      };
    }
    return {
      container: variantStyles[toast.type as keyof typeof variantStyles],
      icon: iconStyles[toast.type as keyof typeof iconStyles],
    };
  };

  const styles = getStyles();
  const Icon = !isFruitToast ? iconMap[toast.type as keyof typeof iconMap] : null;
  const fruitEmoji = isFruitToast ? getFruitColor(toast.fruitType!).emoji : null;

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-4 chamfered border shadow-lg",
        "bg-background/95 backdrop-blur-sm",
        "animate-in slide-in-from-right-full duration-300",
        styles.container
      )}
    >
      {isFruitToast ? (
        <span className="text-xl shrink-0 mt-0.5">{fruitEmoji}</span>
      ) : (
        Icon && <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", styles.icon)} />
      )}
      <div className="flex-1 min-w-0">
        <p className="font-heading font-medium text-sm text-foreground">
          {toast.title}
        </p>
        {toast.message && (
          <p className="mt-1 text-xs text-foreground-secondary line-clamp-2">
            {toast.message}
          </p>
        )}
      </div>
      <button
        onClick={() => removeToast(toast.id)}
        className="shrink-0 p-1 chamfered-sm text-foreground-muted hover:text-foreground hover:bg-muted/50 transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts } = useUiStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} />
        </div>
      ))}
    </div>
  );
}

export { ToastItem };
