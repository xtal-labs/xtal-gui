import { useEffect, useRef, useState } from "react";
import { AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ModalShell } from "@/components/ui/modal-shell";
import { tauriCommand } from "@/hooks";

interface SyncStatus {
  current_height: number;
  target_height: number;
  is_syncing: boolean;
  recovery: {
    running: boolean;
    needs_unlock: boolean;
    phase: string;
    pass: number;
    derived_keys: number;
    error: string | null;
  };
}

interface WalletRecoveryModalProps {
  open: boolean;
  onClose: () => void;
  /** Called when a recovery run finishes (used to refresh wallet data). */
  onRecovered?: () => void;
}

/**
 * Standalone wallet recovery dialog, triggered from the native File menu
 * ("Recover Wallet Balance..."). Rebuilds local wallet history after restoring
 * an older backup or when the local database is corrupted. Rendered at the app
 * level so it is reachable from any tab — the wallet page itself does not
 * embed this anymore.
 */
export function WalletRecoveryModal({ open, onClose, onRecovered }: WalletRecoveryModalProps) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [password, setPassword] = useState("");
  const [searchFurther, setSearchFurther] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const callback = useRef(onRecovered);
  callback.current = onRecovered;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let wasWorking = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await tauriCommand<SyncStatus>("get_wallet_sync_status");
        if (cancelled) return;
        setStatus(next);
        const working = next.recovery.running || next.is_syncing;
        if (wasWorking && !working) callback.current?.();
        wasWorking = working;
      } catch {
        // The loop is registered asynchronously when a wallet is loaded.
      }
      if (!cancelled) timer = setTimeout(poll, 1500);
    };
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open]);

  const recovering = busy || status?.recovery.running;
  const close = () => {
    if (recovering) return;
    onClose();
    setPassword("");
    setError(null);
    setComplete(false);
    setSearchFurther(false);
  };
  const recover = async (continueSearch = searchFurther) => {
    setBusy(true);
    setError(null);
    setComplete(false);
    const recoveryPassword = password;
    setPassword("");
    try {
      await tauriCommand("recover_wallet", {
        request: { password: recoveryPassword, continue_search: continueSearch },
      });
      setComplete(true);
      callback.current?.();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const progress = status?.recovery.phase === "deriving"
    ? `Discovering addresses (${status.recovery.derived_keys.toLocaleString()} added)…`
    : `Scanning wallet history: ${(status?.current_height ?? 0).toLocaleString()} / ${(status?.target_height ?? 0).toLocaleString()}`;

  return (
    <ModalShell title="Recover wallet balance" cardClassName="max-w-md" onClose={close}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Recover wallet balance</CardTitle>
          <Button variant="ghost" size="icon" disabled={!!recovering} onClick={close} aria-label="Close recovery">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-foreground-secondary">
          After restoring an older backup, search for used addresses and rebuild your wallet history.
          Your password allows the wallet to discover additional addresses.
        </p>
        {recovering ? <div role="status" className="space-y-2">
          <p>{progress}</p>
          <p className="text-sm text-foreground-muted">Balances may be incomplete until recovery finishes. Keep the application open.</p>
        </div> : complete ? <div role="status" className="text-sm">
          Recovery finished. If funds are still missing, you can continue searching for additional addresses.
        </div> : <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void recover(); }}>
          <label className="block text-sm space-y-2">
            <span>Wallet password</span>
            <Input type="password" autoComplete="current-password" value={password}
              onChange={(event) => setPassword(event.target.value)} autoFocus />
          </label>
          {(error || status?.recovery.error) && <p role="alert" className="text-sm text-destructive">
            <AlertCircle className="inline h-4 w-4 mr-2" />{error || status?.recovery.error}
          </p>}
          <Button type="submit" className="w-full">{searchFurther ? "Continue searching" : "Start recovery"}</Button>
          {!searchFurther && <details className="text-sm space-y-2">
            <summary className="cursor-pointer">Still missing funds after recovery?</summary>
            <p className="text-foreground-muted">Continue checking additional addresses. This may take longer if many addresses were created without receiving funds.</p>
            <Button type="button" variant="outline" onClick={() => void recover(true)}>Continue searching</Button>
          </details>}
        </form>}
        {complete && !recovering && <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setComplete(false); setSearchFurther(true); }}>Continue searching</Button>
          <Button className="flex-1" onClick={close}>Done</Button>
        </div>}
      </CardContent>
    </ModalShell>
  );
}