import { ArrowDownLeft } from "lucide-react";

import { WidgetIcon, WidgetShell } from "@/components/Dashboard/WidgetShell";
import { AmountDisplay, HashDisplay } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { useIncomingMempoolTxs } from "@/hooks/useIncomingMempoolTxs";
import { useWalletStore } from "@/stores";
import { formatDuration } from "@/lib/utils";
import type { WidgetProps } from "./registry";

export default function IncomingTransactionsWidget({ size, shellProps }: WidgetProps) {
  const isLoaded = useWalletStore((s) => s.isLoaded);
  const txs = useIncomingMempoolTxs();

  const maxRows = size === "s" || size === "m" ? 4 : 8;
  const rows = txs?.slice(0, maxRows) ?? [];

  return (
    <WidgetShell
      title="INCOMING TRANSACTIONS"
      icon={<WidgetIcon icon={ArrowDownLeft} wrapClass="bg-success/20" iconClass="text-success" />}
      headerRight={
        txs && txs.length > 0 ? (
          <Badge variant="success" diamond>
            {txs.length}
          </Badge>
        ) : undefined
      }
      {...shellProps}
    >
      {!isLoaded ? (
        <p className="text-xs text-foreground-muted font-mono">No wallet loaded</p>
      ) : txs === null ? (
        <div className="h-8 w-32 bg-muted/50 animate-pulse chamfered-sm" />
      ) : txs.length === 0 ? (
        <p className="text-xs text-foreground-muted font-mono">
          No pending transactions to this wallet
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((tx) => (
            <div
              key={tx.txid}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <div className="min-w-0 font-mono">
                <HashDisplay hash={tx.txid} chars={8} />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-foreground-muted font-mono">
                  {tx.ageSecs < 60 ? `${tx.ageSecs}s` : formatDuration(tx.ageSecs)} ago
                </span>
                <AmountDisplay amount={tx.incomingAmount} size="sm" showSymbol positive />
              </div>
            </div>
          ))}
          {txs.length > maxRows && (
            <p className="text-xs text-foreground-muted font-mono">
              +{txs.length - maxRows} more pending
            </p>
          )}
        </div>
      )}
    </WidgetShell>
  );
}
