/**
 * Mining-related types
 */

import type { BlockSummary } from "./blockchain";

export interface MiningStatus {
  isActive: boolean;
  threads: number;
  maxThreads: number;
  walletName: string | null;
  miningAddress: string | null;
}

export interface MiningStats {
  isRunning: boolean; // Backend mining state (synced from MiningService)
  hashRate: number; // Hashes per second
  hashRateMH: number; // MH/s for display
  stemsFound: number;
  leavesFound: number;
  staleBlocks: number;
  uptime: number; // seconds
lastBlockTime?: number;
  averageBlockTime?: number;
}

export interface MiningHistoryPoint {
  timestamp: number;
  hashRate: number;
}

export interface ThreadStats {
  threadId: number;
  hashRate: number;
  isActive: boolean;
}

/**
 * A block that was mined by this wallet
 */
export type MinedBlock = BlockSummary & {
  minedAt: number; // Client timestamp when notification received
};

/**
 * Event record from wallet database
 */
export interface MinedBlockEvent {
  id: number;
  eventType: string;
  data: MinedBlock;
  timestamp: number;
  isRead: boolean;
}
