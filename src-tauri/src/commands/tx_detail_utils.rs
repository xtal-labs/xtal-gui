//! Shared transaction detail helpers for wallet + explorer commands.

use xtal::address_format::format_utxo_address;
use xtal::crypto::hash_public_key;
use xtal::interfaces::ChainDataProvider;
use xtal::script::{extract_pkh_from_script, extract_pubkey_from_script_sig};
use xtal::transaction::receipt::TransactionReceipt;
use xtal::transaction::{Transaction, TxIn, TxOut, MIN_GAS_PRICE};
use xtal::vm::cage_contract::CAGE_CONTRACT_ADDRESS;

use crate::commands::wallet::{TransactionInput, TransactionOutput};

pub fn vm_transaction_fee(tx: &Transaction) -> Option<u64> {
    let sponsored = tx.requests_free_execution();

    match tx {
        Transaction::ContractCall(call_tx) => Some(if sponsored {
            0
        } else {
            call_tx
                .gas_limit
                .saturating_mul(call_tx.gas_price.unwrap_or(MIN_GAS_PRICE))
        }),
        Transaction::ContractDeploy(deploy_tx) => Some(if sponsored {
            0
        } else {
            deploy_tx
                .gas_limit
                .saturating_mul(deploy_tx.gas_price.unwrap_or(MIN_GAS_PRICE))
        }),
        Transaction::AccountTransfer(transfer_tx) => Some(if sponsored {
            0
        } else {
            transfer_tx
                .gas_limit
                .saturating_mul(transfer_tx.gas_price.unwrap_or(MIN_GAS_PRICE))
        }),
        _ => None,
    }
}

/// Extract details from a Transaction enum
pub fn extract_transaction_details(
    tx: &Transaction,
    blockchain: &xtal::blockchain::Blockchain,
    is_pending: bool,
    pending_fee: u64,
    stored_input_details: Option<String>,
    raw_receipt: Option<&TransactionReceipt>,
) -> Result<
    (
        String,
        Vec<TransactionInput>,
        Vec<TransactionOutput>,
        u64,
        u64,
        Option<u64>,
    ),
    String,
> {
    // Helper to get inputs - uses stored details if available, falls back to blockchain lookup
    let get_inputs = |tx_inputs: &[TxIn]| -> Result<Vec<TransactionInput>, String> {
        // Try to use stored input details first (self-contained wallet)
        if let Some(ref details_json) = stored_input_details {
            if let Ok(details) = serde_json::from_str::<
                Vec<xtal::wallet::database::models::InputDetail>,
            >(details_json)
            {
                // Only use stored details if all addresses are resolved;
                // stale records may have None addresses from prior bugs
                if details.iter().all(|d| d.address.is_some()) {
                    return Ok(details
                        .into_iter()
                        .map(|d| TransactionInput {
                            txid: d.txid,
                            output_index: d.index,
                            address: d.address,
                            amount: Some(d.amount),
                            is_mine: false,
                        })
                        .collect());
                }
            }
        }
        // Fall back to blockchain lookup
        extract_inputs(tx_inputs, blockchain)
    };

    match tx {
        Transaction::Standard(std_tx) => {
            let inputs = get_inputs(&std_tx.inputs)?;
            let outputs = extract_outputs(&std_tx.outputs, "p2pkh");
            let total_input: u64 = inputs.iter().filter_map(|i| i.amount).sum();
            let total_output: u64 = outputs.iter().map(|o| o.amount).sum();
            let fee = if is_pending {
                Some(pending_fee)
            } else if total_input > 0 {
                Some(total_input.saturating_sub(total_output))
            } else {
                None
            };
            Ok((
                "standard".to_string(),
                inputs,
                outputs,
                total_input,
                total_output,
                fee,
            ))
        }
        Transaction::Coinbase(cb_tx) => {
            // Coinbase has no real inputs
            let inputs = vec![];
            let mut outputs = vec![TransactionOutput {
                index: 0,
                amount: cb_tx.output().amount,
                currency: "XTAL".to_string(),
                address: extract_address_from_txout(&cb_tx.output()),
                script_type: "coinbase".to_string(),
                is_mine: false,
            }];
            // Add stem outputs if any
            for (idx, out) in cb_tx.stem_outputs().iter().enumerate() {
                outputs.push(TransactionOutput {
                    index: (idx + 1) as u16,
                    amount: out.amount,
                    currency: "XTAL".to_string(),
                    address: extract_address_from_txout(out),
                    script_type: "coinbase".to_string(),
                    is_mine: false,
                });
            }
            // Add fruit outputs (auto-staked validator rewards)
            let fruit_start = 1 + cb_tx.stem_outputs().len();
            for (idx, out) in cb_tx.fruit_outputs().iter().enumerate() {
                outputs.push(TransactionOutput {
                    index: (fruit_start + idx) as u16,
                    amount: out.amount,
                    currency: "XTAL".to_string(),
                    address: extract_address_from_txout(out),
                    script_type: "stake".to_string(),
                    is_mine: false,
                });
            }
            let total_output: u64 = outputs.iter().map(|o| o.amount).sum();
            Ok((
                "coinbase".to_string(),
                inputs,
                outputs,
                0,
                total_output,
                None,
            ))
        }
        Transaction::Stake(stake_tx) => {
            let inputs = get_inputs(&stake_tx.inputs)?;
            let outputs = extract_outputs(&stake_tx.outputs, "stake");
            let total_input: u64 = inputs.iter().filter_map(|i| i.amount).sum();
            let total_output: u64 = outputs.iter().map(|o| o.amount).sum();
            let fee = if total_input > 0 {
                Some(total_input.saturating_sub(total_output))
            } else {
                None
            };
            Ok((
                "stake".to_string(),
                inputs,
                outputs,
                total_input,
                total_output,
                fee,
            ))
        }
        Transaction::Unstake(unstake_tx) => {
            let inputs = get_inputs(&unstake_tx.inputs)?;
            let outputs = extract_outputs(&unstake_tx.outputs, "unstake");
            let total_input: u64 = inputs.iter().filter_map(|i| i.amount).sum();
            let total_output: u64 = outputs.iter().map(|o| o.amount).sum();
            let fee = if total_input > 0 {
                Some(total_input.saturating_sub(total_output))
            } else {
                None
            };
            Ok((
                "unstake".to_string(),
                inputs,
                outputs,
                total_input,
                total_output,
                fee,
            ))
        }
        Transaction::ContractCall(cc_tx) => {
            // Check if this is a CAGE deposit (consume_utxo method)
            let is_deposit =
                cc_tx.contract_address == CAGE_CONTRACT_ADDRESS && cc_tx.method == "consume_utxo";

            if is_deposit {
                // Preferred path: read the consumed UTXO straight from the receipt.
                // The receipt is consensus-bound and snapshots {amount, owner, currency}
                // at execution time, so it stays correct even after leaf finalization
                // deletes the underlying UTXO row from RocksDB.
                if let Some((input, total)) = raw_receipt.and_then(vm_deposit_input_from_receipt) {
                    let fee = vm_transaction_fee(tx);
                    return Ok(("vm_deposit".to_string(), vec![input], vec![], total, 0, fee));
                }

                // Fallback path: pre-confirmation (no receipt yet) — parse the consumed
                // UTXO out of the call data and resolve against the live UTXO set.
                // Call data: [declared_anchor_stem_hash:32][tx_id:32][output_index:2][script_sig...]
                if cc_tx.data.len() >= 66 {
                    let consumed_txid: [u8; 32] = cc_tx.data[32..64].try_into().unwrap();
                    let consumed_vout = u16::from_le_bytes([cc_tx.data[64], cc_tx.data[65]]);

                    // Resolve the deposited UTXO even after it has been spent.
                    let (amount, address) =
                        resolve_referenced_utxo(blockchain, &consumed_txid, consumed_vout);

                    let inputs = vec![TransactionInput {
                        txid: hex::encode(consumed_txid),
                        output_index: consumed_vout,
                        address,
                        amount,
                        is_mine: false,
                    }];

                    let fee = vm_transaction_fee(tx);
                    return Ok((
                        "vm_deposit".to_string(),
                        inputs,
                        vec![],
                        amount.unwrap_or(0),
                        0,
                        fee,
                    ));
                }
            }

            // Regular contract call - no UTXO inputs/outputs
            let inputs = vec![];
            let outputs = vec![];
            let fee = vm_transaction_fee(tx);
            Ok(("contract_call".to_string(), inputs, outputs, 0, 0, fee))
        }
        Transaction::ContractDeploy(_cd_tx) => {
            let inputs = vec![];
            let outputs = vec![];
            let fee = vm_transaction_fee(tx);
            Ok(("contract_deploy".to_string(), inputs, outputs, 0, 0, fee))
        }
        Transaction::AccountTransfer(at_tx) => {
            let inputs = vec![];
            let outputs = vec![TransactionOutput {
                index: 0,
                amount: at_tx.amount,
                currency: "XTAL".to_string(),
                address: Some(format!("0x{}", hex::encode(at_tx.recipient.as_bytes()))),
                script_type: "account".to_string(),
                is_mine: false,
            }];
            let fee = vm_transaction_fee(tx);
            Ok((
                "account_transfer".to_string(),
                inputs,
                outputs,
                0,
                at_tx.amount,
                fee,
            ))
        }
        Transaction::VmWithdrawal(vw_tx) => {
            let inputs = vec![];
            let outputs = vec![TransactionOutput {
                index: 0,
                amount: vw_tx.output.amount,
                currency: "XTAL".to_string(),
                address: extract_address_from_txout(&vw_tx.output),
                script_type: "vm_withdrawal".to_string(),
                is_mine: false,
            }];
            Ok((
                "vm_withdrawal".to_string(),
                inputs,
                outputs,
                0,
                vw_tx.output.amount,
                None,
            ))
        }
    }
}

/// Extract input details from TxIn array
pub fn extract_inputs(
    tx_inputs: &[TxIn],
    blockchain: &xtal::blockchain::Blockchain,
) -> Result<Vec<TransactionInput>, String> {
    let mut inputs = Vec::new();
    for inp in tx_inputs {
        // Try to resolve the referenced output from the live UTXO set first,
        // then fall back to the source transaction once it has been spent.
        let (amount, address) =
            match resolve_referenced_utxo(blockchain, &inp.tx_id, inp.output_index) {
                resolved @ (Some(_), _) => resolved,
                resolved @ (_, Some(_)) => resolved,
                _ => {
                    // Last resort: extract address from script_sig (pubkey is embedded in signature)
                    let addr = extract_pubkey_from_script_sig(&inp.script_sig).map(|vk| {
                        let pkh = hash_public_key(&vk);
                        format_utxo_address(&pkh)
                    });
                    (None, addr)
                }
            };

        inputs.push(TransactionInput {
            txid: hex::encode(inp.tx_id),
            output_index: inp.output_index,
            address,
            amount,
            is_mine: false,
        });
    }
    Ok(inputs)
}

/// Build a deposit `TransactionInput` from the first `ConsumedUtxo` in a receipt.
///
/// Returns `(input, total_input_amount)` for the `vm_deposit` view, or `None`
/// when the receipt has no consumed UTXOs (pre-confirmation, non-deposit call).
///
/// Reading from the receipt is the consensus-bound source of truth: the UTXO
/// row is deleted from RocksDB at leaf finalization, but
/// `TransactionReceipt.consumed_utxos` snapshots `{position, amount, owner}`
/// at execution time and is committed via `receipts_root`, so it remains
/// retrievable for the lifetime of the receipt.
fn vm_deposit_input_from_receipt(receipt: &TransactionReceipt) -> Option<(TransactionInput, u64)> {
    let consumed = receipt.consumed_utxos.first()?;
    let input = TransactionInput {
        txid: hex::encode(consumed.position.tx_id),
        output_index: consumed.position.output_index,
        address: Some(format_utxo_address(&consumed.owner)),
        amount: Some(consumed.amount),
        is_mine: false,
    };
    Some((input, consumed.amount))
}

fn resolve_referenced_utxo(
    blockchain: &xtal::blockchain::Blockchain,
    txid: &[u8; 32],
    output_index: u16,
) -> (Option<u64>, Option<String>) {
    if let Ok(Some(utxo)) = blockchain.get_utxo(txid, output_index) {
        let addr =
            extract_pkh_from_script(&utxo.script_pubkey).map(|pkh| format_utxo_address(&pkh));
        return (Some(utxo.amount), addr);
    }

    if let Ok(Some(source_tx)) = blockchain.get_transaction(txid) {
        return extract_output_from_transaction(&source_tx, output_index);
    }

    (None, None)
}

/// Extract amount and address from a transaction's output at the given index
pub fn extract_output_from_transaction(
    tx: &Transaction,
    output_index: u16,
) -> (Option<u64>, Option<String>) {
    let outputs = tx.utxo_outputs();

    if let Some(output) = outputs.get(output_index as usize) {
        let addr =
            extract_pkh_from_script(&output.script_pubkey).map(|pkh| format_utxo_address(&pkh));
        (Some(output.amount), addr)
    } else {
        (None, None)
    }
}

/// Extract output details from TxOut array
pub fn extract_outputs(tx_outputs: &[TxOut], script_type: &str) -> Vec<TransactionOutput> {
    tx_outputs
        .iter()
        .enumerate()
        .map(|(idx, out)| TransactionOutput {
            index: idx as u16,
            amount: out.amount,
            currency: format!("{:?}", out.currency),
            address: extract_address_from_txout(out),
            script_type: script_type.to_string(),
            is_mine: false,
        })
        .collect()
}

/// Extract address from a TxOut
pub fn extract_address_from_txout(out: &TxOut) -> Option<String> {
    extract_pkh_from_script(&out.script_pubkey).map(|pkh| format_utxo_address(&pkh))
}

#[cfg(test)]
mod tests {
    use super::*;
    use xtal::blockchain::processing::utxo_verifier::ConsumedUtxo;
    use xtal::fruit::core::FruitType;
    use xtal::storage::types::UtxoPosition;
    use xtal::transaction::receipt::TxStatus;
    use xtal::transaction::CurrencyType;

    fn make_receipt_with_consumed(consumed: Vec<ConsumedUtxo>) -> TransactionReceipt {
        let mut receipt = TransactionReceipt::new(
            [1u8; 32],
            [2u8; 32],
            10,
            FruitType::Apple,
            0,
            TxStatus::Success,
            5_000,
        );
        receipt.consumed_utxos = consumed;
        receipt
    }

    #[test]
    fn vm_deposit_input_from_receipt_uses_first_consumed_utxo() {
        let owner = [0x11; 20];
        let consumed = ConsumedUtxo {
            position: UtxoPosition {
                tx_id: [0xAB; 32],
                output_index: 4,
            },
            amount: 12_345_678,
            currency: CurrencyType::XTAL,
            owner,
        };
        let receipt = make_receipt_with_consumed(vec![consumed]);

        let (input, total) = vm_deposit_input_from_receipt(&receipt)
            .expect("receipt with one consumed UTXO should yield a deposit input");

        assert_eq!(input.txid, hex::encode([0xAB; 32]));
        assert_eq!(input.output_index, 4);
        assert_eq!(input.amount, Some(12_345_678));
        assert_eq!(
            input.address.as_deref(),
            Some(format_utxo_address(&owner)).as_deref()
        );
        assert!(!input.is_mine);
        assert_eq!(total, 12_345_678);
    }

    #[test]
    fn vm_deposit_input_from_receipt_returns_none_when_empty() {
        let receipt = make_receipt_with_consumed(vec![]);
        assert!(vm_deposit_input_from_receipt(&receipt).is_none());
    }
}
