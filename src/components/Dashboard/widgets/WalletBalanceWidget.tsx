import { Wallet } from "lucide-react";

import { WidgetIcon, WidgetShell } from "@/components/Dashboard/WidgetShell";
import { VALUE_SIZE_CLASSES } from "@/components/Dashboard/sizing";
import { useWalletStore } from "@/stores";
import { formatXtal, cn, toShards } from "@/lib/utils";
import type { WidgetProps } from "./registry";

export default function WalletBalanceWidget({ size, shellProps }: WidgetProps) {
  const isLoaded = useWalletStore((s) => s.isLoaded);
  const walletName = useWalletStore((s) => s.walletName);
  const balance = useWalletStore((s) => s.balance);
  const vmBalance = useWalletStore((s) => s.vmBalance);

  return (
    <WidgetShell
      title="WALLET BALANCE"
      icon={
        <WidgetIcon
          icon={Wallet}
          wrapClass={isLoaded ? "bg-success/20" : "bg-muted"}
          iconClass={isLoaded ? "text-success" : "text-foreground-muted"}
        />
      }
      {...shellProps}
    >
      {isLoaded ? (
        <>
          <div className={cn("font-heading font-bold tabular-nums", VALUE_SIZE_CLASSES[size])}>
            {formatXtal(balance.total)}
          </div>
          <p className="text-xs text-foreground-muted mt-1 font-mono">
            {formatXtal(balance.confirmed)} confirmed
            {toShards(balance.pending) > 0n && <> &bull; {formatXtal(balance.pending)} pending</>}
            {toShards(balance.immature) > 0n && <> &bull; {formatXtal(balance.immature)} immature</>}
          </p>
          {vmBalance !== null && toShards(vmBalance.balance) > 0n && (
            <p className="text-xs text-foreground-muted mt-0.5 font-mono">
              {formatXtal(vmBalance.balance)} VM account
            </p>
          )}
          {walletName && (
            <p className="text-xs text-foreground-secondary mt-2 font-heading tracking-wide">
              {walletName}
            </p>
          )}
        </>
      ) : (
        <>
          <div className={cn("font-heading font-bold tabular-nums text-foreground-muted", VALUE_SIZE_CLASSES[size])}>
            --
          </div>
          <p className="text-xs text-foreground-muted mt-1 font-mono">
            No wallet loaded
          </p>
        </>
      )}
    </WidgetShell>
  );
}
