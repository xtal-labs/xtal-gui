/**
 * Types for GUI-owned persisted preferences.
 */

import type { DashboardLayout } from "./dashboard";

export interface GuiConfig {
  toastsEnabled: boolean;
  dashboard?: DashboardLayout | null;
}
