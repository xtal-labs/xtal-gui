import { create } from "zustand";
import type {
  FruitSpec,
  FruitProduction,
  FruitProductionStats,
  FruitDifficultyHistoryPoint,
  ProducedFruit,
  ValidatorInfo,
  ValidatorWalletSummary,
  ValidatorWalletCreationResult,
  NetworkValidatorStats,
  Transaction,
} from "@/types";
import {
  initialTransactionPagination,
  type TransactionPagination,
} from "@/lib/pagination";

interface ValidatorState {
  // Status
  isLoaded: boolean;
  isRunning: boolean;
  address: string | null;
  walletName: string | null;
  withdrawableStake: string;
  matureStake: string;
  pendingStake: string;
  effectiveStake: string;
  availableBalance: string; // UTXO balance (unstaked)
  pendingUnstake: string;   // Pending unstake (locked)
  immatureBalance: string;  // Immature coinbase/withdrawal + unconfirmed incoming
  totalFruitsProduced: number;

  // Network-wide statistics (for dashboard)
  networkStats: NetworkValidatorStats | null;

  // Validator earnings (from coinbase rewards)
  validatorEarnings: string | null; // In shards

  // Fruit specifications (static, fetched once)
  fruitSpecs: FruitSpec[];

  // Production status per fruit
  productions: Record<string, FruitProduction>;

  // Session tracking
  sessionStartTime: number | null;

  // Available validator wallets (separate from normal wallets)
  availableValidatorWallets: ValidatorWalletSummary[];

  // Creation result (for mnemonic display after wallet creation)
  creationResult: ValidatorWalletCreationResult | null;

  // Production stats from WebSocket (global difficulty data)
  productionStats: FruitProductionStats[];
  fruitDifficultyHistory: Record<string, FruitDifficultyHistoryPoint[]>;

  // Recently produced fruits (session-only, newest first)
  recentFruits: ProducedFruit[];

  // Transaction history for the validator wallet (one page at a time)
  transactions: Transaction[];
  transactionPagination: TransactionPagination;

  // Refresh trigger (incremented by WebSocket events to trigger re-fetch)
  refreshTrigger: number;

  // Actions
  addProducedFruit: (fruit: ProducedFruit) => void;
  setLoaded: (loaded: boolean, walletName: string | null, address: string | null) => void;
  setRunning: (running: boolean) => void;
  setBalanceInfo: (
    available: string,
    withdrawableStake: string,
    pendingStake: string,
    pendingUnstake: string,
    immature: string,
  ) => void;
  setNetworkStats: (stats: NetworkValidatorStats | null) => void;
  setValidatorEarnings: (earnings: string | null) => void;
  setFruitSpecs: (specs: FruitSpec[]) => void;
  setProductions: (productions: FruitProduction[]) => void;
  setProductionActive: (fruitType: string, active: boolean) => void;
  setValidatorInfo: (info: ValidatorInfo) => void;
  setTotalFruitsProduced: (count: number) => void;
  startSession: () => void;
  setProductionStats: (stats: FruitProductionStats[]) => void;
  addProductionStatsSnapshot: (currentEpoch: number, stats: FruitProductionStats[]) => void;
  triggerRefresh: () => void;
  setAvailableValidatorWallets: (wallets: ValidatorWalletSummary[]) => void;
  setCreationResult: (result: ValidatorWalletCreationResult | null) => void;
  setTransactionPage: (page: number, transactions: Transaction[], totalCount: number) => void;
  setPageLoading: (loading: boolean) => void;
  reset: () => void;
}

const initialState = {
  isLoaded: false,
  isRunning: false,
  address: null as string | null,
  walletName: null as string | null,
  withdrawableStake: "0",
  matureStake: "0",
  pendingStake: "0",
  effectiveStake: "0",
  availableBalance: "0",
  pendingUnstake: "0",
  immatureBalance: "0",
  totalFruitsProduced: 0,
  networkStats: null as NetworkValidatorStats | null,
  validatorEarnings: null as string | null,
  fruitSpecs: [] as FruitSpec[],
  productions: {} as Record<string, FruitProduction>,
  sessionStartTime: null as number | null,
  availableValidatorWallets: [] as ValidatorWalletSummary[],
  creationResult: null as ValidatorWalletCreationResult | null,
  recentFruits: [] as ProducedFruit[],
  productionStats: [] as FruitProductionStats[],
  fruitDifficultyHistory: {} as Record<string, FruitDifficultyHistoryPoint[]>,
  transactions: [] as Transaction[],
  transactionPagination: { ...initialTransactionPagination },
  refreshTrigger: 0,
};

const MAX_DIFFICULTY_HISTORY_POINTS = 96;

export const useValidatorStore = create<ValidatorState>((set) => ({
  ...initialState,

  setLoaded: (loaded, walletName, address) =>
    set({
      isLoaded: loaded,
      walletName,
      address,
      // Transaction history is wallet-scoped: clear it on both load and unload so
      // a newly loaded validator never shows the previous wallet's rows.
      transactions: [],
      transactionPagination: { ...initialTransactionPagination },
      // Reset other state when unloading
      ...(loaded
        ? {}
        : {
            isRunning: false,
            withdrawableStake: "0",
            matureStake: "0",
            pendingStake: "0",
            effectiveStake: "0",
            availableBalance: "0",
            pendingUnstake: "0",
            immatureBalance: "0",
            totalFruitsProduced: 0,
            validatorEarnings: null,
            productions: {},
            sessionStartTime: null,
            recentFruits: [],
            fruitDifficultyHistory: {},
            refreshTrigger: 0,
          }),
    }),

  setRunning: (running) =>
    set((state) => ({
      isRunning: running,
      sessionStartTime: running && !state.sessionStartTime ? Date.now() : state.sessionStartTime,
    })),

  setBalanceInfo: (available, withdrawableStake, pendingStake, pendingUnstake, immature) =>
    set({
      availableBalance: available,
      withdrawableStake,
      matureStake: withdrawableStake,
      pendingStake,
      pendingUnstake,
      immatureBalance: immature,
    }),

  setNetworkStats: (stats) => set({ networkStats: stats }),

  setValidatorEarnings: (earnings) => set({ validatorEarnings: earnings }),

  setFruitSpecs: (specs) => set({ fruitSpecs: specs }),

  setProductions: (productions) =>
    set({
      productions: productions.reduce(
        (acc, prod) => {
          acc[prod.fruitType] = prod;
          return acc;
        },
        {} as Record<string, FruitProduction>
      ),
    }),

  setProductionActive: (fruitType, active) =>
    set((state) => ({
      productions: {
        ...state.productions,
        [fruitType]: {
          ...state.productions[fruitType],
          isActive: active,
        },
      },
    })),

  setValidatorInfo: (info) =>
    set({
      address: info.address,
      effectiveStake: info.effectiveStake,
      isRunning: info.isActive,
      totalFruitsProduced: info.totalFruitsProduced,
    }),

  setTotalFruitsProduced: (count) => set({ totalFruitsProduced: count }),

  startSession: () => set({ sessionStartTime: Date.now() }),

  addProducedFruit: (fruit) =>
    set((state) => ({
      recentFruits: [fruit, ...state.recentFruits].slice(0, 50),
    })),

  setProductionStats: (stats) => set({ productionStats: stats }),

  addProductionStatsSnapshot: (currentEpoch, stats) =>
    set((state) => {
      const timestamp = Date.now();
      const fruitDifficultyHistory = { ...state.fruitDifficultyHistory };

      for (const stat of stats) {
        const point: FruitDifficultyHistoryPoint = {
          epoch: currentEpoch,
          timestamp,
          difficultyBits: stat.currentDifficultyBits,
          referenceDifficultyBits: stat.referenceDifficultyBits,
          expectedTimeSecs: stat.expectedTimeSecs,
          networkStakeUnits: stat.networkStakeUnits,
        };
        const existing = fruitDifficultyHistory[stat.fruitType] ?? [];
        const next =
          existing.length > 0 && existing[existing.length - 1].epoch === currentEpoch
            ? [...existing.slice(0, -1), point]
            : [...existing, point];

        fruitDifficultyHistory[stat.fruitType] = next.slice(-MAX_DIFFICULTY_HISTORY_POINTS);
      }

      return { fruitDifficultyHistory };
    }),

  triggerRefresh: () =>
    set((state) => ({
      refreshTrigger: state.refreshTrigger + 1,
    })),

  setAvailableValidatorWallets: (wallets) => set({ availableValidatorWallets: wallets }),

  setCreationResult: (result) => set({ creationResult: result }),

  setTransactionPage: (page, transactions, totalCount) =>
    set((state) => ({
      transactions,
      transactionPagination: {
        ...state.transactionPagination,
        currentPage: page,
        totalCount,
        isLoading: false,
      },
    })),

  setPageLoading: (loading) =>
    set((state) => ({
      transactionPagination: {
        ...state.transactionPagination,
        isLoading: loading,
      },
    })),

  reset: () => set(initialState),
}));
