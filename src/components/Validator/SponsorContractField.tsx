import { AlertCircle, CheckCircle2, ChevronDown, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getFruitColor } from "@/lib/fruitColors";
import { normalizeContractAddress, shortContractAddress } from "@/lib/sponsorship";
import { addShards, compareShards, formatXtalExact, subShards, type ShardAmount } from "@/lib/utils";
import type { CachedContract, ContractInfo, SponsoredStakeEntry } from "@/types";

interface SponsorContractFieldProps {
  /** Whether the "sponsor a contract" tick is on. */
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  /** Raw address text as typed or picked. */
  address: string;
  onAddressChange: (value: string) => void;
  /** Gateway-imported contracts offered as quick picks. */
  options: CachedContract[];
  /** Result of `get_contract_info` for the normalized address, if resolved. */
  contractInfo: ContractInfo | null;
  isResolving: boolean;
  resolveError: string | null;
  /** The normalized address is the CAGE bridge contract. */
  isCageSelected: boolean;
  /** Fruit-type minimum stake for the resolved contract's shard (shards). */
  threshold: ShardAmount | null;
  /** Display label for the resolved contract. */
  label: string | null;
  /** Stake the validator already has on the resolved contract. */
  currentOnTarget: SponsoredStakeEntry | null;
  /** Amount being staked right now (shards), when valid. */
  stakeAmount: ShardAmount | null;
}

const HELPER_COPY =
  "Stake still counts fully toward fruit eligibility; it additionally unlocks gas-free calls to the contract.";

const THRESHOLD_COPY =
  "Sponsored stake counts fully toward fruit-production eligibility. Gas-free calls to this contract unlock once your stake on it reaches the fruit's minimum. It is a threshold, not proportional.";

export function SponsorContractField({
  enabled,
  onEnabledChange,
  address,
  onAddressChange,
  options,
  contractInfo,
  isResolving,
  resolveError,
  isCageSelected,
  threshold,
  label,
  currentOnTarget,
  stakeAmount,
}: SponsorContractFieldProps) {
  const normalized = normalizeContractAddress(address);
  const formatError = address.trim().length > 0 && normalized === null;
  const infoMatches =
    contractInfo !== null && normalized !== null && contractInfo.address.toLowerCase() === normalized;
  const isValid = infoMatches && contractInfo.isContract && !isCageSelected;

  const currentTotal = currentOnTarget?.total ?? "0";
  const afterStake = stakeAmount !== null ? addShards(currentTotal, stakeAmount) : null;
  const meetsThreshold =
    threshold !== null && afterStake !== null && compareShards(afterStake, threshold) >= 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4 py-2 px-3 chamfered-sm bg-muted/50">
        <div>
          <span className="text-sm font-heading text-foreground-secondary">SPONSOR A CONTRACT</span>
          <p className="text-xs text-foreground-muted mt-0.5">{HELPER_COPY}</p>
        </div>
        <Switch checked={enabled} onCheckedChange={onEnabledChange} />
      </div>

      {enabled && (
        <div className="space-y-2">
          <label className="text-sm font-heading text-foreground-muted block">
            Target contract
          </label>
          <div className="flex gap-2">
            <Input
              placeholder="0x… contract address"
              value={address}
              onChange={(e) => onAddressChange(e.target.value)}
              className="font-mono text-sm"
              spellCheck={false}
              autoComplete="off"
            />
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline-crystalline"
                        size="sm"
                        className="text-foreground whitespace-nowrap"
                        disabled={options.length === 0}
                      >
                        Imported
                        <ChevronDown className="h-3.5 w-3.5 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                  </span>
                </TooltipTrigger>
                {options.length === 0 && (
                  <TooltipContent className="max-w-[16rem] text-center">
                    Import a contract in the Gateway tab to pick it here
                  </TooltipContent>
                )}
              </Tooltip>
              <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
                {options.map((contract) => {
                  const fruit = contract.fruitType ? getFruitColor(contract.fruitType) : null;
                  return (
                    <DropdownMenuItem
                      key={contract.address}
                      onSelect={() => onAddressChange(contract.address)}
                      className="flex items-center gap-2"
                    >
                      {fruit && <span aria-hidden>{fruit.emoji}</span>}
                      <span className="flex-1 truncate">{contract.name || "Unnamed contract"}</span>
                      <span className="font-mono text-xs text-foreground-muted">
                        {shortContractAddress(contract.address)}
                      </span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {formatError && (
            <p className="text-destructive text-xs flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Enter a 40-character hex address (0x optional)
            </p>
          )}

          {normalized !== null && isCageSelected && (
            <div className="bg-warning/10 border border-warning/20 chamfered-sm p-3 text-sm text-foreground">
              The CAGE contract is always sponsorable. Staking to it gains nothing. Choose another contract.
            </div>
          )}

          {normalized !== null && !isCageSelected && isResolving && (
            <p className="text-foreground-muted text-xs flex items-center gap-1.5">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Checking contract…
            </p>
          )}

          {normalized !== null && !isCageSelected && !isResolving && resolveError && (
            <p className="text-destructive text-xs flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {resolveError}
            </p>
          )}

          {normalized !== null && !isCageSelected && !isResolving && !resolveError && infoMatches && !contractInfo.isContract && (
            <p className="text-destructive text-xs flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {contractInfo.exists
                ? "This address is an account, not a contract"
                : "No contract exists at this address"}
            </p>
          )}

          {isValid && (
            <div className="bg-success/10 border border-success/20 chamfered-sm p-3 text-sm text-foreground space-y-1.5">
              <p className="flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <span className="truncate">{label ?? shortContractAddress(normalized)}</span>
              </p>
              {contractInfo.fruitType && (
                <p className="text-foreground-muted">
                  Shard:{" "}
                  <span className="text-foreground">
                    {getFruitColor(contractInfo.fruitType).emoji} {contractInfo.fruitType}
                  </span>
                </p>
              )}
              {threshold !== null && (
                <p className="text-foreground-muted">
                  Sponsorship threshold:{" "}
                  <span className="font-mono text-foreground">{formatXtalExact(threshold)} XTAL</span>
                </p>
              )}
              {currentOnTarget && (
                <p className="text-foreground-muted">
                  Your stake on this contract:{" "}
                  <span className="font-mono text-foreground">{formatXtalExact(currentOnTarget.mature)}</span> mature
                  {" / "}
                  <span className="font-mono text-foreground">{formatXtalExact(currentOnTarget.pending)}</span> pending
                </p>
              )}
              {afterStake !== null && (
                <p className="text-foreground-muted">
                  After this stake:{" "}
                  <span className="font-mono text-foreground">{formatXtalExact(afterStake)} XTAL</span>
                  {threshold !== null && (
                    <span className={meetsThreshold ? "text-success" : "text-warning"}>
                      {meetsThreshold
                        ? " · meets threshold"
                        : ` · short by ${formatXtalExact(subShards(threshold, afterStake))} XTAL`}
                    </span>
                  )}
                </p>
              )}
              <p className="text-xs text-foreground-muted pt-1">{THRESHOLD_COPY}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
