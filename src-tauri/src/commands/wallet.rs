//! Wallet operation commands
//!
//! Commands for wallet management, balance queries, and transactions.
//! Note: Validator wallets are managed separately in validator.rs
//!
//! The WalletManager is created with `new()` at startup,
//! so it knows its own wallet directory. This eliminates the need
//! to rebuild directory configuration on every command.

use ed25519_dalek::VerifyingKey;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::State;
use xtal::fruit::codec::{Decode, Encode};
use xtal::fruit::core::FruitTx;

use xtal::address::{encode_sh, ContractAddress};
use xtal::address_format::{format_contract_address, format_utxo_address};
use xtal::crypto::hash_public_key;
use xtal::gas::{can_afford_transaction, TX_BASE_GAS};
use xtal::interfaces::ChainDataProvider;
use xtal::interfaces::UtxoData;
use xtal::mempool::TransactionSource;
use xtal::script::{
    extract_pkh_from_script, multisig_script_pubkey, p2sh_script_hash, MAX_MULTISIG_KEYS,
};
use xtal::storage::UnifiedMPT;
use xtal::transaction::builders::TransferBuilder;
use xtal::transaction::receipt::TransactionReceipt;
use xtal::transaction::{
    ContractCallTransaction, CurrencyType, Transaction, TxOut, MAX_GAS_LIMIT, MIN_GAS_PRICE,
};
use xtal::vm::abi::{cage_abi, ParamType};
use xtal::vm::cage_contract::CAGE_CONTRACT_ADDRESS;
use xtal::wallet::database::models::{
    InputDetail, KeyType, TransactionExecutionStatus, TransactionRecord, TransactionType,
    WalletScriptRecord, WalletType,
};
use xtal::wallet::database::queries::WalletQueries;
use xtal::wallet::sync::WalletSyncService;
use xtal::wallet::{FeeStrategy, WalletManager};
use zeroize::{Zeroize, ZeroizeOnDrop};

use crate::commands::tx_detail_utils::{
    extract_inputs, extract_transaction_details, vm_transaction_fee,
};
use crate::events::{emit_wallet_loaded, emit_wallet_unloaded, get_wallet_pkh_set};
use crate::state::AppState;

/// Wallet balance information
#[derive(Debug, Clone, Serialize)]
pub struct WalletBalance {
    /// Spendable balance (excludes immature and pending outgoing)
    pub confirmed: u64,
    /// Pending outgoing transactions
    pub pending: u64,
    /// Immature coinbase/withdrawal rewards (not yet spendable)
    pub immature: u64,
    /// Total balance (confirmed + pending + immature)
    pub total: u64,
    pub currency: String,
}

/// VM account balance information (from UnifiedMPT state, not UTXOs)
#[derive(Debug, Clone, Serialize)]
pub struct VmAccountBalance {
    /// Total VM account balance in shards
    pub balance: u64,
    /// Highest observed nonce across wallet-owned account-state entries
    pub nonce: u64,
    pub currency: String,
}

/// Wallet status information
#[derive(Debug, Clone, Serialize)]
pub struct WalletStatus {
    pub is_loaded: bool,
    pub wallet_name: Option<String>,
    pub primary_address: Option<String>,
}

/// Result of wallet creation
#[derive(Debug, Clone, Serialize)]
pub struct WalletCreationResult {
    pub wallet_name: String,
    pub mnemonic: Vec<String>,
    pub primary_address: String,
    /// Deprecated compatibility field. Master seed is no longer exported.
    pub master_seed: Option<String>,
}

/// Result of wallet loading
#[derive(Debug, Clone, Serialize)]
pub struct WalletLoadResult {
    pub wallet_name: String,
    pub primary_address: String,
}

/// Result of creating a P2SH multisig address.
#[derive(Debug, Clone, Serialize)]
pub struct MultisigAddressResult {
    pub address: String,
    pub script_hash: String,
    pub redeem_script: String,
    pub threshold: u8,
    pub public_keys: Vec<String>,
    pub label: Option<String>,
    pub saved: bool,
    #[serde(rename = "type")]
    pub script_type: String,
}

/// Saved script-address metadata for wallet display and PSXT construction.
#[derive(Debug, Clone, Serialize)]
pub struct MultisigAddressInfo {
    pub address: String,
    pub script_hash: String,
    pub redeem_script: String,
    pub threshold: Option<u8>,
    pub public_keys: Vec<String>,
    pub label: Option<String>,
    pub created_at: i64,
    #[serde(rename = "type")]
    pub script_type: String,
}

/// Maturity status for coinbase/withdrawal transactions
#[derive(Debug, Clone, Serialize)]
pub struct MaturityStatus {
    /// Whether this transaction output is still immature
    pub is_immature: bool,
    /// Number of leaf blocks until maturity (0 if mature)
    pub blocks_until_mature: u64,
}

/// Transaction summary for list view
#[derive(Debug, Clone, Serialize)]
pub struct TransactionSummary {
    pub txid: String,
    pub amount: i64,
    pub fee: u64,
    pub confirmations: u32,
    pub timestamp: u64,
    pub tx_type: String,
    pub execution_status: Option<String>,
    /// Maturity status for coinbase/withdrawal transactions
    pub maturity_status: Option<MaturityStatus>,
}

fn tx_type_has_maturity(tx_type: &str) -> bool {
    matches!(tx_type, "coinbase" | "vm_withdrawal")
}

/// Paginated transaction history response
#[derive(Debug, Clone, Serialize)]
pub struct TransactionHistoryResponse {
    /// List of transactions for this page
    pub transactions: Vec<TransactionSummary>,
    /// Total number of transactions available
    pub total_count: usize,
    /// Whether there are more transactions to load
    pub has_more: bool,
}

/// Detailed input information for transaction viewer
#[derive(Debug, Clone, Serialize)]
pub struct TransactionInput {
    /// Source transaction hash (hex)
    pub txid: String,
    /// Output index in source transaction
    pub output_index: u16,
    /// Decoded address (if extractable from script)
    pub address: Option<String>,
    /// Amount from the previous output (if known)
    pub amount: Option<u64>,
    /// Whether this input belongs to the loaded wallet
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub is_mine: bool,
}

/// Detailed output information for transaction viewer
#[derive(Debug, Clone, Serialize)]
pub struct TransactionOutput {
    /// Index in this transaction's outputs
    pub index: u16,
    /// Amount in shards
    pub amount: u64,
    /// Currency type (e.g., "XTAL")
    pub currency: String,
    /// Decoded address from script_pubkey
    pub address: Option<String>,
    /// Script type: "p2pkh", "stake", "unstake", "coinbase", "unknown"
    pub script_type: String,
    /// Whether this output belongs to the loaded wallet
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub is_mine: bool,
}

/// Full transaction details for the detail panel
#[derive(Debug, Clone, Serialize)]
pub struct TransactionReceiptDetail {
    pub status: String,
    pub block_height: u64,
    pub transaction_index: u32,
    pub gas_used: u64,
    pub gas_price: u64,
    pub fee_paid: u64,
    pub contract_address: Option<String>,
    pub logs: Vec<String>,
    pub return_data: String,
    pub error: Option<String>,
}

fn execution_status_label(status: &xtal::transaction::receipt::TxStatus) -> String {
    match status {
        xtal::transaction::receipt::TxStatus::Success => "success".to_string(),
        xtal::transaction::receipt::TxStatus::Failed => "failed".to_string(),
        xtal::transaction::receipt::TxStatus::Pending => "pending_execution".to_string(),
    }
}

impl From<xtal::wallet::database::models::TransactionReceiptRecord> for TransactionReceiptDetail {
    fn from(receipt: xtal::wallet::database::models::TransactionReceiptRecord) -> Self {
        Self {
            status: receipt.status.as_str().to_string(),
            block_height: receipt.block_height,
            transaction_index: receipt.transaction_index,
            gas_used: receipt.gas_used,
            gas_price: receipt.gas_price,
            fee_paid: receipt.fee_paid,
            contract_address: receipt
                .contract_address
                .map(|address| format!("0x{}", hex::encode(address))),
            logs: receipt.logs,
            return_data: format!("0x{}", hex::encode(receipt.return_data)),
            error: receipt.error,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct WalletOwnedPkh {
    pub(crate) pkh: [u8; 20],
    pub(crate) hex_address: String,
    pub(crate) key_type: KeyType,
    pub(crate) key_index: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct WalletAccountStateEntry {
    pub(crate) pkh: [u8; 20],
    pub(crate) hex_address: String,
    pub(crate) balance: u64,
    pub(crate) nonce: u64,
    pub(crate) key_type: KeyType,
    pub(crate) key_index: u32,
}

pub(crate) fn wallet_owned_pkhs_from_queries(
    queries: &WalletQueries,
    wallet_id: &str,
) -> Result<Vec<WalletOwnedPkh>, String> {
    let all_keys = queries
        .get_public_keys(wallet_id, None)
        .map_err(|e| format!("Failed to get public keys: {}", e))?;

    let mut seen = HashSet::new();
    let mut owned = Vec::new();

    for key in all_keys {
        let Ok(pk_bytes) = hex::decode(&key.public_key_hex) else {
            continue;
        };
        if pk_bytes.len() != 32 {
            continue;
        }

        let Ok(pk_array) = <[u8; 32]>::try_from(pk_bytes.as_slice()) else {
            continue;
        };
        let Ok(vk) = VerifyingKey::from_bytes(&pk_array) else {
            continue;
        };

        let pkh = hash_public_key(&vk);
        if seen.insert(pkh) {
            owned.push(WalletOwnedPkh {
                pkh,
                hex_address: format_contract_address(&pkh),
                key_type: key.key_type,
                key_index: key.key_index,
            });
        }
    }

    owned.sort_by(|a, b| {
        a.key_type
            .path_index()
            .cmp(&b.key_type.path_index())
            .then_with(|| a.key_index.cmp(&b.key_index))
            .then_with(|| a.hex_address.cmp(&b.hex_address))
    });
    Ok(owned)
}

pub(crate) fn surfaced_wallet_account_entries(
    owned_pkhs: &[WalletOwnedPkh],
    mpt: &UnifiedMPT,
) -> Result<Vec<WalletAccountStateEntry>, String> {
    let mut entries = Vec::new();

    for owned in owned_pkhs {
        let account = mpt
            .get_account_info(&owned.pkh)
            .map_err(|e| format!("Failed to get account info: {}", e))?;

        let Some((account, _is_contract)) = account else {
            continue;
        };

        entries.push(WalletAccountStateEntry {
            pkh: owned.pkh,
            hex_address: owned.hex_address.clone(),
            balance: account.get_balance(CurrencyType::XTAL),
            nonce: account.nonce,
            key_type: owned.key_type,
            key_index: owned.key_index,
        });
    }

    entries.sort_by(|a, b| {
        b.balance
            .cmp(&a.balance)
            .then_with(|| {
                (b.key_type == KeyType::VmAccount).cmp(&(a.key_type == KeyType::VmAccount))
            })
            .then_with(|| a.hex_address.cmp(&b.hex_address))
    });

    Ok(entries)
}

fn merge_vm_address_catalog(
    owned_pkhs: &[WalletOwnedPkh],
    account_entries: &[WalletAccountStateEntry],
    next_vm_account_index: u32,
) -> Vec<String> {
    let mut addresses = Vec::new();
    let mut seen = HashSet::new();

    for owned in owned_pkhs.iter().filter(|owned| {
        owned.key_type == KeyType::VmAccount && owned.key_index < next_vm_account_index
    }) {
        if seen.insert(owned.pkh) {
            addresses.push(owned.hex_address.clone());
        }
    }

    for entry in account_entries {
        if seen.insert(entry.pkh) {
            addresses.push(entry.hex_address.clone());
        }
    }

    addresses
}

pub(crate) fn select_vm_sender_entry<'a>(
    account_entries: &'a [WalletAccountStateEntry],
    amount: u64,
    gas_limit: u64,
    gas_price: u64,
) -> Option<&'a WalletAccountStateEntry> {
    account_entries
        .iter()
        .filter(|entry| can_afford_transaction(entry.balance, gas_limit, gas_price, amount))
        .max_by(|a, b| {
            a.balance
                .cmp(&b.balance)
                .then_with(|| {
                    (a.key_type == KeyType::VmAccount).cmp(&(b.key_type == KeyType::VmAccount))
                })
                .then_with(|| b.hex_address.cmp(&a.hex_address))
        })
}

impl From<xtal::transaction::receipt::TransactionReceipt> for TransactionReceiptDetail {
    fn from(receipt: xtal::transaction::receipt::TransactionReceipt) -> Self {
        Self {
            status: execution_status_label(&receipt.status),
            block_height: receipt.block_height,
            transaction_index: receipt.tx_index,
            gas_used: receipt.gas_used,
            gas_price: receipt.gas_price,
            fee_paid: receipt.fee_paid,
            contract_address: receipt
                .contract_address
                .map(|address| format!("0x{}", hex::encode(address))),
            logs: receipt.logs,
            return_data: format!("0x{}", hex::encode(receipt.return_data)),
            error: receipt.error,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct TransactionDetail {
    /// Transaction hash (hex)
    pub txid: String,
    /// Transaction type: "standard", "coinbase", "stake", "unstake", etc.
    pub tx_type: String,
    /// Domain-specific detail payload
    pub detail: TransactionDetailPayload,
    /// Transaction fee (if applicable)
    pub fee: Option<u64>,
    /// Number of confirmations (0 for pending)
    pub confirmations: u32,
    /// Block timestamp or submission time for pending
    pub timestamp: u64,
    /// Block hash (if confirmed)
    pub block_hash: Option<String>,
    /// Block height (if confirmed)
    pub block_height: Option<u64>,
    /// Wallet-layer execution status for VM transactions
    pub execution_status: Option<String>,
    /// Cached execution receipt when available
    pub receipt: Option<TransactionReceiptDetail>,
    /// Optional memo/note
    pub memo: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TransactionDetailPayload {
    Utxo(UTXODetail),
    Vm(VMDetail),
}

#[derive(Debug, Clone, Serialize)]
pub struct UTXODetail {
    pub inputs: Vec<TransactionInput>,
    pub outputs: Vec<TransactionOutput>,
    pub total_input: u64,
    pub total_output: u64,
    pub net_amount: i64,
    pub maturity_status: Option<MaturityStatus>,
    pub bridge: Option<UTXOBridgeDetail>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum UTXOBridgeDetail {
    VmWithdrawal {
        withdrawal_value: u64,
        created_output: Option<TransactionOutput>,
    },
}

#[derive(Debug, Clone, Serialize)]
pub struct VMDetail {
    pub caller: Option<String>,
    pub contract_address: Option<String>,
    pub method: Option<String>,
    pub gas_limit: Option<u64>,
    pub gas_price: Option<u64>,
    pub nonce: Option<u64>,
    pub value: Option<u64>,
    pub data_size: Option<usize>,
    pub preferred_fruit_type: Option<String>,
    pub recipient: Option<String>,
    pub transfer_amount: Option<u64>,
    pub currency: Option<String>,
    pub bridge: Option<VMBridgeDetail>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum VMBridgeDetail {
    VmDeposit {
        deposited_amount: u64,
        source_input: Option<TransactionInput>,
    },
    CageWithdrawal {
        requested_amount: u64,
        net_withdrawal_amount: Option<u64>,
        requested_recipient: String,
        produced_output_recipient: Option<String>,
    },
}

struct VmWalletTransactionView {
    tx_type: TransactionType,
    amount: u64,
    fee: u64,
    summary_amount: i64,
    to_address: Option<String>,
}

struct ResolvedTransactionContext {
    tx: Transaction,
    block_height: Option<u64>,
    block_hash: Option<String>,
    timestamp: u64,
    confirmations: u32,
    is_pending: bool,
}

struct DecodedCageWithdrawalCall {
    requested_amount: u64,
    requested_recipient: String,
}

struct ProducedWithdrawalView {
    net_withdrawal_amount: u64,
    produced_output_recipient: Option<String>,
}

/// Result of sending a transaction
#[derive(Debug, Clone, Serialize)]
pub struct SendResult {
    pub txid: String,
    pub fee: u64,
}

/// Gas configuration constants from the blockchain layer
#[derive(Debug, Clone, Serialize)]
pub struct GasConfig {
    pub min_gas_price: u64,
    pub max_gas_limit: u64,
    pub default_gas_limit: u64,
    pub default_gas_price: u64,
}

/// Get gas configuration constants for the frontend
#[tauri::command]
pub fn get_gas_config() -> GasConfig {
    GasConfig {
        min_gas_price: MIN_GAS_PRICE,
        max_gas_limit: MAX_GAS_LIMIT,
        default_gas_limit: TX_BASE_GAS,
        default_gas_price: MIN_GAS_PRICE,
    }
}

// =============================================================================
// Wallet Creation Helper
// =============================================================================

/// Shared helper for wallet creation - used by both setup and normal modes
///
/// This function contains the core wallet creation logic that can be called
/// from both the normal `create_new_wallet` command and the setup-specific
/// `create_setup_wallet` command.
pub fn create_wallet_impl(
    wallet_manager: &WalletManager,
    wallet_name: &str,
    password: &str,
) -> Result<WalletCreationResult, String> {
    log::info!("create_wallet_impl: Creating wallet '{}'", wallet_name);

    // Create a normal wallet (not validator)
    let result = wallet_manager
        .create_wallet(wallet_name, WalletType::Normal, password)
        .map_err(|e| {
            log::error!("Failed to create wallet: {}", e);
            format!("Failed to create wallet: {}", e)
        })?;

    log::info!("Wallet '{}' created successfully!", wallet_name);

    // Split mnemonic into words
    let mnemonic_words: Vec<String> = result
        .mnemonic
        .split_whitespace()
        .map(String::from)
        .collect();

    Ok(WalletCreationResult {
        wallet_name: wallet_name.to_string(),
        mnemonic: mnemonic_words,
        primary_address: result.primary_address.clone(),
        master_seed: None,
    })
}

/// Shared helper for wallet import from mnemonic
///
/// Like `create_wallet_impl` but uses a provided mnemonic instead of generating one.
pub fn wallet_from_mnemonic_impl(
    wallet_manager: &WalletManager,
    wallet_name: &str,
    password: &str,
    mnemonic: &str,
    wallet_type: WalletType,
) -> Result<WalletCreationResult, String> {
    log::info!(
        "wallet_from_mnemonic_impl: Importing wallet '{}'",
        wallet_name
    );

    let result = wallet_manager
        .wallet_from_mnemonic(wallet_name, wallet_type, password, mnemonic)
        .map_err(|e| {
            log::error!("Failed to import wallet: {}", e);
            format!("Failed to import wallet: {}", e)
        })?;

    log::info!("Wallet '{}' imported successfully!", wallet_name);

    let mnemonic_words: Vec<String> = result
        .mnemonic
        .split_whitespace()
        .map(String::from)
        .collect();

    Ok(WalletCreationResult {
        wallet_name: wallet_name.to_string(),
        mnemonic: mnemonic_words,
        primary_address: result.primary_address.clone(),
        master_seed: None,
    })
}

// =============================================================================
// Wallet File Operations
// =============================================================================

/// List all available wallet files (includes both normal and validator wallets)
#[tauri::command]
pub async fn list_wallets(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let wallet = state
        .services
        .wallet
        .as_ref()
        .ok_or("Wallet manager not available")?;

    wallet
        .list_available_wallets()
        .map_err(|e| format!("Failed to list wallets: {}", e))
}

/// Create a new wallet
#[tauri::command]
pub async fn create_new_wallet(
    state: State<'_, AppState>,
    wallet_name: String,
    password: String,
) -> Result<WalletCreationResult, String> {
    log::info!("create_new_wallet called with name: {}", wallet_name);

    let wallet = state.services.wallet.as_ref().ok_or_else(|| {
        log::error!("Wallet manager not available in services!");
        "Wallet manager not available".to_string()
    })?;

    // Use shared helper
    create_wallet_impl(wallet, &wallet_name, &password)
}

/// Import a wallet from a mnemonic phrase (normal mode - node running)
#[tauri::command]
pub async fn import_wallet(
    state: State<'_, AppState>,
    wallet_name: String,
    password: String,
    mnemonic: String,
) -> Result<WalletCreationResult, String> {
    log::info!("import_wallet called with name: {}", wallet_name);

    let wallet = state.services.wallet.as_ref().ok_or_else(|| {
        log::error!("Wallet manager not available in services!");
        "Wallet manager not available".to_string()
    })?;

    wallet_from_mnemonic_impl(
        wallet,
        &wallet_name,
        &password,
        &mnemonic,
        WalletType::Normal,
    )
}

/// Result of importing a raw key or signer file
#[derive(Debug, Clone, Serialize)]
pub struct SignerImportResult {
    pub wallet_name: String,
    pub address: String,
    pub public_key_hex: String,
}

/// Import a wallet from an existing encrypted .enc file (raw bytes)
///
/// This accepts the raw encrypted data directly (e.g., from a frontend file upload),
/// writes it to the wallet directory, unlocks to derive keys, and registers in the
/// database. The original password is retained — no re-encryption occurs.
#[tauri::command]
pub async fn import_wallet_from_file(
    state: State<'_, AppState>,
    wallet_name: String,
    file_data: Vec<u8>, // Raw encrypted bytes from frontend
    password: String,
) -> Result<WalletCreationResult, String> {
    log::info!(
        "import_wallet_from_file called with name: {}, data size: {} bytes",
        wallet_name,
        file_data.len()
    );

    let wallet = state.services.wallet.as_ref().ok_or_else(|| {
        log::error!("Wallet manager not available in services!");
        "Wallet manager not available".to_string()
    })?;

    // Validate that we received some data
    if file_data.is_empty() {
        return Err("No wallet data provided".to_string());
    }

    let result = wallet
        .import_wallet_from_bytes(&wallet_name, &file_data, &password)
        .map_err(|e| {
            log::error!("Failed to import wallet from bytes: {}", e);
            format!("Failed to import wallet from file: {}", e)
        })?;

    log::info!("Wallet '{}' imported successfully!", wallet_name);

    let mnemonic_words: Vec<String> = result
        .mnemonic
        .split_whitespace()
        .map(String::from)
        .collect();

    Ok(WalletCreationResult {
        wallet_name: result.wallet_name.clone(),
        mnemonic: mnemonic_words,
        primary_address: result.primary_address.clone(),
        master_seed: None,
    })
}

/// Import a raw Ed25519 private key as a signer wallet
#[tauri::command]
pub async fn import_raw_key(
    state: State<'_, AppState>,
    wallet_name: String,
    password: String,
    private_key_hex: String,
) -> Result<SignerImportResult, String> {
    log::info!("import_raw_key called with name: {}", wallet_name);

    let wallet = state.services.wallet.as_ref().ok_or_else(|| {
        log::error!("Wallet manager not available in services!");
        "Wallet manager not available".to_string()
    })?;

    let result = wallet
        .import_raw_key(&wallet_name, &password, &private_key_hex)
        .map_err(|e| format!("Failed to import key: {}", e))?;

    Ok(SignerImportResult {
        wallet_name: result.wallet_name,
        address: result.address,
        public_key_hex: result.public_key_hex,
    })
}

/// Import a CAGE signer file into the wallet system
#[tauri::command]
pub async fn import_signer_file(
    state: State<'_, AppState>,
    wallet_name: String,
    wallet_password: String,
    signer_file_path: String,
    signer_password: String,
) -> Result<SignerImportResult, String> {
    log::info!(
        "import_signer_file called with name: {}, path: {}",
        wallet_name,
        signer_file_path
    );

    let wallet = state.services.wallet.as_ref().ok_or_else(|| {
        log::error!("Wallet manager not available in services!");
        "Wallet manager not available".to_string()
    })?;

    let path = std::path::Path::new(&signer_file_path);
    let result = wallet
        .import_signer_file(&wallet_name, &wallet_password, path, &signer_password)
        .map_err(|e| format!("Failed to import signer file: {}", e))?;

    Ok(SignerImportResult {
        wallet_name: result.wallet_name,
        address: result.address,
        public_key_hex: result.public_key_hex,
    })
}

/// Load a wallet file (view-only mode - no password required)
///
/// The wallet is loaded in view-only mode with access to pre-derived public keys.
/// Password is only required when signing transactions.
#[tauri::command]
pub async fn load_wallet(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    wallet_name: String,
) -> Result<WalletLoadResult, String> {
    let wallet = state
        .services
        .wallet
        .as_ref()
        .ok_or("Wallet manager not available")?;

    // Load wallet in view-only mode (uses pre-derived public keys from database)
    let record = wallet
        .load_wallet(&wallet_name)
        .map_err(|e| format!("Failed to load wallet: {}", e))?;

    // Get primary address from pre-derived keys (no password needed)
    let primary_address = wallet
        .with_wallet(|w| {
            w.get_all_mining_keys().map(|keys| {
                keys.first()
                    .map(|(_, addr, _)| addr.clone())
                    .unwrap_or_default()
            })
        })
        .map_err(|e| format!("Failed to get primary address: {}", e))?;

    // Emit wallet loaded event for toast notification
    emit_wallet_loaded(&app, &record.name);

    // Start wallet sync service to index incoming transactions (coinbase, receives)
    start_wallet_sync(&state, wallet);

    Ok(WalletLoadResult {
        wallet_name: record.name,
        primary_address,
    })
}

/// Unload the current wallet
#[tauri::command]
pub async fn unload_wallet(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let wallet = state
        .services
        .wallet
        .as_ref()
        .ok_or("Wallet manager not available")?;

    // Stop wallet sync service before unloading
    if let Ok(mut guard) = state.wallet_sync.lock() {
        if let Some(sync) = guard.take() {
            sync.stop();
        }
    }

    let result = wallet
        .unload_wallet()
        .map_err(|e| format!("Failed to unload wallet: {}", e))?;

    // Emit wallet unloaded event for toast notification
    emit_wallet_unloaded(&app);

    Ok(result)
}

/// Change wallet password
#[derive(Deserialize, Zeroize, ZeroizeOnDrop)]
#[serde(rename_all = "camelCase")]
pub struct ChangePasswordRequest {
    current_password: String,
    new_password: String,
}

impl std::fmt::Debug for ChangePasswordRequest {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ChangePasswordRequest")
            .field("current_password", &"[REDACTED]")
            .field("new_password", &"[REDACTED]")
            .finish()
    }
}

#[tauri::command]
pub async fn change_password(
    state: State<'_, AppState>,
    request: ChangePasswordRequest,
) -> Result<(), String> {
    let wallet = state
        .services
        .wallet
        .as_ref()
        .ok_or("Wallet manager not available")?;

    wallet
        .change_password(&request.current_password, &request.new_password)
        .map_err(|e| format!("Failed to change password: {}", e))
}

// =============================================================================
// Wallet Status & Info
// =============================================================================

/// Get wallet status
#[tauri::command]
pub async fn get_wallet_status(state: State<'_, AppState>) -> Result<WalletStatus, String> {
    match &state.services.wallet {
        Some(wallet) => {
            let is_loaded = wallet.is_loaded();

            // Get wallet name and primary address if loaded
            let (wallet_name, primary_address) = if is_loaded {
                // Get wallet name from database using current_wallet_id
                let name = wallet.current_wallet_id().and_then(|wallet_id| {
                    wallet.database().and_then(|db| {
                        let queries = WalletQueries::new(db.connection());
                        queries
                            .get_wallet(&wallet_id)
                            .ok()
                            .flatten()
                            .map(|w| w.name)
                    })
                });

                let addr = wallet
                    .with_wallet(|w| {
                        w.get_all_mining_keys()
                            .map(|keys| keys.first().map(|(_, addr, _)| addr.clone()))
                    })
                    .ok()
                    .flatten();

                (name, addr)
            } else {
                (None, None)
            };

            Ok(WalletStatus {
                is_loaded,
                wallet_name,
                primary_address,
            })
        }
        None => Ok(WalletStatus {
            is_loaded: false,
            wallet_name: None,
            primary_address: None,
        }),
    }
}

/// Get wallet balance
///
/// This queries the database directly for public keys - no wallet unlock required.
/// The balance is calculated from UTXOs on the blockchain for each stored address.
/// Immature coinbase/withdrawal UTXOs are tracked separately and excluded from spendable balance.
#[tauri::command]
pub async fn get_wallet_balance(state: State<'_, AppState>) -> Result<WalletBalance, String> {
    let wallet = state
        .services
        .wallet
        .as_ref()
        .ok_or("Wallet not available")?;

    if !wallet.is_loaded() {
        return Err("No wallet loaded".to_string());
    }

    // Get wallet_id and database
    let wallet_id = wallet.current_wallet_id().ok_or("No wallet ID available")?;

    let db = wallet.database().ok_or("Wallet database not available")?;
    let queries = WalletQueries::new(db.connection());

    // Get all public keys from database (no unlock required!)
    let all_keys = queries
        .get_public_keys(&wallet_id, None)
        .map_err(|e| format!("Failed to get public keys: {}", e))?;

    // Calculate balance from blockchain for each address
    let blockchain = state.services.blockchain();
    let current_leaf_height = blockchain.get_current_leaf_height();
    let maturity_required = xtal::consensus::validation::COINBASE_MATURITY;

    let mut total_balance = 0u64;
    let mut immature_balance = 0u64;

    for key in all_keys {
        // Convert hex public key to VerifyingKey, then compute PKH
        if let Ok(pk_bytes) = hex::decode(&key.public_key_hex) {
            if pk_bytes.len() == 32 {
                let pk_array: [u8; 32] = pk_bytes.try_into().unwrap_or([0u8; 32]);
                if let Ok(vk) = VerifyingKey::from_bytes(&pk_array) {
                    let pkh = hash_public_key(&vk);

                    // Get UTXO positions for this address
                    if let Ok(utxo_positions) = blockchain.get_utxos_by_address(&pkh) {
                        // Fetch each UTXO to get the amount
                        for pos in utxo_positions {
                            if let Ok(Some(utxo)) =
                                blockchain.get_utxo(&pos.tx_id, pos.output_index)
                            {
                                let amount = utxo.amount;
                                total_balance = total_balance.saturating_add(amount);

                                // Check if immature (coinbase/withdrawal with insufficient confirmations)
                                if utxo.is_coinbase || utxo.is_withdrawal {
                                    let age =
                                        current_leaf_height.saturating_sub(utxo.creation_height);
                                    if age < maturity_required {
                                        immature_balance = immature_balance.saturating_add(amount);
                                    }
                                } else if let Some(info) =
                                    xtal::script::parse_stake_or_unstake_script(&utxo.script_pubkey)
                                {
                                    if !info.is_stake {
                                        if let xtal::script::TimeLock::Relative(lock) = info.lock {
                                            let age = current_leaf_height
                                                .saturating_sub(utxo.creation_height);
                                            if age < lock {
                                                immature_balance =
                                                    immature_balance.saturating_add(amount);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Get pending outgoing amount from wallet database (per-wallet)
    let pending_outgoing = queries.get_pending_outgoing_total(&wallet_id).unwrap_or(0);

    // Spendable = total - immature - pending outgoing
    let spendable = total_balance
        .saturating_sub(immature_balance)
        .saturating_sub(pending_outgoing);

    Ok(WalletBalance {
        confirmed: spendable,
        pending: pending_outgoing,
        immature: immature_balance,
        total: total_balance,
        currency: "XTAL".to_string(),
    })
}

/// Individual UTXO information for the deposit picker
#[derive(Debug, Clone, Serialize)]
pub struct WalletUtxo {
    /// Transaction ID (raw hex, no 0x prefix)
    pub txid: String,
    /// Output index within the transaction
    pub vout: u16,
    /// Amount in shards
    pub amount: u64,
    /// Base58Check formatted owner address
    pub address: String,
    /// Number of leaf confirmations
    pub confirmations: u64,
    /// Whether this UTXO can be consumed via CAGE deposit
    pub is_eligible: bool,
    /// Reason if not eligible (e.g. "coinbase", "staking", "immature")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ineligible_reason: Option<String>,
}

/// List individual unspent outputs owned by the wallet.
///
/// No wallet unlock required — reads public keys from the wallet database.
/// Returns each UTXO with eligibility info for CAGE deposit (consume_utxo).
#[tauri::command]
pub async fn list_unspent_outputs(state: State<'_, AppState>) -> Result<Vec<WalletUtxo>, String> {
    let wallet = state
        .services
        .wallet
        .as_ref()
        .ok_or("Wallet not available")?;

    if !wallet.is_loaded() {
        return Err("No wallet loaded".to_string());
    }

    let wallet_id = wallet.current_wallet_id().ok_or("No wallet ID available")?;
    let db = wallet.database().ok_or("Wallet database not available")?;
    let queries = WalletQueries::new(db.connection());

    let all_keys = queries
        .get_public_keys(&wallet_id, None)
        .map_err(|e| format!("Failed to get public keys: {}", e))?;

    let blockchain = state.services.blockchain();
    let current_leaf_height = blockchain.get_current_leaf_height();
    let maturity_required = xtal::consensus::validation::COINBASE_MATURITY;

    let mut utxos = Vec::new();

    for key in all_keys {
        let pk_bytes = match hex::decode(&key.public_key_hex) {
            Ok(b) if b.len() == 32 => b,
            _ => continue,
        };
        let pk_array: [u8; 32] = match pk_bytes.try_into() {
            Ok(a) => a,
            Err(_) => continue,
        };
        let vk = match VerifyingKey::from_bytes(&pk_array) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let pkh = hash_public_key(&vk);
        let address = format_utxo_address(&pkh);

        let positions = match blockchain.get_utxos_by_address(&pkh) {
            Ok(p) => p,
            Err(_) => continue,
        };

        for pos in positions {
            let utxo = match blockchain.get_utxo(&pos.tx_id, pos.output_index) {
                Ok(Some(u)) => u,
                _ => continue,
            };

            let confirmations = current_leaf_height.saturating_sub(utxo.creation_height);

            // Determine eligibility for CAGE deposit
            let (is_eligible, ineligible_reason) = if utxo.is_staking {
                (false, Some("staking".to_string()))
            } else if utxo.is_coinbase {
                if confirmations < maturity_required {
                    (false, Some("immature coinbase".to_string()))
                } else {
                    // Mature coinbase — still ineligible: CAGE only accepts standard UTXOs
                    (false, Some("coinbase".to_string()))
                }
            } else if utxo.is_withdrawal {
                if confirmations < maturity_required {
                    (false, Some("immature withdrawal".to_string()))
                } else {
                    (false, Some("withdrawal".to_string()))
                }
            } else if let Some(info) =
                xtal::script::parse_stake_or_unstake_script(&utxo.script_pubkey)
            {
                if info.is_stake {
                    (false, Some("staking".to_string()))
                } else if let xtal::script::TimeLock::Relative(lock) = info.lock {
                    if confirmations < lock {
                        (false, Some("timelocked".to_string()))
                    } else {
                        (true, None)
                    }
                } else {
                    (true, None)
                }
            } else {
                // Standard P2PKH UTXO
                (true, None)
            };

            utxos.push(WalletUtxo {
                txid: hex::encode(pos.tx_id),
                vout: pos.output_index,
                amount: utxo.amount,
                address: address.clone(),
                confirmations,
                is_eligible,
                ineligible_reason,
            });
        }
    }

    // Sort: eligible first, then by amount descending
    utxos.sort_by(|a, b| {
        b.is_eligible
            .cmp(&a.is_eligible)
            .then(b.amount.cmp(&a.amount))
    });

    Ok(utxos)
}

/// Get wallet mnemonic (requires password verification)
#[tauri::command]
pub async fn get_wallet_mnemonic(
    state: State<'_, AppState>,
    password: String,
) -> Result<String, String> {
    let wallet = state
        .services
        .wallet
        .as_ref()
        .ok_or("Wallet not available")?;

    wallet
        .with_wallet(|w| {
            w.get_mnemonic(&password)
                .map(|opt| opt.unwrap_or_else(|| "Mnemonic not available".to_string()))
        })
        .map_err(|e| format!("Failed to get mnemonic: {}", e))
}

// =============================================================================
// Address Operations
// =============================================================================

/// Generate a new receiving address (with database persistence)
#[tauri::command]
pub async fn generate_address(state: State<'_, AppState>) -> Result<String, String> {
    let wallet = state
        .services
        .wallet
        .as_ref()
        .ok_or("Wallet not available")?;

    // Use the new method that persists to database
    wallet
        .generate_receiving_address()
        .map_err(|e| format!("Failed to generate address: {}", e))
}

fn parse_saved_multisig_keys(public_keys_json: Option<&str>) -> Vec<String> {
    public_keys_json
        .and_then(|json| serde_json::from_str::<Vec<String>>(json).ok())
        .unwrap_or_default()
}

fn saved_script_to_multisig_info(script: WalletScriptRecord) -> MultisigAddressInfo {
    let public_keys = parse_saved_multisig_keys(script.public_keys_json.as_deref());
    MultisigAddressInfo {
        address: script.address,
        script_hash: hex::encode(script.script_hash),
        redeem_script: script.redeem_script_hex,
        threshold: script.threshold,
        public_keys,
        label: script.label,
        created_at: script.created_at,
        script_type: script.script_type,
    }
}

/// Create a P2SH multisig address and optionally save its redeem script to the loaded wallet.
#[tauri::command]
pub async fn create_multisig_address(
    state: State<'_, AppState>,
    threshold: u8,
    public_keys: Vec<String>,
    label: Option<String>,
    save: Option<bool>,
) -> Result<MultisigAddressResult, String> {
    if !(2..=MAX_MULTISIG_KEYS).contains(&public_keys.len()) {
        return Err(format!(
            "public_keys must contain between 2 and {} keys",
            MAX_MULTISIG_KEYS
        ));
    }

    if threshold == 0 || threshold as usize > public_keys.len() {
        return Err(
            "threshold must be at least 1 and no greater than public_keys length".to_string(),
        );
    }

    let mut seen = HashSet::new();
    let mut parsed_keys = Vec::with_capacity(public_keys.len());
    let mut canonical_public_keys = Vec::with_capacity(public_keys.len());

    for key_hex in &public_keys {
        let bytes = hex::decode(key_hex)
            .map_err(|e| format!("Invalid public key hex '{}': {}", key_hex, e))?;
        if bytes.len() != 32 {
            return Err(format!(
                "Public key must be 32 bytes, got {} bytes",
                bytes.len()
            ));
        }

        let mut key_bytes = [0u8; 32];
        key_bytes.copy_from_slice(&bytes);
        if !seen.insert(key_bytes) {
            return Err("Duplicate public keys are not allowed".to_string());
        }

        let verifying_key = VerifyingKey::from_bytes(&key_bytes)
            .map_err(|e| format!("Invalid Ed25519 public key: {}", e))?;
        canonical_public_keys.push(hex::encode(key_bytes));
        parsed_keys.push(verifying_key);
    }

    let redeem_script = multisig_script_pubkey(&parsed_keys, threshold)
        .map_err(|e| format!("Invalid multisig script: {}", e))?;
    let script_hash = p2sh_script_hash(&redeem_script);
    let address = encode_sh(&script_hash);
    let redeem_script_hex = hex::encode(redeem_script.bytes());
    let should_save = save.unwrap_or(true);
    let mut saved = false;

    if should_save {
        let wallet = state
            .services
            .wallet
            .as_ref()
            .ok_or("Wallet not available")?;
        let wallet_id = wallet.current_wallet_id().ok_or("Wallet not loaded")?;
        let db = wallet.database().ok_or("Wallet database not available")?;
        let queries = WalletQueries::new(db.connection());
        let created_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        let public_keys_json = serde_json::to_string(&canonical_public_keys)
            .map_err(|e| format!("Failed to encode public keys: {}", e))?;

        queries
            .upsert_wallet_script(&WalletScriptRecord {
                id: None,
                wallet_id,
                address: address.clone(),
                script_hash,
                script_type: "p2sh_multisig".to_string(),
                redeem_script_hex: redeem_script_hex.clone(),
                threshold: Some(threshold),
                public_keys_json: Some(public_keys_json),
                label: label.clone(),
                created_at,
            })
            .map_err(|e| format!("Failed to save multisig address: {}", e))?;
        saved = true;
    }

    Ok(MultisigAddressResult {
        address,
        script_hash: hex::encode(script_hash),
        redeem_script: redeem_script_hex,
        threshold,
        public_keys: canonical_public_keys,
        label,
        saved,
        script_type: "p2sh_multisig".to_string(),
    })
}

/// List saved P2SH multisig addresses for the loaded wallet.
#[tauri::command]
pub async fn get_multisig_addresses(
    state: State<'_, AppState>,
) -> Result<Vec<MultisigAddressInfo>, String> {
    let wallet = state
        .services
        .wallet
        .as_ref()
        .ok_or("Wallet not available")?;
    let wallet_id = wallet.current_wallet_id().ok_or("Wallet not loaded")?;
    let db = wallet.database().ok_or("Wallet database not available")?;
    let queries = WalletQueries::new(db.connection());

    queries
        .list_wallet_scripts(&wallet_id)
        .map_err(|e| format!("Failed to get multisig addresses: {}", e))
        .map(|scripts| {
            scripts
                .into_iter()
                .filter(|script| script.script_type == "p2sh_multisig")
                .map(saved_script_to_multisig_info)
                .collect()
        })
}

/// Get list of wallet addresses
#[tauri::command]
pub async fn get_addresses(
    state: State<'_, AppState>,
    _limit: Option<usize>,
) -> Result<Vec<String>, String> {
    let wallet = state
        .services
        .wallet
        .as_ref()
        .ok_or("Wallet not available")?;
    let wallet_id = wallet.current_wallet_id();
    let saved_script_addresses =
        if let (Some(db), Some(wallet_id)) = (wallet.database(), wallet_id.as_ref()) {
            let queries = WalletQueries::new(db.connection());
            queries
                .list_wallet_scripts(wallet_id)
                .unwrap_or_default()
                .into_iter()
                .filter(|script| script.script_type == "p2sh_multisig")
                .map(|script| script.address)
                .collect::<Vec<_>>()
        } else {
            Vec::new()
        };

    wallet
        .with_wallet(|w| {
            let mining_keys = w.get_all_mining_keys().unwrap_or_default();
            let receiving = w.get_all_receiving_addresses().unwrap_or_default();
            let change = w.get_all_change_addresses().unwrap_or_default();

            let mut addresses: Vec<String> = mining_keys
                .into_iter()
                .map(|(_, _, verifying_key)| {
                    let pkh = hash_public_key(&verifying_key);
                    format_utxo_address(&pkh)
                })
                .chain(receiving.into_iter().map(|(_, _, addr, _)| addr))
                .chain(change.into_iter().map(|(_, _, addr, _)| addr))
                .collect();

            addresses.extend(saved_script_addresses);

            addresses.sort();
            addresses.dedup();
            Ok(addresses)
        })
        .map_err(|e| format!("Failed to get addresses: {}", e))
}

// =============================================================================
// Transaction Operations
// =============================================================================

/// Send a transaction (requires password for signing)
#[tauri::command]
pub async fn send_transaction(
    state: State<'_, AppState>,
    to_address: String,
    amount: u64,
    fee: Option<u64>,
    password: String,
) -> Result<SendResult, String> {
    let wallet = state
        .services
        .wallet
        .as_ref()
        .ok_or("Wallet manager not available")?;

    // Unlock wallet temporarily for signing (30 second auto-lock)
    wallet
        .unlock_wallet(&password, Some(Duration::from_secs(30)))
        .map_err(|e| format!("Invalid password: {}", e))?;

    let blockchain = state.services.blockchain();
    let mempool = state.services.mempool();

    // Get maturity requirements for filtering immature UTXOs
    let current_leaf_height = blockchain.get_current_leaf_height();
    let maturity_required = xtal::consensus::validation::COINBASE_MATURITY;

    // Validate recipient address (40 hex characters)
    let recipient_bytes = hex::decode(&to_address)
        .map_err(|_| "Invalid address format: must be hex encoded".to_string())?;

    if recipient_bytes.len() != 20 {
        return Err("Invalid address: must be 20 bytes (40 hex characters)".to_string());
    }

    let mut recipient = [0u8; 20];
    recipient.copy_from_slice(&recipient_bytes);

    // Collect UTXOs from wallet addresses
    let mut available_utxos = Vec::new();

    // Get mining addresses (where coinbase rewards go)
    let mining = wallet
        .with_wallet(|w| w.get_all_mining_keys_with_gap(true))
        .map_err(|e| format!("Failed to get mining keys: {}", e))?;

    for (_, _, vk) in &mining {
        let pkh = hash_public_key(vk);
        if let Ok(positions) = blockchain.get_utxos_by_address(&pkh) {
            for pos in positions {
                if let Ok(Some(utxo)) = blockchain.get_utxo(&pos.tx_id, pos.output_index) {
                    // Skip immature coinbase/withdrawal UTXOs
                    if utxo.is_coinbase || utxo.is_withdrawal {
                        let age = current_leaf_height.saturating_sub(utxo.creation_height);
                        if age < maturity_required {
                            continue;
                        }
                    }

                    if utxo.currency == CurrencyType::XTAL {
                        available_utxos.push(UtxoData {
                            outpoint: (pos.tx_id, pos.output_index),
                            output: TxOut {
                                amount: utxo.amount,
                                currency: utxo.currency,
                                script_pubkey: utxo.script_pubkey.clone(),
                            },
                            creation_height: utxo.creation_height,
                            is_coinbase: utxo.is_coinbase,
                            is_withdrawal: utxo.is_withdrawal,
                            is_staking: utxo.is_staking,
                        });
                    }
                }
            }
        }
    }

    // Get receiving addresses
    let receiving = wallet
        .with_wallet(|w| w.get_all_receiving_addresses_with_gap(true))
        .map_err(|e| format!("Failed to get receiving addresses: {}", e))?;

    for (_, _, _, vk) in &receiving {
        let pkh = hash_public_key(vk);
        if let Ok(positions) = blockchain.get_utxos_by_address(&pkh) {
            for pos in positions {
                if let Ok(Some(utxo)) = blockchain.get_utxo(&pos.tx_id, pos.output_index) {
                    // Skip immature coinbase/withdrawal UTXOs
                    if utxo.is_coinbase || utxo.is_withdrawal {
                        let age = current_leaf_height.saturating_sub(utxo.creation_height);
                        if age < maturity_required {
                            continue;
                        }
                    }

                    if utxo.currency == CurrencyType::XTAL {
                        available_utxos.push(UtxoData {
                            outpoint: (pos.tx_id, pos.output_index),
                            output: TxOut {
                                amount: utxo.amount,
                                currency: utxo.currency,
                                script_pubkey: utxo.script_pubkey.clone(),
                            },
                            creation_height: utxo.creation_height,
                            is_coinbase: utxo.is_coinbase,
                            is_withdrawal: utxo.is_withdrawal,
                            is_staking: utxo.is_staking,
                        });
                    }
                }
            }
        }
    }

    // Get change addresses
    let change = wallet
        .with_wallet(|w| w.get_all_change_addresses_with_gap(true))
        .map_err(|e| format!("Failed to get change addresses: {}", e))?;

    for (_, _, _, vk) in &change {
        let pkh = hash_public_key(vk);
        if let Ok(positions) = blockchain.get_utxos_by_address(&pkh) {
            for pos in positions {
                if let Ok(Some(utxo)) = blockchain.get_utxo(&pos.tx_id, pos.output_index) {
                    // Skip immature coinbase/withdrawal UTXOs
                    if utxo.is_coinbase || utxo.is_withdrawal {
                        let age = current_leaf_height.saturating_sub(utxo.creation_height);
                        if age < maturity_required {
                            continue;
                        }
                    }

                    if utxo.currency == CurrencyType::XTAL {
                        available_utxos.push(UtxoData {
                            outpoint: (pos.tx_id, pos.output_index),
                            output: TxOut {
                                amount: utxo.amount,
                                currency: utxo.currency,
                                script_pubkey: utxo.script_pubkey.clone(),
                            },
                            creation_height: utxo.creation_height,
                            is_coinbase: utxo.is_coinbase,
                            is_withdrawal: utxo.is_withdrawal,
                            is_staking: utxo.is_staking,
                        });
                    }
                }
            }
        }
    }

    if available_utxos.is_empty() {
        return Err("No UTXOs available for transaction".to_string());
    }

    // Calculate total available
    let total_available: u64 = available_utxos.iter().map(|u| u.output.amount).sum();

    // Determine fee strategy
    let fee_strategy = match fee {
        Some(f) => FeeStrategy::Fixed(f),
        None => FeeStrategy::PerByte(1000), // Default: 1000 shards per byte
    };

    // Estimate fee for validation
    let estimated_fee = fee.unwrap_or(250_000); // ~250 bytes * 1000 shards
    if amount + estimated_fee > total_available {
        return Err(format!(
            "Insufficient funds: need {} + {} fee, have {}",
            amount, estimated_fee, total_available
        ));
    }

    // Get outpoints already spent by pending mempool transactions
    let spent = mempool.spent_outpoints();

    // Build transaction
    let build_result = wallet
        .with_wallet(|w| {
            w.create_transaction_builder(available_utxos)
                .map(|builder| {
                    builder
                        .exclude_outpoints(spent)
                        .add_recipient(recipient, amount)
                        .fee_strategy(fee_strategy)
                        .build_and_sign()
                })
        })
        .map_err(|e| format!("Failed to create transaction builder: {}", e))?
        .map_err(|e| format!("Failed to build transaction: {}", e))?;

    let tx = build_result.transaction;

    // Get txid
    let txid = tx
        .id()
        .map_err(|e| format!("Failed to get transaction ID: {}", e))?;

    // Submit to mempool
    mempool
        .add_transaction(tx.clone(), TransactionSource::Local)
        .map_err(|e| format!("Failed to submit transaction: {}", e))?;

    log::info!("Transaction submitted: {}", hex::encode(txid));

    // Store in wallet database for UI tracking
    if let (Some(db), Some(wallet_id)) = (wallet.database(), wallet.current_wallet_id()) {
        let queries = WalletQueries::new(db.connection());

        // Store pending transaction with unified TransactionRecord
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        // Capture input details from selected UTXOs
        let input_details: Vec<InputDetail> = build_result
            .selected_inputs
            .iter()
            .map(InputDetail::from_utxo)
            .collect();

        let record = TransactionRecord {
            txid,
            raw_tx: tx.encode(),
            tx_type: TransactionType::Send,
            amount,
            fee: Some(estimated_fee),
            to_address: Some(to_address.clone()),
            memo: None,
            created_at: now,
            confirmation: None, // Pending
            expires_at: None,
            priority: Some(0),
            input_details: InputDetail::serialize_list(&input_details),
            execution_status: None,
        };

        if let Err(e) = queries.insert_transaction(&wallet_id, &record) {
            log::warn!("Failed to store pending transaction: {}", e);
        }

        // Track pending outgoing amount (amount + fee) per-wallet
        if let Err(e) = queries.add_pending_outgoing(&wallet_id, amount + estimated_fee) {
            log::warn!("Failed to update pending outgoing total: {}", e);
        }
    }

    Ok(SendResult {
        txid: hex::encode(txid),
        fee: estimated_fee,
    })
}

/// Get transaction history including confirmed transactions from blockchain
#[tauri::command]
pub async fn get_transaction_history(
    state: State<'_, AppState>,
    limit: Option<usize>,
    offset: Option<usize>,
    address: Option<String>,
    wallet_id: Option<String>,
) -> Result<TransactionHistoryResponse, String> {
    let mempool = state.services.mempool();
    let blockchain = state.services.blockchain();
    let current_leaf_height = blockchain.get_current_leaf_height();
    let limit = limit.unwrap_or(50);
    let mut transactions = Vec::new();
    let mut seen_txids = std::collections::HashSet::new();
    let mut wallet_db_ref = state.services.wallet.as_ref().and_then(|w| w.database());

    // Determine the wallet_id to use for querying transactions:
    // 1. If explicit wallet_id is provided, use it
    // 2. If address is provided, check if it matches a validator and use validator's wallet_id
    // 3. Otherwise, fall back to the regular wallet's current_wallet_id
    let query_wallet_id: Option<String> = if let Some(wid) = wallet_id.clone() {
        Some(wid)
    } else if let Some(ref addr) = address {
        // Check if this address belongs to a validator
        state
            .services
            .validators
            .iter()
            .find(|entry| {
                if let Ok(status) = entry.value().get_status() {
                    status.validator_address == *addr
                } else {
                    false
                }
            })
            .and_then(|entry| {
                wallet_db_ref = entry
                    .value()
                    .get_wallet_database()
                    .or_else(|| wallet_db_ref.clone());
                entry.value().get_wallet_id()
            })
            .or_else(|| {
                // Not a validator address, use regular wallet
                state
                    .services
                    .wallet
                    .as_ref()
                    .and_then(|w| w.current_wallet_id())
            })
    } else {
        // No address specified, use regular wallet
        state
            .services
            .wallet
            .as_ref()
            .and_then(|w| w.current_wallet_id())
    };

    let wallet_pkhs: std::collections::HashSet<[u8; 20]> = if let Some(addr) = address.as_ref() {
        let pkh = xtal::address_format::parse_address_input(addr)
            .map_err(|e| format!("Invalid address: {}", e))?;
        std::collections::HashSet::from([pkh])
    } else {
        let wallet = state
            .services
            .wallet
            .as_ref()
            .ok_or("Wallet not available")?;

        if !wallet.is_loaded() {
            return Err("No wallet loaded".to_string());
        }

        get_wallet_pkh_set(wallet)?
    };

    // Query wallet database for outgoing transactions (works for both validator and normal wallet)
    // This must happen before building the address set since both contexts share the same DB
    if let (Some(db), Some(wallet_id)) = (wallet_db_ref.as_ref(), query_wallet_id.clone()) {
        log::debug!("Querying wallet database for outgoing transactions");
        let queries = WalletQueries::new(db.connection());

        // Get pending outgoing transactions (sends, stakes, unstakes)
        match queries.list_pending_outgoing(&wallet_id) {
            Ok(pending) => {
                log::debug!("Found {} pending outgoing transactions", pending.len());
                for ptx in pending {
                    let in_mempool = mempool.get_transaction_by_hash(&ptx.txid).is_some();

                    if in_mempool {
                        // Still pending - include with 0 confirmations
                        seen_txids.insert(ptx.txid);
                        transactions.push(TransactionSummary {
                            txid: hex::encode(ptx.txid),
                            amount: -(ptx.amount as i64),
                            fee: ptx.fee.unwrap_or(0),
                            confirmations: 0,
                            timestamp: ptx.created_at as u64,
                            tx_type: ptx.tx_type.as_str().to_string(),
                            execution_status: lookup_any_receipt(blockchain.as_ref(), &ptx.txid)
                                .map(|receipt| execution_status_label(&receipt.status))
                                .or_else(|| {
                                    ptx.execution_status
                                        .map(|status| status.as_str().to_string())
                                }),
                            maturity_status: None,
                        });
                    } else {
                        // Not in mempool — check if confirmed via UTXO set
                        // (same approach as coinbase maturity: use creation_height from UTXOs)
                        let mut confirmed_leaf_height: Option<u64> = None;

                        if let Ok(tx) = Transaction::decode(&mut ptx.raw_tx.as_slice()) {
                            // Try to find any output of this tx in the UTXO set
                            for (idx, _) in tx.utxo_outputs().iter().enumerate() {
                                if let Ok(Some(utxo)) = blockchain.get_utxo(&ptx.txid, idx as u16) {
                                    confirmed_leaf_height = Some(utxo.creation_height);
                                    break;
                                }
                            }

                            // Fallback: if outputs already spent, check if inputs were consumed
                            if confirmed_leaf_height.is_none() {
                                if let Some(inputs) = tx.utxo_inputs() {
                                    for input in inputs {
                                        if input.tx_id != [0u8; 32] {
                                            if let Ok(None) = blockchain
                                                .get_utxo(&input.tx_id, input.output_index)
                                            {
                                                // Input consumed → tx confirmed at unknown height
                                                confirmed_leaf_height = Some(current_leaf_height);
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        if let Some(leaf_height) = confirmed_leaf_height {
                            let fallback_ts = std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .map(|d| d.as_secs())
                                .unwrap_or(0);
                            let block_ts =
                                get_block_timestamp(&blockchain, &ptx.txid, None, fallback_ts);
                            let confirmation = Some((block_ts as i64, leaf_height));
                            let _ = queries.set_transaction_confirmed(&ptx.txid, confirmation);
                            let _ = queries.subtract_pending_outgoing(
                                &wallet_id,
                                ptx.amount + ptx.fee.unwrap_or(0),
                            );

                            let confirmations =
                                current_leaf_height.saturating_sub(leaf_height) as u32 + 1;

                            seen_txids.insert(ptx.txid);
                            transactions.push(TransactionSummary {
                                txid: hex::encode(ptx.txid),
                                amount: -(ptx.amount as i64),
                                fee: ptx.fee.unwrap_or(0),
                                confirmations,
                                timestamp: block_ts,
                                tx_type: ptx.tx_type.as_str().to_string(),
                                execution_status: ptx
                                    .execution_status
                                    .map(|status| status.as_str().to_string()),
                                maturity_status: None,
                            });

                            log::info!(
                                "Updated tx {} to confirmed at leaf height {}",
                                hex::encode(ptx.txid),
                                leaf_height
                            );
                        } else {
                            // Not in mempool and not confirmed — dropped
                            let _ = queries.remove_transaction(&ptx.txid);
                            let _ = queries.subtract_pending_outgoing(
                                &wallet_id,
                                ptx.amount + ptx.fee.unwrap_or(0),
                            );
                            log::info!(
                                "Cleaned up dropped tx {} (no longer in mempool or blockchain)",
                                hex::encode(ptx.txid)
                            );
                        }
                    }
                }
            }
            Err(e) => {
                log::warn!("Failed to query pending outgoing transactions: {}", e);
            }
        }

        // Include confirmed outgoing transactions (sends, stakes, unstakes)
        if let Ok(confirmed_outgoing) = queries.list_confirmed_outgoing(&wallet_id) {
            for ctx in confirmed_outgoing {
                if !seen_txids.contains(&ctx.txid) {
                    seen_txids.insert(ctx.txid);
                    let (confirmed_at, height) = ctx.confirmation.unwrap_or((ctx.created_at, 0));
                    let confirmations = current_leaf_height.saturating_sub(height) as u32 + 1;
                    let timestamp =
                        get_block_timestamp(&blockchain, &ctx.txid, None, confirmed_at as u64);

                    transactions.push(TransactionSummary {
                        txid: hex::encode(ctx.txid),
                        amount: -(ctx.amount as i64), // Negative for outgoing
                        fee: ctx.fee.unwrap_or(0),
                        confirmations,
                        timestamp,
                        tx_type: ctx.tx_type.as_str().to_string(),
                        execution_status: ctx
                            .execution_status
                            .map(|status| status.as_str().to_string()),
                        maturity_status: None,
                    });
                }
            }
        }

        // Include confirmed incoming transactions from DB (receive, coinbase, withdrawal)
        // This ensures the UTXO scan (section 4) only catches newly discovered txs
        if let Ok(all_confirmed) = queries.list_all_confirmed(&wallet_id) {
            for ctx in all_confirmed {
                if !seen_txids.contains(&ctx.txid) {
                    seen_txids.insert(ctx.txid);
                    let (confirmed_at, db_height) = ctx.confirmation.unwrap_or((ctx.created_at, 0));

                    // For coinbase/withdrawal, use UTXO creation_height (leaf height)
                    // as source of truth. The wallet sync service may store the general
                    // block height which differs from leaf height in this hybrid chain.
                    let height = if matches!(
                        ctx.tx_type,
                        TransactionType::Coinbase | TransactionType::VmWithdrawal
                    ) {
                        (0u16..16)
                            .find_map(|idx| {
                                blockchain
                                    .get_utxo(&ctx.txid, idx)
                                    .ok()
                                    .flatten()
                                    .map(|u| u.creation_height)
                            })
                            .unwrap_or(db_height)
                    } else {
                        db_height
                    };

                    let confirmations = current_leaf_height.saturating_sub(height) as u32 + 1;
                    let timestamp = get_block_timestamp(
                        &blockchain,
                        &ctx.txid,
                        Some(height),
                        confirmed_at as u64,
                    );

                    // Determine sign based on tx type
                    let amount = if matches!(
                        ctx.tx_type,
                        TransactionType::ContractDeploy
                            | TransactionType::ContractCall
                            | TransactionType::AccountTransfer
                    ) {
                        pending_vm_amount_from_record(&ctx, &wallet_pkhs)
                            .unwrap_or(ctx.amount as i64)
                    } else if ctx.is_outgoing() {
                        -(ctx.amount as i64)
                    } else {
                        ctx.amount as i64
                    };

                    // Maturity status for coinbase/withdrawal
                    let maturity_required = xtal::consensus::validation::COINBASE_MATURITY;
                    let maturity_status = match ctx.tx_type {
                        TransactionType::Coinbase | TransactionType::VmWithdrawal => {
                            let age = current_leaf_height.saturating_sub(height);
                            let blocks_remaining = maturity_required.saturating_sub(age);
                            Some(MaturityStatus {
                                is_immature: blocks_remaining > 0,
                                blocks_until_mature: blocks_remaining,
                            })
                        }
                        _ => None,
                    };

                    transactions.push(TransactionSummary {
                        txid: hex::encode(ctx.txid),
                        amount,
                        fee: ctx.fee.unwrap_or(0),
                        confirmations,
                        timestamp,
                        tx_type: ctx.tx_type.as_str().to_string(),
                        execution_status: ctx
                            .execution_status
                            .map(|status| status.as_str().to_string()),
                        maturity_status,
                    });
                }
            }
        }
    } else {
        log::debug!("No wallet database available for outgoing transaction query");
    }

    // 3. Scan mempool for relevant pending VM transactions
    if let Some(ref wallet_id) = query_wallet_id {
        if let Some(ref db) = wallet_db_ref {
            let queries = WalletQueries::new(db.connection());
            transactions.extend(collect_pending_vm_mempool_transactions(
                blockchain.as_ref(),
                mempool.as_ref(),
                &wallet_pkhs,
                Some(&queries),
                Some(wallet_id.as_str()),
                &mut seen_txids,
            ));
        } else {
            transactions.extend(collect_pending_vm_mempool_transactions(
                blockchain.as_ref(),
                mempool.as_ref(),
                &wallet_pkhs,
                None,
                None,
                &mut seen_txids,
            ));
        }
    } else {
        transactions.extend(collect_pending_vm_mempool_transactions(
            blockchain.as_ref(),
            mempool.as_ref(),
            &wallet_pkhs,
            None,
            None,
            &mut seen_txids,
        ));
    }

    // 4. Scan mempool for incoming pending UTXO transactions
    let now = current_unix_timestamp();

    for tx in mempool.get_transactions() {
        // Get canonical transaction id
        let tx_hash = match tx.id() {
            Ok(h) => h,
            Err(_) => continue,
        };

        // Skip if already seen (e.g., it's our outgoing pending tx)
        if seen_txids.contains(&tx_hash) {
            continue;
        }

        // Sum all outputs to wallet addresses (a tx may have multiple outputs to us)
        let mut incoming_amount: u64 = 0;
        for output in tx.utxo_outputs() {
            if let Some(recipient_pkh) = extract_pkh_from_script(&output.script_pubkey) {
                if wallet_pkhs.contains(&recipient_pkh) {
                    incoming_amount += output.amount;
                }
            }
        }
        if incoming_amount > 0 {
            let fee = tx
                .utxo_inputs()
                .and_then(|inputs| extract_inputs(inputs, &blockchain).ok())
                .map(|parsed| {
                    let total_in: u64 = parsed.iter().filter_map(|i| i.amount).sum();
                    let total_out: u64 = tx.utxo_outputs().iter().map(|o| o.amount).sum();
                    if total_in > 0 && parsed.iter().all(|i| i.amount.is_some()) {
                        total_in.saturating_sub(total_out)
                    } else {
                        0
                    }
                })
                .unwrap_or(0);

            seen_txids.insert(tx_hash);
            transactions.push(TransactionSummary {
                txid: hex::encode(tx_hash),
                amount: incoming_amount as i64, // Positive for incoming
                fee,
                confirmations: 0,
                timestamp: now,
                tx_type: "receive".to_string(),
                execution_status: None,
                maturity_status: None,
            });

            if let (Some(db), Some(wallet_id)) = (wallet_db_ref.as_ref(), query_wallet_id.as_ref())
            {
                let queries = WalletQueries::new(db.connection());
                if queries.get_transaction(&tx_hash).ok().flatten().is_none() {
                    let input_details = tx.utxo_inputs().and_then(|inputs| {
                        let details: Vec<InputDetail> = inputs
                            .iter()
                            .map(|input| {
                                let (amount, address) = if let Ok(Some(utxo)) =
                                    blockchain.get_utxo(&input.tx_id, input.output_index)
                                {
                                    let address = extract_pkh_from_script(&utxo.script_pubkey)
                                        .map(|pkh| format_utxo_address(&pkh));
                                    (utxo.amount, address)
                                } else {
                                    (0, None)
                                };

                                InputDetail {
                                    txid: hex::encode(input.tx_id),
                                    index: input.output_index,
                                    amount,
                                    address,
                                }
                            })
                            .collect();

                        if details.is_empty() {
                            None
                        } else {
                            InputDetail::serialize_list(&details)
                        }
                    });

                    let record = TransactionRecord {
                        txid: tx_hash,
                        raw_tx: tx.encode(),
                        tx_type: TransactionType::Receive,
                        amount: incoming_amount,
                        fee: None,
                        to_address: None,
                        memo: None,
                        created_at: now as i64,
                        confirmation: None,
                        expires_at: None,
                        priority: None,
                        input_details,
                        execution_status: None,
                    };

                    if let Err(e) = queries.insert_transaction(wallet_id, &record) {
                        log::warn!("Failed to store pending incoming tx in wallet DB: {}", e);
                    }
                }
            }
        }
    }

    // 5. Get confirmed transactions from blockchain UTXOs (two-phase approach)
    // Phase 1: Collect — aggregate all UTXO amounts per txid across all wallet addresses
    struct CollectedUtxoTx {
        total_amount: u64,
        is_coinbase: bool,
        is_withdrawal: bool,
        creation_height: u64,
    }
    let mut collected_utxos: HashMap<[u8; 32], CollectedUtxoTx> = HashMap::new();

    for pkh in &wallet_pkhs {
        if let Ok(utxo_positions) = blockchain.get_utxos_by_address(pkh) {
            for pos in utxo_positions {
                if let Ok(Some(utxo_data)) = blockchain.get_utxo(&pos.tx_id, pos.output_index) {
                    collected_utxos
                        .entry(pos.tx_id)
                        .and_modify(|c| c.total_amount += utxo_data.amount)
                        .or_insert(CollectedUtxoTx {
                            total_amount: utxo_data.amount,
                            is_coinbase: utxo_data.is_coinbase,
                            is_withdrawal: utxo_data.is_withdrawal,
                            creation_height: utxo_data.creation_height,
                        });
                }
            }
        }
    }

    // Phase 2: Process — create summaries and DB records with correct aggregated amounts
    for (tx_id, info) in &collected_utxos {
        if seen_txids.contains(tx_id) {
            continue;
        }
        seen_txids.insert(*tx_id);

        // Calculate confirmations
        let confirmations = current_leaf_height.saturating_sub(info.creation_height) as u32 + 1;

        // Determine transaction type and maturity status
        let maturity_required = xtal::consensus::validation::COINBASE_MATURITY;
        let (tx_type, maturity_status) = if info.is_coinbase {
            let age = current_leaf_height.saturating_sub(info.creation_height);
            let blocks_remaining = maturity_required.saturating_sub(age);
            (
                "coinbase".to_string(),
                Some(MaturityStatus {
                    is_immature: blocks_remaining > 0,
                    blocks_until_mature: blocks_remaining,
                }),
            )
        } else if info.is_withdrawal {
            let age = current_leaf_height.saturating_sub(info.creation_height);
            let blocks_remaining = maturity_required.saturating_sub(age);
            (
                "vm_withdrawal".to_string(),
                Some(MaturityStatus {
                    is_immature: blocks_remaining > 0,
                    blocks_until_mature: blocks_remaining,
                }),
            )
        } else {
            ("receive".to_string(), None)
        };

        // Get block timestamp from the transaction index
        let timestamp = get_block_timestamp(&blockchain, tx_id, Some(info.creation_height), 0);

        // Look up the full transaction from the block (needed for raw_tx in DB + fee for standard txs)
        let found_tx_data = blockchain
            .get_block_by_leaf_height(info.creation_height)
            .ok()
            .flatten()
            .and_then(|block| {
                block
                    .transactions
                    .iter()
                    .find(|t| t.hash().ok().as_ref() == Some(tx_id))
                    .map(|found_tx| {
                        let raw = found_tx.encode();

                        // Coinbase/withdrawal have no meaningful inputs or fees
                        if info.is_coinbase || info.is_withdrawal {
                            return (raw, None, 0);
                        }

                        let parsed_inputs = found_tx
                            .utxo_inputs()
                            .and_then(|inputs| extract_inputs(inputs, &blockchain).ok());

                        let input_details = parsed_inputs
                            .as_ref()
                            .map(|parsed| {
                                let details: Vec<InputDetail> = parsed
                                    .iter()
                                    .map(|i| InputDetail {
                                        txid: i.txid.clone(),
                                        index: i.output_index,
                                        amount: i.amount.unwrap_or(0),
                                        address: i.address.clone(),
                                    })
                                    .collect();
                                InputDetail::serialize_list(&details)
                            })
                            .flatten();

                        let fee = parsed_inputs
                            .as_ref()
                            .map(|parsed| {
                                let total_in: u64 = parsed.iter().filter_map(|i| i.amount).sum();
                                let total_out: u64 =
                                    found_tx.utxo_outputs().iter().map(|o| o.amount).sum();
                                if total_in > 0 && parsed.iter().all(|i| i.amount.is_some()) {
                                    total_in.saturating_sub(total_out)
                                } else {
                                    0
                                }
                            })
                            .unwrap_or(0);

                        (raw, input_details, fee)
                    })
            });

        let (raw_tx, input_details, tx_fee) = found_tx_data
            .map(|(raw, details, fee)| (raw, details, fee))
            .unwrap_or_else(|| (Vec::new(), None, 0));

        // Store in wallet DB if not already present (captures input_details while resolvable)
        if let (Some(ref db), Some(ref wid)) = (&wallet_db_ref, &query_wallet_id) {
            let q = WalletQueries::new(db.connection());
            match q.get_transaction(tx_id).ok().flatten() {
                Some(existing) if existing.is_pending() => {
                    if let Err(e) = q.set_transaction_confirmed(
                        tx_id,
                        Some((timestamp as i64, info.creation_height)),
                    ) {
                        log::warn!(
                            "Failed to confirm tracked incoming tx {} in wallet DB: {}",
                            hex::encode(tx_id),
                            e
                        );
                    }
                }
                Some(_) => {}
                None => {
                    let record_tx_type = if info.is_coinbase {
                        TransactionType::Coinbase
                    } else {
                        if info.is_withdrawal {
                            TransactionType::VmWithdrawal
                        } else {
                            TransactionType::Receive
                        }
                    };

                    let record = TransactionRecord {
                        txid: *tx_id,
                        raw_tx,
                        tx_type: record_tx_type,
                        amount: info.total_amount,
                        fee: if info.is_coinbase || info.is_withdrawal {
                            None
                        } else {
                            Some(tx_fee)
                        },
                        to_address: None,
                        memo: None,
                        created_at: timestamp as i64,
                        confirmation: Some((timestamp as i64, info.creation_height)),
                        expires_at: None,
                        priority: None,
                        input_details,
                        execution_status: None,
                    };
                    if let Err(e) = q.insert_transaction(wid, &record) {
                        log::warn!("Failed to store incoming tx in wallet DB: {}", e);
                    }
                }
            }
        }

        transactions.push(TransactionSummary {
            txid: hex::encode(tx_id),
            amount: info.total_amount as i64,
            fee: tx_fee,
            confirmations,
            timestamp,
            tx_type,
            execution_status: None,
            maturity_status,
        });
    }

    // Sort by timestamp (newest first)
    transactions.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

    // Apply pagination
    let total_count = transactions.len();
    let offset = offset.unwrap_or(0);
    let paginated: Vec<_> = transactions.into_iter().skip(offset).take(limit).collect();
    let has_more = offset + paginated.len() < total_count;

    Ok(TransactionHistoryResponse {
        transactions: paginated,
        total_count,
        has_more,
    })
}

/// Get detailed transaction information for the transaction viewer
///
/// When `address` is provided (e.g. a validator address), it is included in
/// the set of "owned" addresses used for `is_mine` annotation and net-amount
/// calculation, even if the normal wallet is not loaded.
#[tauri::command]
pub async fn get_transaction_detail(
    state: State<'_, AppState>,
    txid: String,
    address: Option<String>,
) -> Result<TransactionDetail, String> {
    let wallet = state.services.wallet.as_ref();

    // At least one of the normal wallet or an explicit address must be available
    let wallet_loaded = wallet.map(|w| w.is_loaded()).unwrap_or(false);
    if !wallet_loaded && address.is_none() {
        return Err("No wallet loaded".to_string());
    }

    // Parse txid from hex
    let txid_bytes: [u8; 32] = hex::decode(&txid)
        .map_err(|e| format!("Invalid txid hex: {}", e))?
        .try_into()
        .map_err(|_| "Invalid txid length")?;

    let blockchain = state.services.blockchain();
    let mempool = state.services.mempool();
    let current_leaf_height = blockchain.get_current_leaf_height();

    // Try to find the transaction: first in pending, then in mempool, then on chain
    let mut raw_tx_bytes: Option<Vec<u8>> = None;
    let mut wallet_record: Option<TransactionRecord> = None;
    let mut pending_timestamp = 0u64;
    let mut pending_fee = 0u64;
    let mut stored_input_details: Option<String> = None;
    let mut execution_status: Option<String> = None;
    let mut raw_receipt: Option<TransactionReceipt> = None;
    let mut receipt: Option<TransactionReceiptDetail> = None;

    // Check wallet database for tracked transaction
    if let Some(db) = wallet.and_then(|w| w.database()) {
        let queries = WalletQueries::new(db.connection());
        if let Ok(Some(wallet_detail)) = queries.get_transaction_detail(&txid_bytes) {
            let tx_record = wallet_detail.transaction;
            wallet_record = Some(tx_record.clone());

            // Only use raw_tx if non-empty (coinbase/withdrawal records may have empty bytes)
            if !tx_record.raw_tx.is_empty() {
                raw_tx_bytes = Some(tx_record.raw_tx.clone());
            }
            pending_timestamp = tx_record.created_at as u64;
            pending_fee = tx_record.fee.unwrap_or(0);
            stored_input_details = tx_record.input_details.clone();
            receipt = wallet_detail.receipt.map(TransactionReceiptDetail::from);
            execution_status = receipt
                .as_ref()
                .map(|receipt| receipt.status.clone())
                .or_else(|| {
                    tx_record
                        .execution_status
                        .map(|status| status.as_str().to_string())
                });
        }
    }

    // Always prioritize blockchain receipts over cached ones to ensure we have the most current status
    // This is critical because:
    // 1. Live stem receipts are temporary (disappear when leaf persists)
    // 2. Persisted receipts (from confirmed leaves) are authoritative
    // 3. Wallet DB cache should only be a fallback when blockchain has no receipt yet
    let blockchain_receipt = lookup_persisted_receipt(blockchain.as_ref(), &txid_bytes)
        .or_else(|| lookup_live_stem_receipt(blockchain.as_ref(), &txid_bytes));

    if let Some(br) = blockchain_receipt {
        execution_status = Some(execution_status_label(&br.status));
        receipt = Some(TransactionReceiptDetail::from(br.clone()));
        raw_receipt = Some(br);
    }
    // Note: If no blockchain receipt found, we use the wallet DB receipt already captured above

    let mempool_tx = mempool
        .get_transaction_by_hash(&txid_bytes)
        .map(|tx| tx.as_ref().clone());
    if mempool_tx.is_some() && pending_timestamp == 0 {
        pending_timestamp = current_unix_timestamp();
    }

    let resolved = resolve_transaction_context(
        blockchain.as_ref(),
        &txid_bytes,
        current_leaf_height,
        raw_tx_bytes.as_deref(),
        wallet_record.as_ref(),
        mempool_tx,
        pending_timestamp,
    )?;
    let ResolvedTransactionContext {
        tx,
        block_height,
        block_hash,
        timestamp,
        confirmations,
        is_pending: resolved_pending,
    } = resolved;
    let is_pending = resolved_pending;

    // Extract transaction details based on type
    let (tx_type, inputs, outputs, total_input, total_output, fee) = extract_transaction_details(
        &tx,
        &blockchain,
        is_pending,
        pending_fee,
        stored_input_details,
        raw_receipt.as_ref(),
    )?;

    let mut wallet_addresses = wallet
        .map(|w| get_wallet_addresses(w))
        .transpose()?
        .unwrap_or_default();
    // Include the explicit address (e.g. validator address) so its I/O gets tagged
    if let Some(ref addr) = address {
        wallet_addresses.insert(addr.clone());
    }
    // Calculate maturity status for coinbase/withdrawal transactions
    let maturity_status = if tx_type_has_maturity(&tx_type) && block_height.is_some() {
        let creation_height = block_height.unwrap();
        let age = current_leaf_height.saturating_sub(creation_height);
        let maturity_required = xtal::consensus::validation::COINBASE_MATURITY;
        let blocks_remaining = maturity_required.saturating_sub(age);
        Some(MaturityStatus {
            is_immature: blocks_remaining > 0,
            blocks_until_mature: blocks_remaining,
        })
    } else {
        None
    };

    Ok(build_transaction_detail_response(
        txid,
        &tx,
        tx_type,
        inputs,
        outputs,
        total_input,
        total_output,
        fee,
        confirmations,
        timestamp,
        block_hash,
        block_height,
        &wallet_addresses,
        execution_status,
        raw_receipt.as_ref(),
        receipt,
        None,
        maturity_status,
    ))
}

/// Look up the timestamp of a leaf block at the given height.
fn leaf_timestamp(blockchain: &xtal::blockchain::Blockchain, leaf_height: u64) -> Option<u64> {
    blockchain
        .get_block_by_leaf_height(leaf_height)
        .ok()
        .flatten()
        .map(|block| block.header.timestamp)
}

/// Look up the block timestamp for a transaction.
///
/// Resolution order:
/// 1. Transaction index → leaf height → block timestamp
/// 2. Caller-provided `leaf_height` → block timestamp (for UTXO-sourced txs)
/// 3. `fallback` value
fn get_block_timestamp(
    blockchain: &xtal::blockchain::Blockchain,
    txid: &[u8; 32],
    leaf_height: Option<u64>,
    fallback: u64,
) -> u64 {
    // The tx index stores the leaf height a transaction was included in.
    if let Ok(Some(idx)) = blockchain.get_transaction_index(txid) {
        if let Some(ts) = leaf_timestamp(blockchain, idx.block_height) {
            return ts;
        }
    }

    // For UTXO-sourced transactions, the caller provides the leaf height
    // directly (from utxo_data.creation_height).
    if let Some(lh) = leaf_height {
        if let Some(ts) = leaf_timestamp(blockchain, lh) {
            return ts;
        }
    }

    fallback
}

fn current_unix_timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn annotate_transaction_io_ownership(
    inputs: &mut [TransactionInput],
    outputs: &mut [TransactionOutput],
    wallet_addresses: &HashSet<String>,
) {
    for input in inputs {
        input.is_mine = input
            .address
            .as_ref()
            .map(|address| wallet_addresses.contains(address))
            .unwrap_or(false);
    }

    for output in outputs {
        output.is_mine = output
            .address
            .as_ref()
            .map(|address| wallet_addresses.contains(address))
            .unwrap_or(false);
    }
}

fn build_utxo_detail(
    tx: &Transaction,
    inputs: Vec<TransactionInput>,
    outputs: Vec<TransactionOutput>,
    total_input: u64,
    total_output: u64,
    net_amount: i64,
    maturity_status: Option<MaturityStatus>,
) -> UTXODetail {
    let bridge = match tx {
        Transaction::VmWithdrawal(withdrawal_tx) => Some(UTXOBridgeDetail::VmWithdrawal {
            withdrawal_value: withdrawal_tx.output.amount,
            created_output: outputs.first().cloned(),
        }),
        _ => None,
    };

    UTXODetail {
        inputs,
        outputs,
        total_input,
        total_output,
        net_amount,
        maturity_status,
        bridge,
    }
}

fn build_vm_detail(
    tx: &Transaction,
    tx_type: &str,
    inputs: &[TransactionInput],
    total_input: u64,
    raw_receipt: Option<&TransactionReceipt>,
) -> VMDetail {
    match tx {
        Transaction::ContractCall(call_tx) => {
            let bridge = if tx_type == "vm_deposit" {
                Some(VMBridgeDetail::VmDeposit {
                    deposited_amount: total_input,
                    source_input: inputs.first().cloned(),
                })
            } else {
                build_cage_withdrawal_bridge(call_tx, raw_receipt)
            };

            VMDetail {
                caller: Some(format!(
                    "0x{}",
                    hex::encode(hash_public_key(&call_tx.caller))
                )),
                contract_address: Some(format!("0x{}", hex::encode(call_tx.contract_address))),
                method: Some(call_tx.method.clone()),
                gas_limit: Some(call_tx.gas_limit),
                gas_price: call_tx.gas_price,
                nonce: Some(call_tx.nonce),
                value: Some(call_tx.value),
                data_size: Some(call_tx.data.len()),
                preferred_fruit_type: None,
                recipient: None,
                transfer_amount: None,
                currency: None,
                bridge,
            }
        }
        Transaction::ContractDeploy(deploy_tx) => VMDetail {
            caller: Some(format!(
                "0x{}",
                hex::encode(hash_public_key(&deploy_tx.sender))
            )),
            contract_address: None,
            method: None,
            gas_limit: Some(deploy_tx.gas_limit),
            gas_price: deploy_tx.gas_price,
            nonce: Some(deploy_tx.nonce),
            value: None,
            data_size: Some(deploy_tx.wasm.len()),
            preferred_fruit_type: deploy_tx
                .preferred_fruit_type
                .map(|fruit_type| format!("{fruit_type:?}")),
            recipient: None,
            transfer_amount: None,
            currency: None,
            bridge: None,
        },
        Transaction::AccountTransfer(transfer_tx) => VMDetail {
            caller: Some(format!(
                "0x{}",
                hex::encode(hash_public_key(&transfer_tx.sender))
            )),
            contract_address: None,
            method: None,
            gas_limit: Some(transfer_tx.gas_limit),
            gas_price: transfer_tx.gas_price,
            nonce: Some(transfer_tx.nonce),
            value: None,
            data_size: None,
            preferred_fruit_type: None,
            recipient: Some(format!(
                "0x{}",
                hex::encode(transfer_tx.recipient.as_bytes())
            )),
            transfer_amount: Some(transfer_tx.amount),
            currency: Some(format!("{:?}", transfer_tx.currency)),
            bridge: None,
        },
        _ => VMDetail {
            caller: None,
            contract_address: None,
            method: None,
            gas_limit: None,
            gas_price: None,
            nonce: None,
            value: None,
            data_size: None,
            preferred_fruit_type: None,
            recipient: None,
            transfer_amount: None,
            currency: None,
            bridge: None,
        },
    }
}

fn build_cage_withdrawal_bridge(
    call_tx: &ContractCallTransaction,
    raw_receipt: Option<&TransactionReceipt>,
) -> Option<VMBridgeDetail> {
    let decoded = decode_cage_withdrawal_call(call_tx)?;
    let produced = extract_produced_withdrawal(raw_receipt);

    Some(VMBridgeDetail::CageWithdrawal {
        requested_amount: decoded.requested_amount,
        net_withdrawal_amount: produced.as_ref().map(|view| view.net_withdrawal_amount),
        requested_recipient: decoded.requested_recipient,
        produced_output_recipient: produced.and_then(|view| view.produced_output_recipient),
    })
}

fn decode_cage_withdrawal_call(
    call_tx: &ContractCallTransaction,
) -> Option<DecodedCageWithdrawalCall> {
    if call_tx.contract_address != CAGE_CONTRACT_ADDRESS {
        return None;
    }

    let abi = cage_abi();
    let withdraw_method = abi.method("withdraw")?;
    let selector: [u8; 4] = call_tx.data.get(..4)?.try_into().ok()?;

    let resolved_method = match call_tx.method.as_str() {
        "withdraw" => withdraw_method,
        "invoke" => abi.method_by_selector(&selector)?,
        _ => return None,
    };

    if resolved_method.name != "withdraw" || selector != withdraw_method.selector {
        return None;
    }

    if resolved_method.params.len() != 2 {
        return None;
    }

    let (requested_recipient, recipient_len) = decode_cage_withdrawal_recipient(
        &resolved_method.params[0].param_type,
        &call_tx.data[4..],
    )?;
    let (requested_amount, _) = decode_abi_u64(
        &resolved_method.params[1].param_type,
        &call_tx.data[4 + recipient_len..],
    )?;

    Some(DecodedCageWithdrawalCall {
        requested_amount,
        requested_recipient,
    })
}

fn decode_cage_withdrawal_recipient(
    param_type: &ParamType,
    data: &[u8],
) -> Option<(String, usize)> {
    match param_type {
        ParamType::UtxoAddress => {
            let len = *data.first()? as usize;
            if len == 0 || len > 40 {
                return None;
            }
            let address = std::str::from_utf8(data.get(1..1 + len)?).ok()?.to_string();
            Some((address, 1 + len))
        }
        ParamType::Bytes20 | ParamType::VmAddress => {
            let (recipient, consumed) = decode_abi_address(param_type, data)?;
            Some((format_utxo_address(&recipient), consumed))
        }
        _ => None,
    }
}

fn decode_abi_address(param_type: &ParamType, data: &[u8]) -> Option<([u8; 20], usize)> {
    match param_type {
        ParamType::Bytes20 | ParamType::VmAddress => {
            let bytes = data.get(..20)?;
            let mut address = [0u8; 20];
            address.copy_from_slice(bytes);
            Some((address, 20))
        }
        _ => None,
    }
}

fn decode_abi_u64(param_type: &ParamType, data: &[u8]) -> Option<(u64, usize)> {
    match param_type {
        ParamType::U64 | ParamType::XtalAmount => {
            let bytes: [u8; 8] = data.get(..8)?.try_into().ok()?;
            Some((u64::from_le_bytes(bytes), 8))
        }
        _ => None,
    }
}

fn extract_produced_withdrawal(
    raw_receipt: Option<&TransactionReceipt>,
) -> Option<ProducedWithdrawalView> {
    let withdrawal = raw_receipt?.produced_withdrawals.first()?;

    Some(ProducedWithdrawalView {
        net_withdrawal_amount: withdrawal.amount,
        produced_output_recipient: String::from_utf8(withdrawal.recipient.clone()).ok(),
    })
}

pub(crate) fn build_transaction_detail_response(
    txid: String,
    tx: &Transaction,
    tx_type: String,
    mut inputs: Vec<TransactionInput>,
    mut outputs: Vec<TransactionOutput>,
    total_input: u64,
    total_output: u64,
    fee: Option<u64>,
    confirmations: u32,
    timestamp: u64,
    block_hash: Option<String>,
    block_height: Option<u64>,
    wallet_addresses: &HashSet<String>,
    execution_status: Option<String>,
    raw_receipt: Option<&TransactionReceipt>,
    receipt: Option<TransactionReceiptDetail>,
    memo: Option<String>,
    maturity_status: Option<MaturityStatus>,
) -> TransactionDetail {
    annotate_transaction_io_ownership(&mut inputs, &mut outputs, wallet_addresses);
    let net_amount = calculate_net_amount(&inputs, &outputs, wallet_addresses);

    let detail = match tx {
        Transaction::ContractCall(_)
        | Transaction::ContractDeploy(_)
        | Transaction::AccountTransfer(_) => TransactionDetailPayload::Vm(build_vm_detail(
            tx,
            &tx_type,
            &inputs,
            total_input,
            raw_receipt,
        )),
        _ => TransactionDetailPayload::Utxo(build_utxo_detail(
            tx,
            inputs,
            outputs,
            total_input,
            total_output,
            net_amount,
            maturity_status,
        )),
    };

    TransactionDetail {
        txid,
        tx_type,
        detail,
        fee,
        confirmations,
        timestamp,
        block_hash,
        block_height,
        execution_status,
        receipt,
        memo,
    }
}

fn classify_vm_wallet_transaction(
    tx: &Transaction,
    wallet_pkhs: &std::collections::HashSet<[u8; 20]>,
) -> Option<VmWalletTransactionView> {
    match tx {
        Transaction::AccountTransfer(transfer_tx) => {
            let sender = hash_public_key(&transfer_tx.sender);
            let recipient = *transfer_tx.recipient;
            let sender_watched = wallet_pkhs.contains(&sender);
            let recipient_watched = wallet_pkhs.contains(&recipient);

            if !sender_watched && !recipient_watched {
                return None;
            }

            let fee = vm_transaction_fee(tx).unwrap_or(0);
            let summary_amount = if sender_watched {
                -(transfer_tx.amount as i64)
            } else {
                transfer_tx.amount as i64
            };

            Some(VmWalletTransactionView {
                tx_type: TransactionType::AccountTransfer,
                amount: transfer_tx.amount,
                fee,
                summary_amount,
                to_address: Some(format!("0x{}", hex::encode(recipient))),
            })
        }
        Transaction::ContractCall(call_tx) => {
            let caller = hash_public_key(&call_tx.caller);
            let caller_watched = wallet_pkhs.contains(&caller);
            let contract_watched = wallet_pkhs.contains(&call_tx.contract_address);

            if !caller_watched && !contract_watched {
                return None;
            }

            let fee = vm_transaction_fee(tx).unwrap_or(0);
            let total = call_tx.value.saturating_add(fee);
            let summary_amount = if caller_watched {
                -(total as i64)
            } else {
                call_tx.value as i64
            };

            Some(VmWalletTransactionView {
                tx_type: TransactionType::ContractCall,
                amount: total,
                fee,
                summary_amount,
                to_address: Some(format!("0x{}", hex::encode(call_tx.contract_address))),
            })
        }
        Transaction::ContractDeploy(deploy_tx) => {
            let sender = hash_public_key(&deploy_tx.sender);
            if !wallet_pkhs.contains(&sender) {
                return None;
            }

            let fee = vm_transaction_fee(tx).unwrap_or(0);

            Some(VmWalletTransactionView {
                tx_type: TransactionType::ContractDeploy,
                amount: fee,
                fee,
                summary_amount: -(fee as i64),
                to_address: None,
            })
        }
        _ => None,
    }
}

fn pending_vm_amount_from_record(
    record: &TransactionRecord,
    wallet_pkhs: &std::collections::HashSet<[u8; 20]>,
) -> Option<i64> {
    let tx = Transaction::decode(&mut record.raw_tx.as_slice()).ok()?;
    classify_vm_wallet_transaction(&tx, wallet_pkhs).map(|info| info.summary_amount)
}

fn tx_in_active_stems(blockchain: &xtal::blockchain::Blockchain, txid: &[u8; 32]) -> bool {
    for ((stem_hash, _nonce), _) in blockchain.get_stems_since_last_leaf() {
        let Ok(stem_block) = blockchain.get_block_by_hash(&stem_hash) else {
            continue;
        };

        for fruit_hash in &stem_block.fruit_hashes {
            let Some(fruit) = blockchain.get_fruit_by_hash(fruit_hash, None) else {
                continue;
            };

            if fruit
                .transactions
                .iter()
                .any(|fruit_tx| fruit_tx.hash() == *txid)
            {
                return true;
            }
        }
    }

    false
}

fn pending_transaction_context(tx: Transaction, timestamp: u64) -> ResolvedTransactionContext {
    ResolvedTransactionContext {
        tx,
        block_height: None,
        block_hash: None,
        timestamp: if timestamp == 0 {
            current_unix_timestamp()
        } else {
            timestamp
        },
        confirmations: 0,
        is_pending: true,
    }
}

fn find_transaction_in_block_or_fruits(
    blockchain: &xtal::blockchain::Blockchain,
    block: &xtal::blockchain::Block,
    txid: &[u8; 32],
) -> Option<Transaction> {
    if let Some(tx) = block.transactions.iter().find_map(|tx| match tx.id() {
        Ok(id) if id == *txid => Some(tx.clone()),
        _ => None,
    }) {
        return Some(tx);
    }

    for fruit_hash in &block.fruit_hashes {
        let Some(fruit) = blockchain.get_fruit_by_hash(fruit_hash, None) else {
            continue;
        };

        if let Some(fruit_tx) = fruit
            .transactions
            .iter()
            .find(|fruit_tx| fruit_tx.hash() == *txid)
        {
            return Some(match fruit_tx {
                FruitTx::AccountTransfer(tx) => Transaction::AccountTransfer(tx.clone()),
                FruitTx::ContractCall(tx) => Transaction::ContractCall(tx.clone()),
                FruitTx::ContractDeploy(tx) => Transaction::ContractDeploy(tx.clone()),
            });
        }
    }

    None
}

fn resolve_active_stem_transaction_context(
    blockchain: &xtal::blockchain::Blockchain,
    txid: &[u8; 32],
) -> Option<ResolvedTransactionContext> {
    for ((stem_hash, _nonce), stem_timestamp) in blockchain.get_stems_since_last_leaf() {
        let Ok(stem_block) = blockchain.get_block_by_hash(&stem_hash) else {
            continue;
        };

        let Some(tx) = find_transaction_in_block_or_fruits(blockchain, &stem_block, txid) else {
            continue;
        };

        return Some(ResolvedTransactionContext {
            tx,
            block_height: None,
            block_hash: Some(hex::encode(stem_hash)),
            timestamp: stem_block.header.timestamp.max(stem_timestamp),
            confirmations: 0,
            is_pending: false,
        });
    }

    None
}

fn resolve_finalized_transaction_context(
    blockchain: &xtal::blockchain::Blockchain,
    txid: &[u8; 32],
    current_leaf_height: u64,
) -> Result<Option<ResolvedTransactionContext>, String> {
    let Some(index) = blockchain
        .get_transaction_index(txid)
        .map_err(|e| format!("Failed to lookup transaction index: {}", e))?
    else {
        return Ok(None);
    };

    let block = blockchain
        .get_block_by_hash_arc(&index.block_hash)
        .map_err(|e| format!("Failed to load block: {}", e))?;
    let Some(tx) = find_transaction_in_block_or_fruits(blockchain, block.as_ref(), txid) else {
        return Ok(None);
    };

    Ok(Some(ResolvedTransactionContext {
        tx,
        block_height: Some(index.block_height),
        block_hash: Some(hex::encode(index.block_hash)),
        timestamp: block.header.timestamp,
        confirmations: current_leaf_height.saturating_sub(index.block_height) as u32 + 1,
        is_pending: false,
    }))
}

fn resolve_utxo_transaction_context(
    blockchain: &xtal::blockchain::Blockchain,
    txid: &[u8; 32],
    current_leaf_height: u64,
) -> Result<Option<ResolvedTransactionContext>, String> {
    let Some(creation_height) = (0u16..64).find_map(|idx| {
        blockchain
            .get_utxo(txid, idx)
            .ok()
            .flatten()
            .map(|utxo| utxo.creation_height)
    }) else {
        return Ok(None);
    };

    let block = blockchain
        .get_block_by_leaf_height(creation_height)
        .map_err(|e| format!("Failed to get block: {}", e))?
        .ok_or("Block not found at UTXO creation height")?;

    let tx = find_transaction_in_block_or_fruits(blockchain, &block, txid)
        .ok_or("Transaction not found in block")?;

    Ok(Some(ResolvedTransactionContext {
        tx,
        block_height: Some(creation_height),
        block_hash: Some(hex::encode(block.hash())),
        timestamp: block.header.timestamp,
        confirmations: current_leaf_height.saturating_sub(creation_height) as u32 + 1,
        is_pending: false,
    }))
}

fn resolve_transaction_context(
    blockchain: &xtal::blockchain::Blockchain,
    txid: &[u8; 32],
    current_leaf_height: u64,
    raw_tx_bytes: Option<&[u8]>,
    wallet_record: Option<&TransactionRecord>,
    mempool_tx: Option<Transaction>,
    pending_timestamp: u64,
) -> Result<ResolvedTransactionContext, String> {
    if let Some(bytes) = raw_tx_bytes {
        let mut tx_bytes = bytes;
        let decoded_tx = Transaction::decode(&mut tx_bytes)
            .map_err(|e| format!("Failed to decode transaction: {:?}", e))?;

        if let Some(context) = resolve_active_stem_transaction_context(blockchain, txid) {
            return Ok(context);
        }

        if let Some(context) =
            resolve_finalized_transaction_context(blockchain, txid, current_leaf_height)?
        {
            return Ok(context);
        }

        if let Some(tx) = mempool_tx {
            return Ok(pending_transaction_context(tx, pending_timestamp));
        }

        if let Some(record) = wallet_record {
            if let Some(height) = record.height() {
                let block_info = blockchain.get_block_by_leaf_height(height).ok().flatten();
                let timestamp = block_info
                    .as_ref()
                    .map(|block| block.header.timestamp)
                    .unwrap_or_else(|| record.confirmed_at().unwrap_or(record.created_at) as u64);

                return Ok(ResolvedTransactionContext {
                    tx: decoded_tx,
                    block_height: Some(height),
                    block_hash: block_info.as_ref().map(|block| hex::encode(block.hash())),
                    timestamp,
                    confirmations: current_leaf_height.saturating_sub(height) as u32 + 1,
                    is_pending: false,
                });
            }
        }

        return Ok(pending_transaction_context(decoded_tx, pending_timestamp));
    }

    if let Some(tx) = mempool_tx {
        return Ok(pending_transaction_context(tx, pending_timestamp));
    }

    if let Some(context) = resolve_active_stem_transaction_context(blockchain, txid) {
        return Ok(context);
    }

    if let Some(context) =
        resolve_finalized_transaction_context(blockchain, txid, current_leaf_height)?
    {
        return Ok(context);
    }

    if let Some(context) = resolve_utxo_transaction_context(blockchain, txid, current_leaf_height)?
    {
        return Ok(context);
    }

    Err("Transaction not found".to_string())
}

fn lookup_live_stem_receipt(
    blockchain: &xtal::blockchain::Blockchain,
    txid: &[u8; 32],
) -> Option<TransactionReceipt> {
    for ((stem_hash, _nonce), _) in blockchain.get_stems_since_last_leaf() {
        let Some(metadata) = blockchain.get_stem_metadata(&stem_hash) else {
            continue;
        };

        for receipts in metadata.block_receipts.receipts_by_fruit.values() {
            if let Some(receipt) = receipts.iter().find(|receipt| receipt.tx_hash == *txid) {
                return Some(receipt.clone());
            }
        }
    }

    None
}

fn lookup_persisted_receipt(
    blockchain: &xtal::blockchain::Blockchain,
    txid: &[u8; 32],
) -> Option<TransactionReceipt> {
    blockchain.get_receipt(txid).ok().flatten()
}

fn lookup_any_receipt(
    blockchain: &xtal::blockchain::Blockchain,
    txid: &[u8; 32],
) -> Option<TransactionReceipt> {
    lookup_live_stem_receipt(blockchain, txid)
        .or_else(|| lookup_persisted_receipt(blockchain, txid))
}

fn collect_pending_vm_mempool_transactions(
    blockchain: &xtal::blockchain::Blockchain,
    mempool: &xtal::mempool::Mempool,
    wallet_pkhs: &std::collections::HashSet<[u8; 20]>,
    queries: Option<&WalletQueries>,
    wallet_id: Option<&str>,
    seen_txids: &mut std::collections::HashSet<[u8; 32]>,
) -> Vec<TransactionSummary> {
    let now = current_unix_timestamp();
    let mempool_txs = mempool.get_transactions();
    let mut mempool_hashes = std::collections::HashSet::new();

    for tx in &mempool_txs {
        if let Ok(tx_hash) = tx.id() {
            mempool_hashes.insert(tx_hash);
        }
    }

    if let (Some(queries), Some(wallet_id)) = (queries, wallet_id) {
        if let Ok(count) = queries.count_vm_transactions(wallet_id) {
            if count > 0 {
                if let Ok(records) = queries.list_vm_transactions(wallet_id, count as usize, 0) {
                    for record in records {
                        if record.confirmation.is_none()
                            && !mempool_hashes.contains(&record.txid)
                            && !tx_in_active_stems(blockchain, &record.txid)
                        {
                            if lookup_any_receipt(blockchain, &record.txid).is_some() {
                                continue;
                            }

                            let _ = queries.remove_transaction(&record.txid);
                            log::info!(
                                "Cleaned up dropped VM tx {} (no longer in mempool or blockchain)",
                                hex::encode(record.txid)
                            );
                        }
                    }
                }
            }
        }
    }

    let mut summaries = Vec::new();

    for tx in mempool_txs {
        let tx_hash = match tx.id() {
            Ok(hash) => hash,
            Err(_) => continue,
        };

        let Some(view) = classify_vm_wallet_transaction(&tx, wallet_pkhs) else {
            continue;
        };

        let existing = queries.and_then(|q| q.get_transaction(&tx_hash).ok().flatten());
        if existing
            .as_ref()
            .is_some_and(|record| record.confirmation.is_some())
        {
            continue;
        }

        if existing.is_none() {
            if let (Some(queries), Some(wallet_id)) = (queries, wallet_id) {
                let record = TransactionRecord {
                    txid: tx_hash,
                    raw_tx: tx.encode(),
                    tx_type: view.tx_type,
                    amount: view.amount,
                    fee: Some(view.fee),
                    to_address: view.to_address.clone(),
                    memo: None,
                    created_at: now as i64,
                    confirmation: None,
                    expires_at: None,
                    priority: Some(0),
                    input_details: None,
                    execution_status: Some(TransactionExecutionStatus::Unknown),
                };
                if let Err(e) = queries.insert_transaction(wallet_id, &record) {
                    log::warn!("Failed to store pending VM tx in wallet DB: {}", e);
                }
            }
        }

        if seen_txids.contains(&tx_hash) {
            continue;
        }

        let timestamp = existing
            .as_ref()
            .map(|record| record.created_at as u64)
            .unwrap_or(now);
        let execution_status = lookup_any_receipt(blockchain, &tx_hash)
            .map(|receipt| execution_status_label(&receipt.status))
            .or_else(|| {
                existing
                    .as_ref()
                    .and_then(|record| record.execution_status)
                    .map(|status| status.as_str().to_string())
            })
            .or_else(|| Some("unknown".to_string()));

        seen_txids.insert(tx_hash);
        summaries.push(TransactionSummary {
            txid: hex::encode(tx_hash),
            amount: view.summary_amount,
            fee: view.fee,
            confirmations: 0,
            timestamp,
            tx_type: view.tx_type.as_str().to_string(),
            execution_status,
            maturity_status: None,
        });
    }

    summaries
}

fn collect_active_stem_vm_transactions(
    blockchain: &xtal::blockchain::Blockchain,
    wallet_pkhs: &std::collections::HashSet<[u8; 20]>,
    seen_txids: &mut std::collections::HashSet<[u8; 32]>,
) -> Vec<TransactionSummary> {
    let mut summaries = Vec::new();

    for ((stem_hash, _nonce), stem_timestamp) in blockchain.get_stems_since_last_leaf() {
        let Ok(stem_block) = blockchain.get_block_by_hash(&stem_hash) else {
            continue;
        };
        let Some(metadata) = blockchain.get_stem_metadata(&stem_hash) else {
            continue;
        };

        let mut receipts_by_tx = std::collections::HashMap::new();
        for receipts in metadata.block_receipts.receipts_by_fruit.values() {
            for receipt in receipts {
                receipts_by_tx.insert(receipt.tx_hash, receipt);
            }
        }

        for fruit_hash in &stem_block.fruit_hashes {
            let Some(fruit) = blockchain.get_fruit_by_hash(fruit_hash, None) else {
                continue;
            };

            for fruit_tx in &fruit.transactions {
                let tx_hash = fruit_tx.hash();
                if seen_txids.contains(&tx_hash) {
                    continue;
                }

                let tx = match fruit_tx {
                    FruitTx::AccountTransfer(tx) => Transaction::AccountTransfer(tx.clone()),
                    FruitTx::ContractCall(tx) => Transaction::ContractCall(tx.clone()),
                    FruitTx::ContractDeploy(tx) => Transaction::ContractDeploy(tx.clone()),
                };

                let Some(view) = classify_vm_wallet_transaction(&tx, wallet_pkhs) else {
                    continue;
                };

                let execution_status = receipts_by_tx
                    .get(&tx_hash)
                    .map(|receipt| execution_status_label(&receipt.status));

                seen_txids.insert(tx_hash);
                summaries.push(TransactionSummary {
                    txid: hex::encode(tx_hash),
                    amount: view.summary_amount,
                    fee: view.fee,
                    confirmations: 0,
                    timestamp: stem_block.header.timestamp.max(stem_timestamp),
                    tx_type: view.tx_type.as_str().to_string(),
                    execution_status,
                    maturity_status: None,
                });
            }
        }
    }

    summaries
}

/// Get all wallet addresses for net amount calculation
///
/// Uses the wallet database (public keys table) as the primary source,
/// which works regardless of wallet lock state. Falls back to HD wallet
/// derivation if the database is unavailable.
fn get_wallet_addresses(
    wallet: &xtal::wallet::WalletManager,
) -> Result<std::collections::HashSet<String>, String> {
    let mut addresses = std::collections::HashSet::new();

    // Primary: read public keys from database (works even when wallet is locked)
    if let (Some(db), Some(wallet_id)) = (wallet.database(), wallet.current_wallet_id()) {
        let queries = WalletQueries::new(db.connection());
        if let Ok(all_keys) = queries.get_public_keys(&wallet_id, None) {
            for key in &all_keys {
                // Use stored address if available
                if let Some(ref addr) = key.address {
                    addresses.insert(addr.clone());
                    continue;
                }
                // Otherwise compute from public key
                if let Ok(pk_bytes) = hex::decode(&key.public_key_hex) {
                    if pk_bytes.len() == 32 {
                        if let Ok(pk_array) = <[u8; 32]>::try_from(pk_bytes.as_slice()) {
                            if let Ok(vk) = VerifyingKey::from_bytes(&pk_array) {
                                let pkh = hash_public_key(&vk);
                                addresses.insert(format_utxo_address(&pkh));
                            }
                        }
                    }
                }
            }
        }
    }

    // Fallback: if DB approach yielded nothing, try HD wallet derivation
    if addresses.is_empty() {
        if let Ok(mining_keys) = wallet.with_wallet(|w| w.get_all_mining_keys()) {
            for (_, _, vk) in mining_keys {
                let pkh = hash_public_key(&vk);
                addresses.insert(format_utxo_address(&pkh));
            }
        }

        if let Ok(receiving) = wallet.with_wallet(|w| w.get_all_receiving_addresses()) {
            for (_, _, addr, _) in receiving {
                addresses.insert(addr);
            }
        }

        if let Ok(change) = wallet.with_wallet(|w| w.get_all_change_addresses()) {
            for (_, _, addr, _) in change {
                addresses.insert(addr);
            }
        }
    }

    Ok(addresses)
}

/// Calculate net amount for wallet from inputs and outputs
fn calculate_net_amount(
    inputs: &[TransactionInput],
    outputs: &[TransactionOutput],
    wallet_addresses: &std::collections::HashSet<String>,
) -> i64 {
    // Sum outputs going TO wallet
    let mut received: u64 = 0;
    for out in outputs {
        if let Some(ref addr) = out.address {
            if wallet_addresses.contains(addr) {
                received = received.saturating_add(out.amount);
            }
        }
    }

    // Sum inputs coming FROM wallet
    let mut spent: u64 = 0;
    for inp in inputs {
        if let Some(ref addr) = inp.address {
            if wallet_addresses.contains(addr) {
                if let Some(amount) = inp.amount {
                    spent = spent.saturating_add(amount);
                }
            }
        }
    }

    // Net = received - spent (can be negative for outgoing)
    (received as i64).saturating_sub(spent as i64)
}

// =============================================================================
// Wallet Sync
// =============================================================================

/// Start the wallet sync service to index incoming transactions (coinbase, receives).
///
/// Stops any previously running sync service, then creates a new one with the
/// current wallet's addresses and starts it in the background.
fn start_wallet_sync(state: &AppState, wallet: &WalletManager) {
    // Stop any existing sync service
    if let Ok(mut guard) = state.wallet_sync.lock() {
        if let Some(sync) = guard.take() {
            sync.stop();
        }
    }

    let blockchain = state.services.blockchain().clone();
    let (db, wallet_id) = match (wallet.database(), wallet.current_wallet_id()) {
        (Some(db), Some(id)) => (db, id),
        _ => {
            log::debug!("Wallet database or ID not available for sync service");
            return;
        }
    };

    let sync_service = match WalletSyncService::new(
        blockchain as std::sync::Arc<dyn ChainDataProvider>,
        db,
        wallet_id,
    ) {
        Ok(s) => std::sync::Arc::new(s),
        Err(e) => {
            log::warn!("Failed to create wallet sync service: {}", e);
            return;
        }
    };

    // Gather wallet addresses to monitor (mining, receiving, change)
    let pkhs = match get_wallet_pkh_set(wallet) {
        Ok(p) => p,
        Err(e) => {
            log::warn!("Failed to get wallet addresses for sync: {}", e);
            return;
        }
    };

    let addrs: Vec<[u8; 20]> = pkhs.into_iter().collect();
    let sync_clone = sync_service.clone();

    tauri::async_runtime::spawn(async move {
        if let Err(e) = sync_clone.add_addresses(addrs).await {
            log::warn!("Failed to add addresses to sync service: {}", e);
            return;
        }
        log::info!("Wallet sync service started");
        sync_clone.start().await;
    });

    // Store for later cleanup on wallet unload
    if let Ok(mut guard) = state.wallet_sync.lock() {
        *guard = Some(sync_service);
    }
}

// =============================================================================
// Wallet Export
// =============================================================================

/// Export wallet file to a backup location
#[tauri::command]
pub async fn export_wallet(
    state: State<'_, AppState>,
    export_path: String,
) -> Result<String, String> {
    let wallet = state
        .services
        .wallet
        .as_ref()
        .ok_or("Wallet not available")?;

    if !wallet.is_loaded() {
        return Err("No wallet loaded".to_string());
    }

    // Get current wallet path
    let current_path = wallet
        .get_wallet_path()
        .ok_or("Wallet path not available")?;

    // Copy the wallet file to export location
    std::fs::copy(&current_path, &export_path)
        .map_err(|e| format!("Failed to export wallet: {}", e))?;

    Ok(export_path)
}

// =============================================================================
// VM Account Operations
// =============================================================================

/// Get the VM account balance for the loaded wallet
///
/// This queries the UnifiedMPT state trie for account-based balances,
/// which is separate from the UTXO-based balance returned by get_wallet_balance.
/// Wallet-owned account-state entries hold balances from account transfers,
/// contract interactions, CAGE deposits, etc.
#[tauri::command]
pub async fn get_vm_account_balance(
    state: State<'_, AppState>,
) -> Result<VmAccountBalance, String> {
    let wallet = state
        .services
        .wallet
        .as_ref()
        .ok_or("Wallet not available")?;

    if !wallet.is_loaded() {
        return Err("No wallet loaded".to_string());
    }

    let wallet_id = wallet.current_wallet_id().ok_or("No wallet ID available")?;

    let db = wallet.database().ok_or("Wallet database not available")?;
    let queries = WalletQueries::new(db.connection());

    let mpt = if let Some((stem_state, _state_root)) = state.services.blockchain().stem_state() {
        stem_state
    } else {
        state
            .services
            .blockchain()
            .get_current_state_mpt()
            .map_err(|e| format!("Failed to load current state: {}", e))?
    };

    let owned_pkhs = wallet_owned_pkhs_from_queries(&queries, &wallet_id)?;
    let account_entries = surfaced_wallet_account_entries(&owned_pkhs, &mpt)?;
    let total_vm_balance = account_entries
        .iter()
        .fold(0u64, |sum, entry| sum.saturating_add(entry.balance));
    let primary_nonce = account_entries
        .iter()
        .map(|entry| entry.nonce)
        .max()
        .unwrap_or(0);

    Ok(VmAccountBalance {
        balance: total_vm_balance,
        nonce: primary_nonce,
        currency: "XTAL".to_string(),
    })
}

/// Get VM transaction history with server-side filtering and proper pagination.
///
/// Returns only VM-specific transaction types (contract_call, contract_deploy,
/// account_transfer, vm_withdrawal) from the wallet database, with accurate
/// total counts for pagination.
#[tauri::command]
pub async fn get_vm_transaction_history(
    state: State<'_, AppState>,
    limit: Option<usize>,
    offset: Option<usize>,
    wallet_id: Option<String>,
) -> Result<TransactionHistoryResponse, String> {
    let limit = limit.unwrap_or(50);
    let offset = offset.unwrap_or(0);
    let mempool = state.services.mempool();
    let blockchain = state.services.blockchain();
    let current_leaf_height = blockchain.get_current_leaf_height();

    let query_wallet_id = wallet_id
        .or_else(|| {
            state
                .services
                .wallet
                .as_ref()
                .and_then(|w| w.current_wallet_id())
        })
        .ok_or("No wallet ID available")?;

    let wallet = state
        .services
        .wallet
        .as_ref()
        .ok_or("Wallet not available")?;
    let db = wallet.database().ok_or("Wallet database not available")?;
    let queries = WalletQueries::new(db.connection());
    let wallet_pkhs = get_wallet_pkh_set(wallet)?;
    let mut transactions: Vec<TransactionSummary> = Vec::new();

    let mut seen_txids = std::collections::HashSet::new();
    transactions.extend(collect_active_stem_vm_transactions(
        blockchain.as_ref(),
        &wallet_pkhs,
        &mut seen_txids,
    ));
    transactions.extend(collect_pending_vm_mempool_transactions(
        blockchain.as_ref(),
        mempool.as_ref(),
        &wallet_pkhs,
        Some(&queries),
        Some(&query_wallet_id),
        &mut seen_txids,
    ));

    let confirmed_count = queries
        .count_vm_transactions(&query_wallet_id)
        .map_err(|e| format!("Failed to count VM transactions: {}", e))?
        as usize;
    let vm_records = queries
        .list_vm_transactions(&query_wallet_id, confirmed_count, 0)
        .map_err(|e| format!("Failed to list VM transactions: {}", e))?;

    for record in vm_records {
        if seen_txids.contains(&record.txid) {
            continue;
        }
        let (confirmations, timestamp) = if let Some((ts, height)) = record.confirmation {
            let confs = current_leaf_height.saturating_sub(height) as u32 + 1;
            (confs, ts as u64)
        } else {
            // Pending — check if still in mempool
            let in_mempool = mempool.get_transaction_by_hash(&record.txid).is_some();
            let in_active_stem = tx_in_active_stems(blockchain.as_ref(), &record.txid);
            let persisted_receipt = lookup_persisted_receipt(blockchain.as_ref(), &record.txid);
            if !in_mempool && !in_active_stem && persisted_receipt.is_none() {
                // Not in mempool and not confirmed — dropped
                let _ = queries.remove_transaction(&record.txid);
                log::info!(
                    "Cleaned up dropped VM tx {} (no longer in mempool or blockchain)",
                    hex::encode(record.txid)
                );
                continue;
            }
            if let Some(receipt) = persisted_receipt {
                (
                    current_leaf_height.saturating_sub(receipt.block_height) as u32 + 1,
                    record.created_at as u64,
                )
            } else {
                (0u32, record.created_at as u64)
            }
        };

        // Derive VM direction from the decoded transaction when possible.
        let amount = pending_vm_amount_from_record(&record, &wallet_pkhs).unwrap_or_else(|| {
            match record.tx_type {
                TransactionType::VmWithdrawal => record.amount as i64,
                _ => -(record.amount as i64),
            }
        });

        transactions.push(TransactionSummary {
            txid: hex::encode(record.txid),
            amount,
            fee: record.fee.unwrap_or(0),
            confirmations,
            timestamp,
            tx_type: record.tx_type.as_str().to_string(),
            execution_status: lookup_any_receipt(blockchain.as_ref(), &record.txid)
                .map(|receipt| execution_status_label(&receipt.status))
                .or_else(|| {
                    record
                        .execution_status
                        .map(|status| status.as_str().to_string())
                }),
            maturity_status: None,
        });
        seen_txids.insert(record.txid);
    }

    transactions.sort_by(|a, b| {
        b.timestamp
            .cmp(&a.timestamp)
            .then_with(|| a.txid.cmp(&b.txid))
    });

    let total_count = transactions.len();
    let paged_transactions = transactions
        .into_iter()
        .skip(offset)
        .take(limit)
        .collect::<Vec<_>>();
    let has_more = offset + paged_transactions.len() < total_count;

    Ok(TransactionHistoryResponse {
        transactions: paged_transactions,
        total_count,
        has_more,
    })
}

/// Generate a new VM account address (0x-prefixed hex format).
///
/// Derives the next key at m/44'/0'/0'/4/{index}, persists to the wallet
/// database, and returns the 0x-formatted address string.
#[tauri::command]
pub async fn generate_vm_address(state: State<'_, AppState>) -> Result<String, String> {
    let wallet = state
        .services
        .wallet
        .as_ref()
        .ok_or("Wallet not available")?;

    wallet
        .generate_vm_address()
        .map_err(|e| format!("Failed to generate VM address: {}", e))
}

/// Get list of VM wallet addresses (0x-prefixed hex format).
///
/// Returns the union of persisted VM derivation-path addresses and any
/// wallet-owned PKH that currently has account-state in the MPT.
#[tauri::command]
pub async fn get_vm_addresses(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let wallet = state
        .services
        .wallet
        .as_ref()
        .ok_or("Wallet not available")?;

    if !wallet.is_loaded() {
        return Err("No wallet loaded".to_string());
    }

    let wallet_id = wallet.current_wallet_id().ok_or("No wallet ID available")?;

    let db = wallet.database().ok_or("Wallet database not available")?;
    let queries = WalletQueries::new(db.connection());

    let mpt = if let Some((stem_state, _state_root)) = state.services.blockchain().stem_state() {
        stem_state
    } else {
        state
            .services
            .blockchain()
            .get_current_state_mpt()
            .map_err(|e| format!("Failed to load current state: {}", e))?
    };

    let owned_pkhs = wallet_owned_pkhs_from_queries(&queries, &wallet_id)?;
    let account_entries = surfaced_wallet_account_entries(&owned_pkhs, &mpt)?;
    let next_vm_account_index = queries
        .get_key_indices(&wallet_id)
        .map_err(|e| format!("Failed to get wallet key indices: {}", e))?
        .map(|indices| indices.next_vm_account_index)
        .unwrap_or(0);
    let addresses = merge_vm_address_catalog(&owned_pkhs, &account_entries, next_vm_account_index);

    Ok(addresses)
}

/// Send XTAL from a VM account to another address (account-to-account transfer)
///
/// This creates an AccountTransferTransaction, signs it with the best-funded
/// wallet-owned account-state key, and broadcasts it to the mempool.
#[tauri::command]
pub async fn send_vm_transfer(
    state: State<'_, AppState>,
    to_address: String,
    amount: u64,
    password: String,
    gas_limit: Option<u64>,
    gas_price: Option<u64>,
) -> Result<SendResult, String> {
    // Resolve gas defaults and validate
    let gas_limit = gas_limit.unwrap_or(TX_BASE_GAS);
    let gas_price = gas_price.unwrap_or(MIN_GAS_PRICE);

    if gas_limit < TX_BASE_GAS {
        return Err(format!("Gas limit must be at least {}", TX_BASE_GAS));
    }
    if gas_limit > MAX_GAS_LIMIT {
        return Err(format!("Gas limit cannot exceed {}", MAX_GAS_LIMIT));
    }
    if gas_price < MIN_GAS_PRICE {
        return Err(format!(
            "Gas price must be at least {} shard/gas",
            MIN_GAS_PRICE
        ));
    }

    let wallet = state
        .services
        .wallet
        .as_ref()
        .ok_or("Wallet manager not available")?;

    if !wallet.is_loaded() {
        return Err("No wallet loaded".to_string());
    }

    // Unlock wallet temporarily for signing
    wallet
        .unlock_wallet(&password, Some(Duration::from_secs(30)))
        .map_err(|e| format!("Invalid password: {}", e))?;

    let wallet_id = wallet.current_wallet_id().ok_or("No wallet ID available")?;
    let db = wallet.database().ok_or("Wallet database not available")?;
    let queries = WalletQueries::new(db.connection());

    let mpt = if let Some((stem_state, _state_root)) = state.services.blockchain().stem_state() {
        stem_state
    } else {
        state
            .services
            .blockchain()
            .get_current_state_mpt()
            .map_err(|e| format!("Failed to load current state: {}", e))?
    };

    let owned_pkhs = wallet_owned_pkhs_from_queries(&queries, &wallet_id)?;
    let account_entries = surfaced_wallet_account_entries(&owned_pkhs, &mpt)?;
    let sender_entry =
        select_vm_sender_entry(&account_entries, amount, gas_limit, gas_price).ok_or_else(|| {
            let max_fee = gas_limit.saturating_mul(gas_price);
            let total = amount.saturating_add(max_fee);
            let total_balance = account_entries
                .iter()
                .fold(0u64, |sum, entry| sum.saturating_add(entry.balance));
            format!(
                "Insufficient VM balance across wallet-owned accounts: have {} shards, need {} (amount: {} + max gas: {})",
                total_balance, total, amount, max_fee
            )
        })?;

    let signing_key = wallet
        .with_wallet(|w| w.get_signing_key_by_type(sender_entry.key_type, sender_entry.key_index))
        .map_err(|e| {
            format!(
                "Failed to get signing key for sender {}: {}",
                sender_entry.hex_address, e
            )
        })?;

    // Parse recipient address (supports 0x-prefixed hex or raw hex)
    let to_hex = to_address.strip_prefix("0x").unwrap_or(&to_address);
    let recipient_bytes = hex::decode(to_hex)
        .map_err(|_| "Invalid address format: must be hex encoded".to_string())?;

    if recipient_bytes.len() != 20 {
        return Err("Invalid address: must be 20 bytes (40 hex characters)".to_string());
    }

    let mut recipient = [0u8; 20];
    recipient.copy_from_slice(&recipient_bytes);

    let current_nonce = sender_entry.nonce;

    // Build and sign the account transfer transaction
    let tx = TransferBuilder::new()
        .with_sender(signing_key)
        .with_recipient(ContractAddress::from_bytes(recipient))
        .with_amount(amount)
        .with_currency(CurrencyType::XTAL)
        .with_gas_limit(gas_limit)
        .with_gas_price(gas_price)
        .with_nonce(current_nonce)
        .build()
        .map_err(|e| format!("Build failed: {}", e))?;
    let tx_hash = tx
        .id()
        .map_err(|e| format!("Failed to hash transaction: {}", e))?;
    let txid = hex::encode(tx_hash);

    // Broadcast to mempool
    let mempool = state.services.mempool();
    mempool
        .add_transaction(tx.clone(), TransactionSource::Local)
        .map_err(|e| format!("Failed to broadcast transaction: {}", e))?;

    let max_fee = gas_limit.saturating_mul(gas_price);

    // Store in wallet database
    if let Some(db) = wallet.database() {
        let wallet_id = wallet.current_wallet_id().unwrap_or_default();
        let queries = WalletQueries::new(db.connection());
        let record = TransactionRecord {
            txid: tx_hash,
            raw_tx: tx.clone().encode(),
            tx_type: TransactionType::AccountTransfer,
            amount,
            fee: Some(max_fee),
            to_address: Some(to_address.clone()),
            memo: None,
            created_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64,
            confirmation: None,
            expires_at: None,
            priority: None,
            input_details: None,
            execution_status: Some(TransactionExecutionStatus::Unknown),
        };
        if let Err(e) = queries.insert_transaction(&wallet_id, &record) {
            log::warn!("Failed to record VM transfer in wallet db: {}", e);
        }
    }

    log::info!(
        "VM transfer sent: {} shards from {} to {}",
        amount,
        sender_entry.hex_address,
        to_address
    );

    Ok(SendResult { txid, fee: max_fee })
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::SigningKey;
    use std::fs;
    use xtal::config::SHARDS_PER_XTAL;
    use xtal::fruit::core::FruitType;
    use xtal::storage::{trie::RocksDBBackend as XtalRocksDbBackend, Storage};
    use xtal::transaction::receipt::TxStatus;
    use xtal::transaction::{AccountTransferTransaction, ContractCallTransaction};
    use xtal::vm::abi::AbiValue;
    use xtal::vm::PendingWithdrawal;

    #[test]
    fn classify_vm_wallet_transaction_marks_outgoing_account_transfer() {
        let signing_key = SigningKey::from_bytes(&[7u8; 32]);
        let sender = hash_public_key(&signing_key.verifying_key());
        let recipient = [9u8; 20];
        let wallet_pkhs = std::collections::HashSet::from([sender]);

        let tx = Transaction::AccountTransfer(
            AccountTransferTransaction::new(
                signing_key.verifying_key(),
                recipient.into(),
                42,
                CurrencyType::XTAL,
                1,
            )
            .with_gas_limit(25_000)
            .with_gas_price(3),
        );

        let view = classify_vm_wallet_transaction(&tx, &wallet_pkhs).unwrap();
        assert_eq!(view.tx_type, TransactionType::AccountTransfer);
        assert_eq!(view.amount, 42);
        assert_eq!(view.fee, 75_000);
        assert_eq!(view.summary_amount, -42);
    }

    #[test]
    fn classify_vm_wallet_transaction_marks_incoming_account_transfer() {
        let signing_key = SigningKey::from_bytes(&[7u8; 32]);
        let recipient = [9u8; 20];
        let wallet_pkhs = std::collections::HashSet::from([recipient]);

        let tx = Transaction::AccountTransfer(
            AccountTransferTransaction::new(
                signing_key.verifying_key(),
                recipient.into(),
                42,
                CurrencyType::XTAL,
                1,
            )
            .with_gas_limit(25_000)
            .with_gas_price(3),
        );

        let view = classify_vm_wallet_transaction(&tx, &wallet_pkhs).unwrap();
        assert_eq!(view.summary_amount, 42);
    }

    #[test]
    fn classify_vm_wallet_transaction_marks_outgoing_contract_call() {
        let signing_key = SigningKey::from_bytes(&[7u8; 32]);
        let caller = hash_public_key(&signing_key.verifying_key());
        let wallet_pkhs = std::collections::HashSet::from([caller]);

        let tx = Transaction::ContractCall(ContractCallTransaction {
            caller: signing_key.verifying_key(),
            contract_address: [3u8; 20],
            method: "poke".to_string(),
            data: Vec::new(),
            value: 5,
            gas_limit: 21_000,
            gas_price: Some(2),
            nonce: 1,
            signature: None,
        });

        let view = classify_vm_wallet_transaction(&tx, &wallet_pkhs).unwrap();
        assert_eq!(view.tx_type, TransactionType::ContractCall);
        assert_eq!(view.amount, 42_005);
        assert_eq!(view.fee, 42_000);
        assert_eq!(view.summary_amount, -42_005);
    }

    #[test]
    fn build_vm_detail_enriches_cage_withdrawal_calls() {
        let signing_key = SigningKey::from_bytes(&[7u8; 32]);
        let recipient = [0x42; 20];
        let recipient_address = xtal::address::encode_pkh(&recipient);
        let abi = cage_abi();
        let mut data = abi
            .method("withdraw")
            .expect("bundled CAGE ABI includes withdraw")
            .selector
            .to_vec();
        data.extend(
            abi.encode_args(
                "withdraw",
                &[
                    AbiValue::String(recipient_address.clone()),
                    AbiValue::U64(SHARDS_PER_XTAL),
                ],
            )
            .unwrap(),
        );
        let tx = Transaction::ContractCall(ContractCallTransaction {
            caller: signing_key.verifying_key(),
            contract_address: CAGE_CONTRACT_ADDRESS,
            method: "invoke".to_string(),
            data,
            value: 0,
            gas_limit: 50_000,
            gas_price: Some(1),
            nonce: 3,
            signature: None,
        });

        let caller = hash_public_key(&signing_key.verifying_key());
        let mut receipt = TransactionReceipt::new(
            [1u8; 32],
            [2u8; 32],
            10,
            FruitType::Apple,
            0,
            TxStatus::Success,
            26_972,
        );
        receipt.produced_withdrawals.push(PendingWithdrawal {
            recipient: recipient_address.as_bytes().to_vec(),
            amount: SHARDS_PER_XTAL - (SHARDS_PER_XTAL / 1_000),
            source: caller,
        });

        let detail = build_vm_detail(&tx, "contract_call", &[], 0, Some(&receipt));

        match detail.bridge {
            Some(VMBridgeDetail::CageWithdrawal {
                requested_amount,
                net_withdrawal_amount,
                requested_recipient,
                produced_output_recipient,
            }) => {
                assert_eq!(requested_amount, SHARDS_PER_XTAL);
                assert_eq!(
                    net_withdrawal_amount,
                    Some(SHARDS_PER_XTAL - (SHARDS_PER_XTAL / 1_000))
                );
                assert_eq!(requested_recipient, recipient_address);
                assert_eq!(produced_output_recipient, Some(recipient_address));
            }
            other => panic!("expected cage withdrawal bridge, got {:?}", other),
        }
    }

    #[test]
    fn merge_vm_address_catalog_keeps_derived_vm_addresses_and_funded_extras() {
        let vm_primary = [1u8; 20];
        let funded_receiving = [2u8; 20];
        let vm_secondary = [3u8; 20];

        let owned = vec![
            WalletOwnedPkh {
                pkh: vm_primary,
                hex_address: format_contract_address(&vm_primary),
                key_type: KeyType::VmAccount,
                key_index: 0,
            },
            WalletOwnedPkh {
                pkh: funded_receiving,
                hex_address: format_contract_address(&funded_receiving),
                key_type: KeyType::Receiving,
                key_index: 4,
            },
            WalletOwnedPkh {
                pkh: vm_secondary,
                hex_address: format_contract_address(&vm_secondary),
                key_type: KeyType::VmAccount,
                key_index: 1,
            },
        ];
        let account_entries = vec![
            WalletAccountStateEntry {
                pkh: funded_receiving,
                hex_address: format_contract_address(&funded_receiving),
                balance: 75,
                nonce: 2,
                key_type: KeyType::Receiving,
                key_index: 4,
            },
            WalletAccountStateEntry {
                pkh: vm_secondary,
                hex_address: format_contract_address(&vm_secondary),
                balance: 10,
                nonce: 1,
                key_type: KeyType::VmAccount,
                key_index: 1,
            },
        ];

        let addresses = merge_vm_address_catalog(&owned, &account_entries, 2);
        assert_eq!(
            addresses,
            vec![
                format_contract_address(&vm_primary),
                format_contract_address(&vm_secondary),
                format_contract_address(&funded_receiving),
            ]
        );
    }

    #[test]
    fn merge_vm_address_catalog_hides_ungenerated_vm_gap_keys() {
        let vm_primary = [1u8; 20];
        let vm_gap = [2u8; 20];
        let funded_gap = [3u8; 20];

        let owned = vec![
            WalletOwnedPkh {
                pkh: vm_primary,
                hex_address: format_contract_address(&vm_primary),
                key_type: KeyType::VmAccount,
                key_index: 0,
            },
            WalletOwnedPkh {
                pkh: vm_gap,
                hex_address: format_contract_address(&vm_gap),
                key_type: KeyType::VmAccount,
                key_index: 1,
            },
            WalletOwnedPkh {
                pkh: funded_gap,
                hex_address: format_contract_address(&funded_gap),
                key_type: KeyType::VmAccount,
                key_index: 2,
            },
        ];
        let account_entries = vec![WalletAccountStateEntry {
            pkh: funded_gap,
            hex_address: format_contract_address(&funded_gap),
            balance: 25,
            nonce: 1,
            key_type: KeyType::VmAccount,
            key_index: 2,
        }];

        let addresses = merge_vm_address_catalog(&owned, &account_entries, 1);
        assert_eq!(
            addresses,
            vec![
                format_contract_address(&vm_primary),
                format_contract_address(&funded_gap),
            ]
        );
    }

    #[test]
    fn select_vm_sender_entry_prefers_highest_balance_then_vm_path_on_tie() {
        let vm_primary = WalletAccountStateEntry {
            pkh: [1u8; 20],
            hex_address: format_contract_address(&[1u8; 20]),
            balance: 80,
            nonce: 1,
            key_type: KeyType::VmAccount,
            key_index: 0,
        };
        let funded_receiving = WalletAccountStateEntry {
            pkh: [2u8; 20],
            hex_address: format_contract_address(&[2u8; 20]),
            balance: 150,
            nonce: 4,
            key_type: KeyType::Receiving,
            key_index: 0,
        };
        let vm_secondary = WalletAccountStateEntry {
            pkh: [3u8; 20],
            hex_address: format_contract_address(&[3u8; 20]),
            balance: 150,
            nonce: 2,
            key_type: KeyType::VmAccount,
            key_index: 1,
        };
        let entries = vec![
            vm_primary.clone(),
            funded_receiving.clone(),
            vm_secondary.clone(),
        ];

        let selected = select_vm_sender_entry(&entries, 25, 10, 1).expect("sender");
        assert_eq!(selected.hex_address, vm_secondary.hex_address);
    }

    #[test]
    fn surfaced_wallet_account_entries_only_include_existing_account_state() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("time")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("crystal-gui-wallet-test-{}", unique));
        fs::create_dir_all(&path).expect("create temp dir");

        let storage = Storage::new(&path, 1_000_000).expect("storage");
        let backend = Box::new(XtalRocksDbBackend::new(
            storage.db.clone(),
            "unified_state".to_string(),
        ));
        let mpt = UnifiedMPT::new(backend).expect("mpt");

        let visible = [1u8; 20];
        let nonce_only = [2u8; 20];
        let absent = [3u8; 20];

        mpt.set_global_balance(&visible, CurrencyType::XTAL, 50)
            .expect("fund visible");
        mpt.increment_global_nonce(&nonce_only)
            .expect("create nonce-bearing account");

        let owned = vec![
            WalletOwnedPkh {
                pkh: visible,
                hex_address: format_contract_address(&visible),
                key_type: KeyType::VmAccount,
                key_index: 0,
            },
            WalletOwnedPkh {
                pkh: nonce_only,
                hex_address: format_contract_address(&nonce_only),
                key_type: KeyType::Receiving,
                key_index: 1,
            },
            WalletOwnedPkh {
                pkh: absent,
                hex_address: format_contract_address(&absent),
                key_type: KeyType::Change,
                key_index: 2,
            },
        ];

        let surfaced = surfaced_wallet_account_entries(&owned, &mpt).expect("surface accounts");
        assert_eq!(surfaced.len(), 2);
        assert_eq!(surfaced[0].pkh, visible);
        assert_eq!(surfaced[0].balance, 50);
        assert!(surfaced.iter().any(|entry| entry.pkh == nonce_only));
        assert!(!surfaced.iter().any(|entry| entry.pkh == absent));

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn tx_type_has_maturity_includes_vm_withdrawals() {
        assert!(tx_type_has_maturity("coinbase"));
        assert!(tx_type_has_maturity("vm_withdrawal"));
        assert!(!tx_type_has_maturity("withdrawal"));
        assert!(!tx_type_has_maturity("standard"));
    }
}
