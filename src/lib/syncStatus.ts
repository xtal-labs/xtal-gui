import type { SyncPhase } from "@/types";

/** User-facing sync status shared by every sync badge in the app. */
export type SyncStatus = "synced" | "syncing" | "no_peers" | "idle";

/**
 * Derive the sync status shown to the user.
 *
 * `Idle` means the node has not started syncing yet. It is never evidence that
 * the chain is up to date, so it must not be presented as `synced` — only the
 * store's `isSynced` flag (phase === "Synced") may do that.
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
