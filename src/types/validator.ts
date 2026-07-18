/**
 * Validator types for the Validator tab
 *
 * NOTE: All monetary amounts are in shards (base units).
 * Use shardsToXtal() for display conversion.
 */

/** Per-fruit production count from backend */
export interface FruitProductionCount {
  fruitType: string;
  fruitsProduced: number;
}

/** Validator information returned from list_validators */
export interface ValidatorInfo {
  address: string;
  effectiveStake: number; // In shards
  isActive: boolean;
  activeProductions: string[];
  totalFruitsProduced: number;
  productionStats: FruitProductionCount[];
}

/** Result of starting a validator */
export interface ValidatorStartResult {
  address: string;
  eligibleFruits: string[];
  startedCount: number;
}

/** Fruit specification for UI display */
export interface FruitSpec {
  fruitType: string;
  minStake: number; // In shards
  targetIntervalSecs: number;
  maxSizeBytes: number;
  maxFuel: number;
  emoji: string;
}

/** Fruit eligibility information */
export interface EligibleFruit {
  fruitType: string;
  isEligible: boolean;
  minStake: number; // In shards
  shortfall: number; // In shards
  emoji: string;
}

/** Production status for a single fruit type */
export interface FruitProduction {
  fruitType: string;
  isActive: boolean;
  isEligible: boolean;
  fruitsProduced: number;
  minStake: number; // In shards
  shortfall: number; // In shards
  emoji: string;
}

/** Complete validator status for UI state */
export interface ValidatorStatus {
  isLoaded: boolean;
  isRunning: boolean;
  address: string | null;
  walletName: string | null;
  totalStake: number; // In shards
  effectiveStake: number; // In shards
  totalFruitsProduced: number;
  productions: FruitProduction[];
}

/** Summary of a validator wallet (from list_validator_wallets) */
export interface ValidatorWalletSummary {
  name: string;
  address: string;
  walletType: string;
}

/** Result of creating a validator wallet */
export interface ValidatorWalletCreationResult {
  walletName: string;
  mnemonic: string[];
  address: string;
  masterSeed?: string;
}

/** Network-wide validator statistics */
export interface NetworkValidatorStats {
  currentEpoch: number;
  totalStaked: number; // In shards
  validatorCount: number;
}

/** Validator earnings from coinbase rewards */
export interface ValidatorEarnings {
  validatorAddress: string;
  totalEarned: number; // In shards
  leafMining: number; // In shards
  stemCredits: number; // In shards
  fruitRewards: number; // In shards (auto-staked validator rewards)
  coinbaseCount: number;
}

/** Validator balance breakdown */
export interface ValidatorBalanceInfo {
  validatorAddress: string;
  availableBalance: number;  // UTXO balance (unstaked, available to stake)
  withdrawableStake?: number; // Staked XTAL available to unstake
  matureStake: number;       // Backward-compatible alias for withdrawableStake
  pendingStake: number;      // Immature stake not yet effective
  totalStake: number;        // Mature + pending stake
  pendingUnstake: number;    // Pending unstake (locked)
  immatureBalance: number;   // Non-stake immature balance + unconfirmed incoming
  totalValue: number;        // Sum of all
}

/** Fruit production statistics with dynamic difficulty */
export interface FruitProductionStats {
  fruitType: string;
  emoji: string;
  minStake: number; // In shards
  targetIntervalSecs: number;

  // Dynamic difficulty (current epoch)
  currentDifficultyBits: number;
  expectedTimeSecs: number;
  expectedTimeLabel: string;
  expectedFruitsPerHour: string;
  expectedStemsLabel: string;
  winProbabilityLabel: string;
  networkStakeUnits: number;

  // Reference difficulty (for comparison)
  referenceDifficultyBits: number;

  // Personalized stats (when validator address is provided)
  personalExpectedTimeSecs?: number;
  personalExpectedTimeLabel?: string;
  personalExpectedFruitsPerHour?: string;
  personalExpectedStemsLabel?: string;
  personalWinProbabilityLabel?: string;
}

/** Chain-derived difficulty for one historical epoch */
export interface FruitDifficultyEpochPoint {
  epoch: number;
  difficultyBits: number;
}

/** Session-only per-epoch difficulty snapshot for a fruit type */
export interface FruitDifficultyHistoryPoint {
  epoch: number;
  timestamp: number;
  difficultyBits: number;
  referenceDifficultyBits: number;
  expectedTimeSecs: number;
  networkStakeUnits: number;
}

/** A fruit produced by the local validator during this session */
export interface ProducedFruit {
  fruitHash: string;
  fruitType: string;
  transactionCount: number;
  timestamp: number;   // Stem timestamp (inherited from the stem this fruit is affixed to)
  producedAt: number;  // Local timestamp when production notification was received
  stemHash: string;    // Stem block this fruit is affixed to
}
