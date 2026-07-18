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
  totalOutput: string;
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
  amount?: string;
  fee?: string;
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

/**
 * Chain-strip visualizer types (backbone + fruit body availability).
 *
 * The view distinguishes a fruit whose body (tx payload) is retrievable from
 * one where only the header/receipt is available. Header-only fruits are valid
 * empty attestations; receipt-only payload fruits are shown as missing bodies.
 * `bodyTxCount` is what is actually present; `receiptTxCount` is what the
 * receipt says it should be.
 */
export interface StripFruit {
  hash: string;
  fruitType: string;
  bodyPresent: boolean;
  headerPresent: boolean;
  /** Transactions actually in the body; undefined when the body is missing. */
  bodyTxCount?: number;
  /** Transactions the stem receipt recorded; undefined for empty attestation fruits. */
  receiptTxCount?: number;
}

export interface StripStem {
  hash: string;
  height: number;
  timestamp: number;
  fruits: StripFruit[];
}

export interface StripLeaf {
  hash: string;
  leafHeight: number;
  timestamp: number;
  txCount: number;
  froot: string;
}

/** One (stems → leaf) interval; `leaf` is undefined for the open tail at the tip. */
export interface StripInterval {
  leaf?: StripLeaf;
  stems: StripStem[];
}

/** One epoch page: its (stems → leaf) intervals in order. */
export interface EpochStrip {
  epoch: number;
  isCurrent: boolean;
  intervals: StripInterval[];
}

/**
 * Body-availability classification that drives the fruit glyph encoding:
 * - `payload` — body present with transactions (filled)
 * - `empty`   — body present, zero transactions (hollow)
 * - `missing` — body NOT retrievable but the receipt says it carried a payload
 *               (the archival bug; rendered dashed + ⚠)
 * - `orphan`  — body not retrievable and no payload was recorded (faint/ghost)
 */
export type FruitBodyState = "payload" | "empty" | "missing" | "orphan";
