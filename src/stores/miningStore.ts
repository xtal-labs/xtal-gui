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

  // In-flight optimistic toggle guard. While a start/stop is pending, the live
  // `stats.isRunning` flag lags the user's intent for ~500ms-1s; `pendingActive`
  // holds the requested state so stale ticks can't flip the button back.
  pendingActive: boolean | null;
  pendingSince: number;

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
  beginToggle: (target: boolean) => void;
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
  pendingActive: null as boolean | null,
  pendingSince: 0,
  miningWalletName: null as string | null,
  stats: initialStats,
  hashRateHistory: [],
  minedBlocks: [] as MinedBlock[],
};

// Failsafe: if the backend never confirms a requested toggle within this window,
// stop suppressing live updates so a genuinely stopped/started miner can't get
// stuck showing the opposite state.
const GUARD_MS = 6000;

/**
 * Resolve the next `isActive` from an incoming live flag, honoring an in-flight
 * optimistic toggle. When a toggle is pending we only accept the live value once
 * it confirms the request (or the guard expires); a contradicting value is treated
 * as a stale snapshot and ignored. Returns the active flag plus the (possibly
 * cleared) guard fields.
 */
function reconcileActive(
  state: { isActive: boolean; pendingActive: boolean | null; pendingSince: number },
  incoming: boolean,
): { isActive: boolean; pendingActive: boolean | null; pendingSince: number } {
  if (state.pendingActive === null) {
    return { isActive: incoming, pendingActive: null, pendingSince: 0 };
  }
  if (incoming === state.pendingActive || Date.now() - state.pendingSince >= GUARD_MS) {
    return { isActive: incoming, pendingActive: null, pendingSince: 0 };
  }
  return {
    isActive: state.isActive,
    pendingActive: state.pendingActive,
    pendingSince: state.pendingSince,
  };
}

/**
 * Field-wise equality for mining stats. The backend re-broadcasts the full
 * stats object every 500ms (poll-driven, not change-driven), so most ticks
 * carry identical values — especially while stopped. Comparing here lets us
 * skip no-op store updates and avoid re-rendering the Mining panel twice a
 * second when nothing has actually changed.
 */
function miningStatsEqual(a: MiningStats, b: MiningStats): boolean {
  return (
    a.isRunning === b.isRunning &&
    a.hashRate === b.hashRate &&
    a.hashRateMH === b.hashRateMH &&
    a.stemsFound === b.stemsFound &&
    a.leavesFound === b.leavesFound &&
    a.staleBlocks === b.staleBlocks &&
    a.uptime === b.uptime &&
    a.lastBlockTime === b.lastBlockTime &&
    a.averageBlockTime === b.averageBlockTime
  );
}

export const useMiningStore = create<MiningState>((set) => ({
  ...initialState,

  setStatus: (status) =>
    set((state) => ({
      ...reconcileActive(state, status.isActive),
      threads: status.threads,
      maxThreads: status.maxThreads,
      miningWalletName: status.walletName,
    })),

  setStats: (stats) =>
    set((state) => {
      // Skip no-op updates: the backend re-sends identical stats every 500ms.
      // Returning the *same* state reference makes Zustand's Object.is check
      // short-circuit and notify no listeners — important because Mining and
      // Dashboard subscribe to the whole store (no selector), so any new top-level
      // state object would re-render them. This kills the idle 500ms render churn.
      if (miningStatsEqual(state.stats, stats)) {
        return state;
      }

      // Honor an in-flight optimistic toggle: a stale `isRunning` that contradicts
      // the just-requested state is ignored until the backend confirms it.
      const active = reconcileActive(state, stats.isRunning);

      // Only add history points when actively mining with non-zero hashrate
      if (stats.isRunning && stats.hashRate > 0) {
        const newPoint: MiningHistoryPoint = {
          timestamp: Date.now(),
          hashRate: stats.hashRate,
        };
        return {
          stats,
          ...active,
          hashRateHistory: [...state.hashRateHistory, newPoint].slice(-MAX_HISTORY_POINTS),
        };
      }

      // When not mining, just update stats (don't add to history). Clear the
      // snapshotted wallet name only once we actually consider mining inactive.
      return {
        stats,
        ...active,
        ...(active.isActive ? {} : { miningWalletName: null }),
      };
    }),

  // Force-resolve the active flag and cancel any pending optimistic toggle.
  // Used by the error path to revert an optimistic flip back to reality.
  setActive: (active) => set({ isActive: active, pendingActive: null, pendingSince: 0 }),

  // Optimistically flip the button to the requested state on click and arm the
  // guard so stale live ticks can't flip it back before the backend confirms.
  beginToggle: (target) =>
    set({ isActive: target, pendingActive: target, pendingSince: Date.now() }),

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
