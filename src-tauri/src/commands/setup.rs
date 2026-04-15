//! Setup wizard commands
//!
//! Commands for first-time setup: network selection, wallet creation, etc.
//! These commands work in setup mode when the node is not yet running.

use serde::Serialize;
use std::str::FromStr;
use tauri::AppHandle;

use xtal::config::{Config as NodeConfig, SyncMode};
use xtal::utils::{CrystalDirs, DirectoryConfig, NetworkType};
use xtal::wallet::database::models::WalletType;
use xtal::wallet::WalletManager;

use crate::commands::wallet::{
    create_wallet_impl, wallet_from_mnemonic_impl, WalletCreationResult,
};
use crate::config::{node_config_exists, save_node_config, set_node_sync_preferences, GuiConfig};

/// Network information for selection
#[derive(Debug, Clone, Serialize)]
pub struct NetworkInfo {
    pub id: String,
    pub name: String,
    pub description: String,
}

/// Result of node initialization
#[derive(Debug, Clone, Serialize)]
pub struct InitResult {
    pub network: String,
    pub data_dir: String,
}

/// Check if this is a first run (needs setup)
///
/// This command works without any state - it just checks if config exists
#[tauri::command]
pub async fn check_first_run() -> Result<bool, String> {
    Ok(!node_config_exists())
}

/// Get available networks for selection
#[tauri::command]
pub async fn get_available_networks() -> Result<Vec<NetworkInfo>, String> {
    Ok(vec![
        NetworkInfo {
            id: "mainnet".to_string(),
            name: "Mainnet".to_string(),
            description: "Crystal main network for real transactions".to_string(),
        },
        NetworkInfo {
            id: "testnet".to_string(),
            name: "Testnet".to_string(),
            description: "Test network for development and testing".to_string(),
        },
        NetworkInfo {
            id: "regtest".to_string(),
            name: "Regtest".to_string(),
            description: "Local regression testing network".to_string(),
        },
    ])
}

/// Initialize the node with selected network
///
/// This creates the directory structure and saves the node configuration.
/// Does NOT start the node - that happens after setup completes.
#[tauri::command]
pub async fn initialize_node(network: String) -> Result<InitResult, String> {
    log::info!("Initializing node for network: {}", network);

    // Parse network type
    let network_type = NetworkType::from_str(&network).map_err(|_| {
        format!(
            "Invalid network '{}'. Must be 'mainnet', 'testnet', or 'regtest'",
            network
        )
    })?;

    // Create directory configuration
    let dir_config = DirectoryConfig::platform_default(network_type)
        .map_err(|e| format!("Failed to create directory config: {}", e))?;

    // Create all required directories
    let dirs = CrystalDirs::from_config(&dir_config)
        .map_err(|e| format!("Failed to create directories: {}", e))?;

    log::info!("Created directories at: {:?}", dirs.data_dir);

    let config = NodeConfig::for_network(network_type);
    save_node_config(&config).map_err(|e| format!("Failed to save node configuration: {}", e))?;

    GuiConfig::load_or_create()
        .map_err(|e| format!("Failed to prepare GUI configuration: {}", e))?;

    log::info!("Node configuration saved");

    Ok(InitResult {
        network: network_type.display_name().to_string(),
        data_dir: dirs.data_dir.to_string_lossy().to_string(),
    })
}

/// Create a new wallet during setup
///
/// This works without the node running by creating a WalletManager on-the-fly.
#[tauri::command]
pub async fn create_setup_wallet(
    network: String,
    wallet_name: String,
    password: String,
) -> Result<WalletCreationResult, String> {
    log::info!(
        "Creating wallet '{}' for network '{}'",
        wallet_name,
        network
    );

    // Parse network type
    let network_type = NetworkType::from_str(&network).map_err(|_| {
        format!(
            "Invalid network '{}'. Must be 'mainnet', 'testnet', or 'regtest'",
            network
        )
    })?;

    // Create WalletManager for this network
    let wallet_manager = WalletManager::new(network_type)
        .map_err(|e| format!("Failed to create wallet manager: {}", e))?;

    // Use the shared helper from wallet.rs
    create_wallet_impl(&wallet_manager, &wallet_name, &password)
}

/// Import wallet from mnemonic during setup
///
/// Creates a wallet from a 12-word recovery phrase. The wallet is encrypted
/// with an empty password initially — the user is prompted to add a password
/// in the next wizard step via `change_wallet_password`.
#[tauri::command]
pub async fn import_setup_wallet(
    network: String,
    wallet_name: String,
    mnemonic: String,
) -> Result<WalletCreationResult, String> {
    log::info!(
        "Importing wallet '{}' from mnemonic for network '{}'",
        wallet_name,
        network
    );

    let network_type = NetworkType::from_str(&network).map_err(|_| {
        format!(
            "Invalid network '{}'. Must be 'mainnet', 'testnet', or 'regtest'",
            network
        )
    })?;

    let wallet_manager = WalletManager::new(network_type)
        .map_err(|e| format!("Failed to create wallet manager: {}", e))?;

    wallet_from_mnemonic_impl(
        &wallet_manager,
        &wallet_name,
        "",
        &mnemonic,
        WalletType::Normal,
    )
}

/// Change the password of an existing wallet
///
/// General-purpose command that works in both setup and normal modes.
/// During setup import flow, this is used to upgrade from the initial
/// empty password to a real password.
#[tauri::command]
pub async fn change_wallet_password(
    network: String,
    wallet_name: String,
    old_password: String,
    new_password: String,
) -> Result<(), String> {
    log::info!("Changing password for wallet '{}'", wallet_name);

    let network_type = NetworkType::from_str(&network).map_err(|_| {
        format!(
            "Invalid network '{}'. Must be 'mainnet', 'testnet', or 'regtest'",
            network
        )
    })?;

    let wallet_manager = WalletManager::new(network_type)
        .map_err(|e| format!("Failed to create wallet manager: {}", e))?;

    wallet_manager
        .change_wallet_password(&wallet_name, &old_password, &new_password)
        .map_err(|e| format!("Failed to change wallet password: {}", e))
}

/// Complete setup and restart the application
///
/// This triggers a full app restart so the node can start with the new configuration.
/// Note: This function never returns because app.restart() terminates the process.
#[tauri::command]
pub async fn complete_setup(app: AppHandle) -> Result<(), String> {
    log::info!("Setup complete - restarting application");

    // Verify config was saved
    if !node_config_exists() {
        return Err("Configuration not saved. Please run initialize_node first.".to_string());
    }

    // Restart the application (this terminates the current process)
    app.restart();
}

/// Set node configuration (fruit shards, archival mode, transaction index, and sync mode)
///
/// Called from the node type wizard step after network initialization.
/// Updates the existing node config with the user's preferences.
#[tauri::command]
pub async fn set_node_config(
    fruits: Vec<String>,
    archival: bool,
    tx_index: bool,
    sync_mode: String,
) -> Result<(), String> {
    log::info!(
        "Setting node config: {} fruits, archival={}, tx_index={}, sync_mode={}",
        fruits.len(),
        archival,
        tx_index,
        sync_mode,
    );

    let parsed_sync_mode = sync_mode
        .parse::<SyncMode>()
        .map_err(|_| format!("Invalid sync mode '{}'", sync_mode))?;

    set_node_sync_preferences(fruits, archival, tx_index, parsed_sync_mode)
        .map_err(|e| format!("Failed to save node configuration: {}", e))?;

    Ok(())
}

/// Confirm backup has been written down
#[tauri::command]
pub async fn confirm_backup(confirmed: bool) -> Result<(), String> {
    if !confirmed {
        return Err("Backup must be confirmed before proceeding".to_string());
    }
    log::info!("Backup confirmed by user");
    Ok(())
}
