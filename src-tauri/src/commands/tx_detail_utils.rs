//! Shared transaction detail helpers for wallet + explorer commands.

use xtal::shards::Shards;

use xtal::address_format::{format_script_address, format_utxo_address};
use xtal::crypto::hash_public_key;
use xtal::interfaces::ChainDataProvider;
use xtal::script::{
    extract_p2sh_redeem_script, extract_pubkey_from_script_sig, p2sh_script_hash,
    p2sh_script_pubkey, parse_multisig_script, Script,
};
use xtal::transaction::receipt::TransactionReceipt;
use xtal::transaction::{Transaction, TxIn, TxOut, MIN_GAS_PRICE};
use xtal::vm::cage_contract::CAGE_CONTRACT_ADDRESS;

use crate::commands::wallet::{TransactionInput, TransactionOutput};

/// The gas a VM transaction reserves upfront: `gas_limit * gas_price`, or
/// zero when execution is sponsored.
///
/// Checked rather than saturating — `None` reports "we cannot say", which
/// callers render as unknown. A saturated product would be displayed as a
/// `u64::MAX` fee, which is worse than admitting ignorance.
pub fn vm_transaction_fee(tx: &Transaction) -> Option<u64> {
    let sponsored = tx.requests_free_execution();

    let (gas_limit, gas_price) = match tx {
        Transaction::ContractCall(call_tx) => (call_tx.gas_limit, call_tx.gas_price),
        Transaction::ContractDeploy(deploy_tx) => (deploy_tx.gas_limit, deploy_tx.gas_price),
        Transaction::AccountTransfer(transfer_tx) => (transfer_tx.gas_limit, transfer_tx.gas_price),
        _ => return None,
    };

    if sponsored {
        return Some(0);
    }

    gas_limit.checked_mul(gas_price.unwrap_or(MIN_GAS_PRICE))
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
                        .zip(tx_inputs.iter())
                        .map(|(d, inp)| TransactionInput {
                            txid: d.txid,
                            output_index: d.index,
                            address: d.address,
                            amount: Some(d.amount.into()),
                            is_mine: false,
                            // Redeem details aren't persisted; decode them from the
                            // live unlocking script so the P2SH badge survives the
                            // stored fast-path too.
                            redeem_script_type: decode_p2sh_input(&inp.script_sig)
                                .map(|(_, label)| label),
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
            let total_input: u64 = inputs
                .iter()
                .filter_map(|i| i.amount)
                .map(Shards::get)
                .sum();
            let total_output: u64 = outputs.iter().map(|o| o.amount.get()).sum();
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
                amount: cb_tx.output().amount.into(),
                currency: "XTAL".to_string(),
                address: extract_address_from_txout(&cb_tx.output()),
                script_type: "coinbase".to_string(),
                is_mine: false,
            }];
            // Add stem outputs if any
            for (idx, out) in cb_tx.stem_outputs().iter().enumerate() {
                outputs.push(TransactionOutput {
                    index: (idx + 1) as u16,
                    amount: out.amount.into(),
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
                    amount: out.amount.into(),
                    currency: "XTAL".to_string(),
                    address: extract_address_from_txout(out),
                    script_type: "stake".to_string(),
                    is_mine: false,
                });
            }
            let total_output: u64 = outputs.iter().map(|o| o.amount.get()).sum();
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
            let total_input: u64 = inputs
                .iter()
                .filter_map(|i| i.amount)
                .map(Shards::get)
                .sum();
            let total_output: u64 = outputs.iter().map(|o| o.amount.get()).sum();
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
            let total_input: u64 = inputs
                .iter()
                .filter_map(|i| i.amount)
                .map(Shards::get)
                .sum();
            let total_output: u64 = outputs.iter().map(|o| o.amount.get()).sum();
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
                        amount: amount.map(Shards::from),
                        is_mine: false,
                        redeem_script_type: None,
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
                amount: at_tx.amount.into(),
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
                amount: vw_tx.output.amount.into(),
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

/// Decode P2SH redeem-script details from a spending input's `script_sig`.
///
/// Returns `(p2sh_address, redeem_label)` when the unlocking script carries a
/// redeem script that classifies as a recognized type. Requiring a recognized
/// redeem type doubles as the P2SH guard: a plain P2PKH/stake `<sig> <pubkey>`
/// unlocking script's final push (a 32-byte pubkey) does not parse as a known
/// script, so it is never mistaken for a P2SH spend.
fn decode_p2sh_input(script_sig: &Script) -> Option<(String, String)> {
    let redeem = extract_p2sh_redeem_script(script_sig)?;
    let label = redeem_script_label(&redeem)?;
    let address = format_script_address(&p2sh_script_pubkey(&p2sh_script_hash(&redeem)))?;
    Some((address, label))
}

/// Human-readable label for a recognized P2SH redeem script, or `None` when the
/// script is not a type we surface (which also rejects non-P2SH unlocking data).
fn redeem_script_label(redeem: &Script) -> Option<String> {
    // classify_type() is the unified discriminant; only the multisig arm needs the extra
    // m-of-n detail layered on via parse_multisig_script.
    match redeem.classify_type() {
        "unknown" => None,
        "multisig" => parse_multisig_script(redeem)
            .map(|info| format!("{}-of-{} multisig", info.threshold, info.total_signers)),
        other => Some(other.to_string()),
    }
}

/// Extract input details from TxIn array
pub fn extract_inputs(
    tx_inputs: &[TxIn],
    blockchain: &xtal::blockchain::Blockchain,
) -> Result<Vec<TransactionInput>, String> {
    let mut inputs = Vec::new();
    for inp in tx_inputs {
        // Decode any P2SH redeem script in the unlocking script up front: it both labels
        // the input and lets us reconstruct the address when the referenced output is gone.
        let p2sh = decode_p2sh_input(&inp.script_sig);

        // Resolve the referenced output from the live UTXO set first, then the source
        // transaction once it has been spent.
        let (amount, resolved_address) =
            resolve_referenced_utxo(blockchain, &inp.tx_id, inp.output_index);

        // Address precedence: resolved output -> reconstructed P2SH -> embedded pubkey.
        let address = resolved_address
            .or_else(|| p2sh.as_ref().map(|(addr, _)| addr.clone()))
            .or_else(|| {
                extract_pubkey_from_script_sig(&inp.script_sig)
                    .map(|vk| format_utxo_address(&hash_public_key(&vk)))
            });

        inputs.push(TransactionInput {
            txid: hex::encode(inp.tx_id),
            output_index: inp.output_index,
            address,
            amount: amount.map(Shards::from),
            is_mine: false,
            redeem_script_type: p2sh.map(|(_, label)| label),
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
        amount: Some(consumed.amount.into()),
        is_mine: false,
        redeem_script_type: None,
    };
    Some((input, consumed.amount))
}

fn resolve_referenced_utxo(
    blockchain: &xtal::blockchain::Blockchain,
    txid: &[u8; 32],
    output_index: u16,
) -> (Option<u64>, Option<String>) {
    if let Ok(Some(utxo)) = blockchain.get_utxo(txid, output_index) {
        let addr = format_script_address(&utxo.script_pubkey);
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
        let addr = format_script_address(&output.script_pubkey);
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
        .map(|(idx, out)| {
            // A standard transaction can pay to a P2SH (e.g. multisig) address, so label
            // those correctly instead of inheriting the transaction-level default.
            // classify_type() is the single script classifier reused for both outputs and
            // redeem scripts; we use it only to detect the structural P2SH exception so the
            // tx-context default (coinbase/account/stake/…) still passes through otherwise.
            let resolved_type = if out.script_pubkey.classify_type() == "p2sh" {
                "p2sh"
            } else {
                script_type
            };
            TransactionOutput {
                index: idx as u16,
                amount: out.amount.into(),
                currency: format!("{:?}", out.currency),
                address: extract_address_from_txout(out),
                script_type: resolved_type.to_string(),
                is_mine: false,
            }
        })
        .collect()
}

/// Extract address from a TxOut
pub fn extract_address_from_txout(out: &TxOut) -> Option<String> {
    format_script_address(&out.script_pubkey)
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
        let mut receipt =
            TransactionReceipt::new([1u8; 32], 10, FruitType::Apple, 0, TxStatus::Success, 5_000);
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
        assert_eq!(input.amount, Some(Shards(12_345_678)));
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
