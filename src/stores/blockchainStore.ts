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

const syncProgressKeys: Array<keyof SyncProgress> = [
  "phase",
  "progressPercent",
  "startedAt",
  "headersReceived",
  "targetHeaders",
  "stemsPending",
  "stemsComplete",
  "leavesReceived",
  "totalLeaves",
  "currentEpoch",
  "pivotHeight",
  "stateRoot",
  "downloadedChunks",
  "totalChunks",
  "blocksExecuted",
  "targetHeight",
  "itemsPerSecond",
  "estimatedSecondsRemaining",
  "bytesDownloaded",
  "bytesTotal",
  "failureReason",
  "syncPeer",
  "peerCount",
];

function isSameSyncProgress(a: SyncProgress, b: SyncProgress) {
  return syncProgressKeys.every((key) => a[key] === b[key]);
}

export const useBlockchainStore = create<BlockchainState>((set) => ({
  ...initialState,

  setBlockchainInfo: (info) =>
    set((state) => ({
      ...state,
      ...info,
    })),

  // Handle WebSocket blockchain_info message (snake_case)
  handleWsBlockchainInfo: (data) =>
    set((state) => {
      const stemsSinceLastLeaf =
        data.stem_work_info?.stems_since_last_leaf ?? state.stemsSinceLastLeaf;
      const bestBlockHash = data.latest_leaf?.hash ?? state.bestBlockHash;

      if (
        state.leafHeight === data.leaf_height &&
        state.stemHeight === data.height &&
        state.stemsSinceLastLeaf === stemsSinceLastLeaf &&
        state.bestBlockHash === bestBlockHash
      ) {
        return state;
      }

      return {
        leafHeight: data.leaf_height,
        stemHeight: data.height,
        stemsSinceLastLeaf,
        bestBlockHash,
      };
    }),

  // Handle WebSocket stem_provider_info message (snake_case)
  handleWsStemProviderInfo: (data) =>
    set((state) => {
      const stemsSinceLastLeaf = data.stems_since_last_leaf.length;
      const latestStemHash = data.latest_stem_hash ?? state.latestStemHash;

      if (
        state.stemsSinceLastLeaf === stemsSinceLastLeaf &&
        state.latestStemHash === latestStemHash
      ) {
        return state;
      }

      return {
        stemsSinceLastLeaf,
        latestStemHash,
      };
    }),

  setSyncProgress: (progress) =>
    set((state) => {
      const isSynced = progress.phase === "Synced";

      if (state.isSynced === isSynced && isSameSyncProgress(state.syncProgress, progress)) {
        return state;
      }

      return {
        syncProgress: progress,
        isSynced,
      };
    }),

  triggerRefresh: () =>
    set((state) => ({
      refreshTrigger: state.refreshTrigger + 1,
    })),

  reset: () => set(initialState),
}));
