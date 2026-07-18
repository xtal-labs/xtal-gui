//! Event broadcasting from backend to frontend
//!
//! This module handles wallet-specific GUI events via Tauri.
//! Node-level events (blocks, mining, sync, peers) are handled via WebSocket.

use xtal::shards::Shards;

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

use xtal::address_format::parse_address_input;
use xtal::blockchain::events::BlockchainEvent;
use xtal::crypto::hash_public_key;
use xtal::node::services::Services;
use xtal::script::extract_pkh_from_script;
use xtal::wallet::database::models::{KeyType, WalletType};
use xtal::wallet::database::queries::WalletQueries;
use xtal::wallet::sync::WalletSyncEvent;

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
        amount: Shards,
        timestamp: u64,
    },

    /// Outgoing transaction submitted to mempool (triggers wallet refresh)
    OutgoingTransaction {
        txid: String,
        amount: Shards,
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
    // Subscribe to blockchain events (for chain reorg notifications)
    let blockchain = services.blockchain();
    let mut blockchain_event_rx = blockchain.subscribe_events();

    // Subscribe to wallet record changes. The sync loops own detection and
    // persistence; this stream is purely what to tell the user about. The bus
    // lives on the wallet manager now — the node no longer carries wallet
    // events — so a node without a wallet service has no stream to offer.
    let mut wallet_event_rx = services
        .wallet_manager()
        .map(|manager| manager.subscribe_sync_events());

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
                handle_blockchain_event(&app, blockchain_event);
            }

            // Wallet record changes (incoming/outgoing notifications)
            Some(wallet_event) = async {
                if let Some(ref mut rx) = wallet_event_rx {
                    rx.recv().await.ok()
                } else {
                    std::future::pending::<Option<WalletSyncEvent>>().await
                }
            } => {
                handle_wallet_sync_event(&app, wallet_event);
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

/// Handle blockchain events for user-facing notifications.
///
/// - ChainReorg: Notify user of chain reorganization
/// - BlockAdded: Handled via WebSocket, not here
///
/// Marking transactions confirmed is not done here. The sync services do it from the
/// block that actually carried the transaction, so the record gets that block's real
/// height — this path only ever had a `FruitsConfirmed` event with no height in it, and
/// wrote a literal `0`, which downstream confirmation math read as "confirmed since
/// genesis".
fn handle_blockchain_event(app: &AppHandle, event: BlockchainEvent) {
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

/// Surface a wallet record change as a UI notification.
///
/// Ownership, attribution, and persistence all happened in the sync service before this
/// event was emitted — it knows which wallet the transaction belongs to and for how
/// much, from the same monitored set it indexes with. Recomputing any of that here is
/// how the two answers drift apart, so this only renders what it is told.
fn handle_wallet_sync_event(app: &AppHandle, event: WalletSyncEvent) {
    let WalletSyncEvent::TransactionRecorded {
        txid,
        tx_type,
        amount,
        confirmed,
        ..
    } = event
    else {
        // Evictions need no toast; the history view reflects the dropped row.
        return;
    };

    // Only unconfirmed arrivals are news — a confirmed record is the block path
    // catching up on something already reported, or backfill during initial sync.
    if confirmed {
        return;
    }

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let (gui_event, label) = if tx_type.is_outgoing() {
        (
            GuiEvent::OutgoingTransaction {
                txid: hex::encode(txid),
                amount: amount.into(),
                timestamp,
            },
            "OutgoingTransaction",
        )
    } else {
        (
            GuiEvent::IncomingTransaction {
                txid: hex::encode(txid),
                amount: amount.into(),
                timestamp,
            },
            "IncomingTransaction",
        )
    };

    debug!(
        "{} detected: {} shards in tx {}",
        label,
        amount,
        hex::encode(&txid[..8])
    );

    diag_log_event_rate(label);
    if let Err(e) = app.emit("gui-event", &gui_event) {
        error!("Failed to emit {} event: {}", label, e);
    }
}

/// Build a HashSet of wallet public key hashes for output matching
/// Total shards paid to any of `pkhs` by this transaction's UTXO outputs.
///
/// Display-side attribution for the mempool view only. Persistence and balance
/// accounting go through the wallet sync service, which resolves ownership against its
/// own monitored set and handles address forms this does not.
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
