//! GUI and node configuration helpers.
//!
//! `GuiConfig` stores GUI-owned state in `config.toml`.
//! The blockchain node itself reads and writes the core `config.json`.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::PathBuf;

use xtal::config::{Config as NodeConfig, SyncMode};
use xtal::utils::{DirectoryConfig, NetworkType};

use crate::ipfs::IpfsConfig;

/// GUI configuration persisted to disk.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GuiConfig {
    /// Whether in-app toast notifications are enabled.
    #[serde(default = "default_toasts_enabled")]
    pub toasts_enabled: bool,

    /// IPFS ABI distribution settings.
    #[serde(default)]
    pub ipfs: IpfsConfig,
}

fn default_toasts_enabled() -> bool {
    true
}

impl Default for GuiConfig {
    fn default() -> Self {
        Self {
            toasts_enabled: default_toasts_enabled(),
            ipfs: IpfsConfig::default(),
        }
    }
}

impl GuiConfig {
    /// Get the GUI config path: `~/.crystal/config.toml`.
    pub fn default_path() -> PathBuf {
        base_data_dir()
            .unwrap_or_else(|_| PathBuf::from(".").join(".crystal"))
            .join("config.toml")
    }

    /// Load GUI configuration from disk.
    pub fn load() -> Result<Self, ConfigError> {
        let path = Self::default_path();
        let contents = fs::read_to_string(&path).map_err(|e| ConfigError::Io {
            path: path.clone(),
            source: e,
        })?;

        toml::from_str(&contents).map_err(|e| ConfigError::Parse {
            path,
            message: e.to_string(),
        })
    }

    /// Load GUI configuration from disk, recreating defaults if the file is
    /// missing or invalid.
    pub fn load_or_create() -> Result<Self, ConfigError> {
        match Self::load() {
            Ok(config) => Ok(config),
            Err(err) if is_recoverable_gui_config_error(&err) => {
                let config = Self::default();
                config.save()?;
                Ok(config)
            }
            Err(err) => Err(err),
        }
    }

    /// Save GUI configuration to disk.
    pub fn save(&self) -> Result<(), ConfigError> {
        let path = Self::default_path();

        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| ConfigError::Io {
                path: parent.to_path_buf(),
                source: e,
            })?;
        }

        let contents = toml::to_string_pretty(self).map_err(|e| ConfigError::Serialize {
            message: e.to_string(),
        })?;

        fs::write(&path, contents).map_err(|e| ConfigError::Io { path, source: e })?;

        Ok(())
    }
}

fn is_recoverable_gui_config_error(err: &ConfigError) -> bool {
    matches!(
        err,
        ConfigError::Io { source, .. } if source.kind() == io::ErrorKind::NotFound
    ) || matches!(err, ConfigError::Parse { .. })
}

fn base_data_dir() -> Result<PathBuf, ConfigError> {
    DirectoryConfig::platform_default(NetworkType::Mainnet)
        .map(|config| config.base_path)
        .map_err(|e| ConfigError::Io {
            path: PathBuf::from("."),
            source: e,
        })
}

/// Get the persisted node config path: `~/.crystal/config/config.json`.
pub fn node_config_path() -> Result<PathBuf, ConfigError> {
    Ok(base_data_dir()?.join("config").join("config.json"))
}

/// Check whether the persisted node config exists.
pub fn node_config_exists() -> bool {
    node_config_path()
        .map(|path| path.exists())
        .unwrap_or(false)
}

/// Load the persisted node config from disk.
pub fn load_node_config() -> Result<NodeConfig, ConfigError> {
    let path = node_config_path()?;

    if !path.exists() {
        return Err(ConfigError::Io {
            path,
            source: io::Error::new(io::ErrorKind::NotFound, "Node config not found"),
        });
    }

    NodeConfig::load_for_network(&path.to_string_lossy(), NetworkType::Mainnet).map_err(|e| {
        ConfigError::NodeConfig {
            path,
            message: e.to_string(),
        }
    })
}

/// Save the persisted node config to disk.
pub fn save_node_config(config: &NodeConfig) -> Result<(), ConfigError> {
    let path = node_config_path()?;

    config
        .save(&path.to_string_lossy())
        .map_err(|e| ConfigError::NodeConfig {
            path,
            message: e.to_string(),
        })
}

/// Update the persisted GUI config in place and save it back to disk.
pub fn update_gui_config<F>(mutator: F) -> Result<GuiConfig, ConfigError>
where
    F: FnOnce(&mut GuiConfig),
{
    let mut config = GuiConfig::load_or_create()?;
    mutator(&mut config);
    config.save()?;
    Ok(config)
}

/// Update the persisted node config in place and save it back to disk.
pub fn update_node_config<F>(mutator: F) -> Result<NodeConfig, ConfigError>
where
    F: FnOnce(&mut NodeConfig),
{
    let mut config = load_node_config()?;
    mutator(&mut config);
    save_node_config(&config)?;
    Ok(config)
}

/// Apply storage-related node config settings with the shared invariants used
/// by both setup and settings flows.
pub fn apply_node_storage_preferences(config: &mut NodeConfig, archival: bool, tx_index: bool) {
    config.storage.enable_tx_index = tx_index;
    config.storage.archival = archival || config.sync_mode == SyncMode::Full;
}

/// Apply the initial sync/storage preferences chosen during setup.
pub fn apply_node_sync_preferences(
    config: &mut NodeConfig,
    fruits: Vec<String>,
    archival: bool,
    tx_index: bool,
    sync_mode: SyncMode,
) {
    config.subscribed_fruits = fruits;
    config.sync_mode = sync_mode;
    apply_node_storage_preferences(config, archival, tx_index);
}

/// Apply a network switch while preserving any user-customized ports.
pub fn apply_node_network_change(config: &mut NodeConfig, network_type: NetworkType) {
    let previous_network = config.network_type;

    if previous_network != network_type {
        let previous_defaults = NodeConfig::for_network(previous_network);
        let new_defaults = NodeConfig::for_network(network_type);

        if config.network.default_port == previous_defaults.network.default_port {
            config.network.default_port = new_defaults.network.default_port;
        }
        if config.api.api_port == previous_defaults.api.api_port {
            config.api.api_port = new_defaults.api.api_port;
        }
        if config.api.rpc_port == previous_defaults.api.rpc_port {
            config.api.rpc_port = new_defaults.api.rpc_port;
        }
    }

    config.network_type = network_type;
}

/// Persist setup-time node preferences.
pub fn set_node_sync_preferences(
    fruits: Vec<String>,
    archival: bool,
    tx_index: bool,
    sync_mode: SyncMode,
) -> Result<NodeConfig, ConfigError> {
    update_node_config(|config| {
        apply_node_sync_preferences(config, fruits, archival, tx_index, sync_mode)
    })
}

/// Persist storage-related node settings.
pub fn set_node_storage_preferences(
    archival: bool,
    tx_index: bool,
) -> Result<NodeConfig, ConfigError> {
    update_node_config(|config| apply_node_storage_preferences(config, archival, tx_index))
}

/// Persist a node network switch.
pub fn switch_node_network(network_type: NetworkType) -> Result<NodeConfig, ConfigError> {
    update_node_config(|config| apply_node_network_change(config, network_type))
}

/// Errors that can occur when loading or saving configuration.
#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("Failed to read/write config at {path}: {source}")]
    Io { path: PathBuf, source: io::Error },

    #[error("Failed to parse config at {path}: {message}")]
    Parse { path: PathBuf, message: String },

    #[error("Failed to save GUI config: {message}")]
    Serialize { message: String },

    #[error("Failed to load/save node config at {path}: {message}")]
    NodeConfig { path: PathBuf, message: String },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gui_config_round_trip() {
        let config = GuiConfig::default();
        let serialized = toml::to_string(&config).unwrap();
        let deserialized: GuiConfig = toml::from_str(&serialized).unwrap();
        assert_eq!(deserialized.toasts_enabled, config.toasts_enabled);
        assert_eq!(deserialized.ipfs.enabled, config.ipfs.enabled);
    }

    #[test]
    fn test_apply_node_storage_preferences_restores_default_retention() {
        let mut config = NodeConfig::for_network(NetworkType::Mainnet);
        config.pruning.stem_epochs_to_keep += 10;
        apply_node_storage_preferences(&mut config, false, true);

        assert!(config.storage.enable_tx_index);
        assert!(!config.storage.archival);
        assert!(config.pruning.enable_pruning);
        assert_eq!(config.pruning.stem_epochs_to_keep, 12);
    }

    #[test]
    fn test_apply_node_network_change_updates_default_ports_only() {
        let mut config = NodeConfig::for_network(NetworkType::Mainnet);
        let testnet_defaults = NodeConfig::for_network(NetworkType::Testnet);

        let custom_rpc_port = config.api.rpc_port + 10;
        config.api.rpc_port = custom_rpc_port;

        apply_node_network_change(&mut config, NetworkType::Testnet);

        assert_eq!(config.network_type, NetworkType::Testnet);
        assert_eq!(
            config.network.default_port,
            testnet_defaults.network.default_port
        );
        assert_eq!(config.api.api_port, testnet_defaults.api.api_port);
        assert_eq!(config.api.rpc_port, custom_rpc_port);
    }
}
