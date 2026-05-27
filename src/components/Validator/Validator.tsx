import { useState, useEffect, useCallback, useRef } from "react";
import {
  Shield,
  Plus,
  Download,
  RefreshCw,
  ChevronDown,
  LogOut,
  Zap,
  Copy,
  Check,
  Cherry,
  Clock,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HashDisplay, StatusBadge, TransactionList } from "@/components/common";
import { FruitDetailPanel } from "@/components/Explorer/FruitDetailPanel";
import { FruitCard } from "./FruitCard";
import { StakeCard } from "./StakeCard";
import { ValidatorDashboardStats } from "./ValidatorDashboard";
import {
  MODAL_LOAD_VALIDATOR,
  MODAL_CREATE_WALLET,
  MODAL_IMPORT_VALIDATOR,
  MODAL_MNEMONIC_DISPLAY,
  MODAL_STAKE,
  MODAL_UNSTAKE,
  LoadValidatorModal,
  CreateWalletModal,
  ImportValidatorModal,
  MnemonicModal,
  StakeModal,
  UnstakeModal,
} from "./ValidatorModals";
import { useValidatorStore, useUiStore } from "@/stores";
import { tauriCommand, useTauriCommand } from "@/hooks";
import { cn, shardsToXtal, formatTimeAgo, parseXtalToShards, copyToClipboard } from "@/lib/utils";
import { getFruitColor } from "@/lib/fruitColors";
import type {
  FruitSpec,
  FruitDetail,
  EligibleFruit,
  ValidatorInfo,
  ValidatorWalletSummary,
  ValidatorWalletCreationResult,
  NetworkValidatorStats,
  ValidatorEarnings,
  ValidatorBalanceInfo,
  FruitProductionStats,
  Transaction,
  TransactionHistoryResponse,
} from "@/types";

interface FeeEstimate {
  fee: number;
  txSize: number;
  inputCount: number;
  outputCount: number;
  feeRate: number;
}

// ============================================================================
// WalletCTACard Component
// ============================================================================

interface WalletCTACardProps {
  availableWallets: ValidatorWalletSummary[];
  onSelectWallet: (walletName: string) => void;
  onCreateWallet: () => void;
  onImportWallet: () => void;
  addToast: (toast: any) => void;
}

function mergeValidatorTransactions(
  previous: Transaction[],
  next: Transaction[],
): Transaction[] {
  const merged = new Map(next.map((tx) => [tx.txid, tx]));

  for (const tx of previous) {
    const isStableIncomingReceive =
      tx.confirmations > 0 &&
      (tx.txType === "receive" || (tx.txType === "standard" && tx.amount > 0));

    if (isStableIncomingReceive && !merged.has(tx.txid)) {
      merged.set(tx.txid, tx);
    }
  }

  return Array.from(merged.values()).sort((a, b) => b.timestamp - a.timestamp);
}

function WalletCTACard({ availableWallets, onSelectWallet, onCreateWallet, onImportWallet, addToast }: WalletCTACardProps) {
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const handleCopyAddress = async (address: string) => {
    const success = await copyToClipboard(address);
    if (success) {
      setCopiedAddress(address);
      addToast({
        type: "success",
        title: "Address copied",
        message: "Validator address copied to clipboard",
        duration: 2000,
      });
      setTimeout(() => setCopiedAddress(null), 2000);
    }
  };

  return (
    <Card variant="crystalline" className="max-w-md mx-auto">
      <CardHeader className="text-center">
        <div className="icon-hex mx-auto mb-4 bg-primary/20" style={{ width: "4rem", height: "4rem" }}>
          <Shield className="h-8 w-8 text-primary" />
        </div>
        <CardTitle className="font-heading tracking-wide">NO VALIDATOR ACTIVE</CardTitle>
        <CardDescription>
          {availableWallets.length > 0
            ? "Select a validator wallet to start"
            : "Create a validator wallet to begin"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {availableWallets.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium font-heading">Available Validator Wallets</p>
            {availableWallets.map((wallet) => (
              <Button
                key={wallet.name}
                variant="outline"
                className="w-full justify-between"
                onClick={() => onSelectWallet(wallet.name)}
              >
                <span className="flex items-center">
                  <Shield className="h-4 w-4 mr-2" />
                  {wallet.name}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-foreground-muted font-mono">
                    {wallet.address}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyAddress(wallet.address);
                    }}
                  >
                    {copiedAddress === wallet.address ? (
                      <Check className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </Button>
            ))}
            <div className="flex gap-2 mt-2">
              <Button
                variant="outline-crystalline"
                className="flex-1"
                onClick={onCreateWallet}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create
              </Button>
              <Button
                variant="outline-crystalline"
                className="flex-1"
                onClick={onImportWallet}
              >
                <Download className="h-4 w-4 mr-2" />
                Import
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center space-y-4">
            <p className="text-sm text-foreground-muted font-heading">
              No validator wallets found. Create or import one to start validating.
            </p>
            <div className="flex gap-2">
              <Button
                variant="crystalline"
                className="flex-1"
                onClick={onCreateWallet}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create
              </Button>
              <Button
                variant="outline-crystalline"
                className="flex-1"
                onClick={onImportWallet}
              >
                <Download className="h-4 w-4 mr-2" />
                Import
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// FruitStakeRequirements Component
// ============================================================================

interface FruitStakeRequirementsProps {
  fruitSpecs: FruitSpec[];
}

function FruitStakeRequirements({ fruitSpecs }: FruitStakeRequirementsProps) {
  if (fruitSpecs.length === 0) return null;

  return (
    <Card variant="crystalline">
      <CardHeader>
        <CardTitle className="text-base font-heading tracking-wide">
          FRUIT STAKE REQUIREMENTS
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2">
          {fruitSpecs.map((spec) => (
            <div
              key={spec.fruitType}
              className="flex items-center justify-between p-2 chamfered-sm bg-muted/50"
            >
              <span className="text-lg">{spec.emoji}</span>
              <span className="text-xs font-mono text-foreground-muted">
                {shardsToXtal(spec.minStake).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// FruitProductionRates Component
// ============================================================================

interface FruitProductionRatesProps {
  stats: FruitProductionStats[];
  isLoading?: boolean;
}

function FruitProductionRates({ stats, isLoading }: FruitProductionRatesProps) {
  if (stats.length === 0 && !isLoading) return null;

  const hasRows = stats.length > 0;
  const hasPersonalStats = stats.some((s) => s.personalExpectedTimeSecs != null);

  return (
    <Card variant="crystalline">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base font-heading tracking-wide">
            FRUIT PRODUCTION RATES
          </CardTitle>
          {isLoading && hasRows && (
            <RefreshCw className="h-4 w-4 shrink-0 animate-spin text-foreground-muted" />
          )}
        </div>
        <CardDescription>
          {hasPersonalStats
            ? "Your expected production rates based on stake"
            : "Current network difficulty (updates each epoch)"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && !hasRows ? (
          <div className="flex items-center justify-center py-4">
            <RefreshCw className="h-5 w-5 animate-spin text-foreground-muted" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-foreground-muted border-b border-border">
                  <th className="text-left py-2 font-heading font-medium">Fruit</th>
                  <th className="text-right py-2 font-heading font-medium">Min Stake</th>
                  <th className="text-right py-2 font-heading font-medium">Difficulty</th>
                  {hasPersonalStats && (
                    <th className="text-right py-2 font-heading font-medium">Your Est.</th>
                  )}
                  <th className="text-right py-2 font-heading font-medium">
                    {hasPersonalStats ? "Network" : "Est. Time"}
                  </th>
                  <th className="text-right py-2 font-heading font-medium">Rate</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => {
                  const isDifficultyChanged = s.currentDifficultyBits !== s.referenceDifficultyBits;
                  return (
                    <tr key={s.fruitType} className="border-b border-border/50">
                      <td className="py-2">
                        <span className="mr-2">{s.emoji}</span>
                        <span className="font-heading">{s.fruitType}</span>
                      </td>
                      <td className="text-right font-mono tabular-nums">
                        {shardsToXtal(s.minStake).toLocaleString()}
                      </td>
                      <td className="text-right">
                        <span className={cn(
                          "font-mono text-xs tabular-nums",
                          isDifficultyChanged && "text-warning"
                        )}>
                          0x{s.currentDifficultyBits.toString(16)}
                        </span>
                        {isDifficultyChanged && (
                          <span className="ml-1 text-xs text-foreground-muted">*</span>
                        )}
                      </td>
                      {hasPersonalStats && (
                        <td className="text-right font-mono tabular-nums font-semibold text-primary">
                          {s.personalExpectedTimeLabel != null
                            ? `~${s.personalExpectedTimeLabel}`
                            : "—"}
                        </td>
                      )}
                      <td className={cn(
                        "text-right font-mono tabular-nums",
                        hasPersonalStats && "text-foreground-muted"
                      )}>
                        {s.expectedTimeLabel}
                      </td>
                      <td
                        className="text-right font-mono tabular-nums text-foreground-muted"
                        title={`${s.expectedStemsLabel} | ${s.winProbabilityLabel}`}
                      >
                        {s.expectedFruitsPerHour}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-xs text-foreground-muted mt-3">
              {hasPersonalStats
                ? "Your Est. = personal expected time based on your stake and effective difficulty"
                : "* Difficulty differs from reference (adjusted based on network production)"}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Validator Component
// ============================================================================

export default function Validator() {
  const isLoaded = useValidatorStore((state) => state.isLoaded);
  const isRunning = useValidatorStore((state) => state.isRunning);
  const address = useValidatorStore((state) => state.address);
  const walletName = useValidatorStore((state) => state.walletName);
  const withdrawableStake = useValidatorStore((state) => state.withdrawableStake);
  const pendingStake = useValidatorStore((state) => state.pendingStake);
  const effectiveStake = useValidatorStore((state) => state.effectiveStake);
  const availableBalance = useValidatorStore((state) => state.availableBalance);
  const pendingUnstake = useValidatorStore((state) => state.pendingUnstake);
  const immatureBalance = useValidatorStore((state) => state.immatureBalance);
  const fruitSpecs = useValidatorStore((state) => state.fruitSpecs);
  const productions = useValidatorStore((state) => state.productions);
  const totalFruitsProduced = useValidatorStore((state) => state.totalFruitsProduced);
  const sessionStartTime = useValidatorStore((state) => state.sessionStartTime);
  const availableValidatorWallets = useValidatorStore((state) => state.availableValidatorWallets);
  const creationResult = useValidatorStore((state) => state.creationResult);
  const networkStats = useValidatorStore((state) => state.networkStats);
  const validatorEarnings = useValidatorStore((state) => state.validatorEarnings);
  const refreshTrigger = useValidatorStore((state) => state.refreshTrigger);
  const recentFruits = useValidatorStore((state) => state.recentFruits);
  const wsProductionStats = useValidatorStore((state) => state.productionStats);
  const fruitDifficultyHistory = useValidatorStore((state) => state.fruitDifficultyHistory);
  const setLoaded = useValidatorStore((state) => state.setLoaded);
  const setRunning = useValidatorStore((state) => state.setRunning);
  const setFruitSpecs = useValidatorStore((state) => state.setFruitSpecs);
  const setProductions = useValidatorStore((state) => state.setProductions);
  const setProductionActive = useValidatorStore((state) => state.setProductionActive);
  const setValidatorInfo = useValidatorStore((state) => state.setValidatorInfo);
  const setAvailableValidatorWallets = useValidatorStore((state) => state.setAvailableValidatorWallets);
  const setCreationResult = useValidatorStore((state) => state.setCreationResult);
  const setNetworkStats = useValidatorStore((state) => state.setNetworkStats);
  const setValidatorEarnings = useValidatorStore((state) => state.setValidatorEarnings);
  const setBalanceInfo = useValidatorStore((state) => state.setBalanceInfo);
  const startSession = useValidatorStore((state) => state.startSession);
  const reset = useValidatorStore((state) => state.reset);

  const activeModal = useUiStore((state) => state.activeModal);
  const openModal = useUiStore((state) => state.openModal);
  const closeModal = useUiStore((state) => state.closeModal);
  const addToast = useUiStore((state) => state.addToast);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [loadingFruit, setLoadingFruit] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [stakeAmount, setStakeAmount] = useState("");
  const [newWalletName, setNewWalletName] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [hideBalances, setHideBalances] = useState(false);
  const [importStep, setImportStep] = useState<"mnemonic" | "password">("mnemonic");
  const [importWords, setImportWords] = useState<string[]>([]);
  const [importWalletName, setImportWalletName] = useState("");
  const [importPassword, setImportPassword] = useState("");
  const [importConfirmPassword, setImportConfirmPassword] = useState("");
  const [importProcessing, setImportProcessing] = useState(false);
  const [showImportPassword, setShowImportPassword] = useState(false);
  const [personalProductionStats, setPersonalProductionStats] = useState<FruitProductionStats[]>([]);
  const [isLoadingProductionStats, setIsLoadingProductionStats] = useState(false);
  const [isFruitDetailOpen, setIsFruitDetailOpen] = useState(false);
  const [stakeFeeEstimate, setStakeFeeEstimate] = useState<FeeEstimate | null>(null);
  const [isStakeFeeEstimating, setIsStakeFeeEstimating] = useState(false);
  const [stakeFeeEstimateError, setStakeFeeEstimateError] = useState<string | null>(null);
  const [unstakeFeeEstimate, setUnstakeFeeEstimate] = useState<FeeEstimate | null>(null);
  const [isUnstakeFeeEstimating, setIsUnstakeFeeEstimating] = useState(false);
  const [unstakeFeeEstimateError, setUnstakeFeeEstimateError] = useState<string | null>(null);
  const lastEarningsFetchRef = useRef(0);

  const {
    data: fruitDetail,
    execute: fetchFruitDetail,
    reset: resetFruitDetail,
    isLoading: isFruitDetailLoading,
  } = useTauriCommand<FruitDetail | null>("get_fruit_detail");

  const handleOpenFruitDetail = useCallback(
    async (fruitHash: string, stemHash: string) => {
      setIsFruitDetailOpen(true);
      const detail = await fetchFruitDetail({ hash: fruitHash, blockHash: stemHash });
      if (!detail) {
        setIsFruitDetailOpen(false);
      }
    },
    [fetchFruitDetail]
  );

  const handleCloseFruitDetail = useCallback(() => {
    setIsFruitDetailOpen(false);
    resetFruitDetail();
  }, [resetFruitDetail]);

  // Use WebSocket-provided production stats as base, overlay personalized data when available
  const productionStats = isLoaded && personalProductionStats.length > 0
    ? personalProductionStats
    : wsProductionStats;
  const totalStake = withdrawableStake + pendingStake;
  const parsedStakeAmount = parseXtalToShards(stakeAmount);

  // Modal state
  const showLoadModal = activeModal === MODAL_LOAD_VALIDATOR;
  const showCreateModal = activeModal === MODAL_CREATE_WALLET;
  const showImportModal = activeModal === MODAL_IMPORT_VALIDATOR;
  const showMnemonicModal = activeModal === MODAL_MNEMONIC_DISPLAY;
  const showStakeModal = activeModal === MODAL_STAKE;
  const showUnstakeModal = activeModal === MODAL_UNSTAKE;

  useEffect(() => {
    if (!showStakeModal || !address || parsedStakeAmount === null || parsedStakeAmount <= 0) {
      setStakeFeeEstimate(null);
      setIsStakeFeeEstimating(false);
      setStakeFeeEstimateError(null);
      return;
    }

    let isCurrent = true;
    setIsStakeFeeEstimating(true);
    setStakeFeeEstimateError(null);

    const timer = window.setTimeout(async () => {
      try {
        const result = await tauriCommand<FeeEstimate>("estimate_validator_stake_fee", {
          address,
          amount: parsedStakeAmount,
        });
        if (isCurrent) {
          setStakeFeeEstimate(result);
          setStakeFeeEstimateError(null);
        }
      } catch (err) {
        if (isCurrent) {
          setStakeFeeEstimate(null);
          setStakeFeeEstimateError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (isCurrent) {
          setIsStakeFeeEstimating(false);
        }
      }
    }, 250);

    return () => {
      isCurrent = false;
      window.clearTimeout(timer);
    };
  }, [showStakeModal, address, parsedStakeAmount]);

  useEffect(() => {
    if (!showUnstakeModal || !address || parsedStakeAmount === null || parsedStakeAmount <= 0) {
      setUnstakeFeeEstimate(null);
      setIsUnstakeFeeEstimating(false);
      setUnstakeFeeEstimateError(null);
      return;
    }

    let isCurrent = true;
    setIsUnstakeFeeEstimating(true);
    setUnstakeFeeEstimateError(null);

    const timer = window.setTimeout(async () => {
      try {
        const result = await tauriCommand<FeeEstimate>("estimate_validator_unstake_fee", {
          address,
          amount: parsedStakeAmount,
        });
        if (isCurrent) {
          setUnstakeFeeEstimate(result);
          setUnstakeFeeEstimateError(null);
        }
      } catch (err) {
        if (isCurrent) {
          setUnstakeFeeEstimate(null);
          setUnstakeFeeEstimateError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (isCurrent) {
          setIsUnstakeFeeEstimating(false);
        }
      }
    }, 250);

    return () => {
      isCurrent = false;
      window.clearTimeout(timer);
    };
  }, [showUnstakeModal, address, parsedStakeAmount]);

  const canSubmitStake =
    parsedStakeAmount !== null &&
    parsedStakeAmount > 0 &&
    stakeFeeEstimate !== null &&
    !isStakeFeeEstimating &&
    !stakeFeeEstimateError &&
    parsedStakeAmount + stakeFeeEstimate.fee <= availableBalance;

  const canSubmitUnstake =
    parsedStakeAmount !== null &&
    parsedStakeAmount > 0 &&
    unstakeFeeEstimate !== null &&
    !isUnstakeFeeEstimating &&
    !unstakeFeeEstimateError;

  const refreshValidatorStatus = useCallback(async () => {
    if (!address) return;

    try {
      const [status, eligible] = await Promise.all([
        tauriCommand<ValidatorInfo | null>("get_validator_status", { address }),
        tauriCommand<EligibleFruit[]>("get_eligible_fruits", { address }),
      ]);

      if (!status) {
        setRunning(false);
        setProductions([]);
        return;
      }

      setValidatorInfo(status);

      const activeProductions = new Set(status.activeProductions);
      const backendCounts: Record<string, number> = {};
      for (const ps of status.productionStats ?? []) {
        backendCounts[ps.fruitType] = ps.fruitsProduced;
      }

      const prods = eligible.map((e) => ({
        fruitType: e.fruitType,
        isActive: activeProductions.has(e.fruitType),
        isEligible: e.isEligible,
        fruitsProduced: backendCounts[e.fruitType] ?? 0,
        minStake: e.minStake,
        shortfall: e.shortfall,
        emoji: e.emoji,
      }));
      setProductions(prods);
    } catch (err) {
      console.error("Failed to refresh validator status:", err);
    }
  }, [address, setProductions, setRunning, setValidatorInfo]);

  // Fetch network stats
  const fetchNetworkStats = useCallback(async () => {
    try {
      const stats = await tauriCommand<NetworkValidatorStats>("get_network_validator_stats");
      setNetworkStats(stats);
    } catch (err) {
      console.error("Failed to fetch network stats:", err);
    }
  }, [setNetworkStats]);

  // Fetch validator earnings
  const fetchValidatorEarnings = useCallback(async () => {
    if (!address) return;
    try {
      const earnings = await tauriCommand<ValidatorEarnings>("get_validator_earnings", { address });
      setValidatorEarnings(earnings.totalEarned);
    } catch (err) {
      console.error("Failed to fetch validator earnings:", err);
    }
  }, [address, setValidatorEarnings]);

  // Fetch validator balance info (available, staked, pending)
  const fetchBalanceInfo = useCallback(async () => {
    if (!address) return;
    try {
      const info = await tauriCommand<ValidatorBalanceInfo>("get_validator_balance_info", { address });
      setBalanceInfo(
        info.availableBalance,
        info.withdrawableStake ?? info.matureStake,
        info.pendingStake,
        info.pendingUnstake,
        info.immatureBalance,
      );
    } catch (err) {
      console.error("Failed to fetch balance info:", err);
    }
  }, [address, setBalanceInfo]);

  // Fetch transaction history for validator wallet
  const fetchTransactions = useCallback(async () => {
    if (!address) return;
    try {
      const response = await tauriCommand<TransactionHistoryResponse>("get_transaction_history", {
        limit: 50,
        address: address,
      });
      setTransactions((previous) => mergeValidatorTransactions(previous, response.transactions));
    } catch (err) {
      console.error("Failed to fetch transactions:", err);
    }
  }, [address]);

  // Fetch personalized fruit production stats (with validator-specific effective difficulty)
  const fetchProductionStats = useCallback(async () => {
    setIsLoadingProductionStats(true);
    try {
      const stats = await tauriCommand<FruitProductionStats[]>(
        "get_fruit_production_stats",
        { address: isLoaded ? address : null }
      );
      setPersonalProductionStats(stats);
    } catch (err) {
      console.error("Failed to fetch production stats:", err);
    } finally {
      setIsLoadingProductionStats(false);
    }
  }, [isLoaded, address]);

  // Fetch network stats once on mount (WebSocket broadcaster keeps it updated after)
  useEffect(() => {
    fetchNetworkStats();
  }, [fetchNetworkStats]);

  // Fetch fruit specifications and validator wallets on mount
  useEffect(() => {
    fetchFruitSpecs();
    fetchValidatorWallets();
  }, []);

  // Fetch validator status, earnings, balance, and transactions when loaded
  useEffect(() => {
    if (isLoaded && address) {
      refreshValidatorStatus();
      fetchValidatorEarnings();
      fetchBalanceInfo();
      fetchTransactions();
      fetchProductionStats();
    }
  }, [
    isLoaded,
    address,
    fetchBalanceInfo,
    fetchProductionStats,
    fetchTransactions,
    fetchValidatorEarnings,
    refreshValidatorStatus,
  ]);

  // Refresh validator data when triggered by new blocks or fruit production events
  useEffect(() => {
    if (refreshTrigger > 0 && isLoaded && address) {
      refreshValidatorStatus();
      fetchBalanceInfo();
      fetchTransactions();
      fetchProductionStats();

      // Throttle earnings refresh to once per 60s (expensive blockchain scan)
      const now = Date.now();
      if (now - lastEarningsFetchRef.current > 60_000) {
        lastEarningsFetchRef.current = now;
        fetchValidatorEarnings();
      }
    }
  }, [
    refreshTrigger,
    isLoaded,
    address,
    fetchBalanceInfo,
    fetchProductionStats,
    fetchTransactions,
    fetchValidatorEarnings,
    refreshValidatorStatus,
  ]);

  const fetchFruitSpecs = async () => {
    try {
      const specs = await tauriCommand<FruitSpec[]>("get_fruit_specifications");
      setFruitSpecs(specs);
    } catch (err) {
      console.error("Failed to fetch fruit specs:", err);
    }
  };

  const fetchValidatorWallets = async () => {
    try {
      const wallets = await tauriCommand<ValidatorWalletSummary[]>("list_validator_wallets");
      setAvailableValidatorWallets(wallets);
    } catch (err) {
      console.error("Failed to fetch validator wallets:", err);
    }
  };

  const handleLoadValidator = async () => {
    if (!selectedWallet || !password) {
      setError("Please select a wallet and enter password");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await tauriCommand<{ address: string; eligibleFruits: string[]; startedCount: number }>(
        "start_validator",
        { walletName: selectedWallet, password }
      );

      setLoaded(true, selectedWallet, result.address);
      setRunning(false);
      startSession();
      closeModal();
      setPassword("");
      setSelectedWallet(null);

      addToast({
        type: "success",
        title: result.startedCount > 0 ? "Validator started" : "Validator loaded",
        message: result.startedCount > 0
          ? `Started ${result.startedCount} fruit productions`
          : "Validator loaded. Start fruit production manually.",
        duration: 5000,
      });

      await Promise.all([
        refreshValidatorStatus(),
        fetchBalanceInfo(),
        fetchTransactions(),
        fetchProductionStats(),
        fetchValidatorEarnings(),
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      addToast({
        type: "error",
        title: "Failed to start validator",
        message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopValidator = async () => {
    if (!address) return;

    setIsLoading(true);
    try {
      await tauriCommand("stop_validator", { address });
      reset();
      fetchValidatorWallets(); // Refresh wallet list after reset
      addToast({
        type: "success",
        title: "Validator stopped",
        message: "All fruit productions have been stopped",
        duration: 3000,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addToast({
        type: "error",
        title: "Failed to stop validator",
        message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateValidatorWallet = async () => {
    if (!newWalletName.trim()) {
      setError("Please enter a wallet name");
      return;
    }
    if (!password) {
      setError("Please enter a password");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await tauriCommand<ValidatorWalletCreationResult>(
        "create_validator_wallet",
        { walletName: newWalletName.trim(), password }
      );

      // Store the result to show mnemonic
      setCreationResult(result);

      // Close create modal, open mnemonic modal
      closeModal();
      openModal(MODAL_MNEMONIC_DISPLAY);

      // Refresh wallet list
      await fetchValidatorWallets();

      addToast({
        type: "success",
        title: "Validator wallet created",
        message: `Created wallet: ${result.walletName}`,
        duration: 5000,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMnemonicConfirmed = () => {
    // Clear sensitive data and close modal
    setCreationResult(null);
    setPassword("");
    setConfirmPassword("");
    setNewWalletName("");
    closeModal();
  };

  const handleImportMnemonicSubmit = (words: string[], walletName: string) => {
    setImportWords(words);
    setImportWalletName(walletName);
    setImportStep("password");
  };

  const handleImportValidatorWallet = async () => {
    if (!importPassword) {
      setError("Please enter a password");
      return;
    }
    if (importPassword !== importConfirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (importPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setImportProcessing(true);
    setError(null);

    try {
      const mnemonic = importWords.join(" ");
      const result = await tauriCommand<ValidatorWalletCreationResult>(
        "import_validator_wallet",
        { walletName: importWalletName, password: importPassword, mnemonic }
      );

      closeModal();
      // Reset import state
      setImportStep("mnemonic");
      setImportWords([]);
      setImportWalletName("");
      setImportPassword("");
      setImportConfirmPassword("");

      // Refresh wallet list
      await fetchValidatorWallets();

      addToast({
        type: "success",
        title: "Validator wallet imported",
        message: `Imported wallet: ${result.walletName}`,
        duration: 5000,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setImportProcessing(false);
    }
  };

  const handleToggleFruit = async (fruitType: string, active: boolean) => {
    if (!address) return;

    setLoadingFruit(fruitType);
    try {
      if (active) {
        await tauriCommand("start_fruit_production", { address, fruitType: fruitType.toLowerCase() });
      } else {
        await tauriCommand("stop_fruit_production", { address, fruitType: fruitType.toLowerCase() });
      }
      setProductionActive(fruitType, active);
      setRunning(active || Object.values(productions).some((prod) => prod.fruitType !== fruitType && prod.isActive));
      await refreshValidatorStatus();

      addToast({
        type: "fruit",
        fruitType,
        title: active ? `${fruitType} Started` : `${fruitType} Stopped`,
        message: `${fruitType} production ${active ? "started" : "stopped"}`,
        duration: 2000,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addToast({
        type: "error",
        title: "Failed to toggle production",
        message,
      });
    } finally {
      setLoadingFruit(null);
    }
  };

  const handleStake = async () => {
    if (!address || !stakeAmount) return;

    const amountShards = parseXtalToShards(stakeAmount);
    if (amountShards === null || amountShards <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    if (!stakeFeeEstimate || stakeFeeEstimateError || isStakeFeeEstimating) {
      setError(stakeFeeEstimateError || "Fee estimate is not ready yet");
      return;
    }

    // Check if user has sufficient balance including the builder-estimated fee.
    if (amountShards + stakeFeeEstimate.fee > availableBalance) {
      setError(`Insufficient balance. Available: ${shardsToXtal(availableBalance).toLocaleString()} XTAL`);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await tauriCommand("validator_stake", { address, amount: amountShards });

      closeModal();
      setStakeAmount("");

      addToast({
        type: "stake",
        title: "Stake transaction submitted",
        message: `Staking ${stakeAmount.trim()} XTAL`,
        duration: 5000,
      });

      // Refresh immediately so the pending tx appears
      await Promise.all([
        refreshValidatorStatus(),
        fetchBalanceInfo(),
        fetchTransactions(),
        fetchProductionStats(),
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnstake = async () => {
    if (!address || !stakeAmount) return;

    const amountShards = parseXtalToShards(stakeAmount);
    if (amountShards === null || amountShards <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    if (!unstakeFeeEstimate || unstakeFeeEstimateError || isUnstakeFeeEstimating) {
      setError(unstakeFeeEstimateError || "Fee estimate is not ready yet");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await tauriCommand("validator_unstake", { address, amount: amountShards });

      closeModal();
      setStakeAmount("");

      addToast({
        type: "unstake",
        title: "Unstake transaction submitted",
        message: `Unstaking ${stakeAmount.trim()} XTAL (locked for 1 epoch)`,
        duration: 5000,
      });

      // Refresh immediately so the pending tx appears
      await Promise.all([
        refreshValidatorStatus(),
        fetchBalanceInfo(),
        fetchTransactions(),
        fetchProductionStats(),
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectWallet = (walletName: string) => {
    setSelectedWallet(walletName);
    openModal(MODAL_LOAD_VALIDATOR);
  };

  const getSessionDuration = () => {
    if (!sessionStartTime) return "0m";
    const elapsed = Date.now() - sessionStartTime;
    const hours = Math.floor(elapsed / 3600000);
    const minutes = Math.floor((elapsed % 3600000) / 60000);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const activeCount = Object.values(productions).filter((p) => p.isActive).length;

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div>
            <h1 className="text-2xl font-heading font-bold tracking-wide text-foreground">VALIDATOR</h1>
            {isLoaded ? (
              <div className="flex items-center gap-2 mt-1">
                <p className="text-foreground-secondary text-sm font-heading tracking-wide">
                  {walletName}
                </p>
                {address && (
                  <HashDisplay hash={address} truncate={false} showTooltip={false} />
                )}
              </div>
            ) : (
              <p className="text-foreground-secondary text-sm mt-1 font-heading tracking-wide">
                Stake XTAL to produce fruits
              </p>
            )}
          </div>
          {isLoaded && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="mt-1">
                  <ChevronDown className="h-4 w-4 text-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Validator Actions</DropdownMenuLabel>
                <DropdownMenuItem onClick={refreshValidatorStatus}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Status
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleStopValidator} className="text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4 mr-2" />
                  Stop Validator
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isLoaded && (
            <Button
              variant="ghost"
              size="icon"
              onClick={refreshValidatorStatus}
              disabled={isLoading}
            >
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            </Button>
          )}
          <StatusBadge
            status={isLoaded && isRunning ? "validating" : "idle"}
            label={isLoaded && isRunning && activeCount > 0 ? `VALIDATING (${activeCount})` : undefined}
          />
        </div>
      </div>

      {/* Conditional content based on validator state */}
      {!isLoaded ? (
        <>
          {/* Dashboard Stats Grid */}
          <ValidatorDashboardStats
            networkStats={networkStats}
            validatorEarnings={null}
            isValidatorLoaded={false}
            hideBalances={hideBalances}
          />

          {/* Wallet CTA Card */}
          <WalletCTACard
            availableWallets={availableValidatorWallets}
            onSelectWallet={handleSelectWallet}
            onCreateWallet={() => openModal(MODAL_CREATE_WALLET)}
            onImportWallet={() => openModal(MODAL_IMPORT_VALIDATOR)}
            addToast={addToast}
          />

          {/* Fruit Stake Requirements */}
          <FruitStakeRequirements fruitSpecs={fruitSpecs} />

          {/* Fruit Production Rates */}
          <FruitProductionRates stats={productionStats} isLoading={isLoadingProductionStats} />
        </>
      ) : (
        <>
          {/* Stake Card - at top when validator is loaded */}
          <StakeCard
            totalStake={totalStake}
            withdrawableStake={withdrawableStake}
            activeStake={effectiveStake}
            pendingStake={pendingStake}
            availableBalance={availableBalance}
            pendingUnstake={pendingUnstake}
            immatureBalance={immatureBalance}
            hideBalances={hideBalances}
            onToggleHide={() => setHideBalances(!hideBalances)}
            onStake={() => openModal(MODAL_STAKE)}
            onUnstake={() => openModal(MODAL_UNSTAKE)}
          />

          {/* Dashboard Stats Grid */}
          <ValidatorDashboardStats
            networkStats={networkStats}
            validatorEarnings={validatorEarnings}
            isValidatorLoaded={true}
            hideBalances={hideBalances}
          />

          {/* Fruit Production Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-heading font-semibold tracking-wide text-foreground flex items-center gap-2">
                <Zap className="h-5 w-5 text-accent" />
                FRUIT PRODUCTION
              </h2>
              <Badge variant={activeCount > 0 ? "success" : "secondary"} shape="chamfered" diamond pulse={activeCount > 0}>
                {activeCount} Active
              </Badge>
            </div>

            {/* Fruit Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
              {Object.values(productions).map((prod) => {
                // Find production stats for this fruit type
                const stats = productionStats.find((s) => s.fruitType === prod.fruitType);
                const difficultyChanged = stats && stats.currentDifficultyBits !== stats.referenceDifficultyBits;
                const difficultyUp = difficultyChanged && stats.currentDifficultyBits < stats.referenceDifficultyBits;

                return (
                  <FruitCard
                    key={prod.fruitType}
                    fruitType={prod.fruitType}
                    emoji={prod.emoji}
                    minStake={prod.minStake}
                    isEligible={prod.isEligible}
                    isActive={prod.isActive}
                    shortfall={prod.shortfall}
                    fruitsProduced={prod.fruitsProduced}
                    onToggle={(active) => handleToggleFruit(prod.fruitType, active)}
                    isLoading={loadingFruit === prod.fruitType}
                    expectedTimeSecs={stats?.expectedTimeSecs}
                    personalExpectedTimeSecs={stats?.personalExpectedTimeSecs}
                    expectedTimeLabel={stats?.expectedTimeLabel}
                    personalExpectedTimeLabel={stats?.personalExpectedTimeLabel}
                    difficultyChanged={difficultyChanged}
                    difficultyUp={difficultyUp}
                    targetIntervalSecs={stats?.targetIntervalSecs}
                    difficultyHistory={fruitDifficultyHistory[prod.fruitType] ?? []}
                    maxSizeBytes={fruitSpecs.find((s) => s.fruitType === prod.fruitType)?.maxSizeBytes}
                    maxFuel={fruitSpecs.find((s) => s.fruitType === prod.fruitType)?.maxFuel}
                  />
                );
              })}
            </div>
          </div>

          {/* Stats Footer */}
          <Card variant="crystalline">
            <CardContent className="py-4">
              <div className="flex items-center justify-around text-center">
                <div>
                  <p className="text-xs font-heading text-foreground-muted tracking-wide">TOTAL PRODUCED</p>
                  <p className="text-xl font-heading font-bold tabular-nums text-foreground">
                    {totalFruitsProduced}
                  </p>
                </div>
                <div className="w-px h-8 bg-border" />
                <div>
                  <p className="text-xs font-heading text-foreground-muted tracking-wide">SESSION TIME</p>
                  <p className="text-xl font-heading font-bold tabular-nums text-foreground">
                    {getSessionDuration()}
                  </p>
                </div>
                <div className="w-px h-8 bg-border" />
                <div>
                  <p className="text-xs font-heading text-foreground-muted tracking-wide">ACTIVE FRUITS</p>
                  <p className="text-xl font-heading font-bold tabular-nums text-foreground">
                    {activeCount} / {Object.keys(productions).length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recently Produced Fruits */}
          <Card variant="crystalline">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-heading tracking-wide flex items-center gap-2">
                <div className="icon-hex icon-hex-sm bg-accent/20">
                  <Cherry className="h-3.5 w-3.5 text-accent" />
                </div>
                RECENTLY PRODUCED
                {recentFruits.length > 0 && (
                  <Badge variant="secondary" className="ml-auto">
                    {recentFruits.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentFruits.length > 0 ? (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {recentFruits.map((fruit, index) => {
                    const color = getFruitColor(fruit.fruitType);
                    return (
                      <button
                        key={`${fruit.fruitHash}-${index}`}
                        onClick={() => handleOpenFruitDetail(fruit.fruitHash, fruit.stemHash)}
                        className={cn(
                          "w-full flex items-center justify-between p-3 rounded-lg border",
                          "transition-colors cursor-pointer text-left",
                          "hover:brightness-125",
                          color.border,
                          "bg-gradient-to-r",
                          color.bg,
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-lg leading-none">{color.emoji}</span>
                          <div>
                            <p className="font-mono text-sm font-medium">
                              {fruit.fruitHash.slice(0, 16)}...
                            </p>
                            <p className="text-xs text-foreground-muted flex items-center gap-2">
                              <span className={cn("font-heading", color.icon)}>{fruit.fruitType}</span>
                              <span className="opacity-50">|</span>
                              <span>
                                {fruit.transactionCount} tx{fruit.transactionCount !== 1 ? "s" : ""}
                              </span>
                            </p>
                          </div>
                        </div>
                        <div className="text-right text-xs text-foreground-muted flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTimeAgo(fruit.producedAt)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-foreground-muted">
                  <div className="icon-hex mx-auto mb-3 bg-muted">
                    <Cherry className="h-5 w-5 opacity-50" />
                  </div>
                  <p className="font-heading">No fruits produced yet</p>
                  <p className="text-xs mt-1">
                    Produced fruits will appear here during this session
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <FruitDetailPanel
            detail={fruitDetail}
            isOpen={isFruitDetailOpen}
            onClose={handleCloseFruitDetail}
            isLoading={isFruitDetailLoading}
          />

          {/* Fruit Production Rates */}
          <FruitProductionRates stats={productionStats} isLoading={isLoadingProductionStats} />

          {/* Validator Transactions */}
          <TransactionList
            transactions={transactions}
            surface="validator"
            title="TRANSACTIONS"
            address={address ?? undefined}
          />
        </>
      )}

      {/* ========== MODALS ========== */}

      <LoadValidatorModal
        show={showLoadModal}
        selectedWallet={selectedWallet}
        password={password}
        showPassword={showPassword}
        isLoading={isLoading}
        error={error}
        onClose={() => closeModal()}
        onPasswordChange={setPassword}
        onSubmit={handleLoadValidator}
        onTogglePasswordVisibility={() => setShowPassword(!showPassword)}
      />

      <CreateWalletModal
        show={showCreateModal}
        newWalletName={newWalletName}
        password={password}
        confirmPassword={confirmPassword}
        showPassword={showPassword}
        isLoading={isLoading}
        error={error}
        onClose={() => { closeModal(); setError(null); setNewWalletName(""); setPassword(""); setConfirmPassword(""); }}
        onNewWalletNameChange={setNewWalletName}
        onPasswordChange={setPassword}
        onConfirmPasswordChange={setConfirmPassword}
        onSubmit={handleCreateValidatorWallet}
        onTogglePasswordVisibility={() => setShowPassword(!showPassword)}
      />

      <ImportValidatorModal
        show={showImportModal}
        step={importStep}
        password={importPassword}
        confirmPassword={importConfirmPassword}
        showPassword={showImportPassword}
        isProcessing={importProcessing}
        error={error}
        onClose={() => {
          closeModal();
          setError(null);
          setImportStep("mnemonic");
          setImportWords([]);
          setImportWalletName("");
          setImportPassword("");
          setImportConfirmPassword("");
        }}
        onMnemonicSubmit={handleImportMnemonicSubmit}
        onPasswordChange={setImportPassword}
        onConfirmPasswordChange={setImportConfirmPassword}
        onTogglePasswordVisibility={() => setShowImportPassword(!showImportPassword)}
        onBack={() => {
          setImportStep("mnemonic");
          setImportPassword("");
          setImportConfirmPassword("");
          setError(null);
        }}
        onSubmit={handleImportValidatorWallet}
      />

      <MnemonicModal
        show={showMnemonicModal}
        creationResult={creationResult}
        onConfirm={handleMnemonicConfirmed}
      />

      <StakeModal
        show={showStakeModal}
        stakeAmount={stakeAmount}
        availableBalance={availableBalance}
        totalStake={totalStake}
        effectiveStake={effectiveStake}
        pendingStake={pendingStake}
        feeEstimate={stakeFeeEstimate}
        isFeeEstimating={isStakeFeeEstimating}
        feeEstimateError={stakeFeeEstimateError}
        canSubmit={canSubmitStake}
        isLoading={isLoading}
        error={error}
        onClose={() => { closeModal(); setStakeAmount(""); setError(null); }}
        onStakeAmountChange={setStakeAmount}
        onSubmit={handleStake}
      />

      <UnstakeModal
        show={showUnstakeModal}
        stakeAmount={stakeAmount}
        withdrawableStake={withdrawableStake}
        pendingUnstake={pendingUnstake}
        feeEstimate={unstakeFeeEstimate}
        isFeeEstimating={isUnstakeFeeEstimating}
        feeEstimateError={unstakeFeeEstimateError}
        canSubmit={canSubmitUnstake}
        isLoading={isLoading}
        error={error}
        onClose={() => { closeModal(); setStakeAmount(""); setError(null); }}
        onStakeAmountChange={setStakeAmount}
        onSubmit={handleUnstake}
      />
    </div>
  );
}
