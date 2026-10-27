import { Wallet } from "lucide-react";

import { truncateAddress } from "@/lib/utils";

interface SendFromRowProps {
  /** The VM account selected in the wallet, or null when the wallet chooses. */
  address: string | null;
  /** What the wallet does when no account is selected. */
  automaticLabel: string;
}

/**
 * The VM account a write draws from. Read-only: the source is chosen in the
 * wallet's VM account list, so every VM write shows the same selection.
 */
export function SendFromRow({ address, automaticLabel }: SendFromRowProps) {
  return (
    <div
      className="flex items-center justify-between gap-3 py-2 px-3 chamfered-sm bg-muted/50 text-sm"
      title="Select an account in the wallet's VM tab to change this"
    >
      <span className="flex items-center gap-1.5 font-heading tracking-wide text-foreground-secondary">
        <Wallet className="h-3.5 w-3.5" />
        FROM
      </span>
      {address ? (
        <span className="font-mono text-foreground truncate">{truncateAddress(address, 8)}</span>
      ) : (
        <span className="text-foreground-muted truncate">{automaticLabel}</span>
      )}
    </div>
  );
}
