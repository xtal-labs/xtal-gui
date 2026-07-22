//! Mining control commands
//!
//! Commands for starting, stopping, and monitoring mining.

use serde::Serialize;
use tauri::State;
use xtal::address_format::format_utxo_address;
use xtal::MiningStatsDisplay;

use crate::platform;
use crate::state::AppState;

const MINING_WALLET_REQUIRED: &str = "Select or load a wallet before starting mining";

fn require_loaded_mining_wallet(
    is_loaded: bool,
    wallet_id: Option<&str>,
) -> Result<(), &'static str> {
    if is_loaded && wallet_id.is_some() {
        Ok(())
    } else {
        Err(MINING_WALLET_REQUIRED)
    }
}

/// Mining status response
#[derive(Debug, Clone, Serialize)]
pub struct MiningStatus {
    pub is_active: bool,
    pub threads: usize,
    pub max_threads: usize,
    pub wallet_name: Option<String>,
    pub mining_address: Option<String>,
}

/// Start mining with specified thread count
#[tauri::command]
pub async fn start_mining(state: State<'_, AppState>, threads: usize) -> Result<(), String> {
    let wallet = state
        .services
        .wallet
        .as_ref()
        .ok_or(MINING_WALLET_REQUIRED)?;
    let wallet_id = wallet.current_wallet_id();
    require_loaded_mining_wallet(wallet.is_loaded(), wallet_id.as_deref())?;

    let mining = state
        .services
        .mining
        .as_ref()
        .ok_or("Mining service not available")?;

    mining
        .start(threads, false, None, None)
        .await
        .map_err(|e| format!("Failed to start mining: {}", e))?;

    // Prevent macOS App Nap from throttling mining threads
    platform::begin_mining_activity();

    Ok(())
}

/// Stop mining
#[tauri::command]
pub async fn stop_mining(state: State<'_, AppState>) -> Result<(), String> {
    let mining = state
        .services
        .mining
        .as_ref()
        .ok_or("Mining service not available")?;

    mining
        .stop()
        .await
        .map_err(|e| format!("Failed to stop mining: {}", e))?;

    // Release macOS App Nap prevention
    platform::end_mining_activity();

    Ok(())
}

/// Get current mining status
#[tauri::command]
pub async fn get_mining_status(state: State<'_, AppState>) -> Result<MiningStatus, String> {
    // Get wallet info if available
    let wallet_name = if let Some(wallet) = &state.services.wallet {
        if wallet.is_loaded() {
            wallet.get_wallet_path().and_then(|p| {
                std::path::Path::new(&p)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .map(String::from)
            })
        } else {
            None
        }
    } else {
        None
    };

    let max_threads = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);

    match &state.services.mining {
        Some(mining) => {
            let is_active = mining.is_running();

            // When mining is running, use the snapshotted wallet (locked at
            // start; coinbases keep paying it even if the loaded wallet is
            // switched). When not running, use the currently loaded wallet.
            let effective_wallet_name = if is_active {
                mining.mining_wallet_name().await.or(wallet_name)
            } else {
                wallet_name
            };
            let reward_wallet_id = if is_active {
                mining.mining_wallet_id().await
            } else {
                state
                    .services
                    .wallet
                    .as_ref()
                    .and_then(|wallet| wallet.current_wallet_id())
            };
            let mining_address = match (&state.services.wallet, reward_wallet_id) {
                (Some(wallet), Some(wallet_id)) => wallet
                    .get_mining_pkh_for_wallet(&wallet_id)
                    .ok()
                    .map(|pkh| format_utxo_address(&pkh)),
                _ => None,
            };

            Ok(MiningStatus {
                is_active,
                threads: mining.thread_count(),
                max_threads,
                wallet_name: effective_wallet_name,
                mining_address,
            })
        }
        None => Ok(MiningStatus {
            is_active: false,
            threads: 0,
            max_threads,
            wallet_name,
            mining_address: None,
        }),
    }
}

/// Get mining statistics (lock-free, can be called frequently)
#[tauri::command]
pub async fn get_mining_stats(
    state: State<'_, AppState>,
) -> Result<Option<MiningStatsDisplay>, String> {
    match &state.services.mining {
        Some(mining) => {
            if mining.is_running() {
                Ok(Some(mining.get_mining_stats().get_stats()))
            } else {
                Ok(None)
            }
        }
        None => Ok(None),
    }
}

/// Set mining thread count (requires restart)
#[tauri::command]
pub async fn set_mining_threads(state: State<'_, AppState>, threads: usize) -> Result<(), String> {
    let mining = state
        .services
        .mining
        .as_ref()
        .ok_or("Mining service not available")?;

    // Stop and restart with new thread count
    if mining.is_running() {
        mining.stop().await.map_err(|e| e.to_string())?;
        mining
            .start(threads, false, None, None)
            .await
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::require_loaded_mining_wallet;

    #[test]
    fn mining_start_requires_a_loaded_wallet() {
        assert!(require_loaded_mining_wallet(false, None).is_err());
        assert!(require_loaded_mining_wallet(false, Some("wallet-id")).is_err());
        assert!(require_loaded_mining_wallet(true, None).is_err());
        assert!(require_loaded_mining_wallet(true, Some("wallet-id")).is_ok());
    }
}
