/**
 * Types for GUI-owned persisted preferences.
 */

import type { DashboardLayout } from "./dashboard";

export interface GuiConfig {
  toastsEnabled: boolean;
  /** Whether expert controls (e.g. staking to a specific contract) are shown. */
  advancedMode: boolean;
  dashboard?: DashboardLayout | null;
}
