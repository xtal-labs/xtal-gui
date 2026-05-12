/**
 * Blockchain-related types
 */

export type BlockType = "Stem" | "Leaf";

interface BlockSummaryBase {
  hash: string;
  height: number;
  leafHeight: number;
  timestamp: number;
  size?: number;
}

export interface StemSummary extends BlockSummaryBase {
  blockType: "Stem";
  fruitCount: number;
}

export interface LeafSummary extends BlockSummaryBase {
  blockType: "Leaf";
  txCount: number;
}

export type BlockSummary = StemSummary | LeafSummary;

export interface BlockchainInfo {
  leafHeight: number;
  stemHeight: number;
  stemsSinceLastLeaf: number;
  bestBlockHash: string;
  isSynced: boolean;
  peerCount: number;
}

export interface BestLeafInfo {
  hash: string;
  leafHeight: number;
  stemHeight: number;
  stemsSinceLastLeaf: number;
  timestamp: number;
  stateRoot: string | null;
  difficulty: number;
  miner: string;
  txCount: number;
  froot: string;
}

/**
 * Sync phases matching backend SyncState enum
 */
export type SyncPhase =
  | "Idle"
  | "SyncingHeaders"
  | "SyncingStemBodies"
  | "SyncingFruitHeaders"
  | "SyncingLeaves"
  | "DownloadingState"
  | "ExecutingFromCheckpoint"
  | "Synced"
  | "Failed";

/**
 * Rich sync progress data matching backend SyncState fields
 */
export interface SyncProgress {
  phase: SyncPhase;
  progressPercent: number;
  startedAt?: number;

  // Headers phase
  headersReceived?: number;
  targetHeaders?: number;

  // Stem bodies phase
  stemsPending?: number;
  stemsComplete?: number;

  // Leaves phase
  leavesReceived?: number;
  totalLeaves?: number;
  currentEpoch?: number;

  // State sync phase
  pivotHeight?: number;
  stateRoot?: string;
  downloadedChunks?: number;
  totalChunks?: number;

  // Execution from checkpoint phase
  blocksExecuted?: number;
  targetHeight?: number;

  // Speed & ETA
  itemsPerSecond?: number;
  estimatedSecondsRemaining?: number;
  bytesDownloaded?: number;
  bytesTotal?: number;

  // Error info
  failureReason?: string;

  // Peer info
  syncPeer?: string;
  peerCount?: number;
}

/**
 * Phase metadata for UI display
 */
export interface SyncPhaseInfo {
  id: SyncPhase;
  label: string;
  shortLabel: string;
  description: string;
  order: number;
}

export interface ChainTip {
  hash: string;
  height: number;
  leafHeight: number;
  status: "active" | "valid-fork" | "valid-headers" | "headers-only" | "invalid";
}

export interface BlockTransactionSummary {
  txid: string;
  txType: string;
  totalOutput: number;
}

export interface FruitSummary {
  hash: string;
  fruitType: string;
  validator: string;
  txCount?: number;
  timestamp: number;
}

export interface FruitTransactionSummary {
  txid: string;
  txType: string;
  vmType: string;
  amount?: number;
  fee?: number;
  from?: string;
  to?: string;
  nonce: number;
}

export interface FruitDetail {
  hash: string;
  fruitType: string;
  validator: string;
  timestamp: number;
  nonce: number;
  stem: string;
  merkleRoot: string;
  difficultyTarget: number;
  gasPrice: number;
  txCount?: number;
  transactions?: FruitTransactionSummary[];
  neighbors: string[];
}

interface BlockDetailBase {
  hash: string;
  height: number;
  leafHeight: number;
  timestamp: number;
  size?: number;
  previousHash?: string;
  version: number;
  nonce: number;
  difficulty: number;
  froot: string;
  merkleRoot: string;
  miner: string;
}

export interface StemBlockDetail extends BlockDetailBase {
  blockType: "Stem";
  fruitCount: number;
  fruits?: FruitSummary[];
  txCount?: never;
  transactions?: never;
}

export interface LeafBlockDetail extends BlockDetailBase {
  blockType: "Leaf";
  txCount: number;
  transactions: BlockTransactionSummary[];
  fruitCount?: never;
  fruits?: never;
}

export type BlockDetail = StemBlockDetail | LeafBlockDetail;
