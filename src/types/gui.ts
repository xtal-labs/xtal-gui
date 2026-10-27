/**
 * Types for GUI-owned persisted preferences.
 */

import type { DashboardLayout } from "./dashboard";

export interface GuiConfig {
  toastsEnabled: boolean;
  /** Whether expert controls (e.g. staking to a specific contract) are shown. */
  advancedMode: boolean;
  dashboard?: DashboardLayout | null;
  tutorial: TutorialConfig;
}

/** Persisted state of the guided walkthrough. */
export interface TutorialConfig {
  /** Start the walkthrough on this launch (queued by the setup wizard). */
  pending: boolean;
  /** Ids of the chapters the user has finished. */
  completed: string[];
}

/**
 * Consensus parameters quoted by the walkthrough, read from the node so the
 * copy cannot drift from what the chain enforces.
 */
export interface ConsensusParams {
  leafIntervalSecs: number;
  stemsPerLeaf: number;
  leavesPerEpoch: number;
  /** Leaves before a coinbase or VM-withdrawal output is spendable. */
  coinbaseMaturityLeaves: number;
  /** Leaves a new stake stays locked before it counts and can be unstaked. */
  minStakeLockLeaves: number;
  /** Leaves an unstaked output stays locked before it is spendable. */
  unstakeLockLeaves: number;
  /** Smallest stake output a user may create (shards). */
  minStakeOutput: string;
  leafMinerPct: number;
  stemPoolPct: number;
  /** Share of the stem pool carved out for fruit producers. */
  fruitFromStemPct: number;
  /** Share of pooled VM fees paid to credited stems; the rest goes to fruit producers. */
  minerFeePct: number;
}
