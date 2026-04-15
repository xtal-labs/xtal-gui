/**
 * Types for node startup status
 */

export interface StartupErrorInfo {
  message: string;
  category: string;
  logPath: string;
  dataDir: string;
  network: string;
}

export type StartupStage =
  | "opening_database"
  | "bootstrap"
  | "tx_index"
  | "initializing_network"
  | "starting_services"
  | "ready"
  | "failed";

export type BootstrapPhase =
  | "inspecting_storage"
  | "reconstructing_chain"
  | "restoring_validator_state"
  | "complete";

export interface StartupStatus {
  ok: boolean;
  phase: "loading" | "ready" | "failed";
  startupStage: StartupStage;
  error: StartupErrorInfo | null;
  loadingMessage: string;
  progressPercent: number;
  bootstrapPhase: BootstrapPhase | null;
  bootstrapPercent: number | null;
}
