import type { SyncPhase } from "@/types";

/** User-facing sync status shared by every sync badge in the app. */
export type SyncStatus = "synced" | "syncing" | "no_peers" | "idle";

/**
 * Whether the chain can be presented as current.
 *
 * The sync machine's `Synced` is only reached at the end of a peer-driven run,
 * so a caught-up node that restarts with no peer ahead of it rests at `Idle`
 * forever. In that resting state the node's chain-health verdict (`keepingUp`:
 * level with every ready peer and still receiving blocks) is what says the
 * chain is current. The verdict is deliberately ignored mid-run and after a
 * failure: an active run is "syncing" even when it is only one leaf short, and
 * a failed run stays visible until the machine clears it.
 *
 * Mirrors `chain_is_current` in `src-tauri/src/commands/blockchain.rs`.
 */
export function isChainCurrent(phase: SyncPhase, keepingUp: boolean): boolean {
  if (phase === "Synced") return true;
  if (phase === "Idle") return keepingUp;
  return false;
}

/**
 * Derive the sync status shown to the user.
 *
 * `isSynced` is the store's `isChainCurrent` result and is the only thing that
 * may report `synced`. A bare `Idle` phase is never evidence that the chain is
 * up to date; it only reads as synced once the health verdict says so.
 */
export function deriveSyncStatus(
  isSynced: boolean,
  peerCount: number,
  phase: SyncPhase
): SyncStatus {
  if (isSynced) return "synced";
  if (peerCount === 0) return "no_peers";
  if (phase === "Idle") return "idle";
  return "syncing";
}
