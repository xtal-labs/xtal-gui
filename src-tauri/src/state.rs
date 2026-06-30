//! Application state for Tauri GUI
//!
//! This module provides state types for different app modes:
//! - `SetupState`: Minimal state during setup wizard (no node running)
//! - `AppState`: Full state during normal operation (node running)
//! - `SharedStartupStatus`: Mutable startup status with progress tracking

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};

use serde::Serialize;
use tokio::sync::{broadcast, watch};

use xtal::blockchain::{BootstrapPhase, BootstrapProgress};
use xtal::node::services::Services;
use xtal::node::sync::SyncState;
use xtal::utils::NetworkType;
use xtal::wallet::sync::WalletSyncService;

use crate::abi_cache::AbiCache;
use crate::ipfs::{IpfsClient, IpfsConfig};

// =============================================================================
// Setup State (no node running)
// =============================================================================

/// Minimal state during setup wizard when node hasn't started yet
pub struct SetupState {
    /// Broadcast sender for shutdown signal
    pub shutdown_tx: broadcast::Sender<()>,
}

impl SetupState {
    /// Create a new SetupState
    pub fn new() -> Self {
        let (shutdown_tx, _) = broadcast::channel(1);
        Self { shutdown_tx }
    }

    /// Get a clone of the shutdown sender
    pub fn shutdown_sender(&self) -> broadcast::Sender<()> {
        self.shutdown_tx.clone()
    }
}

impl Default for SetupState {
    fn default() -> Self {
        Self::new()
    }
}

// =============================================================================
// App State (node running)
// =============================================================================

/// Full application state when node is running
pub struct AppState {
    /// Services container providing access to all node components
    pub services: Arc<Services>,

    /// Watch channel receiver for sync state updates
    pub sync_state_rx: watch::Receiver<SyncState>,

    /// API port for WebSocket connections
    pub api_port: u16,

    /// Network type (mainnet, testnet, regtest)
    pub network: NetworkType,

    /// Data directory path
    pub data_dir: PathBuf,

    /// Wallet sync services keyed by wallet id.
    pub wallet_sync: Mutex<HashMap<String, Arc<WalletSyncService>>>,

    /// Local ABI cache for contract discovery
    pub abi_cache: Mutex<AbiCache>,

    /// IPFS client for ABI distribution (None if disabled or init failed)
    pub ipfs_client: Option<IpfsClient>,
}

impl AppState {
    /// Create a new AppState with the given services
    pub fn new(
        services: Arc<Services>,
        sync_state_rx: watch::Receiver<SyncState>,
        api_port: u16,
        network: NetworkType,
        data_dir: PathBuf,
        ipfs_config: IpfsConfig,
    ) -> Self {
        let mut abi_cache = AbiCache::open(&data_dir).unwrap_or_else(|e| {
            log::warn!("Failed to open ABI cache: {}", e);
            AbiCache::open(&std::env::temp_dir()).unwrap_or_else(|e2| {
                // Last resort: run with an in-memory cache rather than panicking
                // during AppState construction (which would hang startup at 99%).
                log::error!(
                    "Failed to open ABI cache in temp dir: {} — using ephemeral cache",
                    e2
                );
                AbiCache::ephemeral()
            })
        });

        if let Err(e) = abi_cache.seed_builtins() {
            log::warn!("Failed to seed builtin ABIs: {}", e);
        }

        let ipfs_client = if ipfs_config.enabled {
            match IpfsClient::new(ipfs_config) {
                Ok(client) => {
                    log::info!("IPFS client initialized");
                    Some(client)
                }
                Err(e) => {
                    log::warn!("Failed to initialize IPFS client: {}", e);
                    None
                }
            }
        } else {
            log::info!("IPFS disabled in configuration");
            None
        };

        Self {
            services,
            sync_state_rx,
            api_port,
            network,
            data_dir,
            wallet_sync: Mutex::new(HashMap::new()),
            abi_cache: Mutex::new(abi_cache),
            ipfs_client,
        }
    }

    /// Get the current sync state
    pub fn sync_state(&self) -> SyncState {
        self.sync_state_rx.borrow().clone()
    }
}

// =============================================================================
// Startup Status (shared across modes)
// =============================================================================

/// Information about a node startup failure
#[derive(Debug, Clone, Serialize)]
pub struct StartupErrorInfo {
    /// The error message from the failed component
    pub message: String,
    /// Error category for UI display ("directory", "database", "port", "timeout", "build", "unknown")
    pub category: String,
    /// Path to the log file
    pub log_path: String,
    /// Data directory path
    pub data_dir: String,
    /// Network name
    pub network: String,
}

/// Phase of startup
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum StartupPhase {
    Loading,
    Ready,
    Failed,
}

/// Current startup stage for the loading UI.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum StartupStage {
    OpeningDatabase,
    Bootstrap,
    TxIndex,
    InitializingNetwork,
    StartingServices,
    Ready,
    Failed,
}

/// Inner mutable state for startup progress tracking
#[derive(Debug, Clone, Serialize)]
pub struct StartupStatusInner {
    /// Whether the node started successfully (legacy compat)
    pub ok: bool,
    /// Current startup phase
    pub phase: StartupPhase,
    /// Current startup stage
    pub startup_stage: StartupStage,
    /// Human-readable loading message
    pub loading_message: String,
    /// Progress percentage (0-100)
    pub progress_percent: u8,
    /// Current typed bootstrap phase, if startup is in the bootstrap stage
    pub bootstrap_phase: Option<BootstrapPhase>,
    /// Raw bootstrap percent from the backend, if startup is in the bootstrap stage
    pub bootstrap_percent: Option<u8>,
    /// Error details if startup failed
    pub error: Option<StartupErrorInfo>,
}

/// Thread-safe shared startup status — managed state in Tauri
pub struct SharedStartupStatus(pub Arc<RwLock<StartupStatusInner>>);

impl SharedStartupStatus {
    /// Create a new loading status at 0%
    pub fn loading() -> Self {
        Self(Arc::new(RwLock::new(StartupStatusInner {
            ok: false,
            phase: StartupPhase::Loading,
            startup_stage: StartupStage::OpeningDatabase,
            loading_message: "Starting node...".to_string(),
            progress_percent: 0,
            bootstrap_phase: None,
            bootstrap_percent: None,
            error: None,
        })))
    }

    fn map_bootstrap_percent(percent: u8) -> u8 {
        const START: u16 = 5;
        const END: u16 = 88;
        let span = END - START;
        (START + (u16::from(percent) * span / 100)) as u8
    }

    /// Update a non-bootstrap startup stage and its overall progress.
    pub fn set_progress(&self, stage: StartupStage, message: &str, percent: u8) {
        if let Ok(mut inner) = self.0.write() {
            inner.startup_stage = stage;
            inner.loading_message = message.to_string();
            inner.progress_percent = percent;
            inner.bootstrap_phase = None;
            inner.bootstrap_percent = None;
        }
    }

    /// Update the current typed bootstrap state.
    pub fn set_bootstrap_progress(&self, progress: &BootstrapProgress) {
        if let Ok(mut inner) = self.0.write() {
            inner.startup_stage = StartupStage::Bootstrap;
            inner.loading_message = progress.message.clone();
            inner.progress_percent = Self::map_bootstrap_percent(progress.percent);
            inner.bootstrap_phase = Some(progress.phase);
            inner.bootstrap_percent = Some(progress.percent);
        }
    }

    /// Transition to ready state
    pub fn set_ready(&self) {
        if let Ok(mut inner) = self.0.write() {
            inner.ok = true;
            inner.phase = StartupPhase::Ready;
            inner.startup_stage = StartupStage::Ready;
            inner.loading_message = "Ready".to_string();
            inner.progress_percent = 100;
            inner.bootstrap_phase = None;
            inner.bootstrap_percent = None;
        }
    }

    /// Transition to failed state
    pub fn set_failed(&self, error: StartupErrorInfo) {
        if let Ok(mut inner) = self.0.write() {
            inner.ok = false;
            inner.phase = StartupPhase::Failed;
            inner.startup_stage = StartupStage::Failed;
            inner.loading_message = "Failed".to_string();
            inner.bootstrap_phase = None;
            inner.bootstrap_percent = None;
            inner.error = Some(error);
        }
    }

    /// Read a snapshot of the current status.
    ///
    /// Recovers the inner data even if a writer ever panicked and poisoned the
    /// lock, matching the defensive `if let Ok` style used by the writers above —
    /// status reads drive the loading UI and must never themselves panic.
    pub fn snapshot(&self) -> StartupStatusInner {
        match self.0.read() {
            Ok(guard) => guard.clone(),
            Err(poisoned) => poisoned.into_inner().clone(),
        }
    }
}

/// Stores the node thread handle for cleanup on shutdown
pub struct NodeHandleStore(pub Mutex<Option<std::thread::JoinHandle<()>>>);
