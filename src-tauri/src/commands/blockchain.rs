//! Blockchain query commands
//!
//! Commands for querying blockchain state, blocks, and sync status.

use std::collections::{HashMap, HashSet};

use serde::Serialize;
use tauri::State;
use xtal::address::encode_pkh;
use xtal::blockchain::{Block, BlockType, Blockchain};
use xtal::consensus::validation::COINBASE_MATURITY;
use xtal::crypto::hash_public_key;
use xtal::fruit::core::FruitTx;
use xtal::fruit::FruitHeaderWithSig;
use xtal::interfaces::ChainDataProvider;
use xtal::node::sync::SyncState;
use xtal::storage::block_io::calculate_block_size;
use xtal::transaction::receipt::TransactionReceipt;
use xtal::transaction::Transaction;

use crate::commands::tx_detail_utils::extract_transaction_details;
use crate::commands::wallet::{
    build_transaction_detail_response, MaturityStatus, TransactionDetail, TransactionReceiptDetail,
};
use crate::state::AppState;

/// Best leaf info for the explorer hero card
#[derive(Debug, Clone, Serialize)]
pub struct BestLeafInfo {
    pub hash: String,
    pub leaf_height: u64,
    pub stem_height: u64,
    pub stems_since_last_leaf: u64,
    pub timestamp: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state_root: Option<String>,
    pub difficulty: u32,
    pub miner: String,
    pub tx_count: usize,
    pub froot: String,
}

/// Blockchain information response
#[derive(Debug, Clone, Serialize)]
pub struct BlockchainInfo {
    pub leaf_height: u64,
    pub stem_height: u64,
    pub stems_since_last_leaf: u64,
    pub best_block_hash: String,
    pub is_synced: bool,
    pub peer_count: usize,
}

/// Block summary for display
#[derive(Debug, Clone, Serialize)]
pub struct BlockSummary {
    pub hash: String,
    pub height: u64,
    pub leaf_height: u64,
    pub block_type: String,
    pub timestamp: u64,
    pub tx_count: usize,
    pub fruit_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
}

/// Transaction summary for block detail view
#[derive(Debug, Clone, Serialize)]
pub struct BlockTransactionSummary {
    pub txid: String,
    pub tx_type: String,
    pub total_output: u64,
}

/// Fruit summary for stem block detail view
#[derive(Debug, Clone, Serialize)]
pub struct FruitSummary {
    pub hash: String,
    pub fruit_type: String,
    pub validator: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tx_count: Option<usize>,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct FruitTransactionSummary {
    pub txid: String,
    pub tx_type: String,
    pub vm_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub amount: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fee: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to: Option<String>,
    pub nonce: u64,
}

/// Block detail payload for explorer
#[derive(Debug, Clone, Serialize)]
pub struct BlockDetail {
    pub hash: String,
    pub height: u64,
    pub leaf_height: u64,
    pub block_type: String,
    pub timestamp: u64,
    pub tx_count: usize,
    pub fruit_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub previous_hash: Option<String>,
    pub version: u32,
    pub nonce: u32,
    pub difficulty: u32,
    pub froot: String,
    pub merkle_root: String,
    pub miner: String,
    pub transactions: Vec<BlockTransactionSummary>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub fruits: Vec<FruitSummary>,
}

fn build_leaf_index(blockchain: &Blockchain) -> HashMap<[u8; 32], u64> {
    let leaf_chain = blockchain.get_leaf_chain();
    let mut index = HashMap::with_capacity(leaf_chain.len());
    for (idx, hash) in leaf_chain.iter().enumerate() {
        index.insert(*hash, idx as u64);
    }
    index
}

fn resolve_leaf_height(
    blockchain: &Blockchain,
    block: &Block,
    leaf_index: &HashMap<[u8; 32], u64>,
) -> Option<u64> {
    if block.is_leaf() {
        return leaf_index.get(&block.hash()).copied();
    }

    let mut cursor = block.header.previous_block_hash;
    let mut guard = 0u64;

    while guard < 10_000 {
        if let Some(height) = leaf_index.get(&cursor) {
            return Some(*height);
        }

        match blockchain.get_block_by_hash(&cursor) {
            Ok(prev) => {
                if prev.is_leaf() {
                    return leaf_index.get(&prev.hash()).copied();
                }
                cursor = prev.header.previous_block_hash;
            }
            Err(_) => return None,
        }

        guard += 1;
    }

    None
}

fn block_type_label(block_type: BlockType) -> &'static str {
    match block_type {
        BlockType::Stem => "Stem",
        BlockType::Leaf => "Leaf",
    }
}

fn summarize_block(
    blockchain: &Blockchain,
    block: &Block,
    height: u64,
    leaf_index: &HashMap<[u8; 32], u64>,
) -> BlockSummary {
    let leaf_height = resolve_leaf_height(blockchain, block, leaf_index).unwrap_or(0);
    let size = calculate_block_size(block).ok();

    BlockSummary {
        hash: hex::encode(block.hash()),
        height,
        leaf_height,
        block_type: block_type_label(block.block_type).to_string(),
        timestamp: block.header.timestamp,
        tx_count: block.transactions.len(),
        fruit_count: block.fruit_hashes.len(),
        size,
    }
}

fn tx_type_label(tx: &Transaction) -> &'static str {
    match tx {
        Transaction::Standard(_) => "standard",
        Transaction::Coinbase(_) => "coinbase",
        Transaction::ContractCall(_) => "contract_call",
        Transaction::ContractDeploy(_) => "contract_deploy",
        Transaction::Stake(_) => "stake",
        Transaction::Unstake(_) => "unstake",
        Transaction::AccountTransfer(_) => "account_transfer",
        Transaction::VmWithdrawal(_) => "vm_withdrawal",
    }
}

fn tx_type_has_maturity(tx_type: &str) -> bool {
    matches!(tx_type, "coinbase" | "vm_withdrawal")
}

fn tx_total_output(tx: &Transaction) -> u64 {
    match tx {
        Transaction::Standard(inner) => inner
            .outputs
            .iter()
            .fold(0u64, |acc, out| acc.saturating_add(out.amount)),
        Transaction::Stake(inner) => inner
            .outputs
            .iter()
            .fold(0u64, |acc, out| acc.saturating_add(out.amount)),
        Transaction::Unstake(inner) => inner
            .outputs
            .iter()
            .fold(0u64, |acc, out| acc.saturating_add(out.amount)),
        Transaction::Coinbase(inner) => {
            let mut total = inner.output().amount;
            for output in inner.stem_outputs() {
                total = total.saturating_add(output.amount);
            }
            for output in inner.fruit_outputs() {
                total = total.saturating_add(output.amount);
            }
            total
        }
        Transaction::ContractCall(inner) => inner.value,
        Transaction::ContractDeploy(_) => 0,
        Transaction::AccountTransfer(inner) => inner.amount,
        Transaction::VmWithdrawal(inner) => inner.output.amount,
    }
}

fn summarize_tx(tx: &Transaction) -> BlockTransactionSummary {
    let txid = tx
        .id()
        .map(hex::encode)
        .unwrap_or_else(|_| "unknown".to_string());

    BlockTransactionSummary {
        txid,
        tx_type: tx_type_label(tx).to_string(),
        total_output: tx_total_output(tx),
    }
}

fn summarize_fruit(hash: &[u8; 32], fruit: &xtal::fruit::Fruit) -> FruitSummary {
    FruitSummary {
        hash: hex::encode(hash),
        fruit_type: fruit.fruit_type().to_string(),
        validator: hex::encode(hash_public_key(&fruit.header.producer_key.0)),
        tx_count: Some(fruit.transactions.len()),
        timestamp: fruit.header.timestamp,
    }
}

fn summarize_fruit_header(hash: &[u8; 32], header: &FruitHeaderWithSig) -> FruitSummary {
    FruitSummary {
        hash: hex::encode(hash),
        fruit_type: header.fruit_type().to_string(),
        validator: hex::encode(hash_public_key(&header.header.producer_key.0)),
        tx_count: None,
        timestamp: header.header.timestamp,
    }
}

fn lookup_live_stem_receipt(
    blockchain: &Blockchain,
    tx_hash: &[u8; 32],
) -> Option<TransactionReceipt> {
    for ((stem_hash, _nonce), _) in blockchain.get_stems_since_last_leaf() {
        let Some(metadata) = blockchain.get_stem_metadata(&stem_hash) else {
            continue;
        };

        for receipts in metadata.block_receipts.receipts_by_fruit.values() {
            if let Some(receipt) = receipts.iter().find(|receipt| receipt.tx_hash == *tx_hash) {
                return Some(receipt.clone());
            }
        }
    }

    None
}

fn parse_hash(hash: &str) -> Result<[u8; 32], String> {
    let cleaned = hash.trim_start_matches("0x");
    let bytes = hex::decode(cleaned).map_err(|e| format!("Invalid hash hex: {}", e))?;
    let arr: [u8; 32] = bytes
        .try_into()
        .map_err(|_| "Invalid hash length".to_string())?;
    Ok(arr)
}

/// Get current blockchain information
#[tauri::command]
pub async fn get_blockchain_info(state: State<'_, AppState>) -> Result<BlockchainInfo, String> {
    let blockchain = state.services.blockchain();

    let (tip_hash, leaf_height) = blockchain.get_chain_tip_hash_and_height();

    let best_hash = tip_hash
        .map(|h| hex::encode(h))
        .unwrap_or_else(|| "unknown".to_string());

    // Get stem height (total block height including stems)
    let stem_height = blockchain.get_current_height();

    // Get count of stems since last leaf
    let stems_since_last_leaf = blockchain.get_stems_since_last_leaf().len() as u64;

    let sync_state = state.sync_state();
    let is_synced = matches!(sync_state, SyncState::Synced);

    let peer_count = state.services.peer_manager.peer_count();

    Ok(BlockchainInfo {
        leaf_height,
        stem_height,
        stems_since_last_leaf,
        best_block_hash: best_hash,
        is_synced,
        peer_count,
    })
}

/// Get best leaf info for the explorer hero card
#[tauri::command]
pub async fn get_best_leaf_info(
    state: State<'_, AppState>,
) -> Result<Option<BestLeafInfo>, String> {
    let blockchain = state.services.blockchain();

    let last_leaf = match blockchain.get_last_leaf() {
        Ok(Some(leaf)) => leaf,
        Ok(None) => return Ok(None),
        Err(e) => return Err(format!("Failed to get last leaf: {}", e)),
    };

    let leaf_height = blockchain.get_current_leaf_height();
    let stem_height = blockchain.get_current_height();
    let stems_since_last_leaf = blockchain.get_stems_since_last_leaf().len() as u64;

    let state_root = Some(hex::encode(blockchain.get_current_state_root()));

    Ok(Some(BestLeafInfo {
        hash: hex::encode(last_leaf.hash()),
        leaf_height,
        stem_height,
        stems_since_last_leaf,
        timestamp: last_leaf.header.timestamp,
        state_root,
        difficulty: last_leaf.header.difficulty.bits(),
        miner: encode_pkh(&last_leaf.header.miner_pkh),
        tx_count: last_leaf.transactions.len(),
        froot: hex::encode(last_leaf.header.froot),
    }))
}

/// Get current sync state
#[tauri::command]
pub async fn get_sync_state(state: State<'_, AppState>) -> Result<SyncState, String> {
    Ok(state.sync_state())
}

/// Get recent blocks (newest first)
#[tauri::command]
pub async fn get_recent_blocks(
    state: State<'_, AppState>,
    limit: usize,
    offset: usize,
) -> Result<Vec<BlockSummary>, String> {
    if limit == 0 {
        return Ok(vec![]);
    }

    let blockchain = state.services.blockchain();
    let leaf_index = build_leaf_index(&blockchain);
    let tip_height = blockchain.get_current_height();
    let mut results = Vec::with_capacity(limit);

    let mut current = tip_height.saturating_sub(offset as u64);

    loop {
        match blockchain.get_block_by_height(current) {
            Ok(Some(block)) => {
                results.push(summarize_block(&blockchain, &block, current, &leaf_index));
                if results.len() >= limit {
                    break;
                }
            }
            Ok(None) => {}
            Err(e) => {
                return Err(format!("Failed to load block at height {}: {}", current, e));
            }
        }

        if current == 0 {
            break;
        }
        current = current.saturating_sub(1);
    }

    Ok(results)
}

/// Get block by total height (stem + leaf)
#[tauri::command]
pub async fn get_block_by_height(
    state: State<'_, AppState>,
    height: u64,
) -> Result<Option<BlockSummary>, String> {
    let blockchain = state.services.blockchain();
    let leaf_index = build_leaf_index(&blockchain);

    match blockchain.get_block_by_height(height) {
        Ok(Some(block)) => Ok(Some(summarize_block(
            &blockchain,
            &block,
            height,
            &leaf_index,
        ))),
        Ok(None) => Ok(None),
        Err(e) => Err(format!("Failed to get block: {}", e)),
    }
}

/// Get block by hash (summary)
#[tauri::command]
pub async fn get_block(
    state: State<'_, AppState>,
    hash: String,
) -> Result<Option<BlockSummary>, String> {
    let blockchain = state.services.blockchain();
    let leaf_index = build_leaf_index(&blockchain);
    let cleaned = hash.trim_start_matches("0x").to_string();
    let hash_bytes = parse_hash(&cleaned)?;

    match blockchain.get_block(&cleaned) {
        Ok(Some(block)) => {
            let height = blockchain
                .get_block_height_by_hash(&hash_bytes)
                .map_err(|e| format!("Failed to get block height: {}", e))?;
            Ok(Some(summarize_block(
                &blockchain,
                &block,
                height,
                &leaf_index,
            )))
        }
        Ok(None) => Ok(None),
        Err(e) => Err(format!("Failed to get block: {}", e)),
    }
}

/// Get block detail by hash
#[tauri::command]
pub async fn get_block_detail(
    state: State<'_, AppState>,
    hash: String,
) -> Result<Option<BlockDetail>, String> {
    let blockchain = state.services.blockchain();
    let leaf_index = build_leaf_index(&blockchain);
    let cleaned = hash.trim_start_matches("0x").to_string();
    let hash_bytes = parse_hash(&cleaned)?;

    let block = match blockchain.get_block(&cleaned) {
        Ok(Some(block)) => block,
        Ok(None) => return Ok(None),
        Err(e) => return Err(format!("Failed to get block: {}", e)),
    };

    let height = blockchain
        .get_block_height_by_hash(&hash_bytes)
        .map_err(|e| format!("Failed to get block height: {}", e))?;

    let leaf_height = resolve_leaf_height(&blockchain, &block, &leaf_index).unwrap_or(0);
    let size = calculate_block_size(&block).ok();
    let previous_hash = Some(hex::encode(block.header.previous_block_hash));

    let transactions = block
        .transactions
        .iter()
        .map(summarize_tx)
        .collect::<Vec<_>>();

    let fruits = if block.block_type == BlockType::Stem {
        block
            .fruit_hashes
            .iter()
            .filter_map(|h| {
                if let Some(fruit) = blockchain.get_fruit_by_hash(h, None) {
                    return Some(summarize_fruit(h, &fruit));
                }
                if let Ok(Some(hdr)) = blockchain.get_fruit_header_at(leaf_height, h) {
                    return Some(summarize_fruit_header(h, &hdr));
                }
                None
            })
            .collect()
    } else {
        Vec::new()
    };

    Ok(Some(BlockDetail {
        hash: hex::encode(block.hash()),
        height,
        leaf_height,
        block_type: block_type_label(block.block_type).to_string(),
        timestamp: block.header.timestamp,
        tx_count: block.transactions.len(),
        fruit_count: block.fruit_hashes.len(),
        size,
        previous_hash,
        version: block.header.version,
        nonce: block.header.nonce,
        difficulty: block.header.difficulty.bits(),
        froot: hex::encode(block.header.froot),
        merkle_root: hex::encode(block.header.merkle_root),
        miner: encode_pkh(&block.header.miner_pkh),
        transactions,
        fruits,
    }))
}

/// Get detailed transaction information for the explorer (no wallet required)
#[tauri::command]
pub async fn get_transaction_detail_explorer(
    state: State<'_, AppState>,
    txid: String,
    block_hash: Option<String>,
) -> Result<Option<TransactionDetail>, String> {
    let blockchain = state.services.blockchain();
    let leaf_index = build_leaf_index(&blockchain);
    let txid_bytes = parse_hash(&txid)?;
    let txid_hex = hex::encode(txid_bytes);

    let (block, block_hash_hex, leaf_height_opt) = if let Some(hash) = block_hash {
        let cleaned = hash.trim_start_matches("0x").to_string();
        let block = match blockchain.get_block(&cleaned) {
            Ok(Some(block)) => block,
            Ok(None) => return Ok(None),
            Err(e) => return Err(format!("Failed to get block: {}", e)),
        };
        let leaf_height = resolve_leaf_height(&blockchain, &block, &leaf_index);
        (block, cleaned, leaf_height)
    } else {
        let idx = blockchain
            .get_transaction_index(&txid_bytes)
            .map_err(|e| format!("Failed to lookup transaction index: {}", e))?;
        let idx = match idx {
            Some(idx) => idx,
            None => return Ok(None),
        };
        let block = blockchain
            .get_block_by_hash_arc(&idx.block_hash)
            .map_err(|e| format!("Failed to load block: {}", e))?;
        let leaf_height =
            resolve_leaf_height(&blockchain, &block, &leaf_index).or(Some(idx.block_height));
        (block, hex::encode(idx.block_hash), leaf_height)
    };

    let mut tx = block
        .transactions
        .iter()
        .find_map(|tx: &Transaction| match tx.id() {
            Ok(id) if id == txid_bytes => Some(tx.clone()),
            _ => None,
        });

    if tx.is_none() {
        for fruit_hash in &block.fruit_hashes {
            let Some(fruit) = blockchain.get_fruit_by_hash(fruit_hash, None) else {
                continue;
            };

            if let Some(fruit_tx) = fruit
                .transactions
                .iter()
                .find(|fruit_tx| fruit_tx.hash() == txid_bytes)
            {
                tx = Some(match fruit_tx {
                    FruitTx::AccountTransfer(tx) => Transaction::AccountTransfer(tx.clone()),
                    FruitTx::ContractCall(tx) => Transaction::ContractCall(tx.clone()),
                    FruitTx::ContractDeploy(tx) => Transaction::ContractDeploy(tx.clone()),
                });
                break;
            }
        }
    }

    let tx = match tx {
        Some(tx) => tx,
        None => return Ok(None),
    };

    let raw_receipt = blockchain
        .get_receipt(&txid_bytes)
        .map_err(|e| format!("Failed to lookup receipt: {}", e))?
        .or_else(|| lookup_live_stem_receipt(&blockchain, &txid_bytes));
    let receipt = raw_receipt.clone().map(TransactionReceiptDetail::from);
    let execution_status = receipt.as_ref().map(|detail| detail.status.clone());

    let (tx_type, inputs, outputs, total_input, total_output, fee) =
        extract_transaction_details(&tx, &blockchain, false, 0, None, raw_receipt.as_ref())?;

    let current_leaf_height = blockchain.get_current_leaf_height();
    let confirmations = leaf_height_opt
        .map(|height| current_leaf_height.saturating_sub(height) as u32 + 1)
        .unwrap_or(0);

    let maturity_status = if tx_type_has_maturity(&tx_type) && leaf_height_opt.is_some() {
        let creation_height = leaf_height_opt.unwrap();
        let age = current_leaf_height.saturating_sub(creation_height);
        let blocks_remaining = COINBASE_MATURITY.saturating_sub(age);
        Some(MaturityStatus {
            is_immature: blocks_remaining > 0,
            blocks_until_mature: blocks_remaining,
            kind: Some(tx_type.clone()),
            phase: Some("locked".to_string()),
        })
    } else {
        None
    };

    Ok(Some(build_transaction_detail_response(
        txid_hex,
        &tx,
        tx_type,
        inputs,
        outputs,
        total_input,
        total_output,
        fee,
        confirmations,
        block.header.timestamp,
        Some(block_hash_hex),
        leaf_height_opt,
        &HashSet::new(),
        execution_status,
        raw_receipt.as_ref(),
        receipt,
        None,
        maturity_status,
    )))
}

/// Fruit detail payload for the fruit detail panel
#[derive(Debug, Clone, Serialize)]
pub struct FruitDetail {
    pub hash: String,
    pub fruit_type: String,
    pub validator: String,
    pub timestamp: u64,
    pub nonce: u32,
    pub stem: String,
    pub merkle_root: String,
    pub difficulty_target: u32,
    pub gas_price: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tx_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transactions: Option<Vec<FruitTransactionSummary>>,
    pub neighbors: Vec<String>,
}

fn summarize_fruit_transaction(tx: &FruitTx) -> FruitTransactionSummary {
    match tx {
        FruitTx::AccountTransfer(at_tx) => FruitTransactionSummary {
            txid: hex::encode(tx.hash()),
            tx_type: "account_transfer".to_string(),
            vm_type: "Account Transfer".to_string(),
            amount: Some(at_tx.amount),
            fee: Some(tx.gas_limit().saturating_mul(tx.gas_price())),
            from: Some(hex::encode(hash_public_key(&at_tx.sender))),
            to: Some(hex::encode(at_tx.recipient)),
            nonce: at_tx.nonce,
        },
        FruitTx::ContractCall(cc_tx) => FruitTransactionSummary {
            txid: hex::encode(tx.hash()),
            tx_type: "contract_call".to_string(),
            vm_type: "Contract Call".to_string(),
            amount: Some(cc_tx.value),
            fee: Some(tx.gas_limit().saturating_mul(tx.gas_price())),
            from: Some(hex::encode(hash_public_key(&cc_tx.caller))),
            to: Some(hex::encode(cc_tx.contract_address)),
            nonce: cc_tx.nonce,
        },
        FruitTx::ContractDeploy(cd_tx) => FruitTransactionSummary {
            txid: hex::encode(tx.hash()),
            tx_type: "contract_deploy".to_string(),
            vm_type: "Contract Deploy".to_string(),
            amount: None,
            fee: Some(tx.gas_limit().saturating_mul(tx.gas_price())),
            from: Some(hex::encode(hash_public_key(&cd_tx.sender))),
            to: cd_tx
                .calculate_contract_address()
                .map(|address| format!("0x{}", hex::encode(address))),
            nonce: cd_tx.nonce,
        },
    }
}

fn build_fruit_detail_from_header(
    hash: &[u8; 32],
    header: &FruitHeaderWithSig,
    tx_count: Option<usize>,
    transactions: Option<Vec<FruitTransactionSummary>>,
) -> FruitDetail {
    FruitDetail {
        hash: hex::encode(hash),
        fruit_type: header.fruit_type().to_string(),
        validator: hex::encode(hash_public_key(&header.header.producer_key.0)),
        timestamp: header.header.timestamp,
        nonce: header.header.nonce,
        stem: hex::encode(header.header.stem),
        merkle_root: hex::encode(header.header.merkle_root),
        difficulty_target: header.header.difficulty_target.bits(),
        gas_price: header.header.gas_price,
        tx_count,
        transactions,
        neighbors: header.neighbors.iter().map(hex::encode).collect(),
    }
}

/// Get detailed fruit information for the fruit detail panel
#[tauri::command]
pub async fn get_fruit_detail(
    state: State<'_, AppState>,
    hash: String,
    block_hash: String,
) -> Result<Option<FruitDetail>, String> {
    let blockchain = state.services.blockchain();
    let leaf_index = build_leaf_index(&blockchain);
    let hash_bytes = parse_hash(&hash)?;

    let cleaned_block = block_hash.trim_start_matches("0x").to_string();
    let block = match blockchain.get_block(&cleaned_block) {
        Ok(Some(block)) => block,
        Ok(None) => return Ok(None),
        Err(e) => return Err(format!("Failed to get block: {}", e)),
    };
    let leaf_height = resolve_leaf_height(&blockchain, &block, &leaf_index).unwrap_or(0);

    // Try full fruit first (has tx_count), using archival-capable lookup.
    if let Some(fruit) = blockchain.get_fruit_by_hash(&hash_bytes, None) {
        if let Ok(hdr) = FruitHeaderWithSig::from_fruit(&fruit) {
            return Ok(Some(build_fruit_detail_from_header(
                &hash_bytes,
                &hdr,
                Some(fruit.transactions.len()),
                Some(
                    fruit
                        .transactions
                        .iter()
                        .map(summarize_fruit_transaction)
                        .collect(),
                ),
            )));
        }
    }

    // Fall back to persisted header
    if let Ok(Some(hdr)) = blockchain.get_fruit_header_at(leaf_height, &hash_bytes) {
        return Ok(Some(build_fruit_detail_from_header(
            &hash_bytes,
            &hdr,
            None,
            None,
        )));
    }

    Ok(None)
}
