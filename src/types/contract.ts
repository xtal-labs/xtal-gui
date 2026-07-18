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

export type DisplayFormat = "raw" | "xtal_amount" | "basis_points" | "percentage";

export interface AbiReturn {
  type: ParamType;
  description?: string;
  display?: DisplayFormat;
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
  fee: string;
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
  balance: string;
  codeHash?: string;
  fruitType?: string;
}

export interface ContractStorageResult {
  value?: string;
}

export interface GasEstimate {
  gasEstimate: number;
  feeEstimate: string;
}

// ---------------------------------------------------------------------------
// UTXO Deposit types (CAGE bridge)
// ---------------------------------------------------------------------------

export interface WalletUtxo {
  txid: string;
  vout: number;
  amount: string;
  address: string;
  confirmations: number;
  isEligible: boolean;
  ineligibleReason?: string;
}

export interface DepositUtxoResult {
  txid: string;
  fee: string;
  amount: string;
  anchorStemHash: string;
}

export interface CageConfig {
  address: string;
  withdrawFeeBps: number;
}
