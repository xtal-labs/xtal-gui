import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusType =
  | "synced"
  | "syncing"
  | "offline"
  | "no_peers"
  | "connecting"
  | "mining"
  | "validating"
  | "idle"
  | "locked"
  | "unlocked"
  | "online"
  | "error";

const statusConfig: Record<
  StatusType,
  {
    variant: BadgeProps["variant"];
    label: string;
    diamond?: boolean;
    pulse?: boolean;
    shape?: BadgeProps["shape"];
  }
> = {
  synced: { variant: "synced", label: "SYNCED", diamond: true, shape: "chamfered" },
  syncing: { variant: "syncing", label: "SYNCING", diamond: true, pulse: true, shape: "chamfered" },
  offline: { variant: "offline", label: "OFFLINE", diamond: true, shape: "chamfered" },
  no_peers: { variant: "no_peers", label: "NO PEERS", diamond: true, shape: "chamfered" },
  connecting: { variant: "info", label: "CONNECTING", diamond: true, pulse: true, shape: "chamfered" },
  mining: { variant: "mining", label: "MINING", diamond: true, pulse: true, shape: "chamfered" },
  validating: { variant: "validating", label: "VALIDATING", diamond: true, pulse: true, shape: "chamfered" },
  idle: { variant: "secondary", label: "IDLE", diamond: true, shape: "chamfered" },
  locked: { variant: "warning", label: "LOCKED", diamond: true, shape: "chamfered" },
  unlocked: { variant: "success", label: "UNLOCKED", diamond: true, shape: "chamfered" },
  online: { variant: "success", label: "ONLINE", diamond: true, shape: "chamfered" },
  error: { variant: "destructive", label: "ERROR", diamond: true, shape: "chamfered" },
};

interface StatusBadgeProps {
  status: StatusType;
  label?: string;
  className?: string;
  size?: "sm" | "default";
}

export function StatusBadge({ status, label, className, size = "default" }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <Badge
      variant={config.variant}
      shape={config.shape}
      diamond={config.diamond}
      pulse={config.pulse}
      className={cn(
        "font-heading tracking-wider",
        size === "sm" && "text-[10px] px-2 py-0.5",
        className
      )}
    >
      {label || config.label}
    </Badge>
  );
}

export default StatusBadge;
