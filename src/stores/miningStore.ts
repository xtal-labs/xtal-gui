import { create } from "zustand";
import type { MiningStatus, MiningStats, MiningHistoryPoint, MinedBlock } from "@/types";

// 24 hours worth of data at 500ms intervals
const MAX_HISTORY_POINTS = 172800;

// Maximum mined blocks to keep in memory
const MAX_MINED_BLOCKS = 100;

interface MiningState {
  // Status
  isActive: boolean;
  threads: number;
  maxThreads: number;

  // Snapshotted wallet name (locked at mining start)
  miningWalletName: string | null;

  // Stats
  stats: MiningStats;

  // History for charts
  hashRateHistory: MiningHistoryPoint[];

  // Mined blocks history
  minedBlocks: MinedBlock[];

  // Actions
  setStatus: (status: MiningStatus) => void;
  setStats: (stats: MiningStats) => void;
  setActive: (active: boolean) => void;
  setThreads: (threads: number) => void;
  setMiningWalletName: (name: string | null) => void;
  addMinedBlock: (block: MinedBlock) => void;
  setMinedBlocks: (blocks: MinedBlock[]) => void;
  reset: () => void;
}

const initialStats: MiningStats = {
  isRunning: false,
  hashRate: 0,
  hashRateMH: 0,
  stemsFound: 0,
  leavesFound: 0,
  staleBlocks: 0,
  uptime: 0,
};

const initialState = {
  isActive: false,
  threads: 1,
  maxThreads: navigator.hardwareConcurrency || 4,
  miningWalletName: null as string | null,
  stats: initialStats,
  hashRateHistory: [],
  minedBlocks: [] as MinedBlock[],
};

export const useMiningStore = create<MiningState>((set) => ({
  ...initialState,

  setStatus: (status) =>
    set({
      isActive: status.isActive,
      threads: status.threads,
      maxThreads: status.maxThreads,
      miningWalletName: status.walletName,
    }),

  setStats: (stats) =>
    set((state) => {
      // Only add history points when actively mining with non-zero hashrate
      if (stats.isRunning && stats.hashRate > 0) {
        const newPoint: MiningHistoryPoint = {
          timestamp: Date.now(),
          hashRate: stats.hashRate,
        };
        return {
          stats,
          isActive: stats.isRunning,
          hashRateHistory: [...state.hashRateHistory, newPoint].slice(-MAX_HISTORY_POINTS),
        };
      }

      // When not mining, just update stats (don't add to history)
      return {
        stats,
        isActive: stats.isRunning,
        ...(stats.isRunning ? {} : { miningWalletName: null }),
      };
    }),

  setActive: (active) => set({ isActive: active }),

  setThreads: (threads) => set({ threads }),

  setMiningWalletName: (name) => set({ miningWalletName: name }),

  addMinedBlock: (block) =>
    set((state) => ({
      minedBlocks: [block, ...state.minedBlocks].slice(0, MAX_MINED_BLOCKS),
    })),

  setMinedBlocks: (blocks) =>
    set({
      minedBlocks: blocks.slice(0, MAX_MINED_BLOCKS),
    }),

  reset: () => set(initialState),
}));
