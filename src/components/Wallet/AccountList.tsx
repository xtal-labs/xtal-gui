import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Eye,
  EyeOff,
  Layers,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AmountDisplay, HashDisplay } from "@/components/common";
import { cn, compareShards, toShards, type ShardAmount } from "@/lib/utils";

export type BalanceSortOrder = "desc" | "asc";

export interface AccountListEntry {
  address: string;
  /** What a send from this address can use; null when the wallet cannot send from it alone. */
  balance: ShardAmount | null;
  /** The address's funds that are not spendable yet; shown when non-zero. */
  locked?: ShardAmount | null;
  /** Catalog position, the tie-break when balances are equal. */
  order: number;
  /** Shown before the address. */
  icon?: React.ReactNode;
  /** Shown after the address: label, kind. */
  badges?: React.ReactNode;
  className?: string;
}

interface AccountListProps {
  title: string;
  entries: AccountListEntry[];
  /** Label and balance of the row that lets the wallet choose. */
  allLabel: string;
  totalBalance: ShardAmount;
  /** The address writes draw from; null lets the wallet choose. */
  selected: string | null;
  onSelect: (address: string | null) => void;
  sortOrder: BalanceSortOrder;
  onSortOrderChange: (order: BalanceSortOrder) => void;
  hideEmpty: boolean;
  onHideEmptyChange: (hide: boolean) => void;
  /** Description while an address is selected, and while none is. */
  selectedHint: string;
  unselectedHint: string;
  emptyText: string;
  /** Header buttons such as "New Address". */
  actions?: React.ReactNode;
  "data-tour"?: string;
}

function isEmpty(entry: AccountListEntry): boolean {
  return toShards(entry.balance) === 0n && toShards(entry.locked) === 0n;
}

/** Entries by balance in `order`, ties kept in catalog order. */
function sortByBalance(entries: AccountListEntry[], order: BalanceSortOrder): AccountListEntry[] {
  const direction = order === "desc" ? -1 : 1;
  return [...entries].sort(
    (a, b) => direction * compareShards(a.balance, b.balance) || a.order - b.order
  );
}

interface AccountRowProps {
  isSelected: boolean;
  /** Absent for addresses that cannot be a source. */
  onSelect?: () => void;
  balance: ShardAmount | null;
  locked?: ShardAmount | null;
  className?: string;
  children: React.ReactNode;
}

function AccountRow({ isSelected, onSelect, balance, locked, className, children }: AccountRowProps) {
  const selectable = onSelect !== undefined;
  return (
    <div
      role={selectable ? "radio" : undefined}
      aria-checked={selectable ? isSelected : undefined}
      tabIndex={selectable ? 0 : undefined}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (selectable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "flex items-center justify-between gap-3 py-2 px-3 chamfered-sm border transition-colors outline-hidden",
        selectable && "cursor-pointer focus-visible:border-accent",
        isSelected
          ? "bg-accent/10 border-accent/50"
          : cn("bg-muted/50 border-transparent", selectable && "hover:bg-muted"),
        className
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-accent">
          {isSelected && <span className="h-2 w-2 diamond-sm bg-current" />}
        </span>
        {children}
      </div>
      {balance !== null && (
        <div className="flex flex-col items-end shrink-0">
          <AmountDisplay amount={balance} size="sm" showSymbol />
          {toShards(locked) > 0n && (
            <span className="text-xs text-foreground-muted">
              + <AmountDisplay amount={locked ?? 0} size="sm" showSymbol={false} className="text-xs" /> locked
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A wallet's addresses with their balances. Selecting one makes it the
 * source every write on that side of the wallet draws from.
 */
export function AccountList({
  title,
  entries,
  allLabel,
  totalBalance,
  selected,
  onSelect,
  sortOrder,
  onSortOrderChange,
  hideEmpty,
  onHideEmptyChange,
  selectedHint,
  unselectedHint,
  emptyText,
  actions,
  "data-tour": dataTour,
}: AccountListProps) {
  const visible = sortByBalance(
    hideEmpty ? entries.filter((entry) => !isEmpty(entry) || entry.address === selected) : entries,
    sortOrder
  );
  const hasEmpty = entries.some(isEmpty);

  return (
    <Card variant="crystalline" data-tour={dataTour}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base font-heading tracking-wide">{title}</CardTitle>
          <div className="flex flex-wrap items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSortOrderChange(sortOrder === "desc" ? "asc" : "desc")}
              disabled={entries.length < 2}
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
            {(hasEmpty || hideEmpty) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onHideEmptyChange(!hideEmpty)}
                title={hideEmpty ? "Show addresses with no balance" : "Hide addresses with no balance"}
              >
                {hideEmpty ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
                {hideEmpty ? "Show empty" : "Hide empty"}
              </Button>
            )}
            {actions}
          </div>
        </div>
        <CardDescription>{selected ? selectedHint : unselectedHint}</CardDescription>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-center text-foreground-muted py-4 font-heading">{emptyText}</p>
        ) : (
          <div role="radiogroup" aria-label="Send from" className="space-y-2 max-h-64 overflow-y-auto pr-1">
            <AccountRow
              isSelected={selected === null}
              onSelect={() => onSelect(null)}
              balance={totalBalance}
            >
              <Layers className="h-4 w-4 shrink-0 text-foreground-muted" />
              <span className="text-sm text-foreground">{allLabel}</span>
              <span className="text-xs text-foreground-muted">automatic</span>
            </AccountRow>
            {visible.map((entry) => (
              <AccountRow
                key={entry.address}
                isSelected={selected === entry.address}
                onSelect={entry.balance === null ? undefined : () => onSelect(entry.address)}
                balance={entry.balance}
                locked={entry.locked}
                className={entry.className}
              >
                {entry.icon}
                <HashDisplay
                  hash={entry.address}
                  truncate={false}
                  showTooltip={false}
                  className="min-w-0"
                />
                {entry.badges}
              </AccountRow>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
