import { Layers } from "lucide-react";

import { WidgetIcon, WidgetShell } from "@/components/Dashboard/WidgetShell";
import { VALUE_SIZE_CLASSES } from "@/components/Dashboard/sizing";
import { useMempoolInfo } from "@/hooks/useMempoolInfo";
import { formatBytes, cn } from "@/lib/utils";
import type { WidgetProps } from "./registry";

export default function MempoolWidget({ size, shellProps }: WidgetProps) {
  const mempoolInfo = useMempoolInfo();

  return (
    <WidgetShell title="MEMPOOL" icon={<WidgetIcon icon={Layers} />} {...shellProps}>
      <div className={cn("font-heading font-bold tabular-nums", VALUE_SIZE_CLASSES[size])}>
        {mempoolInfo?.total_transactions ?? 0}
      </div>
      <p className="text-xs text-foreground-muted mt-1 font-mono">
        {formatBytes(mempoolInfo?.size_bytes ?? 0)}
        {" "}&bull;{" "}
        {mempoolInfo?.utxo_count ?? 0} utxo / {mempoolInfo?.vm_count ?? 0} vm
      </p>
    </WidgetShell>
  );
}
