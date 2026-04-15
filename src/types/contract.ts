/**
 * Contract ABI types mirroring src/vm/abi.rs
 */

// ---------------------------------------------------------------------------
// ABI Types
// ---------------------------------------------------------------------------

export type ParamType =
  | "u8"
  | "u16"
  | "u32"
  | "u64"
  | "bool"
  | "string"
  | "bytes"
  | "bytes20"
  | "bytes32"
  | "vm_address"
  | "vm_address[]"
  | "utxo_address"
  | "xtal_amount";

export type Mutability = "read" | "write" | "payable";

export type Encoding = "packed" | "scale" | "raw";

export interface AbiParam {
  name: string;
  type: ParamType;
  label?: string;
}

export interface AbiReturn {
  type: ParamType;
  description?: string;
}

export interface AbiEvent {
  name: string;
  topicId: number[];
  fields: AbiParam[];
}

export interface AbiMethod {
  name: string;
  displayName?: string;
  description?: string;
  mutability: Mutability;
  params: AbiParam[];
  returns?: AbiReturn;
  encoding: Encoding;
  selector: number[];
}

export interface ContractAbi {
  name: string;
  description: string;
  version: string;
  icon?: string;
  methods: AbiMethod[];
  events: AbiEvent[];
}

// ---------------------------------------------------------------------------
// Cache / response types (from Tauri commands)
// ---------------------------------------------------------------------------

export interface CachedContract {
  address: string;
  name: string;
  description: string;
  icon?: string;
  fruitType?: string;
  methodCount: number;
  contentHash: string;
  cid?: string;
  addedAt: number;
  source: string;
}

export interface DeployResult {
  txid: string;
  contractAddress: string;
  fee: number;
  abiCid?: string;
}

export interface QueryResult {
  success: boolean;
  returnData: string;
  gasUsed: number;
  errorMessage?: string;
  logs: string[];
}

export interface ContractInfo {
  address: string;
  exists: boolean;
  isContract: boolean;
  balance: number;
  codeHash?: string;
  fruitType?: string;
}

export interface ContractStorageResult {
  value?: string;
}

export interface GasEstimate {
  gasEstimate: number;
  feeEstimate: number;
}

// ---------------------------------------------------------------------------
// UTXO Deposit types (CAGE bridge)
// ---------------------------------------------------------------------------

export interface WalletUtxo {
  txid: string;
  vout: number;
  amount: number;
  address: string;
  confirmations: number;
  isEligible: boolean;
  ineligibleReason?: string;
}

export interface DepositUtxoResult {
  txid: string;
  fee: number;
  amount: number;
  anchorStemHash: string;
}
