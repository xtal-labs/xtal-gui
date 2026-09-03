//! Validator management commands
//!
//! Commands for starting, stopping, and managing PoS validators.
//! Validator wallets are completely separate from user wallets.

use xtal::shards::Shards;

use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;

use primitive_types::U256;
use serde::Serialize;
use tauri::State;

use xtal::address_format::parse_address_input;
use xtal::config::{ValidatorConfig, CONTRACT_ADDRESS};
use xtal::consensus::validation::COINBASE_MATURITY;
use xtal::difficulty::Difficulty;
use xtal::fruit::difficulty::calculate_effective_difficulty;
use xtal::fruit::production::{
    estimate_production_rate_from_probability, exclusive_publish_probability,
    rank_by_profitability, recent_stem_cadence, win_probability, StemCadence,
};
use xtal::fruit::spec::{get_fruits_by_stake_requirement, get_spec};
use xtal::fruit::FruitType;
use xtal::interfaces::validator::ProductionResult;
use xtal::interfaces::{ChainDataProvider, UtxoData};
use xtal::script::{parse_stake_or_unstake_script, TimeLock};
use xtal::transaction::CurrencyType;
use xtal::validator::ValidatorService;
use xtal::vm::cage_contract::CAGE_CONTRACT_ADDRESS;
use xtal::wallet::database::models::WalletType;
use xtal::wallet::WalletManager;

use crate::commands::contract::decode_hex_address;
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
    pub effective_stake: Shards,
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
                    effective_stake: status.stake.into(),
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
    match wallet_manager.current_wallet_id() {
        Some(validator_wallet_id) => {
            start_wallet_sync(&state, wallet_manager.clone(), validator_wallet_id)
        }
        None => log::warn!("Validator wallet has no id; sync not started"),
    }
    state
        .services
        .add_validator(address.clone(), Arc::new(service));

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

    if let Some(wallet_id) = service.wallet_id() {
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
            effective_stake: status.stake.into(),
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

    let result = service
        .start_production(vec![fruit])
        .map_err(|e| format!("Failed to start production: {}", e))?;

    first_failure(&result).map_or(Ok(()), |reason| {
        Err(format!("Failed to start production: {}", reason))
    })
}

/// The reason a single-fruit production request failed, if it did.
///
/// A per-fruit request that reports no failure succeeded — including the case where the
/// fruit was already in the requested state, which the service treats as a no-op rather
/// than an error. That is the right behavior behind a toggle.
fn first_failure(result: &ProductionResult) -> Option<String> {
    result
        .failures
        .first()
        .map(|(fruit, reason)| format!("{:?}: {}", fruit, reason))
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

    let result = service
        .stop_production(vec![fruit])
        .map_err(|e| format!("Failed to stop production: {}", e))?;

    first_failure(&result).map_or(Ok(()), |reason| {
        Err(format!("Failed to stop production: {}", reason))
    })
}

/// Get validator stake balance
#[tauri::command]
pub async fn get_validator_stake(
    state: State<'_, AppState>,
    address: String,
) -> Result<Shards, String> {
    let service = state
        .services
        .get_validator(&address)
        .ok_or_else(|| format!("Validator not found: {}", address))?;

    // Get stake from status instead of private method
    let status = service
        .get_status()
        .map_err(|e| format!("Failed to get status: {}", e))?;

    Ok(status.stake.into())
}

/// Validator balance breakdown
#[derive(Debug, Clone, Serialize)]
pub struct ValidatorBalanceInfo {
    pub validator_address: String,
    pub available_balance: Shards, // UTXO balance (unstaked, available to stake)
    pub withdrawable_stake: Shards, // Staked XTAL available to unstake
    pub mature_stake: Shards,      // Backward-compatible alias for withdrawable_stake
    pub pending_stake: Shards,     // Immature stake not yet effective
    pub total_stake: Shards,       // Mature + pending stake
    pub pending_unstake: Shards,   // Pending unstake (locked)
    pub immature_balance: Shards,  // Non-stake immature balance + unconfirmed incoming
    pub total_value: Shards,       // Sum of all
    /// Stake held on contracts other than the canonical staking contract.
    /// Counted in `total_stake` / `total_value` but never in `withdrawable_stake`,
    /// which stays the canonical-only Unstake cap.
    pub sponsored_stake: Vec<SponsoredStakeEntry>,
}

/// Stake a validator holds on one non-canonical ("sponsored") contract.
#[derive(Debug, Clone, Serialize)]
pub struct SponsoredStakeEntry {
    /// 0x-prefixed lowercase hex contract address
    pub contract: String,
    pub mature: Shards,  // Unstakeable from this contract now
    pub pending: Shards, // Locked or immature on this contract
    pub total: Shards,   // mature + pending
}

/// How one UTXO at the validator address contributes to the stake breakdown.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ValidatorUtxoClass {
    /// Stake output past coinbase maturity and its CSV lock: unstakeable now.
    MatureStake { contract: [u8; 20], amount: u64 },
    /// Stake output still locked or immature.
    PendingStake { contract: [u8; 20], amount: u64 },
    /// Unstake output still inside its CSV lock.
    PendingUnstake { amount: u64 },
    /// Immature coinbase output (not a stake).
    ImmatureCoinbase { amount: u64 },
    /// Spendable outputs, other owners' stakes, matured unstakes.
    Ignore,
}

/// Classify a UTXO the way the balance card and the unstake preconditions both
/// need to see it, so the two can never disagree about what is unstakeable.
fn classify_validator_utxo(
    utxo: &UtxoData,
    validator_pkh: &[u8; 20],
    current_leaf_height: u64,
) -> ValidatorUtxoClass {
    let age = current_leaf_height.saturating_sub(utxo.creation_height);
    let amount = utxo.output.amount;

    let Some(info) = parse_stake_or_unstake_script(&utxo.output.script_pubkey) else {
        if utxo.is_coinbase && age < COINBASE_MATURITY {
            return ValidatorUtxoClass::ImmatureCoinbase { amount };
        }
        return ValidatorUtxoClass::Ignore;
    };

    if info.owner != *validator_pkh {
        return ValidatorUtxoClass::Ignore;
    }

    let csv_locked = matches!(info.lock, TimeLock::Relative(lock) if age < lock);

    if info.is_stake {
        let maturity_locked = (utxo.is_coinbase || utxo.is_withdrawal) && age < COINBASE_MATURITY;
        if maturity_locked || csv_locked {
            ValidatorUtxoClass::PendingStake {
                contract: info.contract,
                amount,
            }
        } else {
            ValidatorUtxoClass::MatureStake {
                contract: info.contract,
                amount,
            }
        }
    } else if csv_locked {
        ValidatorUtxoClass::PendingUnstake { amount }
    } else {
        ValidatorUtxoClass::Ignore
    }
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
    let validator_pkh =
        parse_address_input(&address).map_err(|e| format!("Invalid address: {}", e))?;
    let current_leaf_height = blockchain.get_current_leaf_height();

    // Canonical-contract buckets. `withdrawable_stake` is the default Unstake cap,
    // so it must stay canonical-only; stake on other contracts is reported per
    // contract instead (an unstake tx cannot mix contracts).
    let mut withdrawable_stake: u64 = 0;
    let mut pending_stake: u64 = 0;
    let mut pending_unstake: u64 = 0;
    let mut immature_non_stake_balance: u64 = 0;
    // Non-canonical contract → (mature, pending). BTreeMap keeps UI ordering stable.
    let mut sponsored: BTreeMap<[u8; 20], (u64, u64)> = BTreeMap::new();

    if let Ok(utxos) = blockchain.get_utxos(&validator_pkh) {
        for utxo in &utxos {
            if spent_outpoints.contains(&utxo.outpoint) {
                continue;
            }

            match classify_validator_utxo(utxo, &validator_pkh, current_leaf_height) {
                ValidatorUtxoClass::MatureStake { contract, amount } => {
                    if contract == CONTRACT_ADDRESS {
                        withdrawable_stake += amount;
                    } else {
                        sponsored.entry(contract).or_default().0 += amount;
                    }
                }
                ValidatorUtxoClass::PendingStake { contract, amount } => {
                    if contract == CONTRACT_ADDRESS {
                        pending_stake += amount;
                    } else {
                        sponsored.entry(contract).or_default().1 += amount;
                    }
                }
                ValidatorUtxoClass::PendingUnstake { amount } => pending_unstake += amount,
                ValidatorUtxoClass::ImmatureCoinbase { amount } => {
                    immature_non_stake_balance += amount
                }
                ValidatorUtxoClass::Ignore => {}
            }
        }
    }

    // Source B: unconfirmed incoming funds, derived by the validator service from its
    // own wallet rather than reassembled here from a database handle.
    let pending_incoming = service.get_pending_incoming_balance().unwrap_or(0);

    let sponsored_total: u64 = sponsored
        .values()
        .map(|(mature, pending)| mature + pending)
        .sum();
    let sponsored_stake = sponsored
        .into_iter()
        .map(|(contract, (mature, pending))| SponsoredStakeEntry {
            contract: format!("0x{}", hex::encode(contract)),
            mature: mature.into(),
            pending: pending.into(),
            total: (mature + pending).into(),
        })
        .collect();

    let immature_balance = immature_non_stake_balance + pending_incoming;
    // Consensus counts stake on every contract toward the validator's total, so the
    // wallet view does too.
    let total_stake = withdrawable_stake + pending_stake + sponsored_total;
    let total_value = available_balance + total_stake + pending_unstake + immature_balance;

    Ok(ValidatorBalanceInfo {
        validator_address: address,
        available_balance: available_balance.into(),
        withdrawable_stake: withdrawable_stake.into(),
        mature_stake: withdrawable_stake.into(),
        pending_stake: pending_stake.into(),
        total_stake: total_stake.into(),
        pending_unstake: pending_unstake.into(),
        immature_balance: immature_balance.into(),
        total_value: total_value.into(),
        sponsored_stake,
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
    pub min_stake: Shards, // In shards
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
    pub min_stake: Shards, // In shards
    pub shortfall: Shards, // In shards
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
                min_stake: spec.min_stake_threshold.into(), // Keep in shards
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
                min_stake: min_stake.into(), // Keep in shards
                shortfall: shortfall.into(), // Keep in shards
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

/// Amount of `utxo` that can be unstaked from `contract` right now, if any.
fn mature_stake_amount(
    utxo: &UtxoData,
    validator_pkh: &[u8; 20],
    contract: &[u8; 20],
    current_leaf_height: u64,
) -> Option<u64> {
    match classify_validator_utxo(utxo, validator_pkh, current_leaf_height) {
        ValidatorUtxoClass::MatureStake {
            contract: found,
            amount,
        } if found == *contract => Some(amount),
        _ => None,
    }
}

fn collect_mature_stake_utxos(
    state: &AppState,
    validator_pkh: &[u8; 20],
    contract: &[u8; 20],
) -> (Vec<UtxoData>, u64) {
    let current_leaf_height = state.services.blockchain().get_current_leaf_height();
    let spent = state.services.mempool().spent_outpoints();
    let mut mature_stake = 0u64;
    let mut mature_utxos = Vec::new();

    for utxo in collect_validator_address_utxos(state, validator_pkh) {
        if spent.contains(&utxo.outpoint) {
            continue;
        }
        if let Some(amount) =
            mature_stake_amount(&utxo, validator_pkh, contract, current_leaf_height)
        {
            mature_stake = mature_stake.saturating_add(amount);
            mature_utxos.push(utxo);
        }
    }

    (mature_utxos, mature_stake)
}

/// Decode the contract chosen in the UI into the trait-level `Option<[u8; 20]>`.
/// The canonical contract maps to `None` so explicitly picking the default
/// behaves exactly like not picking one.
fn decode_contract_choice(contract_address: Option<&str>) -> Result<Option<[u8; 20]>, String> {
    let Some(raw) = contract_address.map(str::trim).filter(|s| !s.is_empty()) else {
        return Ok(None);
    };
    let addr = decode_hex_address(raw)?;
    Ok((addr != CONTRACT_ADDRESS).then_some(addr))
}

/// Refuse CAGE as a stake target: consensus treats it as always sponsorable, so
/// stake pointed at it buys nothing the validator does not already have.
fn reject_cage_stake_target(contract: Option<[u8; 20]>) -> Result<(), String> {
    if contract == Some(CAGE_CONTRACT_ADDRESS) {
        return Err(
            "The CAGE contract is always sponsorable; staking to it has no effect".to_string(),
        );
    }
    Ok(())
}

fn insufficient_withdrawable_stake(
    requested: Shards,
    mature_stake: u64,
    contract: Option<[u8; 20]>,
) -> String {
    let scope = contract
        .map(|c| format!(" on contract 0x{}", hex::encode(c)))
        .unwrap_or_default();
    format!(
        "Insufficient withdrawable stake{}. Requested: {} shards, available withdrawable stake: {} shards. \
         Some of your stake is still locked or immature and cannot be unstaked yet.",
        scope, requested, mature_stake
    )
}

#[tauri::command]
pub async fn estimate_validator_stake_fee(
    state: State<'_, AppState>,
    address: String,
    amount: Shards,
    contract_address: Option<String>,
) -> Result<FeeEstimate, String> {
    let service = state
        .services
        .get_validator(&address)
        .ok_or_else(|| format!("Validator not found: {}", address))?;

    let contract = decode_contract_choice(contract_address.as_deref())?;
    reject_cage_stake_target(contract)?;

    let estimate = service
        .estimate_stake_to_contract(contract, amount.get())
        .map_err(|e| format!("Failed to estimate stake fee: {}", e))?;

    Ok(FeeEstimate {
        fee: estimate.fee.into(),
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
    amount: Shards,
    contract_address: Option<String>,
) -> Result<FeeEstimate, String> {
    let service = state
        .services
        .get_validator(&address)
        .ok_or_else(|| format!("Validator not found: {}", address))?;

    let contract = decode_contract_choice(contract_address.as_deref())?;
    let validator_pkh =
        parse_address_input(&address).map_err(|e| format!("Invalid address: {}", e))?;
    let (_, mature_stake) = collect_mature_stake_utxos(
        &state,
        &validator_pkh,
        &contract.unwrap_or(CONTRACT_ADDRESS),
    );

    if amount.get() > mature_stake {
        return Err(insufficient_withdrawable_stake(
            amount,
            mature_stake,
            contract,
        ));
    }

    let estimate = service
        .estimate_unstake_funds(contract, amount.get())
        .map_err(|e| format!("Failed to estimate unstake fee: {}", e))?;

    Ok(FeeEstimate {
        fee: estimate.fee.into(),
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
    amount: Shards,
    contract_address: Option<String>,
) -> Result<String, String> {
    let service = state
        .services
        .get_validator(&address)
        .ok_or_else(|| format!("Validator not found: {}", address))?;

    // `None` targets the canonical staking contract; `Some` sponsors that contract.
    let contract = decode_contract_choice(contract_address.as_deref())?;
    reject_cage_stake_target(contract)?;

    let tx_hash = service
        .stake_to_contract(contract, amount.get())
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
    amount: Shards,
    contract_address: Option<String>,
) -> Result<String, String> {
    let service = state
        .services
        .get_validator(&address)
        .ok_or_else(|| format!("Validator not found: {}", address))?;

    let contract = decode_contract_choice(contract_address.as_deref())?;
    let validator_pkh =
        parse_address_input(&address).map_err(|e| format!("Invalid address: {}", e))?;
    let (_, mature_stake) = collect_mature_stake_utxos(
        &state,
        &validator_pkh,
        &contract.unwrap_or(CONTRACT_ADDRESS),
    );

    // Validate: the requested amount must not exceed withdrawable stake on that contract
    if amount.get() > mature_stake {
        return Err(insufficient_withdrawable_stake(
            amount,
            mature_stake,
            contract,
        ));
    }

    // At this point amount <= withdrawable stake on the chosen contract, so only
    // eligible outputs of that contract will be consumed.
    let tx_hash = service
        .unstake_funds(contract, amount.get())
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
    pub total_staked: Shards,
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
        total_staked: total_staked.into(),
        validator_count,
    })
}

/// Validator earnings information
#[derive(Debug, Clone, Serialize)]
pub struct ValidatorEarnings {
    pub validator_address: String,
    pub total_earned: Shards,
    pub leaf_mining: Shards,
    pub stem_credits: Shards,
    pub fruit_rewards: Shards,
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
        total_earned: total_earned.into(),
        leaf_mining: leaf_mining.into(),
        stem_credits: stem_credits.into(),
        fruit_rewards: fruit_rewards.into(),
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
    pub min_stake: Shards,
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

/// Chain-derived difficulty for one historical epoch.
#[derive(Debug, Clone, Serialize)]
pub struct FruitDifficultyEpochPoint {
    pub epoch: u32,
    pub difficulty_bits: u32,
}

const DEFAULT_DIFFICULTY_HISTORY_EPOCHS: u32 = 24;
const MAX_DIFFICULTY_HISTORY_EPOCHS: u32 = 96;

/// Get a bounded, chronological difficulty history for one fruit type.
///
/// Difficulty is reconstructed from the canonical chain, so the UI can show a
/// useful trend immediately instead of waiting to collect session snapshots.
#[tauri::command]
pub async fn get_fruit_difficulty_history(
    state: State<'_, AppState>,
    fruit_type: String,
    limit: Option<u32>,
) -> Result<Vec<FruitDifficultyEpochPoint>, String> {
    let fruit_type = parse_fruit_type(&fruit_type)?;
    let blockchain = state.services.blockchain();
    let current_epoch = blockchain.get_current_epoch();
    let limit = limit
        .unwrap_or(DEFAULT_DIFFICULTY_HISTORY_EPOCHS)
        .clamp(1, MAX_DIFFICULTY_HISTORY_EPOCHS);
    let first_epoch = current_epoch.saturating_sub(limit - 1);

    (first_epoch..=current_epoch)
        .map(|epoch| {
            blockchain
                .get_derived_fruit_difficulty(fruit_type, epoch)
                .map(|difficulty| FruitDifficultyEpochPoint {
                    epoch,
                    difficulty_bits: difficulty.bits(),
                })
                .map_err(|error| {
                    format!(
                        "Failed to derive {:?} difficulty for epoch {}: {}",
                        fruit_type, epoch, error
                    )
                })
        })
        .collect()
}

/// Get current production statistics for all fruit types.
///
/// Shows dynamic difficulty (current epoch) and expected production rates at the stem
/// cadence measured off the canonical chain. When an address is provided, also calculates
/// the personalized expected time between fruits the validator will actually *publish*:
/// its stake-scaled win chance, discounted by every higher-ranked type it also produces,
/// because `most_profitable_won_fruit` publishes one fruit per stem. Types the validator
/// has not switched on are modeled as if added to its current active set.
#[tauri::command]
pub async fn get_fruit_production_stats(
    state: State<'_, AppState>,
    address: Option<String>,
) -> Result<Vec<FruitProductionStats>, String> {
    let blockchain = state.services.blockchain();
    let current_epoch = blockchain.get_current_epoch();
    let stake_table = blockchain.pos_consensus.validator_stakes_snapshot();
    let StemCadence {
        span_secs: cadence_numerator_secs,
        stems: cadence_denominator,
    } = recent_stem_cadence(blockchain.as_ref());

    // Look up local validator stake and active set if an address was provided.
    // ValidatorService only represents validators loaded in this GUI process.
    let validator_state: Option<(u64, Vec<FruitType>)> = address.as_ref().and_then(|addr| {
        state
            .services
            .get_validator(addr)
            .and_then(|service| service.get_status().ok())
            .map(|status| (status.stake, status.active_productions))
    });

    // One batched derivation for every type: the chain walk behind it keys on the
    // epoch alone. Types the walk cannot derive fall back to their reference difficulty.
    let fruit_specs = get_fruits_by_stake_requirement();
    let requested: Vec<FruitType> = fruit_specs
        .iter()
        .map(|(fruit_type, _)| *fruit_type)
        .collect();
    let derived: HashMap<FruitType, Difficulty> = blockchain
        .get_derived_fruit_difficulties(&requested, current_epoch)
        .map(|pairs| pairs.into_iter().collect())
        .unwrap_or_default();
    let base_difficulty = |fruit_type: FruitType| {
        derived
            .get(&fruit_type)
            .copied()
            .unwrap_or_else(|| get_spec(fruit_type).reference_difficulty())
    };
    let personal_win_probability = |fruit_type: FruitType, stake: u64| -> U256 {
        win_probability(calculate_effective_difficulty(
            fruit_type,
            stake,
            base_difficulty(fruit_type),
        ))
    };

    let mut stats = Vec::new();
    for (fruit_type, spec) in fruit_specs {
        let current_difficulty = base_difficulty(fruit_type);

        // `network_stake_units` (whole threshold-units) is kept for the
        // informational stat field only. The rate itself must NOT floor stake:
        // count validators that meet the threshold and scale the difficulty by
        // their *fractional* stake (the same whole-XTAL accounting as the
        // personal estimate below), then treat the network as one aggregate
        // entrant. Flooring here made the sole-staker network rate diverge from
        // that validator's own rate.
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
        let network_estimate = estimate_production_rate_from_probability(
            win_probability(network_difficulty),
            cadence_numerator_secs,
            cadence_denominator,
        );

        // Personal rate = chance this type is the one fruit published on a stem. Mirror the
        // producer's selector exactly: rank the (modeled) active set by profitability, and
        // discount by every affordable higher-ranked type's own lottery.
        let personal_estimate = validator_state
            .as_ref()
            .filter(|(stake, _)| *stake >= spec.min_stake_threshold)
            .map(|(stake, active)| {
                let mut modeled = active.clone();
                if !modeled.contains(&fruit_type) {
                    modeled.push(fruit_type);
                }
                let higher_ranked: Vec<U256> = rank_by_profitability(&modeled)
                    .into_iter()
                    .take_while(|ranked| *ranked != fruit_type)
                    .filter(|ranked| *stake >= get_spec(*ranked).min_stake_threshold)
                    .map(|ranked| personal_win_probability(ranked, *stake))
                    .collect();
                let publish_probability = exclusive_publish_probability(
                    personal_win_probability(fruit_type, *stake),
                    &higher_ranked,
                );
                estimate_production_rate_from_probability(
                    publish_probability,
                    cadence_numerator_secs,
                    cadence_denominator,
                )
            });

        stats.push(FruitProductionStats {
            fruit_type: format!("{:?}", fruit_type),
            emoji: fruit_to_emoji(fruit_type),
            min_stake: spec.min_stake_threshold.into(),
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

#[cfg(test)]
mod tests {
    use super::{classify_validator_utxo, mature_stake_amount, ValidatorUtxoClass};
    use xtal::config::CONTRACT_ADDRESS;
    use xtal::interfaces::UtxoData;
    use xtal::script::create_stake_script_with_duration;
    use xtal::transaction::{CurrencyType, TxOut};

    const LOCK: u64 = 12;
    const OWNER: [u8; 20] = [1u8; 20];
    const SPONSORED: [u8; 20] = [7u8; 20];
    const AMOUNT: u64 = 5_000_000_000;

    fn stake_utxo(owner: [u8; 20], contract: [u8; 20], creation_height: u64) -> UtxoData {
        UtxoData {
            outpoint: ([0u8; 32], 0),
            output: TxOut {
                amount: AMOUNT,
                currency: CurrencyType::XTAL,
                script_pubkey: create_stake_script_with_duration(&owner, &contract, AMOUNT, LOCK),
            },
            creation_height,
            is_coinbase: false,
            is_withdrawal: false,
            is_staking: true,
        }
    }

    #[test]
    fn classifies_canonical_mature_stake() {
        let utxo = stake_utxo(OWNER, CONTRACT_ADDRESS, 100);
        assert_eq!(
            classify_validator_utxo(&utxo, &OWNER, 100 + LOCK),
            ValidatorUtxoClass::MatureStake {
                contract: CONTRACT_ADDRESS,
                amount: AMOUNT
            }
        );
    }

    #[test]
    fn classifies_sponsored_stake_by_contract_and_lock() {
        let utxo = stake_utxo(OWNER, SPONSORED, 100);
        assert_eq!(
            classify_validator_utxo(&utxo, &OWNER, 100 + LOCK - 1),
            ValidatorUtxoClass::PendingStake {
                contract: SPONSORED,
                amount: AMOUNT
            }
        );
        assert_eq!(
            classify_validator_utxo(&utxo, &OWNER, 100 + LOCK),
            ValidatorUtxoClass::MatureStake {
                contract: SPONSORED,
                amount: AMOUNT
            }
        );
    }

    #[test]
    fn ignores_stake_owned_by_other_pkh() {
        let utxo = stake_utxo([2u8; 20], CONTRACT_ADDRESS, 0);
        assert_eq!(
            classify_validator_utxo(&utxo, &OWNER, LOCK),
            ValidatorUtxoClass::Ignore
        );
    }

    #[test]
    fn mature_stake_amount_is_scoped_to_contract() {
        let canonical = stake_utxo(OWNER, CONTRACT_ADDRESS, 0);
        let sponsored = stake_utxo(OWNER, SPONSORED, 0);

        assert_eq!(
            mature_stake_amount(&canonical, &OWNER, &CONTRACT_ADDRESS, LOCK),
            Some(AMOUNT)
        );
        assert_eq!(
            mature_stake_amount(&canonical, &OWNER, &SPONSORED, LOCK),
            None
        );
        assert_eq!(
            mature_stake_amount(&sponsored, &OWNER, &SPONSORED, LOCK),
            Some(AMOUNT)
        );
        assert_eq!(
            mature_stake_amount(&sponsored, &OWNER, &CONTRACT_ADDRESS, LOCK),
            None
        );
    }
}
