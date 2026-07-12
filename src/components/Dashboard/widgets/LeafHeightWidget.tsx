import { Blocks } from "lucide-react";

import { WidgetIcon, WidgetShell } from "@/components/Dashboard/WidgetShell";
import { VALUE_SIZE_CLASSES } from "@/components/Dashboard/sizing";
import { useBlockchainStore } from "@/stores";
import { formatBlockHeight, cn } from "@/lib/utils";
import type { WidgetProps } from "./registry";

export default function LeafHeightWidget({ size, shellProps }: WidgetProps) {
  const leafHeight = useBlockchainStore((s) => s.leafHeight);
  const stemsSinceLastLeaf = useBlockchainStore((s) => s.stemsSinceLastLeaf);

  return (
    <WidgetShell
      title="LEAF HEIGHT"
      icon={<WidgetIcon icon={Blocks} wrapClass="bg-crystal-leaf/20" iconClass="text-crystal-leaf" />}
      {...shellProps}
    >
      <div className={cn("font-heading font-bold tabular-nums", VALUE_SIZE_CLASSES[size])}>
        {formatBlockHeight(leafHeight)}
      </div>
      <p className="text-xs text-foreground-muted mt-1 font-mono">
        + {stemsSinceLastLeaf} stems
      </p>
    </WidgetShell>
  );
}
