import { create } from "zustand";
import type {
  BlockchainInfo,
  SyncProgress,
  SyncPhase,
} from "@/types";

/**
 * WebSocket blockchain_info response (snake_case from Rust API)
 */
interface WsBlockchainInfo {
  leaf_height: number;
  height: number;
  latest_leaf?: {
    hash: string;
    leaf_height: number;
  };
  stem_work_info?: {
    stems_since_last_leaf: number;
  };
}

/**
 * WebSocket stem_provider_info response (snake_case from Rust API)
 */
interface WsStemProviderInfo {
  latest_stem_hash?: string;
  current_epoch: number;
  stems_since_last_leaf: Array<{
    hash: string;
    nonce: number;
    timestamp: number;
  }>;
}

interface BlockchainState {
  // Chain state
  leafHeight: number;
  stemHeight: number;
  stemsSinceLastLeaf: number;
  bestBlockHash: string;
  latestStemHash: string | null;
  isSynced: boolean;

  // Sync state
  syncProgress: SyncProgress;

  // Refresh trigger - increment to signal consumers to refetch blockchain data
  refreshTrigger: number;

  // Actions
  setBlockchainInfo: (info: Partial<BlockchainInfo>) => void;
  handleWsBlockchainInfo: (data: WsBlockchainInfo) => void;
  handleWsStemProviderInfo: (data: WsStemProviderInfo) => void;
  setSyncProgress: (progress: SyncProgress) => void;
  triggerRefresh: () => void;
  reset: () => void;
}

const initialState = {
  leafHeight: 0,
  stemHeight: 0,
  stemsSinceLastLeaf: 0,
  bestBlockHash: "",
  latestStemHash: null as string | null,
  isSynced: false,
  syncProgress: {
    phase: "Idle" as SyncPhase,
    progressPercent: 0,
  },
  refreshTrigger: 0,
};

export const useBlockchainStore = create<BlockchainState>((set) => ({
  ...initialState,

  setBlockchainInfo: (info) =>
    set((state) => ({
      ...state,
      ...info,
    })),

  // Handle WebSocket blockchain_info message (snake_case)
  handleWsBlockchainInfo: (data) =>
    set((state) => ({
      ...state,
      leafHeight: data.leaf_height,
      stemHeight: data.height,
      stemsSinceLastLeaf: data.stem_work_info?.stems_since_last_leaf ?? state.stemsSinceLastLeaf,
      bestBlockHash: data.latest_leaf?.hash ?? state.bestBlockHash,
    })),

  // Handle WebSocket stem_provider_info message (snake_case)
  handleWsStemProviderInfo: (data) =>
    set((state) => ({
      ...state,
      stemsSinceLastLeaf: data.stems_since_last_leaf.length,
      latestStemHash: data.latest_stem_hash ?? state.latestStemHash,
    })),

  setSyncProgress: (progress) =>
    set({
      syncProgress: progress,
      isSynced: progress.phase === "Synced",
    }),

  triggerRefresh: () =>
    set((state) => ({
      refreshTrigger: state.refreshTrigger + 1,
    })),

  reset: () => set(initialState),
}));
