//! Mempool query commands
//!
//! Commands for querying mempool state and pending transactions.

use xtal::shards::Shards;

use std::cmp::Reverse;
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::State;

use xtal::crypto::hash_public_key;
use xtal::transaction::Transaction;

use crate::commands::tx_detail_utils::{extract_inputs, extract_outputs};
use crate::commands::wallet::{
    annotate_transaction_io_ownership, get_wallet_addresses, TransactionInput, TransactionOutput,
};
use crate::events::{get_wallet_pkh_set, incoming_amount_for_pkhs};
use crate::state::AppState;

/// Mempool overview information
#[derive(Debug, Clone, Serialize)]
pub struct MempoolInfo {
    pub total_transactions: usize,
    pub size_bytes: usize,
    pub utxo_count: usize,
    pub vm_count: usize,
    pub oldest_age_secs: Option<u64>,
    pub transaction_count_by_type: HashMap<String, usize>,
}

/// Mempool transaction summary for display
#[derive(Debug, Clone, Serialize)]
pub struct MempoolTransaction {
    pub txid: String,
    pub tx_type: String,
    pub fee: Shards,
    pub size_bytes: usize,
    pub age_secs: u64,
}

impl MempoolTransaction {
    /// Build a summary row from a mempool entry; `None` if the tx id can't be
    /// computed.
    fn from_entry(tx: &Transaction, fee: u64, timestamp: u64, now: u64) -> Option<Self> {
        // Display the same id that the mempool uses for lookup.
        let txid = tx.id().ok().map(hex::encode)?;

        Some(Self {
            txid,
            tx_type: get_tx_type_name(tx).to_string(),
            fee: fee.into(),
            size_bytes: tx.serialized_size().unwrap_or(0),
            age_secs: now.saturating_sub(timestamp),
        })
    }
}

const UTXO_TYPES: &[&str] = &["Standard", "Stake", "Unstake"];
const VM_TYPES: &[&str] = &["ContractCall", "ContractDeploy", "AccountTransfer"];

/// Get transaction type name
fn get_tx_type_name(tx: &Transaction) -> &'static str {
    match tx {
        Transaction::Standard(_) => "Standard",
        Transaction::Coinbase(_) => "Coinbase",
        Transaction::ContractCall(_) => "ContractCall",
        Transaction::ContractDeploy(_) => "ContractDeploy",
        Transaction::Stake(_) => "Stake",
        Transaction::Unstake(_) => "Unstake",
        Transaction::AccountTransfer(_) => "AccountTransfer",
        Transaction::VmWithdrawal(_) => "VmWithdrawal",
    }
}

/// Get mempool overview information
#[tauri::command]
pub async fn get_mempool_info(state: State<'_, AppState>) -> Result<MempoolInfo, String> {
    let mempool = state.services.mempool();
    let stats = mempool.get_stats();

    // Count UTXO vs VM transactions
    let utxo_count = UTXO_TYPES
        .iter()
        .filter_map(|t| stats.transaction_count_by_type.get(*t))
        .sum();

    let vm_count = VM_TYPES
        .iter()
        .filter_map(|t| stats.transaction_count_by_type.get(*t))
        .sum();

    Ok(MempoolInfo {
        total_transactions: stats.total_transactions,
        size_bytes: stats.size_bytes,
        utxo_count,
        vm_count,
        oldest_age_secs: stats.oldest_transaction_age.map(|d| d.as_secs()),
        transaction_count_by_type: stats.transaction_count_by_type,
    })
}

/// Get all mempool transactions
#[tauri::command]
pub async fn get_mempool_transactions(
    state: State<'_, AppState>,
) -> Result<Vec<MempoolTransaction>, String> {
    let mempool = state.services.mempool();

    // Get transactions with fees and timestamps
    let txs_with_fees = mempool.get_transactions_with_fees();

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let mut results = Vec::with_capacity(txs_with_fees.len());

    for (tx, fee, timestamp) in txs_with_fees {
        if let Some(summary) = MempoolTransaction::from_entry(&tx, fee, timestamp, now) {
            results.push(summary);
        }
    }

    // Sort by fee (highest first) as a sensible default
    results.sort_by_key(|t| Reverse(t.fee));

    Ok(results)
}

/// A mempool transaction summary plus the amount it pays the loaded wallet.
#[derive(Debug, Clone, Serialize)]
pub struct IncomingMempoolTransaction {
    #[serde(flatten)]
    pub summary: MempoolTransaction,
    /// Total shards paying wallet-owned PKHs in this transaction.
    pub incoming_amount: Shards,
}

/// Get pending mempool transactions with outputs paying the loaded wallet.
///
/// Scoped to the user wallet's PKH set only — unlike the incoming-transaction
/// event path in `events.rs`, which also aggregates running validator wallets
/// for toast notifications.
#[tauri::command]
pub async fn get_incoming_mempool_transactions(
    state: State<'_, AppState>,
) -> Result<Vec<IncomingMempoolTransaction>, String> {
    let Some(ref wallet) = state.services.wallet else {
        return Ok(Vec::new());
    };
    if !wallet.is_loaded() {
        return Ok(Vec::new());
    }
    let pkhs = get_wallet_pkh_set(wallet)?;

    let mempool = state.services.mempool();
    let txs_with_fees = mempool.get_transactions_with_fees();

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let mut results = Vec::new();

    for (tx, fee, timestamp) in txs_with_fees {
        let incoming_amount = incoming_amount_for_pkhs(&tx, &pkhs);
        if incoming_amount == 0 {
            continue;
        }

        if let Some(summary) = MempoolTransaction::from_entry(&tx, fee, timestamp, now) {
            results.push(IncomingMempoolTransaction {
                summary,
                incoming_amount: incoming_amount.into(),
            });
        }
    }

    // Newest first
    results.sort_by_key(|t| t.summary.age_secs);

    Ok(results)
}

/// Get a single transaction from mempool by hash
#[tauri::command]
pub async fn get_mempool_transaction(
    state: State<'_, AppState>,
    txid: String,
) -> Result<Option<MempoolTransaction>, String> {
    let mempool = state.services.mempool();

    let txid_bytes: [u8; 32] = hex::decode(txid.trim_start_matches("0x"))
        .map_err(|e| format!("Invalid txid: {}", e))?
        .try_into()
        .map_err(|_| "Txid must be 32 bytes")?;

    // Look up transaction with cached fee and timestamp
    let (tx, fee, timestamp) = match mempool.get_transaction_with_fee(&txid_bytes) {
        Some(data) => data,
        None => return Ok(None),
    };

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    Ok(MempoolTransaction::from_entry(&tx, fee, timestamp, now))
}

/// Detailed mempool transaction information for the detail panel
#[derive(Debug, Clone, Serialize)]
pub struct MempoolTransactionDetail {
    // Common fields
    pub txid: String,
    pub tx_type: String,
    pub fee: Shards,
    pub size_bytes: usize,
    pub age_secs: u64,
    pub is_sponsored: bool,

    // UTXO-specific fields (populated for Standard/Stake/Unstake)
    pub inputs: Option<Vec<TransactionInput>>,
    pub outputs: Option<Vec<TransactionOutput>>,
    pub total_input: Option<Shards>,
    pub total_output: Option<Shards>,

    // VM-specific fields (populated for ContractCall/ContractDeploy/AccountTransfer)
    pub caller: Option<String>,
    pub contract_address: Option<String>,
    pub method: Option<String>,
    pub gas_limit: Option<u64>,
    pub gas_price: Option<u64>,
    pub nonce: Option<u64>,
    pub value: Option<Shards>,
    pub data_size: Option<usize>,

    // ContractDeploy-specific
    pub preferred_fruit_type: Option<String>,

    // AccountTransfer-specific
    pub recipient: Option<String>,
    pub transfer_amount: Option<Shards>,
    pub currency: Option<String>,
}

/// Get detailed information about a mempool transaction
#[tauri::command]
pub async fn get_mempool_transaction_detail(
    state: State<'_, AppState>,
    txid: String,
) -> Result<Option<MempoolTransactionDetail>, String> {
    let mempool = state.services.mempool();

    let txid_bytes: [u8; 32] = hex::decode(txid.trim_start_matches("0x"))
        .map_err(|e| format!("Invalid txid: {}", e))?
        .try_into()
        .map_err(|_| "Txid must be 32 bytes")?;

    let (tx, fee, timestamp) = match mempool.get_transaction_with_fee(&txid_bytes) {
        Some(data) => data,
        None => return Ok(None),
    };

    let tx_type = get_tx_type_name(&tx).to_string();
    let size_bytes = tx.serialized_size().unwrap_or(0);
    let is_sponsored = tx.requests_free_execution();

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let age_secs = now.saturating_sub(timestamp);

    let mut detail = MempoolTransactionDetail {
        txid: hex::encode(txid_bytes),
        tx_type,
        fee: fee.into(),
        size_bytes,
        age_secs,
        is_sponsored,
        inputs: None,
        outputs: None,
        total_input: None,
        total_output: None,
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
    };

    match tx.as_ref() {
        Transaction::Standard(std_tx) => {
            let blockchain = state.services.blockchain();
            let inputs = extract_inputs(&std_tx.inputs, &blockchain).unwrap_or_default();
            let outputs = extract_outputs(&std_tx.outputs, "p2pkh");
            let total_input = inputs
                .iter()
                .filter_map(|i| i.amount)
                .map(Shards::get)
                .fold(0u64, u64::saturating_add);
            let total_output = outputs
                .iter()
                .map(|o| o.amount.get())
                .fold(0u64, u64::saturating_add);
            detail.inputs = Some(inputs);
            detail.outputs = Some(outputs);
            detail.total_input = Some(Shards::from(total_input));
            detail.total_output = Some(Shards::from(total_output));
        }
        Transaction::Stake(stake_tx) => {
            let blockchain = state.services.blockchain();
            let inputs = extract_inputs(&stake_tx.inputs, &blockchain).unwrap_or_default();
            let outputs = extract_outputs(&stake_tx.outputs, "stake");
            let total_input = inputs
                .iter()
                .filter_map(|i| i.amount)
                .map(Shards::get)
                .fold(0u64, u64::saturating_add);
            let total_output = outputs
                .iter()
                .map(|o| o.amount.get())
                .fold(0u64, u64::saturating_add);
            detail.inputs = Some(inputs);
            detail.outputs = Some(outputs);
            detail.total_input = Some(Shards::from(total_input));
            detail.total_output = Some(Shards::from(total_output));
        }
        Transaction::Unstake(unstake_tx) => {
            let blockchain = state.services.blockchain();
            let inputs = extract_inputs(&unstake_tx.inputs, &blockchain).unwrap_or_default();
            let outputs = extract_outputs(&unstake_tx.outputs, "unstake");
            let total_input = inputs
                .iter()
                .filter_map(|i| i.amount)
                .map(Shards::get)
                .fold(0u64, u64::saturating_add);
            let total_output = outputs
                .iter()
                .map(|o| o.amount.get())
                .fold(0u64, u64::saturating_add);
            detail.inputs = Some(inputs);
            detail.outputs = Some(outputs);
            detail.total_input = Some(Shards::from(total_input));
            detail.total_output = Some(Shards::from(total_output));
        }
        Transaction::ContractCall(cc_tx) => {
            let pkh = hash_public_key(&cc_tx.caller);
            detail.caller = Some(format!("0x{}", hex::encode(pkh)));
            detail.contract_address = Some(format!("0x{}", hex::encode(cc_tx.contract_address)));
            detail.method = Some(cc_tx.method.clone());
            detail.gas_limit = Some(cc_tx.gas_limit);
            detail.gas_price = cc_tx.gas_price;
            detail.nonce = Some(cc_tx.nonce);
            detail.value = Some(Shards::from(cc_tx.value));
            detail.data_size = Some(cc_tx.data.len());
        }
        Transaction::ContractDeploy(cd_tx) => {
            let pkh = hash_public_key(&cd_tx.sender);
            detail.caller = Some(format!("0x{}", hex::encode(pkh)));
            detail.gas_limit = Some(cd_tx.gas_limit);
            detail.gas_price = cd_tx.gas_price;
            detail.nonce = Some(cd_tx.nonce);
            detail.data_size = Some(cd_tx.wasm.len());
            detail.preferred_fruit_type = cd_tx.preferred_fruit_type.map(|ft| format!("{:?}", ft));
        }
        Transaction::AccountTransfer(at_tx) => {
            let pkh = hash_public_key(&at_tx.sender);
            detail.caller = Some(format!("0x{}", hex::encode(pkh)));
            detail.recipient = Some(format!("0x{}", hex::encode(at_tx.recipient.as_bytes())));
            detail.transfer_amount = Some(Shards::from(at_tx.amount));
            detail.currency = Some(format!("{:?}", at_tx.currency));
            detail.gas_limit = Some(at_tx.gas_limit);
            detail.gas_price = at_tx.gas_price;
            detail.nonce = Some(at_tx.nonce);
            detail.data_size = Some(at_tx.data.len());
        }
        // Coinbase/VmWithdrawal don't normally appear in mempool
        _ => {}
    }

    // Tag inputs/outputs that belong to the wallet so the UI can highlight them
    // (red = spent input, yellow = pending owned output). Reuses the same
    // ownership logic as the confirmed-transaction detail command.
    if let (Some(inputs), Some(outputs)) = (detail.inputs.as_mut(), detail.outputs.as_mut()) {
        let wallet_addresses = state
            .services
            .wallet
            .as_ref()
            .map(|w| get_wallet_addresses(w))
            .transpose()?
            .unwrap_or_default();
        annotate_transaction_io_ownership(inputs, outputs, &wallet_addresses);
    }

    Ok(Some(detail))
}
