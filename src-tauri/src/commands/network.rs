//! Network information commands
//!
//! Commands for peer management and network status.

use serde::Serialize;
use tauri::State;

use crate::state::AppState;

/// Network status information
#[derive(Debug, Clone, Serialize)]
pub struct NetworkStatus {
    pub peer_count: usize,
    pub is_connected: bool,
    pub network_type: String,
}

/// Peer information
#[derive(Debug, Clone, Serialize)]
pub struct PeerInfo {
    pub peer_id: String,
    pub addresses: Vec<String>,
    pub direction: String,
    pub state: String,
}

/// Get network status
#[tauri::command]
pub async fn get_network_status(state: State<'_, AppState>) -> Result<NetworkStatus, String> {
    let peer_manager = &state.services.peer_manager;

    Ok(NetworkStatus {
        peer_count: peer_manager.peer_count(),
        is_connected: peer_manager.peer_count() > 0,
        network_type: state.network.display_name().to_string(),
    })
}

/// Get list of connected peers
#[tauri::command]
pub async fn get_peers(state: State<'_, AppState>) -> Result<Vec<PeerInfo>, String> {
    let peer_manager = &state.services.peer_manager;
    let peers = peer_manager.get_all_peers();

    Ok(peers
        .into_iter()
        .map(|(_peer_id, stats)| PeerInfo {
            peer_id: stats.peer_id.clone(),
            addresses: stats.addresses.clone(),
            direction: stats.direction.clone(),
            state: stats.state.clone(),
        })
        .collect())
}

/// Get peer count
#[tauri::command]
pub async fn get_peer_count(state: State<'_, AppState>) -> Result<usize, String> {
    Ok(state.services.peer_manager.peer_count())
}

/// Get API port for WebSocket connection
#[tauri::command]
pub async fn get_api_port(state: State<'_, AppState>) -> Result<u16, String> {
    Ok(state.api_port)
}

/// Node information for settings display
#[derive(Debug, Clone, Serialize)]
pub struct NodeInfo {
    /// Network name (Mainnet, Testnet, Regtest)
    pub network: String,
    /// Application version
    pub version: String,
    /// Data directory path
    pub data_dir: String,
}

/// Get node information for settings page
#[tauri::command]
pub async fn get_node_info(state: State<'_, AppState>) -> Result<NodeInfo, String> {
    Ok(NodeInfo {
        network: state.network.display_name().to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        data_dir: state.data_dir.to_string_lossy().to_string(),
    })
}

/// Log path information
#[derive(Debug, Clone, Serialize)]
pub struct LogPathInfo {
    pub log_dir: String,
    pub log_file: String,
}

/// Get the log file path for debugging/support
#[tauri::command]
pub async fn get_log_path(state: State<'_, AppState>) -> Result<LogPathInfo, String> {
    let log_dir = xtal::logging::default_log_dir(state.network);
    let log_file = xtal::logging::default_log_path(state.network);

    Ok(LogPathInfo {
        log_dir: log_dir.to_string_lossy().to_string(),
        log_file: log_file.to_string_lossy().to_string(),
    })
}
