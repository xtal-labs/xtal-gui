//! Startup status commands
//!
//! Commands for querying node startup status and recovery actions.
//! These are available in both normal and degraded modes.

use serde::Serialize;
use tauri::{AppHandle, State};

use xtal::fruit::FruitType;
use xtal::utils::NetworkType;

use crate::config::{
    load_node_config, node_config_path, set_active_network, set_node_storage_preferences,
    update_gui_config, GuiConfig,
};
use crate::state::{SharedStartupStatus, StartupStatusInner};

/// Get the node startup status
///
/// Returns the current startup phase, loading message, progress percent,
/// and error details if startup failed.
/// Available in all modes (setup, loading, normal, degraded).
#[tauri::command]
pub async fn get_startup_status(
    status: State<'_, SharedStartupStatus>,
) -> Result<StartupStatusInner, String> {
    Ok(status.snapshot())
}

/// Open a directory or file in the system file manager
#[tauri::command]
pub async fn open_directory(path: String) -> Result<(), String> {
    open::that(&path).map_err(|e| format!("Failed to open path: {}", e))
}

/// Get the config file path
#[tauri::command]
pub async fn get_config_path() -> Result<String, String> {
    Ok(node_config_path()
        .map_err(|e| format!("Failed to resolve node config path: {}", e))?
        .display()
        .to_string())
}

/// Persisted GUI preferences exposed to the frontend.
#[derive(Debug, Clone, Serialize)]
pub struct GuiConfigInfo {
    pub toasts_enabled: bool,
}

/// Get the persisted GUI configuration for frontend-owned settings.
#[tauri::command]
pub async fn get_gui_config() -> Result<GuiConfigInfo, String> {
    let config =
        GuiConfig::load_or_create().map_err(|e| format!("Failed to load GUI config: {}", e))?;

    Ok(GuiConfigInfo {
        toasts_enabled: config.toasts_enabled,
    })
}

/// Persist whether in-app toast notifications are enabled.
#[tauri::command]
pub async fn set_gui_toasts_enabled(enabled: bool) -> Result<(), String> {
    update_gui_config(|config| config.toasts_enabled = enabled)
        .map_err(|e| format!("Failed to save GUI config: {}", e))?;
    Ok(())
}

/// Persisted node configuration exposed to the Settings page.
#[derive(Debug, Clone, Serialize)]
pub struct NodeConfigInfo {
    pub archival: bool,
    pub tx_index: bool,
    pub sync_mode: String,
    pub stem_retention_epochs: u32,
    pub subscribed_fruits: Vec<String>,
}

/// Get the persisted node configuration for Settings.
#[tauri::command]
pub async fn get_node_config() -> Result<NodeConfigInfo, String> {
    let config = load_node_config().map_err(|e| format!("Failed to load config: {}", e))?;

    // An empty `subscribed_fruits` is the sentinel for a full node subscribed to
    // every shard (see NodeConfig docs / node builder). Expand it to the full
    // fruit list so the Settings panel reads "9/9" instead of "0/9".
    let subscribed_fruits = if config.subscribed_fruits.is_empty() {
        FruitType::all().map(|f| f.to_string()).collect()
    } else {
        config.subscribed_fruits
    };

    Ok(NodeConfigInfo {
        archival: config.storage.archival,
        tx_index: config.storage.enable_tx_index,
        sync_mode: config.sync_mode.to_string(),
        stem_retention_epochs: config.pruning.stem_epochs_to_keep,
        subscribed_fruits,
    })
}

/// Update only the storage-related node flags used by Settings.
#[tauri::command]
pub async fn set_node_storage_flags(archival: bool, tx_index: bool) -> Result<(), String> {
    let config = set_node_storage_preferences(archival, tx_index)
        .map_err(|e| format!("Failed to save config: {}", e))?;

    log::info!(
        "Updated node storage flags in config (restart required): archival={}, tx_index={}",
        config.storage.archival,
        config.storage.enable_tx_index,
    );

    Ok(())
}

/// Switch the active network (saves the pointer to disk, does not restart).
///
/// This only repoints the app at `network`; it does not touch any per-network
/// node config. After the caller restarts, `main.rs` boots normal mode if that
/// network's config already exists, or the setup wizard (pre-selected to it)
/// if it has never been set up.
#[tauri::command]
pub async fn switch_network(network: String) -> Result<(), String> {
    let network_type = match network.to_lowercase().as_str() {
        "mainnet" => NetworkType::Mainnet,
        "testnet" => NetworkType::Testnet,
        "regtest" => NetworkType::Regtest,
        other => return Err(format!("Unknown network: {}", other)),
    };

    set_active_network(network_type)
        .map_err(|e| format!("Failed to save active network: {}", e))?;

    log::info!(
        "Active network set to {:?} (restart required)",
        network_type
    );
    Ok(())
}

/// Restart the application
///
/// Uses Tauri's built-in restart mechanism (same as setup completion).
#[tauri::command]
pub async fn restart_app(app: AppHandle) -> Result<(), String> {
    log::info!("Restart requested from startup error screen");
    app.restart();
}
