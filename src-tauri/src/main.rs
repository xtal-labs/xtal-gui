//! Crystal GUI - Tauri Application Entry Point
//!
//! This is the main entry point for the Crystal blockchain GUI.
//! It implements a multi-phase startup:
//! - Setup Mode: Shows setup wizard when no configuration exists (no node running)
//! - Normal Mode: Launches window immediately with loading screen, then starts
//!   the blockchain node in the background with progress reporting.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod abi_cache;
mod commands;
mod config;
mod events;
mod ipfs;
mod platform;
mod state;

use std::path::PathBuf;
use std::sync::mpsc::TryRecvError;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use log::{debug, error, info, warn};
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, LogicalSize, Manager};
use tokio::runtime::Runtime;

use xtal::blockchain::{BootstrapPhase, BootstrapProgress};
use xtal::config::{CliConfig, Config as NodeConfig};
use xtal::node::builder::NodeBuilder;
use xtal::node::services::Services;
use xtal::utils::{DirectoryConfig, NetworkType};
use xtal::wallet::WalletManager;

use config::{load_node_config, node_config_exists, node_config_path, GuiConfig};
use state::{
    AppState, NodeHandleStore, SetupState, SharedStartupStatus, StartupErrorInfo, StartupStage,
};

const PREFERRED_WINDOW_WIDTH: f64 = 1200.0;
const PREFERRED_WINDOW_HEIGHT: f64 = 800.0;
const MIN_USABLE_WINDOW_WIDTH: f64 = 640.0;
const MIN_USABLE_WINDOW_HEIGHT: f64 = 320.0;
const MAX_WORKAREA_RATIO: f64 = 0.9;

fn adaptive_window_dimension(preferred: f64, minimum: f64, work_area: f64) -> f64 {
    let max_for_display = (work_area * MAX_WORKAREA_RATIO).floor();
    // Clamp minimum to display size so we never force a window larger than the screen
    let effective_min = minimum.min(max_for_display);
    preferred.min(max_for_display).max(effective_min)
}

fn apply_adaptive_startup_window_size(app: &tauri::App) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window("main") else {
        warn!("Main window not found; using configured startup window size");
        return Ok(());
    };

    let monitor = match window.current_monitor() {
        Ok(Some(monitor)) => Some(monitor),
        Ok(None) => window.primary_monitor().unwrap_or_else(|err| {
            warn!("Failed to detect primary monitor: {}", err);
            None
        }),
        Err(err) => {
            warn!("Failed to detect current monitor: {}", err);
            window.primary_monitor().unwrap_or_else(|err| {
                warn!("Failed to detect primary monitor: {}", err);
                None
            })
        }
    };

    let Some(monitor) = monitor else {
        warn!("No monitor detected; using configured startup window size");
        return Ok(());
    };

    let scale_factor = monitor.scale_factor().max(1.0);
    let work_area = monitor.work_area();
    let work_area_width = work_area.size.width as f64 / scale_factor;
    let work_area_height = work_area.size.height as f64 / scale_factor;

    let target_width = adaptive_window_dimension(
        PREFERRED_WINDOW_WIDTH,
        MIN_USABLE_WINDOW_WIDTH,
        work_area_width,
    );
    let target_height = adaptive_window_dimension(
        PREFERRED_WINDOW_HEIGHT,
        MIN_USABLE_WINDOW_HEIGHT,
        work_area_height,
    );

    info!(
        "Applying adaptive startup window size: {:.0}x{:.0} logical px (monitor work area: {:.0}x{:.0}, scale factor: {:.2})",
        target_width, target_height, work_area_width, work_area_height, scale_factor
    );

    if let Err(err) = window.set_size(LogicalSize::new(target_width, target_height)) {
        warn!("Failed to apply adaptive startup window size: {}", err);
        return Ok(());
    }

    if let Err(err) = window.center() {
        warn!("Failed to center startup window: {}", err);
    }

    Ok(())
}

// =============================================================================
// Menu Helpers
// =============================================================================

/// Helper to recursively find a menu item by ID
fn find_menu_item_recursive(
    menu: &tauri::menu::Menu<tauri::Wry>,
    target_id: &str,
) -> Option<tauri::menu::MenuItemKind<tauri::Wry>> {
    if let Ok(items) = menu.items() {
        for item in items {
            if item.id().as_ref() == target_id {
                return Some(item);
            }
            if let Some(submenu) = item.as_submenu() {
                if let Ok(sub_items) = submenu.items() {
                    for sub_item in sub_items {
                        if sub_item.id().as_ref() == target_id {
                            return Some(sub_item);
                        }
                    }
                }
            }
        }
    }
    None
}

/// Update wallet-related menu items based on current state
fn update_wallet_menu(app: &AppHandle, wallet_loaded: bool, available_wallets: &[String]) {
    debug!(
        "update_wallet_menu called: wallet_loaded={}, wallets={:?}",
        wallet_loaded, available_wallets
    );

    if let Some(menu) = app.menu() {
        if let Some(item) = find_menu_item_recursive(&menu, "unload_wallet") {
            if let Some(menu_item) = item.as_menuitem() {
                let _ = menu_item.set_enabled(wallet_loaded);
            }
        }

        if let Some(item) = find_menu_item_recursive(&menu, "change_wallet_password") {
            if let Some(menu_item) = item.as_menuitem() {
                let _ = menu_item.set_enabled(wallet_loaded);
            }
        }

        if let Some(item) = find_menu_item_recursive(&menu, "create_multisig_address_menu") {
            if let Some(menu_item) = item.as_menuitem() {
                let _ = menu_item.set_enabled(wallet_loaded);
            }
        }

        if let Some(item) = find_menu_item_recursive(&menu, "load_wallet_menu") {
            if let Some(submenu) = item.as_submenu() {
                debug!(
                    "Found load_wallet_menu submenu, updating with {} wallets",
                    available_wallets.len()
                );

                if let Ok(items) = submenu.items() {
                    for old_item in items {
                        let _ = submenu.remove(&old_item);
                    }
                }

                if available_wallets.is_empty() {
                    if let Ok(placeholder) =
                        MenuItemBuilder::with_id("no_wallets", "No wallets available")
                            .enabled(false)
                            .build(app)
                    {
                        let _ = submenu.append(&placeholder);
                    }
                } else {
                    for wallet_name in available_wallets {
                        let item_id = format!("wallet_{}", wallet_name);
                        debug!("Adding wallet menu item: {}", wallet_name);
                        if let Ok(wallet_item) =
                            MenuItemBuilder::with_id(&item_id, wallet_name).build(app)
                        {
                            let _ = submenu.append(&wallet_item);
                        }
                    }
                }
            }
        } else {
            info!("Could not find load_wallet_menu submenu!");
        }
    } else {
        info!("No menu found!");
    }
}

/// Tauri command to update menu state from frontend
#[tauri::command]
fn sync_wallet_menu(app: AppHandle, wallet_loaded: bool, available_wallets: Vec<String>) {
    update_wallet_menu(&app, wallet_loaded, &available_wallets);
}

// =============================================================================
// Main Entry Point
// =============================================================================

fn main() {
    // Determine network for log path: peek at config if it exists, fall back to Mainnet for setup
    let log_network = load_node_config()
        .map(|c| c.network_type)
        .unwrap_or(NetworkType::Mainnet);
    let log_path = xtal::logging::default_log_path(log_network);
    if let Err(e) = xtal::logging::init_with_file(&log_path, log::LevelFilter::Info) {
        eprintln!(
            "Failed to init file logging: {}, falling back to console",
            e
        );
        env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    }

    info!("Starting Crystal GUI...");
    info!("Log file: {}", log_path.display());

    // Generate context once to avoid duplicate symbol errors
    let context = tauri::generate_context!();

    // Check if setup is needed (no config file exists)
    if !node_config_exists() {
        info!("First run detected - starting setup wizard");
        run_setup_mode(context);
    } else {
        info!("Loading configuration...");
        match load_node_config() {
            Ok(node_config) => {
                let gui_config = match GuiConfig::load_or_create() {
                    Ok(config) => config,
                    Err(err) => {
                        warn!("Failed to load GUI config, using defaults: {}", err);
                        GuiConfig::default()
                    }
                };
                info!("Configuration loaded: {:?}", node_config.network_type);
                run_normal_mode(node_config, gui_config, context);
            }
            Err(e) => {
                error!("Failed to load configuration: {}. Running setup wizard.", e);
                run_setup_mode(context);
            }
        }
    }
}

// =============================================================================
// Setup Mode (No Node Running)
// =============================================================================

/// Run in setup mode - minimal Tauri app without blockchain node
fn run_setup_mode(context: tauri::Context) {
    info!("Running in setup mode (no node)");

    let setup_state = SetupState::new();
    let shutdown_tx_for_window = setup_state.shutdown_sender();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(setup_state)
        .setup(|app| {
            info!("Crystal GUI setup mode initialized");

            // Create minimal menu for setup
            let app_menu = SubmenuBuilder::new(app, "Crystal")
                .item(&PredefinedMenuItem::about(
                    app,
                    Some("About Crystal"),
                    None,
                )?)
                .separator()
                .item(&PredefinedMenuItem::quit(app, Some("Quit Crystal"))?)
                .build()?;

            let help_menu = SubmenuBuilder::new(app, "Help")
                .item(&MenuItemBuilder::with_id("open_config", "Open Config File").build(app)?)
                .separator()
                .item(&MenuItemBuilder::with_id("documentation", "Documentation").build(app)?)
                .item(&MenuItemBuilder::with_id("report_issue", "Report Issue").build(app)?)
                .build()?;

            let menu = MenuBuilder::new(app)
                .item(&app_menu)
                .item(&help_menu)
                .build()?;

            app.set_menu(menu)?;
            apply_adaptive_startup_window_size(app)?;

            // Handle minimal menu events
            app.on_menu_event(|_app_handle, event| {
                let id = event.id().as_ref();
                match id {
                    "open_config" => {
                        let config_path = match node_config_path() {
                            Ok(path) => path,
                            Err(e) => {
                                error!("Failed to resolve node config path: {}", e);
                                return;
                            }
                        };
                        if let Err(e) = open::that(&config_path) {
                            error!("Failed to open config file: {}", e);
                        }
                    }
                    "documentation" => {
                        let _ = open::that("https://docs.xtal.network/");
                    }
                    "report_issue" => {
                        let _ = open::that("https://github.com/xLab-Inc/CrystalRust/issues");
                    }
                    _ => {}
                }
            });

            Ok(())
        })
        .on_window_event(move |_window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                info!("Window close requested during setup");
                let _ = shutdown_tx_for_window.send(());
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Setup-only commands (no node required)
            commands::check_first_run,
            commands::get_available_networks,
            commands::initialize_node,
            commands::set_node_config,
            commands::create_setup_wallet,
            commands::import_setup_wallet,
            commands::change_wallet_password,
            commands::confirm_backup,
            commands::complete_setup,
            commands::get_gui_config,
            commands::set_gui_toasts_enabled,
        ])
        .run(context)
        .expect("Failed to run Crystal GUI setup");

    info!("Setup mode exited");
}

// =============================================================================
// Normal Mode (Unified App with Deferred Node Startup)
// =============================================================================

/// Run in normal mode - unified Tauri app that shows immediately with a loading
/// screen, then starts the blockchain node in the background with progress.
fn run_normal_mode(node_config: NodeConfig, gui_config: GuiConfig, context: tauri::Context) {
    info!(
        "Running in normal mode with network: {:?}",
        node_config.network_type
    );

    let network = node_config.network_type;
    let data_dir = DirectoryConfig::platform_default(network)
        .map(|config| config.base_path)
        .unwrap_or_else(|_| PathBuf::from(".").join(".crystal"));

    // Create shared startup status in "loading" state — managed immediately so
    // the frontend can poll get_startup_status before the node is ready.
    let startup_status = SharedStartupStatus::loading();

    // Store for the node thread handle (for cleanup on shutdown)
    let node_handle_store = NodeHandleStore(std::sync::Mutex::new(None));

    // Shutdown channel shared between window close and async startup task
    let (shutdown_tx, _) = tokio::sync::broadcast::channel::<()>(16);
    let shutdown_tx_for_window = shutdown_tx.clone();
    let shutdown_tx_for_setup = shutdown_tx.clone();

    // Clone what the async startup task needs
    let gui_config_for_startup = gui_config.clone();
    let node_config_for_startup = node_config.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(startup_status)
        .manage(node_handle_store)
        .setup(move |app| {
            info!("Crystal GUI initialized — window shown, starting node in background");

            // Create full application menu (available from the start)
            let app_menu = SubmenuBuilder::new(app, "Crystal")
                .item(&PredefinedMenuItem::about(
                    app,
                    Some("About Crystal"),
                    None,
                )?)
                .separator()
                .item(&PredefinedMenuItem::services(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::hide(app, None)?)
                .item(&PredefinedMenuItem::hide_others(app, None)?)
                .item(&PredefinedMenuItem::show_all(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::quit(app, Some("Quit Crystal"))?)
                .build()?;

            let load_wallet_submenu =
                SubmenuBuilder::with_id(app, "load_wallet_menu", "Load Wallet")
                    .item(
                        &MenuItemBuilder::with_id("no_wallets", "No wallets available")
                            .enabled(false)
                            .build(app)?,
                    )
                    .build()?;

            let import_submenu = SubmenuBuilder::new(app, "Import Wallet")
                .item(
                    &MenuItemBuilder::with_id("import_mnemonic", "Recovery Phrase...")
                        .build(app)?,
                )
                .item(
                    &MenuItemBuilder::with_id("import_raw_key_menu", "Raw Private Key...")
                        .build(app)?,
                )
                .separator()
                .item(
                    &MenuItemBuilder::with_id("import_wallet_file", "Encrypted File (.enc)...")
                        .build(app)?,
                )
                .build()?;

            let file_menu = SubmenuBuilder::new(app, "File")
                .item(&MenuItemBuilder::with_id("new_wallet", "New Wallet...").build(app)?)
                .item(&load_wallet_submenu)
                .item(&import_submenu)
                .separator()
                .item(
                    &MenuItemBuilder::with_id(
                        "create_multisig_address_menu",
                        "Create Multisig Address...",
                    )
                    .enabled(false)
                    .build(app)?,
                )
                .separator()
                .item(
                    &MenuItemBuilder::with_id(
                        "change_wallet_password",
                        "Change Wallet Password...",
                    )
                    .enabled(false)
                    .build(app)?,
                )
                .item(
                    &MenuItemBuilder::with_id("unload_wallet", "Unload Wallet")
                        .enabled(false)
                        .build(app)?,
                )
                .build()?;

            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .item(&PredefinedMenuItem::undo(app, None)?)
                .item(&PredefinedMenuItem::redo(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::cut(app, None)?)
                .item(&PredefinedMenuItem::copy(app, None)?)
                .item(&PredefinedMenuItem::paste(app, None)?)
                .item(&PredefinedMenuItem::select_all(app, None)?)
                .build()?;

            let view_menu = SubmenuBuilder::new(app, "View")
                .item(
                    &MenuItemBuilder::with_id("reload_interface", "Reload Interface")
                        .accelerator("CmdOrCtrl+R")
                        .build(app)?,
                )
                .separator()
                .item(&PredefinedMenuItem::fullscreen(app, None)?)
                .build()?;

            let window_menu = SubmenuBuilder::new(app, "Window")
                .item(&PredefinedMenuItem::minimize(app, None)?)
                .item(&PredefinedMenuItem::maximize(app, None)?)
                .item(&PredefinedMenuItem::close_window(app, None)?)
                .build()?;

            let help_menu = SubmenuBuilder::new(app, "Help")
                .item(&MenuItemBuilder::with_id("open_logs", "Open Logs Folder").build(app)?)
                .item(&MenuItemBuilder::with_id("open_config", "Open Config File").build(app)?)
                .separator()
                .item(&MenuItemBuilder::with_id("documentation", "Documentation").build(app)?)
                .item(&MenuItemBuilder::with_id("report_issue", "Report Issue").build(app)?)
                .build()?;

            let menu = MenuBuilder::new(app)
                .item(&app_menu)
                .item(&file_menu)
                .item(&edit_menu)
                .item(&view_menu)
                .item(&window_menu)
                .item(&help_menu)
                .build()?;

            app.set_menu(menu)?;
            apply_adaptive_startup_window_size(app)?;

            // Handle menu events
            app.on_menu_event(move |app_handle, event| {
                let id = event.id().as_ref();
                info!("Menu event: {}", id);

                let window = match app_handle.get_webview_window("main") {
                    Some(w) => w,
                    None => {
                        error!("Failed to get main window for menu event: {}", id);
                        return;
                    }
                };

                if id.starts_with("wallet_") {
                    if let Some(wallet_name) = id.strip_prefix("wallet_") {
                        let escaped_name = wallet_name.replace('\'', "\\'");
                        let js = format!("window.openWalletLoad?.('{}')", escaped_name);
                        if let Err(e) = window.eval(&js) {
                            error!("Failed to eval openWalletLoad: {}", e);
                        }
                    }
                    return;
                }

                match id {
                    "new_wallet" => {
                        if let Err(e) = window.eval("window.openWalletCreate?.()") {
                            error!("Failed to eval openWalletCreate: {}", e);
                        }
                    }
                    "unload_wallet" => {
                        if let Err(e) = window.eval("window.unloadWallet?.()") {
                            error!("Failed to eval unloadWallet: {}", e);
                        }
                    }
                    "change_wallet_password" => {
                        if let Err(e) = window.eval("window.openWalletChangePassword?.()") {
                            error!("Failed to eval openWalletChangePassword: {}", e);
                        }
                    }
                    "create_multisig_address_menu" => {
                        if let Err(e) = window.eval("window.openWalletMultisig?.()") {
                            error!("Failed to eval openWalletMultisig: {}", e);
                        }
                    }
                    "import_mnemonic" => {
                        if let Err(e) = window.eval("window.openWalletImportMnemonic?.()") {
                            error!("Failed to eval openWalletImportMnemonic: {}", e);
                        }
                    }
                    "import_raw_key_menu" => {
                        if let Err(e) = window.eval("window.openWalletImportKey?.()") {
                            error!("Failed to eval openWalletImportKey: {}", e);
                        }
                    }
                    "import_wallet_file" => {
                        if let Err(e) = window.eval("window.openWalletImportFile?.()") {
                            error!("Failed to eval openWalletImportFile: {}", e);
                        }
                    }
                    "reload_interface" => {
                        if let Err(e) = window.reload() {
                            error!("Failed to reload interface: {}", e);
                        }
                    }
                    "open_logs" => {
                        let log_dir = xtal::logging::default_log_dir(network);
                        if let Err(e) = open::that(&log_dir) {
                            error!("Failed to open logs folder: {}", e);
                        }
                    }
                    "open_config" => {
                        let config_path = match node_config_path() {
                            Ok(path) => path,
                            Err(e) => {
                                error!("Failed to resolve node config path: {}", e);
                                return;
                            }
                        };
                        if let Err(e) = open::that(&config_path) {
                            error!("Failed to open config file: {}", e);
                        }
                    }
                    "documentation" => {
                        let _ = open::that("https://docs.xtal.network/");
                    }
                    "report_issue" => {
                        let _ = open::that("https://github.com/xLab-Inc/CrystalRust/issues");
                    }
                    _ => {}
                }
            });

            // Spawn async task that starts the node in the background and
            // updates SharedStartupStatus as progress comes in.
            let app_handle = app.handle().clone();
            let mut shutdown_rx = shutdown_tx_for_setup.subscribe();

            tauri::async_runtime::spawn(async move {
                let status: tauri::State<'_, SharedStartupStatus> = app_handle.state();
                let handle_store: tauri::State<'_, NodeHandleStore> = app_handle.state();

                // Spawn node thread — returns channels + handle immediately
                let (services_rx, error_rx, progress_rx, node_handle) =
                    spawn_node_thread(&node_config_for_startup);

                // Store the handle for cleanup
                if let Ok(mut guard) = handle_store.0.lock() {
                    *guard = Some(node_handle);
                }

                // Poll channels until the node is ready, fails, or window closes
                loop {
                    // Check for shutdown (window closed during loading)
                    if shutdown_rx.try_recv().is_ok() {
                        info!("Shutdown received during node startup — aborting");
                        return;
                    }

                    // Drain progress messages
                    while let Ok(update) = progress_rx.try_recv() {
                        match update {
                            StartupUpdate::Stage {
                                stage,
                                message,
                                percent,
                            } => status.set_progress(stage, &message, percent),
                            StartupUpdate::Bootstrap(progress) => {
                                status.set_bootstrap_progress(&progress)
                            }
                        }
                    }

                    // Check for services (success)
                    match services_rx.try_recv() {
                        Ok((services, api_port)) => {
                            info!("Node ready — registering AppState (API port: {})", api_port);

                            status.set_progress(
                                StartupStage::StartingServices,
                                "Starting services...",
                                99,
                            );

                            // Subscribe to sync state
                            let sync_rx = services
                                .subscribe_sync_state()
                                .expect("Sync state must be available for GUI");

                            // Create and register AppState dynamically
                            let app_state = AppState::new(
                                services.clone(),
                                sync_rx,
                                api_port,
                                network,
                                data_dir.clone(),
                                gui_config_for_startup.ipfs.clone(),
                            );
                            app_handle.manage(app_state);

                            // Spawn event broadcaster for wallet-specific events
                            let services_for_events = services.clone();
                            let event_shutdown_rx = shutdown_tx_for_setup.subscribe();
                            let event_app_handle = app_handle.clone();
                            tauri::async_runtime::spawn(async move {
                                events::run_event_broadcaster(
                                    event_app_handle,
                                    services_for_events,
                                    event_shutdown_rx,
                                )
                                .await;
                            });

                            // Transition to ready
                            status.set_ready();
                            info!("Startup complete — frontend will transition to main app");
                            return;
                        }
                        Err(TryRecvError::Disconnected) => {
                            // Node thread exited without sending services
                            let err_msg = error_rx
                                .try_recv()
                                .unwrap_or_else(|_| "Node thread exited unexpectedly".to_string());
                            error!("Node startup failed: {}", err_msg);
                            status.set_failed(make_startup_error(err_msg, network));
                            return;
                        }
                        Err(TryRecvError::Empty) => {}
                    }

                    // Check for error from node thread
                    if let Ok(err_msg) = error_rx.try_recv() {
                        error!("Node startup failed: {}", err_msg);
                        status.set_failed(make_startup_error(err_msg, network));
                        return;
                    }

                    tokio::time::sleep(Duration::from_millis(100)).await;
                }
            });

            Ok(())
        })
        .on_window_event(move |_window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                info!("Window close requested - initiating shutdown");
                let _ = shutdown_tx_for_window.send(());
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Setup commands (still available for check_first_run)
            commands::check_first_run,
            commands::get_available_networks,
            // Startup status commands (available during loading + degraded)
            commands::get_startup_status,
            commands::open_directory,
            commands::restart_app,
            commands::get_config_path,
            commands::get_gui_config,
            commands::set_gui_toasts_enabled,
            commands::get_node_config,
            commands::set_node_storage_flags,
            commands::switch_network,
            // Blockchain commands
            commands::get_blockchain_info,
            commands::get_best_leaf_info,
            commands::get_sync_state,
            commands::get_recent_blocks,
            commands::get_block_by_height,
            commands::get_block,
            commands::get_block_detail,
            commands::get_fruit_detail,
            commands::get_transaction_detail_explorer,
            // Mempool commands
            commands::get_mempool_info,
            commands::get_mempool_transactions,
            commands::get_mempool_transaction,
            commands::get_mempool_transaction_detail,
            // Mining commands
            commands::start_mining,
            commands::stop_mining,
            commands::get_mining_status,
            commands::get_mining_stats,
            commands::set_mining_threads,
            // Wallet commands (file operations)
            commands::list_wallets,
            commands::create_new_wallet,
            commands::import_wallet,
            commands::import_wallet_from_file,
            commands::load_wallet,
            commands::unload_wallet,
            commands::export_wallet,
            commands::import_raw_key,
            commands::import_signer_file,
            // Wallet commands (password)
            commands::change_password,
            commands::get_wallet_status,
            commands::get_wallet_balance,
            commands::get_wallet_mnemonic,
            // Wallet commands (addresses & transactions)
            commands::generate_address,
            commands::create_multisig_address,
            commands::get_multisig_addresses,
            commands::get_addresses,
            commands::estimate_send_transaction_fee,
            commands::send_transaction,
            commands::get_transaction_history,
            commands::get_transaction_detail,
            commands::get_vm_account_balance,
            commands::get_vm_transaction_history,
            commands::generate_vm_address,
            commands::get_vm_addresses,
            commands::send_vm_transfer,
            commands::get_gas_config,
            // Validator commands
            commands::list_validators,
            commands::start_validator,
            commands::stop_validator,
            commands::get_validator_status,
            commands::start_fruit_production,
            commands::stop_fruit_production,
            commands::get_validator_stake,
            commands::get_fruit_specifications,
            commands::get_eligible_fruits,
            commands::estimate_validator_stake_fee,
            commands::estimate_validator_unstake_fee,
            commands::validator_stake,
            commands::validator_unstake,
            commands::create_validator_wallet,
            commands::import_validator_wallet,
            commands::list_validator_wallets,
            commands::get_network_validator_stats,
            commands::get_validator_earnings,
            commands::get_validator_balance_info,
            commands::get_fruit_production_stats,
            // Network commands
            commands::get_network_status,
            commands::get_peers,
            commands::get_peer_count,
            commands::get_api_port,
            commands::get_node_info,
            commands::get_log_path,
            // RPC Console commands
            commands::get_rpc_methods,
            commands::get_rpc_method_details,
            commands::execute_rpc,
            // Contract commands
            commands::deploy_contract,
            commands::call_contract,
            commands::query_contract,
            commands::deposit_utxo,
            commands::get_contract_info,
            commands::get_contract_storage_value,
            commands::estimate_contract_gas,
            commands::get_cage_config,
            commands::load_contract_abi,
            commands::list_cached_contracts,
            commands::import_contract_abi,
            commands::remove_cached_contract,
            commands::encode_contract_calldata,
            // IPFS commands
            commands::pin_abi_to_ipfs,
            commands::get_ipfs_status,
            // UTXO commands
            commands::list_unspent_outputs,
            // Menu commands
            sync_wallet_menu,
        ])
        .run(context)
        .expect("Failed to run Crystal GUI");

    // Wait for node thread to finish on shutdown
    // (The NodeHandleStore is dropped here since Tauri owns it)
    info!("Crystal GUI shutdown complete");
}

// =============================================================================
// Node Startup (Background Thread)
// =============================================================================

/// Load or create wallet manager for the GUI
fn load_wallet_manager(network: NetworkType) -> Result<Arc<WalletManager>, String> {
    info!("Creating wallet manager for network: {:?}", network);

    let manager = WalletManager::new(network)
        .map_err(|e| format!("Failed to create wallet manager: {}", e))?;

    info!("Wallet manager created successfully");
    info!("  Wallet service ready - user can load a wallet from the Wallet panel");

    Ok(Arc::new(manager))
}

/// Categorize an error message for user-friendly display
fn categorize_error(msg: &str) -> String {
    let lower = msg.to_lowercase();
    if lower.contains("permission denied")
        || lower.contains("access denied")
        || lower.contains("no such file or directory")
    {
        "directory".to_string()
    } else if lower.contains("rocksdb")
        || lower.contains("corruption")
        || lower.contains("database")
        || lower.contains("column family")
    {
        "database".to_string()
    } else if lower.contains("address already in use")
        || lower.contains("port")
        || lower.contains("bind")
    {
        "port".to_string()
    } else if lower.contains("wallet") {
        "wallet".to_string()
    } else {
        "build".to_string()
    }
}

/// Build a StartupErrorInfo from an error message and config context
fn make_startup_error(message: String, network: NetworkType) -> StartupErrorInfo {
    let log_path = xtal::logging::default_log_path(network)
        .display()
        .to_string();
    let data_dir = DirectoryConfig::platform_default(network)
        .map(|d| d.base_path.display().to_string())
        .unwrap_or_else(|_| "unknown".to_string());

    StartupErrorInfo {
        category: categorize_error(&message),
        message,
        log_path,
        data_dir,
        network: format!("{:?}", network),
    }
}

#[derive(Debug, Clone)]
enum StartupUpdate {
    Stage {
        stage: StartupStage,
        message: String,
        percent: u8,
    },
    Bootstrap(BootstrapProgress),
}

fn gui_startup_cli_config(network: NetworkType, config_path: PathBuf) -> CliConfig {
    CliConfig {
        network_port: 0,
        api_port: 0,
        rpc_port: 0,
        mining_threads: 0,
        metrics_port: 0,
        network: Some(network),
        config_path: config_path.to_string_lossy().to_string(),
        ..CliConfig::for_network(network)
    }
}

/// Spawn the node in a dedicated thread. Returns channels for communication
/// and the thread handle immediately — does NOT block.
fn spawn_node_thread(
    node_config: &NodeConfig,
) -> (
    std::sync::mpsc::Receiver<(Arc<Services>, u16)>,
    std::sync::mpsc::Receiver<String>,
    std::sync::mpsc::Receiver<StartupUpdate>,
    thread::JoinHandle<()>,
) {
    let network = node_config.network_type;
    let txindex = node_config.storage.enable_tx_index;

    // Channels for communication with the GUI thread
    let (services_tx, services_rx) = std::sync::mpsc::channel::<(Arc<Services>, u16)>();
    let (error_tx, error_rx) = std::sync::mpsc::channel::<String>();
    let (progress_tx, progress_rx) = std::sync::mpsc::channel::<StartupUpdate>();

    let node_handle = thread::Builder::new()
        .name("crystal-node".to_string())
        .spawn(move || {
            info!("Node thread starting...");

            let rt = Runtime::new().expect("Failed to create tokio runtime for node");

            rt.block_on(async {
                let _ = progress_tx.send(StartupUpdate::Stage {
                    stage: StartupStage::OpeningDatabase,
                    message: "Opening database...".to_string(),
                    percent: 2,
                });

                // Configure node with network from config
                let dir_config = match DirectoryConfig::platform_default(network) {
                    Ok(d) => d,
                    Err(e) => {
                        let msg = format!("Failed to create directory config: {}", e);
                        error!("{}", msg);
                        let _ = error_tx.send(msg);
                        return;
                    }
                };

                let config_path = match node_config_path() {
                    Ok(path) => path,
                    Err(e) => {
                        let msg = format!("Failed to resolve node config path: {}", e);
                        error!("{}", msg);
                        let _ = error_tx.send(msg);
                        return;
                    }
                };

                let cli_config = gui_startup_cli_config(network, config_path);

                // Create wallet manager
                let wallet = match load_wallet_manager(network) {
                    Ok(w) => w,
                    Err(e) => {
                        error!("{}", e);
                        let _ = error_tx.send(e);
                        return;
                    }
                };

                // Build node (this is where bootstrap_from_storage runs)
                let _ = progress_tx.send(StartupUpdate::Stage {
                    stage: StartupStage::Bootstrap,
                    message: "Loading blockchain...".to_string(),
                    percent: 5,
                });
                info!("Building node...");
                let mut builder = match NodeBuilder::new(cli_config.clone(), dir_config) {
                    Ok(b) => b,
                    Err(e) => {
                        let msg = format!("Failed to create node builder: {}", e);
                        error!("{}", msg);
                        let _ = error_tx.send(msg);
                        return;
                    }
                };

                let (bootstrap_progress_tx, mut bootstrap_progress_rx) =
                    tokio::sync::watch::channel::<Option<BootstrapProgress>>(None);
                let bridge_progress_tx = progress_tx.clone();
                let show_txindex_stage = txindex;
                tokio::spawn(async move {
                    let mut txindex_announced = false;
                    while bootstrap_progress_rx.changed().await.is_ok() {
                        let Some(progress) = bootstrap_progress_rx.borrow().clone() else {
                            continue;
                        };
                        let _ = bridge_progress_tx.send(StartupUpdate::Bootstrap(progress.clone()));
                        if show_txindex_stage
                            && !txindex_announced
                            && progress.phase == BootstrapPhase::Complete
                        {
                            txindex_announced = true;
                            let _ = bridge_progress_tx.send(StartupUpdate::Stage {
                                stage: StartupStage::TxIndex,
                                message: "Building transaction index...".to_string(),
                                percent: 92,
                            });
                        }
                    }
                });

                builder = builder.with_bootstrap_progress(bootstrap_progress_tx);
                builder = builder.with_wallet(wallet);

                let mut node = match builder.build().await {
                    Ok(n) => n,
                    Err(e) => {
                        let msg = format!("Failed to build node: {}", e);
                        error!("{}", msg);
                        let _ = error_tx.send(msg);
                        return;
                    }
                };

                if node.services.wallet.is_some() {
                    info!("Wallet manager is available in services");
                } else {
                    error!("Wallet manager is NOT in services!");
                }

                // Start services (RPC, API)
                let _ = progress_tx.send(StartupUpdate::Stage {
                    stage: StartupStage::InitializingNetwork,
                    message: "Initializing network...".to_string(),
                    percent: 96,
                });

                if let Err(e) = node.start_services().await {
                    let msg = format!("Failed to start node services: {}", e);
                    error!("{}", msg);
                    let _ = error_tx.send(msg);
                    return;
                }

                let _ = progress_tx.send(StartupUpdate::Stage {
                    stage: StartupStage::StartingServices,
                    message: "Starting services...".to_string(),
                    percent: 99,
                });

                // Send services to GUI thread
                let services = node.services.clone();
                let api_port = node.cli_config.api_port;
                if services_tx.send((services, api_port)).is_err() {
                    error!("Failed to send services to GUI thread");
                    return;
                }

                info!("Node running - entering event loop");

                if let Err(e) = node.run().await {
                    error!("Node error: {}", e);
                }

                info!("Node thread shutting down");
            });
        })
        .expect("Failed to spawn node thread");

    (services_rx, error_rx, progress_rx, node_handle)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gui_startup_cli_config_preserves_persisted_node_settings() {
        let cli_config =
            gui_startup_cli_config(NetworkType::Testnet, PathBuf::from("/tmp/config.json"));

        assert_eq!(cli_config.network, Some(NetworkType::Testnet));
        assert_eq!(cli_config.config_path, "/tmp/config.json");
        assert_eq!(cli_config.network_port, 0);
        assert_eq!(cli_config.api_port, 0);
        assert_eq!(cli_config.rpc_port, 0);
        assert_eq!(cli_config.mining_threads, 0);
        assert_eq!(cli_config.metrics_port, 0);
    }
}
