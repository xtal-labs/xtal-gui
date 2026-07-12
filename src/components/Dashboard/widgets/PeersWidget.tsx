import { Users } from "lucide-react";

import { WidgetIcon, WidgetShell } from "@/components/Dashboard/WidgetShell";
import { VALUE_SIZE_CLASSES } from "@/components/Dashboard/sizing";
import { useNetworkStore } from "@/stores";
import { cn } from "@/lib/utils";
import type { WidgetProps } from "./registry";

export default function PeersWidget({ size, shellProps }: WidgetProps) {
  const peerCount = useNetworkStore((s) => s.peerCount);
  const inboundCount = useNetworkStore((s) => s.inboundCount);
  const outboundCount = useNetworkStore((s) => s.outboundCount);

  return (
    <WidgetShell title="CONNECTED PEERS" icon={<WidgetIcon icon={Users} />} {...shellProps}>
      <div className={cn("font-heading font-bold tabular-nums", VALUE_SIZE_CLASSES[size])}>
        {peerCount}
      </div>
      <p className="text-xs text-foreground-muted mt-1 font-mono">
        {inboundCount} in / {outboundCount} out
      </p>
    </WidgetShell>
  );
}
