import { ArrowDownWideNarrow, ArrowUpNarrowWide, Layers, Plus } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AmountDisplay, HashDisplay } from "@/components/common";
import { cn, compareShards, type ShardAmount } from "@/lib/utils";
import type { VmAddress } from "@/types";

export type BalanceSortOrder = "desc" | "asc";

interface VmAccountListProps {
  addresses: VmAddress[];
  /** Wallet total, shown on the "All accounts" row. */
  totalBalance: ShardAmount;
  /** The account sends draw from; null draws from every account. */
  selected: string | null;
  onSelect: (address: string | null) => void;
  sortOrder: BalanceSortOrder;
  onSortOrderChange: (order: BalanceSortOrder) => void;
  onGenerateAddress: () => void;
}

/** Accounts by balance in `order`, ties kept in catalog order. */
function sortByBalance(addresses: VmAddress[], order: BalanceSortOrder): VmAddress[] {
  const direction = order === "desc" ? -1 : 1;
  return [...addresses].sort(
    (a, b) =>
      direction * compareShards(a.balance, b.balance) || (a.order ?? 0) - (b.order ?? 0)
  );
}

interface AccountRowProps {
  isSelected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
  balance: ShardAmount;
}

function AccountRow({ isSelected, onSelect, children, balance }: AccountRowProps) {
  return (
    <div
      role="radio"
      aria-checked={isSelected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "flex items-center justify-between gap-3 py-2 px-3 chamfered-sm border cursor-pointer transition-colors outline-hidden",
        "focus-visible:border-accent",
        isSelected
          ? "bg-accent/10 border-accent/50"
          : "bg-muted/50 border-transparent hover:bg-muted"
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-accent">
          {isSelected && <span className="h-2 w-2 diamond-sm bg-current" />}
        </span>
        {children}
      </div>
      <AmountDisplay amount={balance} size="sm" showSymbol className="shrink-0" />
    </div>
  );
}

/**
 * The wallet's VM accounts with their balances. Selecting one makes it the
 * account every VM send, withdrawal and contract write draws from.
 */
export function VmAccountList({
  addresses,
  totalBalance,
  selected,
  onSelect,
  sortOrder,
  onSortOrderChange,
  onGenerateAddress,
}: VmAccountListProps) {
  const sorted = sortByBalance(addresses, sortOrder);

  return (
    <Card variant="crystalline">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base font-heading tracking-wide">VM ACCOUNTS</CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSortOrderChange(sortOrder === "desc" ? "asc" : "desc")}
              disabled={addresses.length < 2}
              title={
                sortOrder === "desc"
                  ? "Sorted by balance, high to low"
                  : "Sorted by balance, low to high"
              }
            >
              {sortOrder === "desc" ? (
                <ArrowDownWideNarrow className="h-4 w-4 mr-1" />
              ) : (
                <ArrowUpNarrowWide className="h-4 w-4 mr-1" />
              )}
              Balance
            </Button>
            <Button variant="ghost" size="sm" onClick={onGenerateAddress}>
              <Plus className="h-4 w-4 mr-1" />
              New Address
            </Button>
          </div>
        </div>
        <CardDescription>
          {selected
            ? "Sends, withdrawals and contract calls use the selected account."
            : "Select an account to send, withdraw or call contracts from it alone."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {addresses.length === 0 ? (
          <p className="text-center text-foreground-muted py-4 font-heading">
            No VM addresses yet
          </p>
        ) : (
          <div
            role="radiogroup"
            aria-label="Send from"
            className="space-y-2 max-h-64 overflow-y-auto pr-1"
          >
            <AccountRow
              isSelected={selected === null}
              onSelect={() => onSelect(null)}
              balance={totalBalance}
            >
              <Layers className="h-4 w-4 shrink-0 text-foreground-muted" />
              <span className="text-sm text-foreground">All accounts</span>
              <span className="text-xs text-foreground-muted">automatic</span>
            </AccountRow>
            {sorted.map((addr) => (
              <AccountRow
                key={addr.address}
                isSelected={selected === addr.address}
                onSelect={() => onSelect(addr.address)}
                balance={addr.balance}
              >
                <HashDisplay
                  hash={addr.address}
                  truncate={false}
                  showTooltip={false}
                  className="min-w-0"
                />
                {addr.label && (
                  <Badge variant="outline" shape="chamfered" className="text-xs shrink-0">
                    {addr.label}
                  </Badge>
                )}
              </AccountRow>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
