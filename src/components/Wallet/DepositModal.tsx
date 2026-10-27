import { useEffect, useRef, useState } from "react";
// Keep deposit DTO keys unchanged so a reviewed quote round-trips to Rust/RPC.
import { invoke } from "@tauri-apps/api/core";
import { ArrowUpFromLine, X, Loader2, Lock, CheckCircle, AlertCircle } from "lucide-react";
import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalShell } from "@/components/ui/modal-shell";
import { cn, formatXtalExact, isValidXtalInput, parseXtalToShards, toShards } from "@/lib/utils";
import { tauriCommand } from "@/hooks";
import { useUiStore, useWalletStore } from "@/stores";
import type { WalletUtxo } from "@/types/contract";
import type { DepositOperation, DepositQuote, DepositRequest, DepositStatus } from "@/types/deposit";

interface DepositModalProps { isOpen: boolean; onClose: () => void }
interface VmAddress { address: string; label?: string }
const statusText: Record<DepositStatus, string> = {
  preparing: "Preparing funds", waiting_confirmation: "Waiting for preparation confirmation",
  waiting_stem: "Waiting for the deposit window", needs_unlock: "Unlock to finish depositing",
  depositing: "Deposit submitted · awaiting confirmation", confirmed: "Deposit confirmed",
  needs_attention: "Deposit needs attention", cancelled: "Deposit cancelled",
};
const finished = (op: DepositOperation) => op.status === "confirmed" || op.status === "cancelled";

export function DepositModal({ isOpen, onClose }: DepositModalProps) {
  const { addToast } = useUiStore();
  const { triggerRefresh, walletName } = useWalletStore();
  const [mode, setMode] = useState<"amount" | "utxo">("amount");
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState("");
  const [addresses, setAddresses] = useState<VmAddress[]>([]);
  const [utxos, setUtxos] = useState<WalletUtxo[]>([]);
  const [selected, setSelected] = useState("");
  const [feeRate, setFeeRate] = useState("1000");
  const [review, setReview] = useState<{ request: DepositRequest; quote: DepositQuote; id: string } | null>(null);
  const [operations, setOperations] = useState<DepositOperation[]>([]);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const previousStatuses = useRef(new Map<string, DepositStatus>());

  useEffect(() => {
    const current = ++generation.current;
    setPassword(""); setReview(null); setError(null); setOperations([]); setSelected("");
    setAmount(""); setDestination(""); setBusy(false);
    previousStatuses.current.clear();
    if (!isOpen) return;
    setLoading(true);
    let polling = false;
    const refresh = async () => {
      if (polling) return;
      polling = true;
      try {
        const [coins, accounts, ops] = await Promise.all([
          tauriCommand<WalletUtxo[]>("list_unspent_outputs"),
          tauriCommand<VmAddress[]>("get_vm_addresses"),
          invoke<DepositOperation[]>("list_deposit_operations"),
        ]);
        if (generation.current !== current) return;
        setUtxos(coins); setAddresses(accounts); setOperations(ops);
        setDestination(value => value || accounts[0]?.address || coins.find(c => c.isEligible)?.address || "");
        for (const op of ops) {
          const previous = previousStatuses.current.get(op.operation_id);
          if (previous && previous !== op.status && op.status === "confirmed") {
            addToast({ type: "success", title: "Deposit confirmed", message: `${formatXtalExact(op.received_amount ?? op.quote.receive_amount)} XTAL to your VM account` });
            triggerRefresh();
          }
          previousStatuses.current.set(op.operation_id, op.status);
        }
      } catch (e) { if (generation.current === current) setError(String(e)); }
      finally { polling = false; if (generation.current === current) setLoading(false); }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => { clearInterval(timer); generation.current++; };
  }, [isOpen, walletName, addToast, triggerRefresh]);

  async function run(action: () => Promise<void>) {
    const current = generation.current;
    setBusy(true); setError(null);
    try { await action(); }
    catch (e) { if (generation.current === current) setError(String(e)); }
    finally { if (generation.current === current) { setBusy(false); setPassword(""); } }
  }

  async function prepareReview() {
    const current = generation.current;
    let request: DepositRequest;
    if (mode === "amount") {
      const shards = parseXtalToShards(amount);
      const rate = Number(feeRate);
      if (shards === null || toShards(shards) <= 0n) throw new Error("Enter an amount greater than zero.");
      if (!Number.isSafeInteger(rate) || rate <= 0) throw new Error("Enter a positive whole-number fee rate.");
      if (!destination.trim()) throw new Error("Choose a wallet-owned destination account.");
      request = { mode, amount: String(shards), destination: destination.trim(), fee_rate: rate };
    } else {
      const coin = utxos.find(u => `${u.txid}:${u.vout}` === selected && u.isEligible);
      if (!coin) throw new Error("Select an available UTXO.");
      request = { mode, txid: coin.txid, vout: coin.vout };
    }
    const quote = await invoke<DepositQuote>("estimate_deposit", { request });
    if (generation.current === current) setReview({ request, quote, id: crypto.randomUUID() });
  }

  async function submit() {
    if (!review || !password) return;
    const current = generation.current;
    // Retain this ID if the response is lost: another click returns the same operation.
    const op = await invoke<DepositOperation>("start_deposit", {
      request: { operation_id: review.id, request: review.request, quote: review.quote }, password,
    });
    if (generation.current !== current) return;
    setOperations(ops => [op, ...ops.filter(o => o.operation_id !== op.operation_id)]);
    setReview(null); setAmount(""); setSelected(""); triggerRefresh();
    addToast({ type: "success", title: "Deposit scheduled", message: "You can close this dialog. Progress is saved in your wallet." });
  }

  if (!isOpen) return null;
  const active = operations.filter(op => !finished(op));
  const recent = operations.filter(finished).slice(0, 3);
  const shown = [...active, ...recent];
  return (
    <ModalShell cardClassName="max-w-lg max-h-[90vh] overflow-y-auto" onClose={() => { if (!busy) onClose(); }} title="Deposit to VM">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 font-heading"><ArrowUpFromLine className="h-5 w-5" /> DEPOSIT TO VM</CardTitle>
          <Button variant="ghost" size="icon" aria-label="Close deposit" disabled={busy} onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <CardDescription>Enter an exact amount or deposit a specific UTXO.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && <p role="alert" className="text-sm text-destructive break-words flex gap-2"><AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />{error}</p>}
        {loading ? <p className="flex gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading wallet…</p> : review ? (
          <div className="space-y-4">
            <h3 className="font-heading">REVIEW DEPOSIT</h3>
            <dl className="space-y-2 text-sm bg-muted/50 p-3 chamfered-sm">
              <div className="flex justify-between"><dt>You receive in VM</dt><dd className="font-mono font-semibold">{formatXtalExact(review.quote.receive_amount)} XTAL</dd></div>
              <div className="flex justify-between"><dt>Bridge fee</dt><dd>{formatXtalExact(review.quote.bridge_fee)} XTAL</dd></div>
              <div className="flex justify-between"><dt>Preparation fee</dt><dd>{formatXtalExact(review.quote.preparation_fee)} XTAL</dd></div>
              <div className="flex justify-between border-t border-border pt-2"><dt>Total leaving UTXO balance</dt><dd>{formatXtalExact(review.quote.total_debit)} XTAL</dd></div>
              <div><dt className="text-foreground-muted">Destination account</dt><dd className="font-mono text-xs break-all mt-1">{review.quote.destination}</dd></div>
              {review.quote.outpoint && <div><dt className="text-foreground-muted">Selected UTXO</dt><dd className="font-mono text-xs break-all mt-1">{review.quote.outpoint.txid}:{review.quote.outpoint.vout}</dd></div>}
            </dl>
            <p className="text-xs text-foreground-muted">{review.quote.needs_preparation ? "The wallet will prepare the deposit amount, return change, and wait for confirmation before depositing. This requires two transactions." : "This output can be deposited directly, without a preparation transaction."} Deposit gas is sponsored; the bridge fee is shown above.</p>
            <p className="text-xs text-foreground-muted">Your wallet unlocks for 30 seconds. If it locks before the deposit can be signed, you will be asked to unlock again. Keep the node running to continue automatically.</p>
            <label className="block text-sm">Wallet password<Input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} disabled={busy} className="mt-1" /></label>
            <div className="flex gap-2"><Button variant="outline" disabled={busy} onClick={() => { setReview(null); setPassword(""); setError(null); }}>Back</Button><Button className="flex-1" disabled={busy || !password} onClick={() => void run(submit)}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm deposit"}</Button></div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-2" role="group" aria-label="Deposit method">
              <Button className="flex-1" variant={mode === "amount" ? "default" : "outline"} aria-pressed={mode === "amount"} disabled={busy} onClick={() => setMode("amount")}>Enter amount</Button>
              <Button className="flex-1" variant={mode === "utxo" ? "default" : "outline"} aria-pressed={mode === "utxo"} disabled={busy} onClick={() => setMode("utxo")}>Select UTXO</Button>
            </div>
            {mode === "amount" ? <>
              <label className="block text-sm">Amount to receive in VM (XTAL)<Input inputMode="decimal" value={amount} placeholder="0.00" disabled={busy} onChange={e => { if (isValidXtalInput(e.target.value)) setAmount(e.target.value); }} className="mt-1" /></label>
              <label className="block text-sm">Destination account<Input list="deposit-wallet-accounts" value={destination} onChange={e => setDestination(e.target.value)} disabled={busy} className="mt-1 font-mono text-xs" placeholder="A VM account or receive address in this wallet" /></label>
              <datalist id="deposit-wallet-accounts">{addresses.map(a => <option key={a.address} value={a.address}>{a.label || "Wallet VM account"}</option>)}</datalist>
              <label className="block text-sm">Preparation fee rate (shards/byte)<Input inputMode="numeric" value={feeRate} onChange={e => setFeeRate(e.target.value)} disabled={busy} className="mt-1" /></label>
              <p className="text-xs text-foreground-muted">Coins are selected automatically. Any remainder returns to your wallet as change. An existing exact-size output at this account skips preparation.</p>
            </> : <>
              <div className="space-y-2 max-h-52 overflow-y-auto" role="radiogroup" aria-label="UTXO to deposit">
                {utxos.length === 0 && <p className="text-sm text-foreground-muted">No unspent outputs in this wallet.</p>}
                {utxos.map(u => { const id = `${u.txid}:${u.vout}`; return <button key={id} type="button" role="radio" aria-checked={selected === id} disabled={!u.isEligible || busy} onClick={() => setSelected(id)} className={cn("w-full p-3 text-left border chamfered-sm", selected === id ? "border-primary bg-primary/10" : "border-border", !u.isEligible && "opacity-50")}>
                  <span className="font-mono text-sm">{formatXtalExact(u.amount)} XTAL</span>
                  <span className="block text-xs font-mono break-all mt-1">{u.txid}:{u.vout}</span>
                  <span className="block text-xs text-foreground-muted mt-1">{u.isEligible ? u.address : u.ineligibleReason}</span>
                </button>; })}
              </div>
              <p className="text-xs text-foreground-muted">The whole output is deposited to its owner’s VM account, less the bridge fee. Use Enter amount to prepare funds from spendable mining rewards or withdrawal outputs.</p>
            </>}
            <Button className="w-full" disabled={busy || (mode === "utxo" && !selected) || (mode === "amount" && !amount)} onClick={() => void run(prepareReview)}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Review deposit"}</Button>
          </div>
        )}
        {shown.length > 0 && <div className="border-t border-border pt-4 space-y-3">
          <h3 className="font-heading text-sm">DEPOSIT PROGRESS</h3>
          {shown.map(op => <div key={op.operation_id} className="p-3 bg-muted/40 chamfered-sm space-y-2 text-sm">
            <div className="flex gap-2 items-center">{op.status === "confirmed" ? <CheckCircle className="h-4 w-4 text-success" /> : op.status === "needs_unlock" ? <Lock className="h-4 w-4" /> : !finished(op) && op.status !== "needs_attention" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}<span>{statusText[op.status]}</span></div>
            <p className="font-mono">{formatXtalExact(op.received_amount ?? op.quote.receive_amount)} XTAL</p>
            <p className="text-xs break-all text-foreground-muted">To {op.quote.destination}</p>
            {op.preparation_txid && <p className="text-xs break-all">Preparation: <span className="font-mono select-all">{op.preparation_txid}</span></p>}
            {op.deposit_txid && <p className="text-xs break-all">Deposit: <span className="font-mono select-all">{op.deposit_txid}</span></p>}
            {op.error && <p role="alert" className="text-destructive text-xs break-words">{op.error}</p>}
            {op.status === "needs_unlock" && !review && <div className="flex gap-2"><Input type="password" autoComplete="current-password" aria-label="Wallet password to resume deposit" placeholder="Wallet password" value={password} onChange={e => setPassword(e.target.value)} disabled={busy} /><Button disabled={busy || !password} onClick={() => void run(async () => { await tauriCommand("unlock_for_deposit", { operationId: op.operation_id, password }); })}>Unlock</Button></div>}
            {op.can_cancel && <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => {
              const updated = await invoke<DepositOperation>("cancel_deposit_operation", { operationId: op.operation_id });
              setOperations(ops => ops.map(o => o.operation_id === updated.operation_id ? updated : o)); triggerRefresh();
            })}>Cancel remaining deposit</Button>}
            {op.status === "cancelled" && op.preparation_txid && <p className="text-xs text-foreground-muted">Any preparation transaction already broadcast remains valid. Its outputs stay in your wallet.</p>}
          </div>)}
          <p className="text-xs text-foreground-muted">Progress is saved when you close this dialog or restart. Operations continue while this wallet is loaded and the node is running.</p>
        </div>}
      </CardContent>
    </ModalShell>
  );
}
