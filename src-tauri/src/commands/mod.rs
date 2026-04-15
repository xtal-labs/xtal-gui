//! Tauri command handlers
//!
//! This module contains all IPC commands that the frontend can invoke.

pub mod blockchain;
pub mod contract;
pub mod mempool;
pub mod mining;
pub mod network;
pub mod rpc_console;
pub mod setup;
pub mod startup;
pub mod tx_detail_utils;
pub mod validator;
pub mod wallet;

// Re-export all commands for registration
pub use blockchain::*;
pub use contract::*;
pub use mempool::*;
pub use mining::*;
pub use network::*;
pub use rpc_console::*;
pub use setup::*;
pub use startup::*;
pub use validator::*;
pub use wallet::*;
