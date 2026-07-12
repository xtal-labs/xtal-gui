import { useState, useEffect, useRef } from "react";
import { Leaf } from "lucide-react";

import { WidgetIcon, WidgetShell } from "@/components/Dashboard/WidgetShell";
import { Badge } from "@/components/ui/badge";
import { HashDisplay } from "@/components/common";
import { useBlockchainStore } from "@/stores";
import { cn } from "@/lib/utils";
import type { WidgetProps } from "./registry";

export default function BestLeafWidget({ shellProps }: WidgetProps) {
  const bestBlockHash = useBlockchainStore((s) => s.bestBlockHash);

  // Pulse the leaf icon amber briefly whenever a new best leaf arrives.
  const [isLeafPulse, setIsLeafPulse] = useState(false);
  const prevHashRef = useRef(bestBlockHash);

  useEffect(() => {
    if (prevHashRef.current !== bestBlockHash && bestBlockHash) {
      setIsLeafPulse(true);
      const timer = setTimeout(() => setIsLeafPulse(false), 1500);
      prevHashRef.current = bestBlockHash;
      return () => clearTimeout(timer);
    }
  }, [bestBlockHash]);

  return (
    <WidgetShell
      title="BEST LEAF"
      icon={
        <WidgetIcon
          icon={Leaf}
          iconClass={cn(
            "transition-colors duration-500",
            isLeafPulse ? "text-amber-400" : "text-primary"
          )}
        />
      }
      {...shellProps}
    >
      {bestBlockHash ? (
        <div className="flex items-center justify-between">
          <div className="font-mono">
            <HashDisplay hash={bestBlockHash} chars={16} />
          </div>
          <Badge variant="success" diamond>Active Tip</Badge>
        </div>
      ) : (
        <div className="text-2xl font-heading font-bold text-foreground-muted">--</div>
      )}
    </WidgetShell>
  );
}
