/**
 * Wallet-related types
 */

export interface WalletInfo {
  name: string;
  isLoaded: boolean;
  network: NetworkType;
}

export type NetworkType = "Mainnet" | "Testnet" | "Regtest";

export interface WalletBalance {
  confirmed: number; // in shards (1 XTAL = 10^9 shards)
  pending: number;
  immature: number; // coinbase rewards not yet spendable
  total: number;
}

export interface Address {
  address: string;
  index: number;
  label?: string;
  used: boolean;
}

/**
 * Maturity status for coinbase/withdrawal transactions
 */
export interface MaturityStatus {
  /** Whether this transaction is still immature */
  isImmature: boolean;
  /** Number of leaf blocks until maturity (0 if mature) */
  blocksUntilMature: number;
}

export interface Transaction {
  txid: string;
  /** Transaction type - comes as txType from API (snake_case tx_type converted) */
  txType: TransactionType;
  amount: number; // positive for receive, negative for send
  fee?: number;
  confirmations: number;
  timestamp: number;
  blockHash?: string;
  blockHeight?: number;
  toAddress?: string;
  fromAddresses?: string[];
  memo?: string;
  /** Wallet-layer VM execution status */
  executionStatus?: TransactionExecutionStatus;
  /** Maturity status for coinbase/withdrawal transactions */
  maturityStatus?: MaturityStatus;
}

export type TransactionExecutionStatus =
  | "unknown"
  | "pending_execution"
  | "failed"
  | "success";

export type TransactionType =
  | "send"
  | "receive"
  | "coinbase"
  | "stake"
  | "unstake"
  | "contract"
  | "standard"
  | "contract_call"
  | "contract_deploy"
  | "account_transfer"
  | "vm_withdrawal"
  | "vm_deposit";

/**
 * Detailed transaction input information
 */
export interface TransactionInput {
  /** Source transaction hash (hex) */
  txid: string;
  /** Output index in source transaction */
  outputIndex: number;
  /** Decoded address (if extractable from script) */
  address?: string;
  /** Amount from the previous output (in shards) */
  amount?: number;
  /** Whether this input belongs to the loaded wallet */
  isMine?: boolean;
}

/**
 * Detailed transaction output information
 */
export interface TransactionOutput {
  /** Index in this transaction's outputs */
  index: number;
  /** Amount in shards */
  amount: number;
  /** Currency type (e.g., "XTAL") */
  currency: string;
  /** Decoded address from script_pubkey */
  address?: string;
  /** Script type: "p2pkh", "stake", "unstake", "coinbase", "account", etc. */
  scriptType: string;
  /** Whether this output belongs to the loaded wallet */
  isMine?: boolean;
}

export type UTXOBridgeDetail = {
  kind: "vm_withdrawal";
  withdrawalValue: number;
  createdOutput?: TransactionOutput;
};

export type VMBridgeDetail =
  | {
      kind: "vm_deposit";
      depositedAmount: number;
      sourceInput?: TransactionInput;
    }
  | {
      kind: "cage_withdrawal";
      requestedAmount: number;
      netWithdrawalAmount?: number;
      requestedRecipient: string;
      producedOutputRecipient?: string;
    };

export interface UTXODetail {
  kind: "utxo";
  inputs: TransactionInput[];
  outputs: TransactionOutput[];
  totalInput: number;
  totalOutput: number;
  netAmount: number;
  maturityStatus?: MaturityStatus;
  bridge?: UTXOBridgeDetail;
}

export interface VMDetail {
  kind: "vm";
  caller?: string;
  contractAddress?: string;
  method?: string;
  gasLimit?: number;
  gasPrice?: number;
  nonce?: number;
  value?: number;
  dataSize?: number;
  preferredFruitType?: string;
  recipient?: string;
  transferAmount?: number;
  currency?: string;
  bridge?: VMBridgeDetail;
}

/**
 * Full transaction details for the detail panel
 */
export interface TransactionDetail {
  /** Transaction hash (hex) */
  txid: string;
  /** Transaction type */
  txType: string;
  /** UTXO- or VM-specific detail payload */
  detail: UTXODetail | VMDetail;
  /** Transaction fee (if applicable, in shards) */
  fee?: number;
  /** Number of confirmations (0 for pending) */
  confirmations: number;
  /** Block timestamp or submission time for pending */
  timestamp: number;
  /** Block hash (if confirmed) */
  blockHash?: string;
  /** Block height (if confirmed) */
  blockHeight?: number;
  /** Wallet-layer VM execution status */
  executionStatus?: TransactionExecutionStatus;
  /** Cached execution receipt for VM transactions */
  receipt?: TransactionReceipt;
  /** Optional memo/note */
  memo?: string;
}

export interface TransactionReceipt {
  status: TransactionExecutionStatus;
  blockHeight: number;
  transactionIndex: number;
  gasUsed: number;
  gasPrice: number;
  feePaid: number;
  contractAddress?: string;
  logs: string[];
  returnData: string;
  error?: string;
}

/**
 * Paginated transaction history response
 */
export interface TransactionHistoryResponse {
  /** List of transactions for this page */
  transactions: Transaction[];
  /** Total number of transactions available */
  totalCount: number;
  /** Whether there are more transactions to load */
  hasMore: boolean;
}

/**
 * VM account balance from UnifiedMPT state (separate from UTXO balance)
 */
export interface VmAccountBalance {
  /** VM account balance in shards */
  balance: number;
  /** Nonce of the primary address */
  nonce: number;
  /** Currency type */
  currency: string;
}

export interface SendRequest {
  toAddress: string;
  amount: number; // in shards
  fee?: number;
  memo?: string;
  password: string; // Required for signing
}

export interface SendResult {
  txid: string;
  fee: number;
}

export interface WalletCreateRequest {
  name: string;
  password: string;
  network: NetworkType;
}

export interface WalletImportRequest {
  name: string;
  password: string;
  mnemonic: string;
  network: NetworkType;
}

export interface WalletStatus {
  is_loaded: boolean;
  wallet_name: string | null;
  primary_address: string | null;
}

/**
 * Detailed mempool transaction information for the detail panel
 */
export interface MempoolTransactionDetail {
  hash: string;
  txType: string;
  fee: number;
  sizeBytes: number;
  ageSecs: number;
  isSponsored: boolean;

  // UTXO-specific
  inputs?: TransactionInput[];
  outputs?: TransactionOutput[];
  totalInput?: number;
  totalOutput?: number;

  // VM-specific
  caller?: string;
  contractAddress?: string;
  method?: string;
  gasLimit?: number;
  gasPrice?: number;
  nonce?: number;
  value?: number;
  dataSize?: number;

  // ContractDeploy-specific
  preferredFruitType?: string;

  // AccountTransfer-specific
  recipient?: string;
  transferAmount?: number;
  currency?: string;
}

/** Result of importing a raw Ed25519 key or CAGE signer file */
export interface SignerImportResult {
  wallet_name: string;
  address: string;
  public_key_hex: string;
}
