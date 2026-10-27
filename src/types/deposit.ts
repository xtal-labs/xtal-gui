export type DepositRequest =
  | { mode: "amount"; amount: string; destination: string; fee_rate: number }
  | { mode: "utxo"; txid: string; vout: number };

export interface DepositQuote {
  destination: string;
  deposit_amount: string;
  receive_amount: string;
  bridge_fee: string;
  preparation_fee: string;
  total_debit: string;
  needs_preparation: boolean;
  outpoint: { txid: string; vout: number } | null;
}

export type DepositStatus = "preparing" | "waiting_confirmation" | "waiting_stem" | "needs_unlock" | "depositing" | "confirmed" | "needs_attention" | "cancelled";
export interface DepositOperation {
  operation_id: string;
  request: DepositRequest;
  quote: DepositQuote;
  status: DepositStatus;
  preparation_txid: string | null;
  deposit_txid: string | null;
  outpoint: { txid: string; vout: number };
  error: string | null;
  created_at: number;
  received_amount: string | null;
  can_cancel: boolean;
}
