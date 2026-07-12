//! Validator management commands
//!
//! Commands for starting, stopping, and managing PoS validators.
//! Validator wallets are completely separate from user wallets.

use std::sync::Arc;

use serde::Serialize;
use tauri::State;

use xtal::blockchain::constants::{LEAVES_PER_EPOCH, TARGET_SPACING};
use xtal::config::ValidatorConfig;
use xtal::difficulty::DEFAULT_STEM_DIFFICULTY_RATIO;
use xtal::fruit::difficulty::calculate_effective_difficulty;
use xtal::fruit::production::estimate_production_rate;
use xtal::fruit::spec::get_fruits_by_stake_requirement;
use xtal::fruit::FruitType;
use xtal::interfaces::validator::ValidatorProduction;
use xtal::interfaces::{ChainDataProvider, UtxoData};
use xtal::transaction::CurrencyType;
use xtal::validator::ValidatorService;
use xtal::wallet::WalletManager;

use xtal::wallet::database::models::WalletType;

use crate::commands::wallet::{
    start_wallet_sync, stop_wallet_sync, wallet_from_mnemonic_impl, FeeEstimate,
};
use crate::state::AppState;

/// Per-fruit production statistics
#[derive(Debug, Clone, Serialize)]
pub struct FruitProductionCount {
    pub fruit_type: String,
    pub fruits_produced: u64,
}

/// Validator information for display
#[derive(Debug, Clone, Serialize)]
pub struct ValidatorInfo {
    pub address: String,
    pub effective_stake: u64,
    pub is_active: bool,
    pub active_productions: Vec<String>,
    pub total_fruits_produced: u64,
    pub production_stats: Vec<FruitProductionCount>,
}

/// Result of starting a validator
#[derive(Debug, Clone, Serialize)]
pub struct ValidatorStartResult {
    pub address: String,
    pub eligible_fruits: Vec<String>,
    pub started_count: usize,
}

/// List all running validators
#[tauri::command]
pub async fn list_validators(state: State<'_, AppState>) -> Result<Vec<ValidatorInfo>, String> {
    let addresses = state.services.list_validators();

    let mut validators = Vec::new();
    for address in addresses {
        if let Some(service) = state.services.get_validator(&address) {
            if let Ok(status) = service.get_status() {
                validators.push(ValidatorInfo {
                    address: status.validator_address,
                    effective_stake: status.stake,
                    is_active: !status.active_productions.is_empty(),
                    active_productions: status
                        .active_productions
                        .iter()
                        .map(|f| format!("{:?}", f))
                        .collect(),
                    total_fruits_produced: status.total_fruits_produced,
                    production_stats: status
                        .production_stats
                        .iter()
                        .map(|(ft, ps)| FruitProductionCount {
                            fruit_type: format!("{:?}", ft),
                            fruits_produced: ps.fruits_produced,
                        })
                        .collect(),
                });
            }
        }
    }

    Ok(validators)
}

/// Start a validator from a wallet name
///
/// The wallet must already exist. This will:
/// 1. Load the wallet via WalletManager
/// 2. Unlock it with the provided password
/// 3. Create a ValidatorService
/// 4. Register the validator service without auto-starting productions
#[tauri::command]
pub async fn start_validator(
    state: State<'_, AppState>,
    wallet_name: String,
    password: String,
) -> Result<ValidatorStartResult, String> {
    // Get network type from the node's services
    let network_type = state.services.network_type();

    // Create a wallet manager for loading
    let wallet_manager = Arc::new(
        WalletManager::new(network_type)
            .map_err(|e| format!("Failed to create wallet manager: {}", e))?,
    );

    // Load and unlock the wallet
    wallet_manager
        .load_wallet(&wallet_name)
        .map_err(|e| format!("Failed to load wallet: {}", e))?;
    wallet_manager
        .unlock_wallet(&password, None)
        .map_err(|e| format!("Failed to unlock wallet: {}", e))?;

    // Create validator service from wallet
    let blockchain = state.services.blockchain().clone();
    let mempool = state.services.mempool.clone();

    let config = ValidatorConfig::default();

    let service = ValidatorService::from_wallet(
        wallet_manager.clone(),
        config,
        blockchain,
        mempool,
        Some(state.services.clone()),
    )
    .map_err(|e| format!("Failed to create validator: {}", e))?;

    // Get the validator address
    let status = service
        .get_status()
        .map_err(|e| format!("Failed to get validator status: {}", e))?;

    let address = status.validator_address.clone();

    // Determine which fruits are currently eligible without auto-starting them.
    let eligible_fruits = get_fruits_by_stake_requirement()
        .into_iter()
        .filter_map(|(fruit_type, spec)| {
            (status.stake >= spec.min_stake_threshold).then(|| format!("{:?}", fruit_type))
        })
        .collect::<Vec<_>>();

    // Add to services
    start_wallet_sync(&state, wallet_manager.as_ref());
    state.services.add_validator(address.clone(), service);

    Ok(ValidatorStartResult {
        address,
        eligible_fruits,
        started_count: 0,
    })
}

/// Stop a running validator
#[tauri::command]
pub async fn stop_validator(state: State<'_, AppState>, address: String) -> Result<(), String> {
    let service = state
        .services
        .get_validator(&address)
        .ok_or_else(|| format!("Validator not found: {}", address))?;

    // Stop all productions
    service
        .stop_all()
        .map_err(|e| format!("Failed to stop validator: {}", e))?;

    if let Some(wallet_id) = service.get_wallet_id() {
        stop_wallet_sync(&state, &wallet_id);
    }

    // Remove from services
    state.services.validators.remove(&address);

    Ok(())
}

/// Get status of a specific validator
#[tauri::command]
pub async fn get_validator_status(
    state: State<'_, AppState>,
    address: String,
) -> Result<Option<ValidatorInfo>, String> {
    if let Some(service) = state.services.get_validator(&address) {
        let status = service
            .get_status()
            .map_err(|e| format!("Failed to get status: {}", e))?;

        Ok(Some(ValidatorInfo {
            address: status.validator_address,
            effective_stake: status.stake,
            is_active: !status.active_productions.is_empty(),
            active_productions: status
                .active_productions
                .iter()
                .map(|f| format!("{:?}", f))
                .collect(),
            total_fruits_produced: status.total_fruits_produced,
            production_stats: status
                .production_stats
                .iter()
                .map(|(ft, ps)| FruitProductionCount {
                    fruit_type: format!("{:?}", ft),
                    fruits_produced: ps.fruits_produced,
                })
                .collect(),
        }))
    } else {
        Ok(None)
    }
}

/// Start production for a specific fruit type
#[tauri::command]
pub async fn start_fruit_production(
    state: State<'_, AppState>,
    address: String,
    fruit_type: String,
) -> Result<(), String> {
    let service = state
        .services
        .get_validator(&address)
        .ok_or_else(|| format!("Validator not found: {}", address))?;

    let fruit = parse_fruit_type(&fruit_type)?;

    service
        .start_production(fruit)
        .map_err(|e| format!("Failed to start production: {}", e))
}

/// Stop production for a specific fruit type
#[tauri::command]
pub async fn stop_fruit_production(
    state: State<'_, AppState>,
    address: String,
    fruit_type: String,
) -> Result<(), String> {
    let service = state
        .services
        .get_validator(&address)
        .ok_or_else(|| format!("Validator not found: {}", address))?;

    let fruit = parse_fruit_type(&fruit_type)?;

    service
        .stop_production(fruit)
        .map_err(|e| format!("Failed to stop production: {}", e))
}

/// Get validator stake balance
#[tauri::command]
pub async fn get_validator_stake(
    state: State<'_, AppState>,
    address: String,
) -> Result<u64, String> {
    let service = state
        .services
        .get_validator(&address)
        .ok_or_else(|| format!("Validator not found: {}", address))?;

    // Get stake from status instead of private method
    let status = service
        .get_status()
        .map_err(|e| format!("Failed to get status: {}", e))?;

    Ok(status.stake)
}

/// Validator balance breakdown
#[derive(Debug, Clone, Serialize)]
pub struct ValidatorBalanceInfo {
    pub validator_address: String,
    pub available_balance: u64, // UTXO balance (unstaked, available to stake)
    pub withdrawable_stake: u64, // Staked XTAL available to unstake
    pub mature_stake: u64,      // Backward-compatible alias for withdrawable_stake
    pub pending_stake: u64,     // Immature stake not yet effective
    pub total_stake: u64,       // Mature + pending stake
    pub pending_unstake: u64,   // Pending unstake (locked)
    pub immature_balance: u64,  // Non-stake immature balance + unconfirmed incoming
    pub total_value: u64,       // Sum of all
}

/// Get validator balance breakdown (available, staked, pending)
#[tauri::command]
pub async fn get_validator_balance_info(
    state: State<'_, AppState>,
    address: String,
) -> Result<ValidatorBalanceInfo, String> {
    let service = state
        .services
        .get_validator(&address)
        .ok_or_else(|| format!("Validator not found: {}", address))?;

    // Get available balance (spendable, non-staked UTXOs) from core library
    let available_balance = service
        .get_available_balance()
        .map_err(|e| format!("Failed to get balance: {}", e))?;

    // Scan UTXOs to compute wallet-facing stake breakdown.
    let blockchain = state.services.blockchain();
    let spent_outpoints = state.services.mempool().spent_outpoints();
    let validator_pkh = xtal::address_format::parse_address_input(&address)
        .map_err(|e| format!("Invalid address: {}", e))?;
    let current_leaf_height = blockchain.get_current_leaf_height();

    let mut withdrawable_stake: u64 = 0;
    let mut pending_stake: u64 = 0;
    let mut pending_unstake: u64 = 0;
    let mut immature_non_stake_balance: u64 = 0;

    if let Ok(utxos) = blockchain.get_utxos(&validator_pkh) {
        for utxo in &utxos {
            if spent_outpoints.contains(&utxo.outpoint) {
                continue;
            }

            if let Some(info) =
                xtal::script::parse_stake_or_unstake_script(&utxo.output.script_pubkey)
            {
                let belongs_to_validator = info.owner == validator_pkh;
                let is_canonical_contract = info.contract == xtal::config::CONTRACT_ADDRESS;

                if info.is_stake && belongs_to_validator && is_canonical_contract {
                    let coinbase_or_withdrawal_locked = if utxo.is_coinbase || utxo.is_withdrawal {
                        let age = current_leaf_height.saturating_sub(utxo.creation_height);
                        age < xtal::consensus::validation::COINBASE_MATURITY
                    } else {
                        false
                    };

                    if coinbase_or_withdrawal_locked {
                        pending_stake += utxo.output.amount;
                    } else if let xtal::script::TimeLock::Relative(lock) = info.lock {
                        let age = current_leaf_height.saturating_sub(utxo.creation_height);
                        if age < lock {
                            pending_stake += utxo.output.amount;
                        } else {
                            withdrawable_stake += utxo.output.amount;
                        }
                    } else {
                        withdrawable_stake += utxo.output.amount;
                    }
                } else if !info.is_stake && belongs_to_validator && is_canonical_contract {
                    // Unstake output — check CSV lock
                    if let xtal::script::TimeLock::Relative(lock) = info.lock {
                        let age = current_leaf_height.saturating_sub(utxo.creation_height);
                        if age < lock {
                            pending_unstake += utxo.output.amount;
                        }
                    }
                }
            } else if utxo.is_coinbase {
                // Immature coinbase output
                let age = current_leaf_height.saturating_sub(utxo.creation_height);
                if age < xtal::consensus::validation::COINBASE_MATURITY {
                    immature_non_stake_balance += utxo.output.amount;
                }
            }
        }
    }

    // Source B: Unconfirmed incoming transactions from wallet database
    let pending_incoming = if let (Some(db), Some(wallet_id)) =
        (service.get_wallet_database(), service.get_wallet_id())
    {
        let queries = xtal::wallet::database::queries::WalletQueries::new(db.connection());
        queries.get_pending_incoming_total(&wallet_id).unwrap_or(0)
    } else {
        0
    };

    let immature_balance = immature_non_stake_balance + pending_incoming;
    let total_stake = withdrawable_stake + pending_stake;
    let total_value = available_balance + total_stake + pending_unstake + immature_balance;

    Ok(ValidatorBalanceInfo {
        validator_address: address,
        available_balance,
        withdrawable_stake,
        mature_stake: withdrawable_stake,
        pending_stake,
        total_stake,
        pending_unstake,
        immature_balance,
        total_value,
    })
}

/// Helper function to parse fruit type from string
fn parse_fruit_type(s: &str) -> Result<FruitType, String> {
    match s.to_lowercase().as_str() {
        "grape" => Ok(FruitType::Grape),
        "kiwi" => Ok(FruitType::Kiwi),
        "apple" => Ok(FruitType::Apple),
        "pineapple" => Ok(FruitType::Pineapple),
        "watermelon" => Ok(FruitType::Watermelon),
        "pear" => Ok(FruitType::Pear),
        "orange" => Ok(FruitType::Orange),
        "peach" => Ok(FruitType::Peach),
        "strawberry" => Ok(FruitType::Strawberry),
        _ => Err(format!("Unknown fruit type: {}", s)),
    }
}

// ============================================================================
// New commands for Validator UI
// ============================================================================

/// Fruit specification for UI display (all amounts in shards)
#[derive(Debug, Clone, Serialize)]
pub struct FruitSpec {
    pub fruit_type: String,
    pub min_stake: u64, // In shards
    pub target_interval_secs: u64,
    pub max_size_bytes: usize,
    pub max_fuel: u64,
    pub emoji: String,
}

/// Fruit eligibility information (all amounts in shards)
#[derive(Debug, Clone, Serialize)]
pub struct EligibleFruit {
    pub fruit_type: String,
    pub is_eligible: bool,
    pub min_stake: u64, // In shards
    pub shortfall: u64, // In shards
    pub emoji: String,
}

/// Get all fruit specifications (stake requirements for UI display)
/// All amounts returned in shards - frontend handles display conversion
#[tauri::command]
pub async fn get_fruit_specifications() -> Result<Vec<FruitSpec>, String> {
    let fruits = get_fruits_by_stake_requirement();

    let specs: Vec<FruitSpec> = fruits
        .into_iter()
        .map(|(fruit_type, spec)| {
            let emoji = fruit_to_emoji(fruit_type);
            FruitSpec {
                fruit_type: format!("{:?}", fruit_type),
                min_stake: spec.min_stake_threshold, // Keep in shards
                target_interval_secs: spec.target_interval_secs.unwrap_or(0),
                max_size_bytes: spec.max_size_bytes.unwrap_or(0),
                max_fuel: spec.max_fuel_per_fruit,
                emoji,
            }
        })
        .collect();

    Ok(specs)
}

/// Get eligible fruits for a validator based on their stake
/// All amounts in shards - frontend handles display conversion
#[tauri::command]
pub async fn get_eligible_fruits(
    state: State<'_, AppState>,
    address: String,
) -> Result<Vec<EligibleFruit>, String> {
    let service = state
        .services
        .get_validator(&address)
        .ok_or_else(|| format!("Validator not found: {}", address))?;

    let status = service
        .get_status()
        .map_err(|e| format!("Failed to get status: {}", e))?;

    let current_stake = status.stake;
    let fruits = get_fruits_by_stake_requirement();

    let eligible: Vec<EligibleFruit> = fruits
        .into_iter()
        .map(|(fruit_type, spec)| {
            let min_stake = spec.min_stake_threshold;
            let is_eligible = current_stake >= min_stake;
            let shortfall = if is_eligible {
                0
            } else {
                min_stake - current_stake
            };
            let emoji = fruit_to_emoji(fruit_type);

            EligibleFruit {
                fruit_type: format!("{:?}", fruit_type),
                is_eligible,
                min_stake, // Keep in shards
                shortfall, // Keep in shards
                emoji,
            }
        })
        .collect();

    Ok(eligible)
}

fn collect_validator_address_utxos(state: &AppState, validator_pkh: &[u8; 20]) -> Vec<UtxoData> {
    let blockchain = state.services.blockchain();

    blockchain
        .get_utxos(validator_pkh)
        .map(|utxos| {
            utxos
                .into_iter()
                .filter(|utxo| utxo.output.currency == CurrencyType::XTAL)
                .collect()
        })
        .unwrap_or_default()
}

fn mature_canonical_stake_amount(
    utxo: &UtxoData,
    validator_pkh: &[u8; 20],
    current_leaf_height: u64,
) -> Option<u64> {
    let info = xtal::script::parse_stake_or_unstake_script(&utxo.output.script_pubkey)?;
    if !info.is_stake
        || info.owner != *validator_pkh
        || info.contract != xtal::config::CONTRACT_ADDRESS
    {
        return None;
    }

    if utxo.is_coinbase || utxo.is_withdrawal {
        let age = current_leaf_height.saturating_sub(utxo.creation_height);
        if age < xtal::consensus::validation::COINBASE_MATURITY {
            return None;
        }
    }

    if let xtal::script::TimeLock::Relative(lock) = info.lock {
        let age = current_leaf_height.saturating_sub(utxo.creation_height);
        if age < lock {
            return None;
        }
    }

    Some(utxo.output.amount)
}

fn collect_mature_stake_utxos(state: &AppState, validator_pkh: &[u8; 20]) -> (Vec<UtxoData>, u64) {
    let current_leaf_height = state.services.blockchain().get_current_leaf_height();
    let spent = state.services.mempool().spent_outpoints();
    let mut mature_stake = 0u64;
    let mut mature_utxos = Vec::new();

    for utxo in collect_validator_address_utxos(state, validator_pkh) {
        if spent.contains(&utxo.outpoint) {
            continue;
        }
        if let Some(amount) =
            mature_canonical_stake_amount(&utxo, validator_pkh, current_leaf_height)
        {
            mature_stake = mature_stake.saturating_add(amount);
            mature_utxos.push(utxo);
        }
    }

    (mature_utxos, mature_stake)
}

#[tauri::command]
pub async fn estimate_validator_stake_fee(
    state: State<'_, AppState>,
    address: String,
    amount: u64,
) -> Result<FeeEstimate, String> {
    let service = state
        .services
        .get_validator(&address)
        .ok_or_else(|| format!("Validator not found: {}", address))?;

    let estimate = service
        .estimate_stake_to_contract(None, amount)
        .map_err(|e| format!("Failed to estimate stake fee: {}", e))?;

    Ok(FeeEstimate {
        fee: estimate.fee,
        tx_size: estimate.tx_size,
        input_count: estimate.selected_inputs.len(),
        output_count: estimate.transaction.utxo_outputs().len(),
        fee_rate: 1000,
    })
}

#[tauri::command]
pub async fn estimate_validator_unstake_fee(
    state: State<'_, AppState>,
    address: String,
    amount: u64,
) -> Result<FeeEstimate, String> {
    let service = state
        .services
        .get_validator(&address)
        .ok_or_else(|| format!("Validator not found: {}", address))?;

    let validator_pkh = xtal::address_format::parse_address_input(&address)
        .map_err(|e| format!("Invalid address: {}", e))?;
    let (_, mature_stake) = collect_mature_stake_utxos(&state, &validator_pkh);

    if amount > mature_stake {
        return Err(format!(
            "Insufficient withdrawable stake. Requested: {} shards, available withdrawable stake: {} shards. \
             Some of your stake is still locked or immature and cannot be unstaked yet.",
            amount, mature_stake
        ));
    }

    let estimate = service
        .estimate_unstake_funds(amount)
        .map_err(|e| format!("Failed to estimate unstake fee: {}", e))?;

    Ok(FeeEstimate {
        fee: estimate.fee,
        tx_size: estimate.tx_size,
        input_count: estimate.selected_inputs.len(),
        output_count: estimate.transaction.utxo_outputs().len(),
        fee_rate: 1000,
    })
}

/// Stake funds to validator contract
/// Amount is in shards
#[tauri::command]
pub async fn validator_stake(
    state: State<'_, AppState>,
    address: String,
    amount: u64, // In shards
) -> Result<String, String> {
    let service = state
        .services
        .get_validator(&address)
        .ok_or_else(|| format!("Validator not found: {}", address))?;

    // Use the ValidatorProduction trait's stake_to_contract method
    let tx_hash = service
        .stake_to_contract(None, amount)
        .map_err(|e| format!("Failed to stake: {}", e))?;

    Ok(hex::encode(tx_hash))
}

/// Unstake funds from validator
/// Amount is in shards
/// Only withdrawable stake outputs are used for unstaking.
/// Stake still under its script lock or coinbase maturity window is excluded.
#[tauri::command]
pub async fn validator_unstake(
    state: State<'_, AppState>,
    address: String,
    amount: u64, // In shards
) -> Result<String, String> {
    let service = state
        .services
        .get_validator(&address)
        .ok_or_else(|| format!("Validator not found: {}", address))?;

    let validator_pkh = xtal::address_format::parse_address_input(&address)
        .map_err(|e| format!("Invalid address: {}", e))?;
    let (_, mature_stake) = collect_mature_stake_utxos(&state, &validator_pkh);

    // Validate: the requested amount must not exceed withdrawable stake
    if amount > mature_stake {
        return Err(format!(
            "Insufficient withdrawable stake. Requested: {} shards, available withdrawable stake: {} shards. \
             Some of your stake is still locked or immature and cannot be unstaked yet.",
            amount, mature_stake
        ));
    }

    // Use the ValidatorProduction trait's unstake_funds method
    // At this point, amount <= withdrawable stake, so only eligible outputs will be consumed
    let tx_hash = service
        .unstake_funds(amount)
        .map_err(|e| format!("Failed to unstake: {}", e))?;

    Ok(hex::encode(tx_hash))
}

/// Helper function to get emoji for fruit type
fn fruit_to_emoji(fruit_type: FruitType) -> String {
    match fruit_type {
        FruitType::Apple => "🍎".to_string(),
        FruitType::Orange => "🍊".to_string(),
        FruitType::Pear => "🍐".to_string(),
        FruitType::Peach => "🍑".to_string(),
        FruitType::Grape => "🍇".to_string(),
        FruitType::Strawberry => "🍓".to_string(),
        FruitType::Pineapple => "🍍".to_string(),
        FruitType::Watermelon => "🍉".to_string(),
        FruitType::Kiwi => "🥝".to_string(),
    }
}

// ============================================================================
// Validator Wallet Management
// ============================================================================

/// Result of creating a validator wallet
#[derive(Debug, Clone, Serialize)]
pub struct ValidatorWalletCreationResult {
    pub wallet_name: String,
    pub mnemonic: Vec<String>,
    pub address: String,
    /// Deprecated compatibility field. Master seed is no longer exported.
    pub master_seed: Option<String>,
}

/// Summary of a validator wallet for listing
#[derive(Debug, Clone, Serialize)]
pub struct ValidatorWalletSummary {
    pub name: String,
    pub address: String,
    pub wallet_type: String,
}

/// Create a new standalone validator wallet
///
/// This creates a validator-type wallet (separate from normal wallets)
/// and returns the mnemonic for backup.
#[tauri::command]
pub async fn create_validator_wallet(
    state: State<'_, AppState>,
    wallet_name: String,
    password: String,
) -> Result<ValidatorWalletCreationResult, String> {
    log::info!("create_validator_wallet called with name: {}", wallet_name);

    // Get network type from the node's services
    let network_type = state.services.network_type();

    // Create a wallet manager for this operation
    let wallet_manager = WalletManager::new(network_type)
        .map_err(|e| format!("Failed to create wallet manager: {}", e))?;

    // Create a validator wallet (not a normal wallet)
    let result = wallet_manager
        .create_validator_wallet(&wallet_name, &password)
        .map_err(|e| format!("Failed to create validator wallet: {}", e))?;

    log::info!("Validator wallet created: {}", result.primary_address);

    // Split mnemonic into words
    let mnemonic_words: Vec<String> = result
        .mnemonic
        .split_whitespace()
        .map(String::from)
        .collect();

    Ok(ValidatorWalletCreationResult {
        wallet_name,
        mnemonic: mnemonic_words,
        address: result.primary_address.clone(),
        master_seed: None,
    })
}

/// Import a validator wallet from a mnemonic phrase
///
/// This creates a validator-type wallet from a 12-word recovery phrase
/// and returns the wallet details including the validator address.
#[tauri::command]
pub async fn import_validator_wallet(
    state: State<'_, AppState>,
    wallet_name: String,
    password: String,
    mnemonic: String,
) -> Result<ValidatorWalletCreationResult, String> {
    log::info!("import_validator_wallet called with name: {}", wallet_name);

    let network_type = state.services.network_type();

    let wallet_manager = WalletManager::new(network_type)
        .map_err(|e| format!("Failed to create wallet manager: {}", e))?;

    let result = wallet_from_mnemonic_impl(
        &wallet_manager,
        &wallet_name,
        &password,
        &mnemonic,
        WalletType::Validator,
    )?;

    log::info!("Validator wallet imported: {}", result.primary_address);

    Ok(ValidatorWalletCreationResult {
        wallet_name,
        mnemonic: result.mnemonic.clone(),
        address: result.primary_address.clone(),
        master_seed: None,
    })
}

/// List available validator wallets (not normal wallets)
///
/// Returns only wallets created with WalletType::Validator
#[tauri::command]
pub async fn list_validator_wallets(
    state: State<'_, AppState>,
) -> Result<Vec<ValidatorWalletSummary>, String> {
    // Get network type from the node's services
    let network_type = state.services.network_type();

    // Create a wallet manager for this operation
    let wallet_manager = WalletManager::new(network_type)
        .map_err(|e| format!("Failed to create wallet manager: {}", e))?;

    // List only validator wallets
    let wallets = wallet_manager
        .list_validator_wallets()
        .map_err(|e| format!("Failed to list validator wallets: {}", e))?;

    let summaries: Vec<ValidatorWalletSummary> = wallets
        .into_iter()
        .map(|w| ValidatorWalletSummary {
            name: w.name,
            address: w.validator_address.unwrap_or_default(),
            wallet_type: "validator".to_string(),
        })
        .collect();

    Ok(summaries)
}

// ============================================================================
// Network Statistics and Validator Earnings
// ============================================================================

/// Network-wide validator statistics for dashboard display
#[derive(Debug, Clone, Serialize)]
pub struct NetworkValidatorStats {
    pub current_epoch: u32,
    pub total_staked: u64,
    pub validator_count: usize,
}

/// Get network-wide validator statistics
///
/// Returns current epoch, total staked XTAL, and number of validators.
#[tauri::command]
pub async fn get_network_validator_stats(
    state: State<'_, AppState>,
) -> Result<NetworkValidatorStats, String> {
    let blockchain = state.services.blockchain();
    let current_epoch = blockchain.get_current_epoch();

    // Read from PoS consensus cache (pre-filtered by min_stake_threshold).
    // This matches the WebSocket validator_network_stats source.
    let total_staked = blockchain.pos_consensus.total_stake();
    let validator_count = blockchain.pos_consensus.get_eligible_validator_count();

    Ok(NetworkValidatorStats {
        current_epoch,
        total_staked,
        validator_count,
    })
}

/// Validator earnings information
#[derive(Debug, Clone, Serialize)]
pub struct ValidatorEarnings {
    pub validator_address: String,
    pub total_earned: u64,
    pub leaf_mining: u64,
    pub stem_credits: u64,
    pub fruit_rewards: u64,
    pub coinbase_count: u64,
}

/// Get validator earnings from coinbase rewards
///
/// Scans blockchain history to calculate total earnings for a validator address.
#[tauri::command]
pub async fn get_validator_earnings(
    state: State<'_, AppState>,
    address: String,
) -> Result<ValidatorEarnings, String> {
    use xtal::address_format::parse_address_input;
    use xtal::script::{extract_pkh_from_script, parse_stake_or_unstake_script};
    use xtal::transaction::Transaction;

    // Parse validator address to PKH
    let validator_pkh =
        parse_address_input(&address).map_err(|e| format!("Invalid address: {}", e))?;

    let blockchain = state.services.blockchain();
    let current_height = blockchain.get_current_height();

    let mut total_earned: u64 = 0;
    let mut leaf_mining: u64 = 0;
    let mut stem_credits: u64 = 0;
    let mut fruit_rewards: u64 = 0;
    let mut coinbase_count: u64 = 0;

    // Scan through all blocks
    for height in 0..=current_height {
        if let Ok(Some(block)) = blockchain.get_block_by_height(height) {
            for tx in &block.transactions {
                if let Transaction::Coinbase(coinbase) = tx {
                    let mut found_in_block = false;

                    // Check primary output (leaf miner)
                    if let Some(pkh) = extract_pkh_from_script(&coinbase.output().script_pubkey) {
                        if pkh == validator_pkh {
                            leaf_mining += coinbase.output().amount;
                            total_earned += coinbase.output().amount;
                            found_in_block = true;
                        }
                    }

                    // Check stem outputs (stem work credits)
                    for output in coinbase.stem_outputs() {
                        if let Some(pkh) = extract_pkh_from_script(&output.script_pubkey) {
                            if pkh == validator_pkh {
                                stem_credits += output.amount;
                                total_earned += output.amount;
                                found_in_block = true;
                            }
                        }
                    }

                    // Check fruit outputs (auto-staked validator rewards)
                    for output in coinbase.fruit_outputs() {
                        if let Some(info) = parse_stake_or_unstake_script(&output.script_pubkey) {
                            if info.owner == validator_pkh {
                                fruit_rewards += output.amount;
                                total_earned += output.amount;
                                found_in_block = true;
                            }
                        }
                    }

                    if found_in_block {
                        coinbase_count += 1;
                    }
                }
            }
        }
    }

    Ok(ValidatorEarnings {
        validator_address: address,
        total_earned,
        leaf_mining,
        stem_credits,
        fruit_rewards,
        coinbase_count,
    })
}

// ============================================================================
// Fruit Production Rate Statistics
// ============================================================================

/// Current production statistics for each fruit type.
/// Shows dynamic difficulty (adjusts each epoch) and expected production rates.
#[derive(Debug, Clone, Serialize)]
pub struct FruitProductionStats {
    pub fruit_type: String,
    pub emoji: String,
    pub min_stake: u64,
    pub target_interval_secs: u64,

    // Dynamic difficulty (current epoch)
    pub current_difficulty_bits: u32,
    pub expected_time_secs: u64,
    pub expected_time_label: String,
    pub expected_fruits_per_hour: String,
    pub expected_stems_label: String,
    pub win_probability_label: String,
    pub network_stake_units: u64,

    // Reference difficulty (for comparison)
    pub reference_difficulty_bits: u32,

    // Personalized stats (when validator address is provided)
    pub personal_expected_time_secs: Option<u64>,
    pub personal_expected_time_label: Option<String>,
    pub personal_expected_fruits_per_hour: Option<String>,
    pub personal_expected_stems_label: Option<String>,
    pub personal_win_probability_label: Option<String>,
}

fn recent_stem_attempt_cadence(blockchain: &xtal::blockchain::Blockchain) -> (u64, u64) {
    let leaf_chain = blockchain.get_leaf_chain();
    let latest_idx = leaf_chain.len().saturating_sub(1);
    if latest_idx == 0 {
        return (TARGET_SPACING, u64::from(DEFAULT_STEM_DIFFICULTY_RATIO));
    }

    let intervals = latest_idx.min(LEAVES_PER_EPOCH as usize);
    let start_idx = latest_idx - intervals;
    let start = blockchain.get_block_by_hash(&leaf_chain[start_idx]);
    let end = blockchain.get_block_by_hash(&leaf_chain[latest_idx]);

    let span_secs = match (start, end) {
        (Ok(start), Ok(end)) if end.header.timestamp > start.header.timestamp => {
            end.header.timestamp.saturating_sub(start.header.timestamp)
        }
        _ => TARGET_SPACING,
    };

    (
        span_secs,
        intervals as u64 * u64::from(DEFAULT_STEM_DIFFICULTY_RATIO),
    )
}

/// Get current production statistics for all fruit types.
/// Shows dynamic difficulty (current epoch) and expected production rates.
/// When an address is provided, also calculates personalized expected time
/// based on the validator's effective difficulty (stake-scaled).
#[tauri::command]
pub async fn get_fruit_production_stats(
    state: State<'_, AppState>,
    address: Option<String>,
) -> Result<Vec<FruitProductionStats>, String> {
    let blockchain = state.services.blockchain();
    let current_epoch = blockchain.get_current_epoch();
    let stake_table = blockchain.pos_consensus.validator_stakes.load();
    let (cadence_numerator_secs, cadence_denominator) =
        recent_stem_attempt_cadence(blockchain.as_ref());

    // Look up local validator stake if an address was provided.
    // ValidatorService only represents validators loaded in this GUI process.
    let validator_stake: Option<u64> = if let Some(ref addr) = address {
        state
            .services
            .get_validator(addr)
            .and_then(|service| service.get_status().ok())
            .map(|status| status.stake)
    } else {
        None
    };

    let mut stats = Vec::new();
    for (fruit_type, spec) in get_fruits_by_stake_requirement() {
        // Get CURRENT network difficulty (dynamic, adjusts per epoch)
        let current_difficulty = blockchain
            .get_derived_fruit_difficulty(fruit_type, current_epoch)
            .unwrap_or_else(|_| spec.reference_difficulty());

        // `network_stake_units` (whole threshold-units) is kept for the
        // informational stat field only. The rate itself must NOT floor stake:
        // count validators that meet the threshold and scale the difficulty by
        // their *fractional* stake (the same whole-XTAL accounting as the
        // personal estimate below), then treat the network as one aggregate
        // entrant (units = 1). Flooring here made the sole-staker network rate
        // diverge from that validator's own rate.
        let network_stake_units: u64 = stake_table
            .values()
            .map(|stake| stake.total / spec.min_stake_threshold)
            .sum();
        let qualifying_stake: u64 = stake_table
            .values()
            .map(|stake| stake.total)
            .filter(|total| *total >= spec.min_stake_threshold)
            .sum();
        let network_difficulty = if qualifying_stake >= spec.min_stake_threshold {
            calculate_effective_difficulty(fruit_type, qualifying_stake, current_difficulty)
        } else {
            current_difficulty
        };
        let network_estimate = estimate_production_rate(
            network_difficulty.bits(),
            cadence_numerator_secs,
            cadence_denominator,
            1,
        );

        // Calculate personalized rates from effective difficulty. The
        // active-production budget determines which fruit tasks can run
        // together; each running fruit still uses the validator's full stake in
        // the lottery, matching production and verification.
        let personal_estimate = validator_stake
            .filter(|stake| *stake >= spec.min_stake_threshold)
            .map(|stake| {
                let effective_difficulty =
                    calculate_effective_difficulty(fruit_type, stake, current_difficulty);
                estimate_production_rate(
                    effective_difficulty.bits(),
                    cadence_numerator_secs,
                    cadence_denominator,
                    1,
                )
            });

        stats.push(FruitProductionStats {
            fruit_type: format!("{:?}", fruit_type),
            emoji: fruit_to_emoji(fruit_type),
            min_stake: spec.min_stake_threshold,
            target_interval_secs: spec.target_interval_secs.unwrap_or(60),
            current_difficulty_bits: current_difficulty.bits(),
            expected_time_secs: network_estimate.expected_time_secs,
            expected_time_label: network_estimate.expected_time_label,
            expected_fruits_per_hour: network_estimate.expected_fruits_per_hour,
            expected_stems_label: network_estimate.expected_stems_label,
            win_probability_label: network_estimate.win_probability_label,
            network_stake_units,
            reference_difficulty_bits: spec.reference_difficulty_bits,
            personal_expected_time_secs: personal_estimate
                .as_ref()
                .map(|estimate| estimate.expected_time_secs),
            personal_expected_time_label: personal_estimate
                .as_ref()
                .map(|estimate| estimate.expected_time_label.clone()),
            personal_expected_fruits_per_hour: personal_estimate
                .as_ref()
                .map(|estimate| estimate.expected_fruits_per_hour.clone()),
            personal_expected_stems_label: personal_estimate
                .as_ref()
                .map(|estimate| estimate.expected_stems_label.clone()),
            personal_win_probability_label: personal_estimate
                .map(|estimate| estimate.win_probability_label),
        });
    }

    Ok(stats)
}
