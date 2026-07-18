//! Event broadcasting from backend to frontend
//!
//! This module handles wallet-specific GUI events via Tauri.
//! Node-level events (blocks, mining, sync, peers) are handled via WebSocket.

#[cfg(debug_assertions)]
use log::info;
use log::{debug, error, warn};
#[cfg(debug_assertions)]
use std::sync::atomic::{AtomicU64, Ordering};
#[cfg(debug_assertions)]
use std::time::Instant;

// =============================================================================
// DIAGNOSTIC: Event emission rate counter (Phase 1 Investigation 2)
// =============================================================================

/// Global counter for Tauri event emissions (debug-only, stripped in release)
#[cfg(debug_assertions)]
static EVENT_DIAG_START: std::sync::OnceLock<Instant> = std::sync::OnceLock::new();
#[cfg(debug_assertions)]
static EVENT_DIAG_COUNT: AtomicU64 = AtomicU64::new(0);
#[cfg(debug_assertions)]
static EVENT_DIAG_LAST_LOG: std::sync::OnceLock<std::sync::Mutex<std::time::Instant>> =
    std::sync::OnceLock::new();

/// Diagnostic helper: log event emission rate every 10 seconds
#[cfg(debug_assertions)]
fn diag_log_event_rate(event_type: &str) {
    EVENT_DIAG_START.get_or_init(Instant::now);
    EVENT_DIAG_LAST_LOG.get_or_init(|| std::sync::Mutex::new(Instant::now()));

    let count = EVENT_DIAG_COUNT.fetch_add(1, Ordering::Relaxed);

    if let Some(last_log) = EVENT_DIAG_LAST_LOG.get() {
        let mut last_log = last_log.lock().unwrap();
        if last_log.elapsed().as_secs() >= 10 {
            let elapsed = EVENT_DIAG_START.get().unwrap().elapsed();
            info!(
                "[EVENT-DIAG] {}s elapsed | total_events={} | rate={:.2}/s | last_type={}",
                elapsed.as_secs(),
                count + 1,
                (count as f64 + 1.0) / elapsed.as_secs_f64(),
                event_type
            );
            *last_log = Instant::now();
        }
    }
}

#[cfg(not(debug_assertions))]
fn diag_log_event_rate(_event_type: &str) {}
use serde::Serialize;
use std::collections::HashSet;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast;

use xtal::address_format::{format_script_address, parse_address_input};
use xtal::blockchain::events::BlockchainEvent;
use xtal::crypto::hash_public_key;
use xtal::fruit::codec::Encode;
use xtal::interfaces::validator::ValidatorProduction;
use xtal::mempool::{MempoolEvent, RemovalReason};
use xtal::node::services::Services;
use xtal::script::extract_pkh_from_script;
use xtal::wallet::database::models::{
    InputDetail, KeyType, TransactionRecord, TransactionType, WalletType,
};
use xtal::wallet::database::queries::WalletQueries;
use xtal::wallet::database::WalletDatabase;

/// Events that can be emitted to the frontend
///
/// Note: Node-level events (blocks, mining, sync, peers) are broadcast via WebSocket.
/// This enum contains only wallet-specific and GUI-specific events.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", content = "data")]
pub enum GuiEvent {
    /// Chain reorganization occurred - important for wallet users to know
    ChainReorg {
        old_tip: String,
        new_tip: String,
        depth: usize,
        removed_count: usize,
        added_count: usize,
    },

    /// Wallet loaded
    WalletLoaded { name: String },

    /// Wallet unloaded
    WalletUnloaded,

    /// Incoming transaction detected in mempool
    IncomingTransaction {
        txid: String,
        amount: u64,
        timestamp: u64,
    },

    /// Outgoing transaction submitted to mempool (triggers wallet refresh)
    OutgoingTransaction {
        txid: String,
        amount: u64,
        timestamp: u64,
    },

    /// Node shutdown initiated
    ShuttingDown,
}

/// Spawn the event broadcaster task
///
/// This runs in the background and handles wallet-specific events.
/// Node-level events (blocks, mining, sync, peers) are handled via WebSocket.
pub async fn run_event_broadcaster(
    app: AppHandle,
    services: Arc<Services>,
    mut shutdown_rx: broadcast::Receiver<()>,
) {
    // Subscribe to blockchain events (for chain reorgs and wallet tx cleanup)
    let blockchain = services.blockchain();
    let mut blockchain_event_rx = blockchain.subscribe_events();

    // Subscribe to mempool events for incoming transaction detection
    let mut mempool_event_rx = services.mempool.subscribe_events();

    // Get wallet database for pending transaction cleanup
    let wallet_db = services.wallet.as_ref().and_then(|w| w.database());

    // Start diagnostic timer
    #[cfg(debug_assertions)]
    {
        EVENT_DIAG_START.get_or_init(Instant::now);
        info!("[EVENT-DIAG] Tauri event emission monitoring started");
    }

    debug!("Event broadcaster started");

    loop {
        tokio::select! {
            // Blockchain events (chain reorgs, wallet tx cleanup)
            Some(blockchain_event) = async {
                if let Some(ref mut rx) = blockchain_event_rx {
                    rx.recv().await.ok()
                } else {
                    std::future::pending::<Option<BlockchainEvent>>().await
                }
            } => {
                handle_blockchain_event(&app, blockchain_event, wallet_db.as_ref());
            }

            // Mempool events (incoming transaction detection)
            Some(mempool_event) = async {
                if let Some(ref mut rx) = mempool_event_rx {
                    rx.recv().await.ok()
                } else {
                    std::future::pending::<Option<MempoolEvent>>().await
                }
            } => {
                handle_mempool_event(&app, mempool_event, &services);
            }

            // Shutdown signal
            _ = shutdown_rx.recv() => {
                debug!("Event broadcaster received shutdown signal");
                let _ = app.emit("gui-event", &GuiEvent::ShuttingDown);
                break;
            }
        }
    }

    debug!("Event broadcaster stopped");
}

/// Handle blockchain events for wallet-specific actions
///
/// - ChainReorg: Notify user of chain reorganization
/// - FruitsConfirmed/StateFinalized: Clean up pending wallet transactions
/// - BlockAdded: Handled via WebSocket, not here
fn handle_blockchain_event(
    app: &AppHandle,
    event: BlockchainEvent,
    wallet_db: Option<&Arc<WalletDatabase>>,
) {
    match event {
        // BlockAdded is handled via WebSocket - no action needed here
        BlockchainEvent::BlockAdded { .. } => {}

        BlockchainEvent::ChainReorganized {
            old_tip,
            new_tip,
            depth,
            removed_blocks,
            added_blocks,
        } => {
            let event = GuiEvent::ChainReorg {
                old_tip: hex::encode(old_tip),
                new_tip: hex::encode(new_tip),
                depth,
                removed_count: removed_blocks.len(),
                added_count: added_blocks.len(),
            };

            diag_log_event_rate("ChainReorg");
            if let Err(e) = app.emit("gui-event", &event) {
                error!("Failed to emit chain reorg event: {}", e);
            }

            warn!(
                "Chain reorg detected: depth={}, removed={}, added={}",
                depth,
                removed_blocks.len(),
                added_blocks.len()
            );
        }

        // Node-internal mempool re-injection; the recovered transactions
        // re-enter as pending, which the existing pending-tx flow covers.
        BlockchainEvent::FruitsAbandoned { transactions } => {
            debug!(
                "{} transactions recovered from abandoned fruits",
                transactions.len()
            );
        }

        BlockchainEvent::FruitsConfirmed {
            stem_hash: _,
            fruit_count,
            confirmed_tx_hashes,
            ..
        } => {
            debug!(
                "Fruits confirmed: {} fruits, {} txs",
                fruit_count,
                confirmed_tx_hashes.len()
            );

            // Update pending transactions to confirmed status
            // Note: Using 0 as height since FruitsConfirmed doesn't include height info.
            // The height will be properly calculated when querying transaction history.
            if let Some(db) = wallet_db {
                if cleanup_confirmed_txs(db, &confirmed_tx_hashes, 0) {
                    debug!("Updated pending txs to confirmed after FruitsConfirmed");
                }
            }
        }

        BlockchainEvent::StateFinalized {
            leaf_hash: _,
            finalized_height,
            confirmed_tx_hashes,
            ..
        } => {
            debug!(
                "State finalized at height {}: {} txs",
                finalized_height,
                confirmed_tx_hashes.len()
            );

            // Update pending transactions to confirmed status
            if let Some(db) = wallet_db {
                if cleanup_confirmed_txs(db, &confirmed_tx_hashes, finalized_height) {
                    debug!(
                        "Updated pending txs to confirmed after StateFinalized at height {}",
                        finalized_height
                    );
                }
            }
        }

        BlockchainEvent::ReadyForSync => {
            debug!("Blockchain ready for sync");
        }

        BlockchainEvent::BlockRemoved { .. } => {
            // Handled via ChainReorganized
        }

        BlockchainEvent::FruitAdded {
            epoch: _,
            fruit_hash: _,
            tx_hashes,
        } => {
            debug!("Fruit added with {} transactions", tx_hashes.len());
        }
    }
}

/// Update pending transactions to confirmed status
///
/// Returns true if any pending transactions were updated.
/// Note: Frontend wallet refresh is triggered via WebSocket new_block events.
fn cleanup_confirmed_txs(
    db: &WalletDatabase,
    confirmed_tx_hashes: &[[u8; 32]],
    confirmation_height: u64,
) -> bool {
    let queries = WalletQueries::new(db.connection());
    let mut updated = false;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    for txid in confirmed_tx_hashes {
        // Check if this was our tracked transaction and it's still pending
        if let Ok(Some(tx)) = queries.get_transaction(txid) {
            if tx.is_pending() {
                // Get the wallet_id for this transaction
                let wallet_id = match queries.get_wallet_id_for_transaction(txid) {
                    Ok(Some(wid)) => wid,
                    _ => {
                        error!("No wallet_id found for tx {}", hex::encode(txid));
                        continue;
                    }
                };

                // Update to confirmed status
                let confirmation = Some((now, confirmation_height));
                if let Err(e) = queries.set_transaction_confirmed(txid, confirmation) {
                    error!(
                        "Failed to update tx {} to confirmed: {}",
                        hex::encode(txid),
                        e
                    );
                    continue;
                }

                // Subtract from pending outgoing total only for outgoing transactions
                if tx.is_outgoing() {
                    if let Err(e) = queries
                        .subtract_pending_outgoing(&wallet_id, tx.amount + tx.fee.unwrap_or(0))
                    {
                        error!("Failed to update pending outgoing: {}", e);
                    }
                }

                debug!(
                    "Confirmed pending tx: {} at height {}",
                    hex::encode(txid),
                    confirmation_height
                );
                updated = true;
            }
        }
    }

    updated
}

/// Emit a wallet loaded event
pub fn emit_wallet_loaded(app: &AppHandle, name: &str) {
    let event = GuiEvent::WalletLoaded {
        name: name.to_string(),
    };
    diag_log_event_rate("WalletLoaded");
    if let Err(e) = app.emit("gui-event", &event) {
        error!("Failed to emit wallet loaded event: {}", e);
    }
}

/// Emit a wallet unloaded event
pub fn emit_wallet_unloaded(app: &AppHandle) {
    diag_log_event_rate("WalletUnloaded");
    if let Err(e) = app.emit("gui-event", &GuiEvent::WalletUnloaded) {
        error!("Failed to emit wallet unloaded event: {}", e);
    }
}

/// Handle mempool events for incoming transaction detection and pending cleanup
fn handle_mempool_event(app: &AppHandle, event: MempoolEvent, services: &Arc<Services>) {
    match event {
        MempoolEvent::TransactionAdded {
            tx_hash,
            transaction,
            ..
        } => {
            handle_transaction_added(app, tx_hash, transaction, services);
        }
        MempoolEvent::TransactionRemoved { tx_hash, reason } => {
            handle_transaction_removed(&tx_hash, &reason, services);
        }
        _ => {}
    }
}

/// Handle a newly added transaction - check for incoming funds
fn handle_transaction_added(
    app: &AppHandle,
    tx_hash: [u8; 32],
    transaction: Arc<xtal::transaction::Transaction>,
    services: &Arc<Services>,
) {
    let mut total_incoming: u64 = 0;
    let mut incoming_records = Vec::new();

    // Check the loaded user wallet independently so validator funds are not
    // aggregated into the regular wallet's incoming amount.
    if let Some(ref wallet) = services.wallet {
        if wallet.is_loaded() {
            if let Ok(pkhs) = get_wallet_pkh_set(wallet) {
                let amount = incoming_amount_for_pkhs(&transaction, &pkhs);
                if amount > 0 {
                    total_incoming = total_incoming.saturating_add(amount);
                    if let (Some(db), Some(wallet_id)) =
                        (wallet.database(), wallet.current_wallet_id())
                    {
                        incoming_records.push((db, wallet_id, amount));
                    }
                }
            }
        }
    }

    // Check each running validator wallet separately.
    for entry in services.validators.iter() {
        if let Ok(pkh) = entry.value().get_validator_pkh() {
            let pkhs = HashSet::from([pkh]);
            let amount = incoming_amount_for_pkhs(&transaction, &pkhs);
            if amount > 0 {
                total_incoming = total_incoming.saturating_add(amount);
                if let (Some(db), Some(wallet_id)) = (
                    entry.value().get_wallet_database(),
                    entry.value().get_wallet_id(),
                ) {
                    incoming_records.push((db, wallet_id, amount));
                }
            }
        }
    }

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    // If we found incoming funds, emit the event and store in wallet DB
    if total_incoming > 0 {
        let event = GuiEvent::IncomingTransaction {
            txid: hex::encode(tx_hash),
            amount: total_incoming,
            timestamp,
        };

        debug!(
            "Incoming transaction detected: {} shards from tx {}",
            total_incoming,
            hex::encode(&tx_hash[..8])
        );

        diag_log_event_rate("IncomingTransaction");
        if let Err(e) = app.emit("gui-event", &event) {
            error!("Failed to emit incoming transaction event: {}", e);
        }

        for (db, wallet_id, amount) in incoming_records {
            store_incoming_mempool_tx(
                &db,
                &wallet_id,
                tx_hash,
                &transaction,
                amount,
                timestamp,
                services,
            );
        }
    }

    // Check if this is an outgoing transaction (wallet DB tracks pending outgoing txs)
    if let Some(db) = services.wallet.as_ref().and_then(|w| w.database()) {
        let queries = WalletQueries::new(db.connection());
        if let Ok(Some(tx)) = queries.get_transaction(&tx_hash) {
            if tx.is_outgoing() && tx.is_pending() {
                let event = GuiEvent::OutgoingTransaction {
                    txid: hex::encode(tx_hash),
                    amount: tx.amount,
                    timestamp,
                };

                debug!(
                    "Outgoing transaction detected: {} shards in tx {}",
                    tx.amount,
                    hex::encode(&tx_hash[..8])
                );

                diag_log_event_rate("OutgoingTransaction");
                if let Err(e) = app.emit("gui-event", &event) {
                    error!("Failed to emit outgoing transaction event: {}", e);
                }
            }
        }
    }
}

/// Total shards paid to any of `pkhs` by this transaction's UTXO outputs.
pub(crate) fn incoming_amount_for_pkhs(
    transaction: &xtal::transaction::Transaction,
    pkhs: &HashSet<[u8; 20]>,
) -> u64 {
    transaction
        .utxo_outputs()
        .iter()
        .filter_map(|output| {
            extract_pkh_from_script(&output.script_pubkey)
                .filter(|recipient_pkh| pkhs.contains(recipient_pkh))
                .map(|_| output.amount)
        })
        .fold(0u64, u64::saturating_add)
}

fn store_incoming_mempool_tx(
    db: &Arc<WalletDatabase>,
    wallet_id: &str,
    tx_hash: [u8; 32],
    transaction: &xtal::transaction::Transaction,
    amount: u64,
    timestamp: u64,
    services: &Arc<Services>,
) {
    let queries = WalletQueries::new(db.connection());
    if queries.get_transaction(&tx_hash).ok().flatten().is_some() {
        return;
    }

    let blockchain = services.blockchain();
    let input_details = transaction
        .utxo_inputs()
        .and_then(|inputs| {
            let mut details = Vec::new();
            for inp in inputs {
                let (amount, address) =
                    if let Ok(Some(utxo)) = blockchain.get_utxo(&inp.tx_id, inp.output_index) {
                        let addr = format_script_address(&utxo.script_pubkey);
                        (Some(utxo.amount), addr)
                    } else {
                        (None, None)
                    };
                details.push(InputDetail {
                    txid: hex::encode(inp.tx_id),
                    index: inp.output_index,
                    amount: amount.unwrap_or(0),
                    address,
                });
            }
            if details.is_empty() {
                None
            } else {
                Some(details)
            }
        })
        .and_then(|d| InputDetail::serialize_list(&d));

    let record = TransactionRecord {
        txid: tx_hash,
        raw_tx: transaction.encode(),
        tx_type: TransactionType::Receive,
        amount,
        fee: None,
        to_address: None,
        memo: None,
        created_at: timestamp as i64,
        confirmation: None,
        expires_at: None,
        priority: None,
        input_details,
        execution_status: None,
    };
    if let Err(e) = queries.insert_transaction(wallet_id, &record) {
        warn!("Failed to store incoming mempool tx in wallet DB: {}", e);
    }
}

/// Handle a removed transaction - clean up pending if it was our outgoing tx
fn handle_transaction_removed(
    tx_hash: &[u8; 32],
    reason: &RemovalReason,
    services: &Arc<Services>,
) {
    // Check if wallet is loaded
    let Some(ref wallet) = services.wallet else {
        return;
    };

    if !wallet.is_loaded() {
        return;
    }

    // Get wallet database
    let Some(db) = wallet.database() else {
        return;
    };

    cleanup_removed_tx(&db, tx_hash, reason);
}

/// Clean up a pending transaction that was removed from mempool without confirmation
fn cleanup_removed_tx(db: &WalletDatabase, tx_hash: &[u8; 32], reason: &RemovalReason) {
    if matches!(
        reason,
        RemovalReason::Confirmed | RemovalReason::IncludedInFruit
    ) {
        return;
    }

    let queries = WalletQueries::new(db.connection());

    // Check if this was our tracked transaction
    let tx = match queries.get_transaction(tx_hash) {
        Ok(Some(t)) => t,
        Ok(None) => return, // Not our transaction
        Err(e) => {
            debug!("Failed to check tx {}: {}", hex::encode(tx_hash), e);
            return;
        }
    };

    // Only clean up if it's pending
    if !tx.is_pending() {
        return;
    }

    // Get the wallet_id for this transaction
    let wallet_id = match queries.get_wallet_id_for_transaction(tx_hash) {
        Ok(Some(wid)) => wid,
        _ => {
            error!("No wallet_id found for removed tx {}", hex::encode(tx_hash));
            return;
        }
    };

    // Remove from database
    if let Err(e) = queries.remove_transaction(tx_hash) {
        error!(
            "Failed to remove rejected pending tx {}: {}",
            hex::encode(tx_hash),
            e
        );
        return;
    }

    // Subtract from pending outgoing total only for outgoing transactions
    if tx.is_outgoing() {
        if let Err(e) = queries
            .subtract_pending_outgoing(&wallet_id, tx.amount.saturating_add(tx.fee.unwrap_or(0)))
        {
            error!("Failed to update pending outgoing: {}", e);
        }
    }

    warn!(
        "Pending tx {} removed from mempool: {:?}",
        hex::encode(&tx_hash[..8]),
        reason
    );
}

/// Build a HashSet of wallet public key hashes for output matching
pub(crate) fn get_wallet_pkh_set(
    wallet: &xtal::wallet::WalletManager,
) -> Result<HashSet<[u8; 20]>, String> {
    let mut pkhs = HashSet::new();

    if let (Some(db), Some(wallet_id)) = (wallet.database(), wallet.current_wallet_id()) {
        let queries = WalletQueries::new(db.connection());
        let mut wallet_type = None;
        if let Ok(Some(record)) = queries.get_wallet(&wallet_id) {
            wallet_type = Some(record.wallet_type);
            if record.wallet_type == WalletType::Validator {
                if let Some(address) = record.validator_address() {
                    if let Ok(pkh) = parse_address_input(&address) {
                        pkhs.insert(pkh);
                    }
                }
            }
        }

        if let Ok(all_keys) = queries.get_public_keys(&wallet_id, None) {
            for key in all_keys {
                if let Some(wallet_type) = wallet_type {
                    if !key_type_belongs_to_wallet_scope(wallet_type, key.key_type) {
                        continue;
                    }
                }

                let Ok(pk_bytes) = hex::decode(&key.public_key_hex) else {
                    continue;
                };
                if pk_bytes.len() != 32 {
                    continue;
                }

                let Ok(pk_array) = <[u8; 32]>::try_from(pk_bytes.as_slice()) else {
                    continue;
                };
                let Ok(vk) = ed25519_dalek::VerifyingKey::from_bytes(&pk_array) else {
                    continue;
                };

                pkhs.insert(hash_public_key(&vk));
            }
        }
    }

    if !pkhs.is_empty() {
        return Ok(pkhs);
    }

    // Get mining addresses (tuple: index, address, verifying_key)
    if let Ok(mining_keys) = wallet.with_wallet(|w| w.get_all_mining_keys_with_gap(true)) {
        for (_, _, vk) in mining_keys {
            pkhs.insert(hash_public_key(&vk));
        }
    }

    // Get receiving addresses (tuple: index, pk_hex, address, verifying_key)
    if let Ok(receiving) = wallet.with_wallet(|w| w.get_all_receiving_addresses_with_gap(true)) {
        for (_, _, _, vk) in receiving {
            pkhs.insert(hash_public_key(&vk));
        }
    }

    // Get change addresses (tuple: index, pk_hex, address, verifying_key)
    if let Ok(change) = wallet.with_wallet(|w| w.get_all_change_addresses_with_gap(true)) {
        for (_, _, _, vk) in change {
            pkhs.insert(hash_public_key(&vk));
        }
    }

    if let Ok(vm_accounts) = wallet.with_wallet(|w| w.get_all_vm_account_addresses()) {
        for (_, _, _, vk) in vm_accounts {
            pkhs.insert(hash_public_key(&vk));
        }
    }

    Ok(pkhs)
}

fn key_type_belongs_to_wallet_scope(wallet_type: WalletType, key_type: KeyType) -> bool {
    wallet_type == WalletType::Validator || key_type != KeyType::Staking
}
