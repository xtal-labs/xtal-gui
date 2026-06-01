//! Contract interaction commands
//!
//! Provides Tauri commands for deploying, calling, querying, and managing
//! smart contracts through the GUI.

use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::State;

use ed25519_dalek::Signer;

use xtal::address_format::format_utxo_address;
use xtal::blockchain::processing::utxo_verifier::consume_utxo_digest;
use xtal::crypto::hash_public_key;
use xtal::fruit::codec::Encode;
use xtal::fruit::core::FruitType;
use xtal::fruit::StemProvider;
use xtal::gas::TX_BASE_GAS;
use xtal::mempool::TransactionSource;
use xtal::script::extract_pkh_from_script;
use xtal::storage::trie::RocksDBBackend;
use xtal::storage::UnifiedMPT;
use xtal::transaction::builders::{
    ContractCallTransactionBuilder, ContractDeployTransactionBuilder,
};
use xtal::transaction::{CurrencyType, MAX_GAS_LIMIT, MIN_GAS_PRICE};
use xtal::vm::abi::{content_cid_from_bytes, AbiValue, ContractAbi, ParamType, ABI_CID_KEY};
use xtal::vm::cage_contract::{CageConsumeUtxoCallData, CAGE_CONTRACT_ADDRESS};
use xtal::vm::CrystalVm;
use xtal::wallet::database::models::{
    InputDetail, TransactionExecutionStatus, TransactionRecord, TransactionType,
};
use xtal::wallet::database::queries::WalletQueries;

use crate::commands::wallet::{
    select_vm_sender_entry, surfaced_wallet_account_entries, wallet_owned_pkhs_from_queries,
};
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Xtal → Shards strict decimal parser
// ---------------------------------------------------------------------------

/// Strictly parse an xtal amount string to shards (u64).
///
/// Enforces exactly 9 decimal places of precision.  Empty / whitespace /
/// standalone "." yields 0.  Rejects negative, NaN, infinity, and any
/// value that would overflow a u64 when converted to shards.
pub fn parse_xtal_to_shards(value: &str) -> Result<u64, String> {
    let parts: Vec<&str> = value.splitn(2, '.').collect();
    let whole: u64 = parts[0].parse().map_err(|_| "Invalid XTAL whole part")?;

    let frac = if parts.len() == 2 {
        let frac_str = parts[1];
        if frac_str.len() > 9 {
            return Err("XTAL amount exceeds 9 decimal places".into());
        }
        let padded = format!("{:0<9}", frac_str);
        padded
            .parse::<u64>()
            .map_err(|_| "Invalid XTAL fractional part")?
    } else {
        0
    };

    whole
        .checked_mul(1_000_000_000)
        .and_then(|w| w.checked_add(frac))
        .ok_or_else(|| "XTAL amount overflow".into())
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

/// Input parameter from the frontend for calldata encoding.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ParamInput {
    pub name: String,
    #[serde(rename = "type")]
    pub type_: String,
    pub value: String,
}

/// Per-parameter validation result after encoding.
#[derive(Debug, Clone, Serialize)]
pub struct ParamResult {
    pub name: String,
    pub type_: String,
    pub value: String,
}

/// Result of encoding contract call parameters.
#[derive(Debug, Clone, Serialize)]
pub struct EncodeResult {
    /// Hex-encoded calldata (no 0x prefix).
    pub data: String,
    /// Per-param validation results.
    pub param_results: Vec<ParamResult>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DeployResult {
    pub txid: String,
    pub contract_address: String,
    pub fee: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub abi_cid: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct QueryResult {
    pub success: bool,
    pub return_data: String,
    pub gas_used: String,
    pub error_message: Option<String>,
    pub logs: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ContractInfo {
    pub address: String,
    pub exists: bool,
    pub is_contract: bool,
    pub balance: u64,
    pub code_hash: Option<String>,
    pub fruit_type: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ContractStorageResult {
    pub value: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GasEstimate {
    pub gas_estimate: String,
    pub fee_estimate: String,
}

/// Result of a UTXO deposit via CAGE contract
#[derive(Debug, Clone, Serialize)]
pub struct CageConfig {
    /// CAGE contract address as hex string (e.g., "0xd0223910cc28a8eae9b4f7324840b66b8b1ab969")
    pub address: String,
    /// Current withdrawal fee in basis points (e.g., 10 = 0.1%)
    pub withdraw_fee_bps: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct DepositResult {
    /// Transaction hash of the contract call (raw hex)
    pub txid: String,
    /// Max gas fee in shards
    pub fee: String,
    /// UTXO amount being deposited (shards)
    pub amount: String,
    /// Anchor stem hash used for the sighash (raw hex)
    pub anchor_stem_hash: String,
}

// ---------------------------------------------------------------------------
// SendResult is re-exported from wallet commands
// ---------------------------------------------------------------------------
use super::wallet::SendResult;

fn current_unix_timestamp_i64() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

// ---------------------------------------------------------------------------
// Helper: parse fruit type string
// ---------------------------------------------------------------------------
fn parse_fruit_type(ft: &str) -> Option<FruitType> {
    match ft.to_lowercase().as_str() {
        "apple" => Some(FruitType::Apple),
        "orange" => Some(FruitType::Orange),
        "pear" => Some(FruitType::Pear),
        "grape" => Some(FruitType::Grape),
        "peach" => Some(FruitType::Peach),
        "pineapple" => Some(FruitType::Pineapple),
        "strawberry" => Some(FruitType::Strawberry),
        "kiwi" => Some(FruitType::Kiwi),
        "watermelon" => Some(FruitType::Watermelon),
        _ => None,
    }
}

fn fruit_type_name(ft: FruitType) -> &'static str {
    match ft {
        FruitType::Apple => "Apple",
        FruitType::Orange => "Orange",
        FruitType::Pear => "Pear",
        FruitType::Grape => "Grape",
        FruitType::Peach => "Peach",
        FruitType::Pineapple => "Pineapple",
        FruitType::Strawberry => "Strawberry",
        FruitType::Kiwi => "Kiwi",
        FruitType::Watermelon => "Watermelon",
    }
}

fn decode_hex_address(addr: &str) -> Result<[u8; 20], String> {
    let hex_str = addr.strip_prefix("0x").unwrap_or(addr);
    let bytes =
        hex::decode(hex_str).map_err(|_| "Invalid address: must be hex encoded".to_string())?;
    if bytes.len() != 20 {
        return Err("Invalid address: must be 20 bytes".to_string());
    }
    let mut out = [0u8; 20];
    out.copy_from_slice(&bytes);
    Ok(out)
}

fn encode_cage_consume_utxo_call_data(
    declared_anchor_stem_hash: [u8; 32],
    tx_id: [u8; 32],
    output_index: u16,
    script_sig: Vec<u8>,
) -> Vec<u8> {
    CageConsumeUtxoCallData {
        declared_anchor_stem_hash,
        tx_id,
        output_index,
        script_sig,
    }
    .encode()
}

// ===========================================================================
// Wallet-Signing Commands
// ===========================================================================

/// Deploy a new smart contract
#[tauri::command]
pub async fn deploy_contract(
    state: State<'_, AppState>,
    wasm_hex: String,
    abi_json: Option<String>,
    gas_limit: u64,
    gas_price: Option<u64>,
    fruit_type: Option<String>,
    password: String,
) -> Result<DeployResult, String> {
    let gas_price = gas_price.unwrap_or(MIN_GAS_PRICE);
    if gas_limit < TX_BASE_GAS {
        return Err(format!("Gas limit must be at least {}", TX_BASE_GAS));
    }
    if gas_limit > MAX_GAS_LIMIT {
        return Err(format!("Gas limit cannot exceed {}", MAX_GAS_LIMIT));
    }

    let wasm = hex::decode(&wasm_hex).map_err(|_| "Invalid WASM hex".to_string())?;
    if wasm.is_empty() {
        return Err("WASM bytecode is empty".to_string());
    }

    let ft = fruit_type
        .as_deref()
        .and_then(parse_fruit_type)
        .unwrap_or(FruitType::Apple);

    // Unlock wallet
    let wallet = state
        .services
        .wallet
        .as_ref()
        .ok_or("Wallet not available")?;
    if !wallet.is_loaded() {
        return Err("No wallet loaded".to_string());
    }
    wallet
        .unlock_wallet(&password, Some(Duration::from_secs(30)))
        .map_err(|e| format!("Invalid password: {}", e))?;

    // Select the best-funded wallet-owned VM account that can afford deployment gas.
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
    let sender_entry = select_vm_sender_entry(&account_entries, 0, gas_limit, gas_price)
        .ok_or_else(|| {
            let max_fee = gas_limit.saturating_mul(gas_price);
            let total_balance = account_entries
                .iter()
                .fold(0u64, |sum, entry| sum.saturating_add(entry.balance));
            format!(
                "Insufficient balance: have {} shards, need at least {} for gas",
                total_balance, max_fee
            )
        })?;

    let signing_key = wallet
        .with_wallet(|w| w.get_signing_key_by_type(sender_entry.key_type, sender_entry.key_index))
        .map_err(|e| {
            format!(
                "Failed to get signing key for {}: {}",
                sender_entry.hex_address, e
            )
        })?;

    let nonce = sender_entry.nonce;

    // If ABI provided, compute CID and optionally pin to IPFS
    let mut abi_cid_bytes: Option<Vec<u8>> = None;
    let mut abi_cid_hex: Option<String> = None;

    if let Some(ref json) = abi_json {
        let abi: ContractAbi =
            serde_json::from_str(json).map_err(|e| format!("Invalid ABI JSON: {}", e))?;
        abi.validate()
            .map_err(|e| format!("ABI validation: {}", e))?;

        // Try to pin to IPFS (non-fatal if it fails)
        let cid_bytes = if let Some(ref ipfs) = state.ipfs_client {
            match ipfs.pin_abi(json).await {
                Ok(cid) => {
                    log::info!("ABI pinned to IPFS: {}", hex::encode(&cid));
                    cid
                }
                Err(e) => {
                    log::warn!("IPFS pin failed (deploying anyway): {}", e);
                    content_cid_from_bytes(json.as_bytes())
                }
            }
        } else {
            content_cid_from_bytes(json.as_bytes())
        };

        abi_cid_hex = Some(hex::encode(&cid_bytes));
        abi_cid_bytes = Some(cid_bytes);
    }

    // Build deploy transaction — set __set_abi_cid if we have a CID
    let (init_method, init_args) = if let Some(ref cid) = abi_cid_bytes {
        (Some("__set_abi_cid".to_string()), cid.clone())
    } else {
        (None, vec![])
    };

    let mut builder = ContractDeployTransactionBuilder::new()
        .with_sender(signing_key)
        .with_wasm(wasm)
        .with_init_args(init_args)
        .with_gas_limit(gas_limit)
        .with_gas_price(gas_price)
        .with_nonce(nonce)
        .with_preferred_fruit(ft);
    if let Some(method) = init_method {
        builder = builder.with_init_method(method);
    }
    let tx = builder
        .build()
        .map_err(|e| format!("Build failed: {}", e))?;

    let contract_address = xtal::crypto::calculate_contract_address(&sender_entry.pkh, nonce);
    let tx_hash = tx.id().map_err(|e| format!("Hash failed: {}", e))?;

    state
        .services
        .mempool()
        .add_transaction(tx.clone(), TransactionSource::Local)
        .map_err(|e| format!("Broadcast failed: {}", e))?;

    let max_fee = gas_limit.saturating_mul(gas_price);

    let record = TransactionRecord {
        txid: tx_hash,
        raw_tx: tx.encode(),
        tx_type: TransactionType::ContractDeploy,
        amount: max_fee,
        fee: Some(max_fee),
        to_address: Some(format!("0x{}", hex::encode(contract_address))),
        memo: None,
        created_at: current_unix_timestamp_i64(),
        confirmation: None,
        expires_at: None,
        priority: Some(0),
        input_details: None,
        execution_status: Some(TransactionExecutionStatus::Unknown),
    };
    if let Err(e) = queries.insert_transaction(&wallet_id, &record) {
        log::warn!("Failed to store pending contract deploy: {}", e);
    }

    // Cache ABI locally if provided
    if let Some(json) = abi_json {
        let abi: ContractAbi =
            serde_json::from_str(&json).map_err(|e| format!("Invalid ABI JSON: {}", e))?;
        let addr_hex = hex::encode(contract_address);
        if let Ok(mut cache) = state.abi_cache.lock() {
            let _ = cache.put(&addr_hex, &abi, "deployed", Some(fruit_type_name(ft)));
        }
    }

    log::info!(
        "Contract deployment submitted: {}",
        hex::encode(contract_address)
    );

    Ok(DeployResult {
        txid: hex::encode(tx_hash),
        contract_address: format!("0x{}", hex::encode(contract_address)),
        fee: max_fee.to_string(),
        abi_cid: abi_cid_hex,
    })
}

/// Call a contract method (write transaction)
///
/// `value` is provided as a string to avoid JavaScript precision loss for
/// large shard amounts (e.g. xtal_amount which is scaled by 10^9).
#[tauri::command]
pub async fn call_contract(
    state: State<'_, AppState>,
    contract_address: String,
    method: String,
    data: Option<String>,
    value: Option<String>,
    gas_limit: u64,
    gas_price: Option<u64>,
    password: String,
) -> Result<SendResult, String> {
    let gas_price = gas_price.unwrap_or(MIN_GAS_PRICE);
    if gas_limit < TX_BASE_GAS {
        return Err(format!("Gas limit must be at least {}", TX_BASE_GAS));
    }
    if gas_limit > MAX_GAS_LIMIT {
        return Err(format!("Gas limit cannot exceed {}", MAX_GAS_LIMIT));
    }

    let contract_addr = decode_hex_address(&contract_address)?;
    let call_data = match &data {
        Some(d) => hex::decode(d).map_err(|_| "Invalid data hex".to_string())?,
        None => vec![],
    };
    let send_value = match &value {
        Some(v) => parse_xtal_to_shards(v)?,
        None => 0,
    };

    // Unlock wallet
    let wallet = state
        .services
        .wallet
        .as_ref()
        .ok_or("Wallet not available")?;
    if !wallet.is_loaded() {
        return Err("No wallet loaded".to_string());
    }
    wallet
        .unlock_wallet(&password, Some(Duration::from_secs(30)))
        .map_err(|e| format!("Invalid password: {}", e))?;

    // Select the best-funded wallet-owned VM account that can afford this call.
    // This handles funds deposited via CAGE (credited to the UTXO-derived PKH)
    // as well as funds in dedicated VM account keys.
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
    let sender_entry = select_vm_sender_entry(&account_entries, send_value, gas_limit, gas_price)
        .ok_or_else(|| {
        let max_fee = gas_limit.saturating_mul(gas_price);
        let total = send_value.saturating_add(max_fee);
        let total_balance = account_entries
            .iter()
            .fold(0u64, |sum, entry| sum.saturating_add(entry.balance));
        format!(
            "Insufficient balance: have {} shards, need {} (value: {} + max gas: {})",
            total_balance, total, send_value, max_fee
        )
    })?;

    let signing_key = wallet
        .with_wallet(|w| w.get_signing_key_by_type(sender_entry.key_type, sender_entry.key_index))
        .map_err(|e| {
            format!(
                "Failed to get signing key for {}: {}",
                sender_entry.hex_address, e
            )
        })?;

    let nonce = sender_entry.nonce;

    // Build, sign, broadcast
    let tx = ContractCallTransactionBuilder::new()
        .with_sender(signing_key)
        .with_contract(contract_addr)
        .with_method(method.clone())
        .with_args(call_data)
        .with_value(send_value)
        .with_gas_limit(gas_limit)
        .with_gas_price(gas_price)
        .with_nonce(nonce)
        .build()
        .map_err(|e| format!("Build failed: {}", e))?;
    let tx_hash = tx.id().map_err(|e| format!("Hash failed: {}", e))?;

    state
        .services
        .mempool()
        .add_transaction(tx.clone(), TransactionSource::Local)
        .map_err(|e| format!("Broadcast failed: {}", e))?;

    let max_fee = gas_limit.saturating_mul(gas_price);
    let record = TransactionRecord {
        txid: tx_hash,
        raw_tx: tx.encode(),
        tx_type: TransactionType::ContractCall,
        amount: send_value.saturating_add(max_fee),
        fee: Some(max_fee),
        to_address: Some(contract_address.clone()),
        memo: None,
        created_at: current_unix_timestamp_i64(),
        confirmation: None,
        expires_at: None,
        priority: Some(0),
        input_details: None,
        execution_status: Some(TransactionExecutionStatus::Unknown),
    };
    if let Err(e) = queries.insert_transaction(&wallet_id, &record) {
        log::warn!("Failed to store pending contract call: {}", e);
    }

    log::info!(
        "Contract call submitted: {}.{} (value={})",
        contract_address,
        method,
        send_value
    );

    Ok(SendResult {
        txid: hex::encode(tx_hash),
        fee: max_fee,
    })
}

/// Deposit a UTXO into the VM layer via the CAGE bridge contract.
///
/// Handles the full flow: stem hash anchoring, UTXO sighash computation,
/// P2PKH script_sig construction, and contract call broadcast.
#[tauri::command]
pub async fn deposit_utxo(
    state: State<'_, AppState>,
    txid: String,
    vout: u16,
    password: String,
) -> Result<DepositResult, String> {
    // Decode txid (strip 0x if provided)
    let txid_hex = txid.strip_prefix("0x").unwrap_or(&txid);
    let txid_bytes: [u8; 32] = hex::decode(txid_hex)
        .map_err(|_| "Invalid txid: must be 64 hex characters".to_string())?
        .try_into()
        .map_err(|_| "Invalid txid: must be exactly 32 bytes".to_string())?;

    // CAGE deposits must anchor to the currently open stem segment. Using the
    // latest historical stem can pick a stem from before the most recent leaf,
    // which mempool policy correctly rejects as a closed segment anchor.
    let chain = state.services.blockchain();
    let anchor_stem_hash = chain
        .stems_since_last_leaf()
        .into_iter()
        .next()
        .map(|((stem_hash, _nonce), _timestamp)| stem_hash)
        .ok_or(
            "No active stem segment available for UTXO anchoring. Wait for a stem after the latest leaf."
                .to_string(),
        )?;

    // Look up the UTXO
    let storage = state.services.storage();
    let utxo_entry = storage
        .get_utxo(&txid_bytes, vout)
        .map_err(|e| format!("Storage error: {}", e))?
        .ok_or("UTXO not found — it may have already been spent")?;

    // Only standard UTXOs can be deposited
    if utxo_entry.is_coinbase || utxo_entry.is_withdrawal || utxo_entry.is_staking {
        return Err("Only standard transaction UTXOs can be deposited via CAGE".to_string());
    }

    // Extract owner PKH from the UTXO's script_pubkey
    let owner_pkh = extract_pkh_from_script(&utxo_entry.script_pubkey)
        .ok_or("Cannot extract owner from UTXO script")?;
    let owner_address = format_utxo_address(&owner_pkh);

    // Unlock wallet
    let wallet = state
        .services
        .wallet
        .as_ref()
        .ok_or("Wallet not available")?;
    if !wallet.is_loaded() {
        return Err("No wallet loaded".to_string());
    }
    wallet
        .unlock_wallet(&password, Some(Duration::from_secs(30)))
        .map_err(|e| format!("Invalid password: {}", e))?;

    // Get UTXO signing key for this address
    let utxo_signing_key = wallet
        .with_wallet(|w| w.get_signing_key_for_address(&owner_address))
        .map_err(|e| format!("UTXO does not belong to this wallet: {}", e))?;

    // Compute anchor-stem-bound sighash and sign
    let digest = consume_utxo_digest(&anchor_stem_hash, &txid_bytes, vout);
    let signature = utxo_signing_key.sign(&digest);

    // Build P2PKH script_sig: [sig_len(1)] [sig(64)] [pk_len(1)] [pk(32)]
    let mut script_sig = Vec::with_capacity(98);
    script_sig.push(64); // signature length
    script_sig.extend_from_slice(&signature.to_bytes());
    script_sig.push(32); // pubkey length
    script_sig.extend_from_slice(&utxo_signing_key.verifying_key().to_bytes());

    // CAGE `consume_utxo` uses raw args:
    // [declared_anchor_stem_hash:32][tx_id:32][output_index:2][script_sig...]
    let call_data =
        encode_cage_consume_utxo_call_data(anchor_stem_hash, txid_bytes, vout, script_sig);

    // Use the UTXO owner's key as the sender so the sponsored contract call,
    // credited account, and later outbound VM spends all refer to the same PKH.
    let sender_pkh = hash_public_key(&utxo_signing_key.verifying_key());

    // Get nonce (no balance check needed — sponsored tx)
    let state_accessor = state.services.state();
    let nonce = state_accessor.get_nonce(&sender_pkh).unwrap_or(0);

    // Build, sign, and broadcast the sponsored contract call
    let tx = ContractCallTransactionBuilder::new()
        .with_sender(utxo_signing_key)
        .with_contract(CAGE_CONTRACT_ADDRESS)
        .with_method("consume_utxo".to_string())
        .with_args(call_data)
        .with_nonce(nonce)
        .sponsored()
        .build()
        .map_err(|e| format!("Build failed: {}", e))?;
    let tx_hash = tx.id().map_err(|e| format!("Hash failed: {}", e))?;

    state
        .services
        .mempool()
        .add_transaction(tx.clone(), TransactionSource::Local)
        .map_err(|e| format!("Broadcast failed: {}", e))?;

    if let (Some(db), Some(wallet_id)) = (wallet.database(), wallet.current_wallet_id()) {
        let queries = WalletQueries::new(db.connection());
        let input_details = vec![InputDetail {
            txid: hex::encode(txid_bytes),
            index: vout,
            amount: utxo_entry.amount,
            address: Some(owner_address.clone()),
        }];
        let record = TransactionRecord {
            txid: tx_hash,
            raw_tx: tx.encode(),
            tx_type: TransactionType::ContractCall,
            amount: utxo_entry.amount,
            fee: Some(0),
            to_address: Some(format!("0x{}", hex::encode(CAGE_CONTRACT_ADDRESS))),
            memo: None,
            created_at: current_unix_timestamp_i64(),
            confirmation: None,
            expires_at: None,
            priority: Some(0),
            input_details: InputDetail::serialize_list(&input_details),
            execution_status: Some(TransactionExecutionStatus::Unknown),
        };
        if let Err(e) = queries.insert_transaction(&wallet_id, &record) {
            log::warn!("Failed to store pending CAGE deposit: {}", e);
        }
    }

    log::info!(
        "CAGE deposit submitted (sponsored): UTXO {}:{} amount={} anchor={}",
        txid_hex,
        vout,
        utxo_entry.amount,
        hex::encode(anchor_stem_hash)
    );

    Ok(DepositResult {
        txid: hex::encode(tx_hash),
        fee: "0".to_string(), // sponsored — no fee
        amount: utxo_entry.amount.to_string(),
        anchor_stem_hash: hex::encode(anchor_stem_hash),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cage_consume_utxo_call_data_round_trips_through_shared_decoder() {
        let declared_anchor = [0x11; 32];
        let tx_id = [0x22; 32];
        let output_index = 0x3344;
        let script_sig = vec![64, 0xaa, 32, 0xbb, 0xcc];

        let encoded = encode_cage_consume_utxo_call_data(
            declared_anchor,
            tx_id,
            output_index,
            script_sig.clone(),
        );
        let decoded = CageConsumeUtxoCallData::decode(&encoded).unwrap();

        assert_eq!(decoded.declared_anchor_stem_hash, declared_anchor);
        assert_eq!(decoded.tx_id, tx_id);
        assert_eq!(decoded.output_index, output_index);
        assert_eq!(decoded.script_sig, script_sig);
        assert_eq!(&encoded[..32], &declared_anchor);
        assert_eq!(&encoded[32..64], &tx_id);
        assert_eq!(&encoded[64..66], &output_index.to_le_bytes());
    }
}

// ===========================================================================
// CAGE Bridge Configuration
// ===========================================================================

/// Get CAGE bridge configuration: address and current withdrawal fee basis points
#[tauri::command]
pub async fn get_cage_config(state: State<'_, AppState>) -> Result<CageConfig, String> {
    // Address from parent lib constant
    let address_hex = format!("0x{}", hex::encode(CAGE_CONTRACT_ADDRESS));

    // Query current withdrawal fee bps from CAGE contract storage
    let storage = state.services.storage();
    let backend = Box::new(RocksDBBackend::new(
        storage.db.clone(),
        "unified_state".to_string(),
    ));
    let mpt = Arc::new(UnifiedMPT::new(backend).map_err(|e| format!("MPT error: {}", e))?);

    // __fee_basis_points key — stored as little-endian u64
    let fee_bps_value = mpt
        .get_storage(
            &CAGE_CONTRACT_ADDRESS,
            FruitType::Apple,
            b"__fee_basis_points",
        )
        .map_err(|e| format!("Failed to read CAGE fee config: {}", e))?;

    let withdraw_fee_bps = match fee_bps_value {
        Some(bytes) if bytes.len() >= 8 => u64::from_le_bytes(
            bytes[..8]
                .try_into()
                .map_err(|_| "Invalid fee bps length")?,
        ),
        _ => {
            return Err("Failed to read CAGE withdrawal fee from contract storage".to_string());
        }
    };

    Ok(CageConfig {
        address: address_hex,
        withdraw_fee_bps,
    })
}

// ===========================================================================
// Read-Only Commands
// ===========================================================================

/// Simulate a contract call without creating a transaction
///
/// `value` is provided as a string to avoid JavaScript precision loss.
#[tauri::command]
pub async fn query_contract(
    state: State<'_, AppState>,
    caller: Option<String>,
    contract_address: String,
    method: String,
    data: Option<String>,
    value: Option<String>,
    gas_limit: Option<u64>,
) -> Result<QueryResult, String> {
    let _ = value; // Simulation always uses value=0 (no balance required)
    let contract_addr = decode_hex_address(&contract_address)?;
    let caller_addr = match &caller {
        Some(c) => decode_hex_address(c)?,
        None => [0u8; 20],
    };

    let call_data = match &data {
        Some(d) => hex::decode(d).map_err(|_| "Invalid data hex".to_string())?,
        None => vec![],
    };

    let storage = state.services.storage();
    let chain = state.services.blockchain();
    let timestamp = chain
        .get_latest_block()
        .map_err(|e| format!("Failed to get latest block: {}", e))?
        .map(|b| b.header.timestamp)
        .unwrap_or(0);

    let backend = Box::new(RocksDBBackend::new(
        storage.db.clone(),
        "unified_state".to_string(),
    ));
    let mpt = Arc::new(UnifiedMPT::new(backend).map_err(|e| format!("MPT error: {}", e))?);

    let mut vm = CrystalVm::for_fruit_execution(
        mpt,
        storage.clone(),
        chain.get_current_leaf_height(),
        timestamp,
        FruitType::Apple,
        1,
        [0u8; 32],
    )
    .map_err(|e| format!("VM init failed: {}", e))?;

    let sim_gas = gas_limit.unwrap_or(500_000);

    match vm.simulate_call(caller_addr, contract_addr, &method, &call_data, sim_gas) {
        Ok(result) => Ok(QueryResult {
            success: result.success,
            return_data: hex::encode(&result.return_data),
            gas_used: result.gas_used.to_string(),
            error_message: result.error_message,
            logs: result
                .events
                .iter()
                .map(|ev| hex::encode(&ev.data))
                .collect(),
        }),
        Err(e) => Ok(QueryResult {
            success: false,
            return_data: String::new(),
            gas_used: "0".to_string(),
            error_message: Some(format!("Simulation failed: {}", e)),
            logs: vec![],
        }),
    }
}

/// Get basic info about a contract address
#[tauri::command]
pub async fn get_contract_info(
    state: State<'_, AppState>,
    contract_address: String,
) -> Result<ContractInfo, String> {
    let addr = decode_hex_address(&contract_address)?;

    let storage = state.services.storage();
    let backend = Box::new(RocksDBBackend::new(
        storage.db.clone(),
        "unified_state".to_string(),
    ));
    let mpt = UnifiedMPT::new(backend).map_err(|e| format!("MPT error: {}", e))?;

    let account = mpt.get_account(&addr);
    match account {
        Ok(Some(acc)) => {
            let balance = acc.balances.get(&CurrencyType::XTAL).copied().unwrap_or(0);
            Ok(ContractInfo {
                address: format!("0x{}", hex::encode(addr)),
                exists: true,
                is_contract: acc.code_hash.is_some(),
                balance,
                code_hash: acc.code_hash.map(hex::encode),
                fruit_type: acc.fruit_type.map(fruit_type_name).map(String::from),
            })
        }
        _ => Ok(ContractInfo {
            address: format!("0x{}", hex::encode(addr)),
            exists: false,
            is_contract: false,
            balance: 0,
            code_hash: None,
            fruit_type: None,
        }),
    }
}

/// Read a single storage key from a contract
#[tauri::command]
pub async fn get_contract_storage_value(
    state: State<'_, AppState>,
    contract_address: String,
    key: String,
    fruit_type: Option<String>,
) -> Result<ContractStorageResult, String> {
    let addr = decode_hex_address(&contract_address)?;
    let key_bytes = hex::decode(&key).map_err(|_| "Invalid key hex".to_string())?;
    let ft = fruit_type
        .as_deref()
        .and_then(parse_fruit_type)
        .unwrap_or(FruitType::Apple);

    let storage = state.services.storage();
    let backend = Box::new(RocksDBBackend::new(
        storage.db.clone(),
        "unified_state".to_string(),
    ));
    let mpt = UnifiedMPT::new(backend).map_err(|e| format!("MPT error: {}", e))?;

    let value = mpt
        .get_storage(&addr, ft, &key_bytes)
        .map_err(|e| format!("Storage read failed: {}", e))?;

    Ok(ContractStorageResult {
        value: value.map(hex::encode),
    })
}

/// Estimate gas for a contract call by simulating it
#[tauri::command]
pub async fn estimate_contract_gas(
    state: State<'_, AppState>,
    contract_address: String,
    method: String,
    data: Option<String>,
) -> Result<GasEstimate, String> {
    let contract_addr = decode_hex_address(&contract_address)?;
    let call_data = match &data {
        Some(d) => hex::decode(d).map_err(|_| "Invalid data hex".to_string())?,
        None => vec![],
    };

    let storage = state.services.storage();
    let chain = state.services.blockchain();
    let timestamp = chain
        .get_latest_block()
        .map_err(|e| format!("Failed to get latest block: {}", e))?
        .map(|b| b.header.timestamp)
        .unwrap_or(0);

    let backend = Box::new(RocksDBBackend::new(
        storage.db.clone(),
        "unified_state".to_string(),
    ));
    let mpt = Arc::new(UnifiedMPT::new(backend).map_err(|e| format!("MPT error: {}", e))?);

    let mut vm = CrystalVm::for_fruit_execution(
        mpt,
        storage.clone(),
        chain.get_current_leaf_height(),
        timestamp,
        FruitType::Apple,
        1,
        [0u8; 32],
    )
    .map_err(|e| format!("VM init failed: {}", e))?;

    let gas_used =
        match vm.simulate_call([0u8; 20], contract_addr, &method, &call_data, MAX_GAS_LIMIT) {
            Ok(result) => result.gas_used,
            Err(_) => TX_BASE_GAS + 50_000, // Fallback estimate on simulation failure
        };

    // Add 20% buffer for safety
    let gas_estimate = gas_used.saturating_add(gas_used / 5);
    let fee_estimate = gas_estimate.saturating_mul(MIN_GAS_PRICE);

    Ok(GasEstimate {
        gas_estimate: gas_estimate.to_string(),
        fee_estimate: fee_estimate.to_string(),
    })
}

// ===========================================================================
// ABI Discovery + Cache Commands
// ===========================================================================

/// Load a contract's ABI — check local cache, then try `__abi_cid` on-chain
#[tauri::command]
pub async fn load_contract_abi(
    state: State<'_, AppState>,
    contract_address: String,
) -> Result<Option<ContractAbi>, String> {
    let addr_hex = contract_address
        .strip_prefix("0x")
        .unwrap_or(&contract_address)
        .to_uppercase();

    // 1. Check local cache
    if let Ok(cache) = state.abi_cache.lock() {
        if let Some(abi) = cache.get(&addr_hex) {
            return Ok(Some(abi));
        }
    }

    // 2. Read __abi_cid from contract storage
    let addr = decode_hex_address(&contract_address)?;
    let storage = state.services.storage();
    let backend = Box::new(RocksDBBackend::new(
        storage.db.clone(),
        "unified_state".to_string(),
    ));
    let mpt = UnifiedMPT::new(backend).map_err(|e| format!("MPT error: {}", e))?;

    let cid_value = mpt
        .get_storage(&addr, FruitType::Apple, ABI_CID_KEY)
        .unwrap_or(None);

    if let Some(cid_bytes) = cid_value {
        let cid_hex = hex::encode(&cid_bytes);

        // Check if any cached ABI matches this CID or content hash
        if let Ok(cache) = state.abi_cache.lock() {
            if let Some(entry) = cache.find_by_cid(&cid_hex) {
                if let Some(abi) = cache.get(&entry.address) {
                    return Ok(Some(abi));
                }
            }
            // Backward compat: also check by raw content hash (32-byte digest)
            if cid_bytes.len() == 36 {
                let digest_hex = hex::encode(&cid_bytes[4..]);
                if let Some(entry) = cache.find_by_content_hash(&digest_hex) {
                    if let Some(abi) = cache.get(&entry.address) {
                        return Ok(Some(abi));
                    }
                }
            }
        }

        // 3. IPFS fallback — fetch ABI by CID from IPFS gateways
        if let Some(ref ipfs) = state.ipfs_client {
            match ipfs.fetch_abi(&cid_bytes).await {
                Ok(json_str) => {
                    let abi: ContractAbi = serde_json::from_str(&json_str)
                        .map_err(|e| format!("Invalid ABI from IPFS: {}", e))?;
                    abi.validate()
                        .map_err(|e| format!("ABI from IPFS failed validation: {}", e))?;

                    // Verify the CID matches what's on-chain
                    let fetched_cid = content_cid_from_bytes(json_str.as_bytes());
                    if fetched_cid != cid_bytes {
                        return Err("ABI from IPFS does not match on-chain CID".to_string());
                    }

                    // Cache locally with source = "ipfs"
                    if let Ok(mut cache) = state.abi_cache.lock() {
                        let _ = cache.put(&addr_hex, &abi, "ipfs", None);
                    }

                    log::info!("ABI resolved from IPFS for contract {}", addr_hex);
                    return Ok(Some(abi));
                }
                Err(e) => {
                    log::warn!("IPFS fetch failed for {}: {}", addr_hex, e);
                }
            }
        }
    }

    Ok(None)
}

/// List all contracts in the local ABI cache
#[tauri::command]
pub async fn list_cached_contracts(
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let cache = state
        .abi_cache
        .lock()
        .map_err(|_| "Cache lock poisoned".to_string())?;

    let entries: Vec<serde_json::Value> = cache
        .list()
        .into_iter()
        .map(|e| {
            serde_json::json!({
                "address": e.address,
                "name": e.name,
                "description": e.description,
                "icon": e.icon,
                "fruitType": e.fruit_type,
                "methodCount": e.method_count,
                "contentHash": e.content_hash,
                "cid": e.cid,
                "addedAt": e.added_at,
                "source": e.source,
            })
        })
        .collect();

    Ok(entries)
}

// ===========================================================================
// Calldata Encoding — delegates to SDK ContractAbi::encode_args()
// ===========================================================================

/// Parse a string value into a typed AbiValue based on the given ParamType.
///
/// This replaces the old encode_param_value which directly produced hex.
/// By parsing into typed AbiValue variants first, we guarantee compatibility
/// with the SDK's canonical encoder and automatically support any future
/// encoding changes the SDK introduces.
fn parse_string_to_abi_value(param_type: &ParamType, value: &str) -> Result<AbiValue, String> {
    match param_type {
        ParamType::U8 => Ok(AbiValue::U8(value.parse().map_err(|_| "Invalid u8")?)),
        ParamType::U16 => Ok(AbiValue::U16(value.parse().map_err(|_| "Invalid u16")?)),
        ParamType::U32 => Ok(AbiValue::U32(value.parse().map_err(|_| "Invalid u32")?)),
        ParamType::U64 => Ok(AbiValue::U64(value.parse().map_err(|_| "Invalid u64")?)),
        ParamType::XtalAmount => Ok(AbiValue::U64(parse_xtal_to_shards(value)?)),
        ParamType::Bool => match value.to_lowercase().as_str() {
            "true" => Ok(AbiValue::Bool(true)),
            "false" => Ok(AbiValue::Bool(false)),
            _ => Err("bool must be 'true' or 'false'".into()),
        },
        ParamType::VmAddress | ParamType::Bytes20 => {
            let hex = value.strip_prefix("0x").unwrap_or(value);
            if hex.len() != 40 {
                return Err(format!("Expected 40 hex chars, got {}", hex.len()));
            }
            let bytes = hex::decode(hex).map_err(|_| "Invalid hex address")?;
            let mut addr = [0u8; 20];
            addr.copy_from_slice(&bytes);
            Ok(AbiValue::Address(addr))
        }
        ParamType::Bytes32 => {
            let hex = value.strip_prefix("0x").unwrap_or(value);
            if hex.len() != 64 {
                return Err(format!("Expected 64 hex chars, got {}", hex.len()));
            }
            let bytes = hex::decode(hex).map_err(|_| "Invalid hex hash")?;
            let mut hash = [0u8; 32];
            hash.copy_from_slice(&bytes);
            Ok(AbiValue::Hash(hash))
        }
        ParamType::UtxoAddress => {
            if value.is_empty() || value.len() > 40 {
                return Err(format!(
                    "utxo_address must be 1-40 chars, got {}",
                    value.len()
                ));
            }
            Ok(AbiValue::String(value.to_string()))
        }
        ParamType::String => Ok(AbiValue::String(value.to_string())),
        ParamType::Bytes => {
            let hex = value.strip_prefix("0x").unwrap_or(value);
            if hex.len() % 2 != 0 {
                return Err("bytes hex must have even length".into());
            }
            Ok(AbiValue::Bytes(
                hex::decode(hex).map_err(|_| "Invalid hex bytes")?,
            ))
        }
        ParamType::Array(elem_type) => {
            let elements = value
                .split(',')
                .map(|v| parse_string_to_abi_value(elem_type, v.trim()))
                .collect::<Result<Vec<_>, _>>()?;
            Ok(AbiValue::Array(elements))
        }
    }
}

/// Load a contract's ABI from the local cache or on-chain `__abi_cid`.
///
/// Helper used by encode_contract_calldata to resolve the ABI for a given
/// contract address.
async fn load_contract_abi_for_encoding(
    state: &State<'_, AppState>,
    contract_address: &str,
) -> Result<ContractAbi, String> {
    let addr_hex = contract_address
        .strip_prefix("0x")
        .unwrap_or(contract_address)
        .to_uppercase();

    // 1. Check local cache
    if let Ok(cache) = state.abi_cache.lock() {
        if let Some(abi) = cache.get(&addr_hex) {
            return Ok(abi.clone());
        }
    }

    // 2. Read __abi_cid from contract storage
    let addr = decode_hex_address(contract_address)?;
    let storage = state.services.storage();
    let backend = Box::new(RocksDBBackend::new(
        storage.db.clone(),
        "unified_state".to_string(),
    ));
    let mpt = UnifiedMPT::new(backend).map_err(|e| format!("MPT error: {}", e))?;

    let cid_value = mpt
        .get_storage(&addr, FruitType::Apple, ABI_CID_KEY)
        .unwrap_or(None);

    if let Some(cid_bytes) = cid_value {
        let cid_hex = hex::encode(&cid_bytes);

        // Check if any cached ABI matches this CID or content hash
        if let Ok(cache) = state.abi_cache.lock() {
            if let Some(entry) = cache.find_by_cid(&cid_hex) {
                if let Some(abi) = cache.get(&entry.address) {
                    return Ok(abi.clone());
                }
            }
            if cid_bytes.len() == 36 {
                let digest_hex = hex::encode(&cid_bytes[4..]);
                if let Some(entry) = cache.find_by_content_hash(&digest_hex) {
                    if let Some(abi) = cache.get(&entry.address) {
                        return Ok(abi.clone());
                    }
                }
            }
        }

        // 3. IPFS fallback
        if let Some(ref ipfs) = state.ipfs_client {
            match ipfs.fetch_abi(&cid_bytes).await {
                Ok(json_str) => {
                    let abi: ContractAbi = serde_json::from_str(&json_str)
                        .map_err(|e| format!("Invalid ABI from IPFS: {}", e))?;
                    abi.validate()
                        .map_err(|e| format!("ABI from IPFS failed validation: {}", e))?;

                    let fetched_cid = content_cid_from_bytes(json_str.as_bytes());
                    if fetched_cid != cid_bytes {
                        return Err("ABI from IPFS does not match on-chain CID".to_string());
                    }

                    if let Ok(mut cache) = state.abi_cache.lock() {
                        let _ = cache.put(&addr_hex, &abi, "ipfs", None);
                    }

                    log::info!("ABI resolved from IPFS for contract {}", addr_hex);
                    return Ok(abi);
                }
                Err(e) => {
                    log::warn!("IPFS fetch failed for {}: {}", addr_hex, e);
                }
            }
        }
    }

    Err(
        "ABI not found for contract. Import it via the ABI cache or deploy the contract first."
            .to_string(),
    )
}

/// Encode contract call parameters into packed hex calldata by delegating
/// to the SDK's `ContractAbi::encode_args()`.
///
/// This is the canonical encoder — any future SDK encoding changes (e.g.
/// array length prefixes, new types) are automatically reflected here.
///
/// Returns the hex-encoded calldata and per-param validation results.
#[tauri::command]
pub async fn encode_contract_calldata(
    state: State<'_, AppState>,
    contract_address: String,
    method_name: String,
    params: Vec<ParamInput>,
) -> Result<EncodeResult, String> {
    // Resolve the ABI for this contract
    let abi = load_contract_abi_for_encoding(&state, &contract_address).await?;

    // Look up the method definition
    let method = abi
        .method(&method_name)
        .ok_or_else(|| format!("Unknown method: {}", method_name))?;

    // Validate param count
    if params.len() != method.params.len() {
        return Err(format!(
            "Expected {} params for method '{}', got {}",
            method.params.len(),
            method_name,
            params.len()
        ));
    }

    // Parse string inputs into typed AbiValues, building param_results in parallel
    let mut param_results = Vec::with_capacity(params.len());
    let values = params
        .iter()
        .zip(method.params.iter())
        .map(|(input, param_def)| {
            let result = parse_string_to_abi_value(&param_def.param_type, &input.value);
            param_results.push(ParamResult {
                name: input.name.clone(),
                type_: input.type_.clone(),
                value: match &result {
                    Ok(_) => input.value.clone(),
                    Err(e) => e.clone(),
                },
            });
            result
        })
        .collect::<Result<Vec<_>, _>>()?;

    // Delegate to the SDK's canonical encoder
    let encoded_bytes = abi.encode_args(&method_name, &values)?;
    let data = hex::encode(encoded_bytes);

    Ok(EncodeResult {
        data,
        param_results,
    })
}
/// Import an ABI for an existing contract
#[tauri::command]
pub async fn import_contract_abi(
    state: State<'_, AppState>,
    contract_address: String,
    abi_json: String,
    fruit_type: Option<String>,
) -> Result<(), String> {
    let abi: ContractAbi =
        serde_json::from_str(&abi_json).map_err(|e| format!("Invalid ABI JSON: {}", e))?;
    abi.validate()
        .map_err(|e| format!("ABI validation failed: {}", e))?;

    let addr_hex = contract_address
        .strip_prefix("0x")
        .unwrap_or(&contract_address)
        .to_uppercase();

    let ft = fruit_type.as_deref().unwrap_or("Apple");

    let mut cache = state
        .abi_cache
        .lock()
        .map_err(|_| "Cache lock poisoned".to_string())?;
    cache.put(&addr_hex, &abi, "imported", Some(ft))
}

/// Remove a contract from the local ABI cache
#[tauri::command]
pub async fn remove_cached_contract(
    state: State<'_, AppState>,
    contract_address: String,
) -> Result<(), String> {
    let addr_hex = contract_address
        .strip_prefix("0x")
        .unwrap_or(&contract_address)
        .to_uppercase();

    let mut cache = state
        .abi_cache
        .lock()
        .map_err(|_| "Cache lock poisoned".to_string())?;
    cache.remove(&addr_hex)
}

// ===========================================================================
// IPFS Commands
// ===========================================================================

/// Pin an already-cached ABI to IPFS (for retroactive pinning)
#[tauri::command]
pub async fn pin_abi_to_ipfs(
    state: State<'_, AppState>,
    contract_address: String,
) -> Result<String, String> {
    let ipfs = state.ipfs_client.as_ref().ok_or("IPFS is not configured")?;

    let addr_hex = contract_address
        .strip_prefix("0x")
        .unwrap_or(&contract_address)
        .to_uppercase();

    // Load ABI from cache
    let abi_json = {
        let cache = state
            .abi_cache
            .lock()
            .map_err(|_| "Cache lock poisoned".to_string())?;
        let abi = cache
            .get(&addr_hex)
            .ok_or("Contract not found in local ABI cache")?;
        serde_json::to_string(&abi).map_err(|e| format!("Serialize error: {}", e))?
    };

    let cid_bytes = ipfs
        .pin_abi(&abi_json)
        .await
        .map_err(|e| format!("IPFS pin failed: {}", e))?;

    let cid_hex = hex::encode(&cid_bytes);
    log::info!("ABI pinned for {}: {}", addr_hex, cid_hex);
    Ok(cid_hex)
}

/// Return the current IPFS integration status
#[tauri::command]
pub async fn get_ipfs_status(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    match &state.ipfs_client {
        Some(client) => {
            let status = client.status();
            Ok(serde_json::json!({
                "enabled": status.enabled,
                "gatewayCount": status.gateway_count,
                "gateways": status.gateways,
                "pinningConfigured": status.pinning_configured,
            }))
        }
        None => Ok(serde_json::json!({
            "enabled": false,
            "gatewayCount": 0,
            "gateways": [],
            "pinningConfigured": false,
        })),
    }
}
