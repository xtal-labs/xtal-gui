import type { DashboardLayout } from "@/types/dashboard";
import { DASHBOARD_LAYOUT_VERSION } from "@/types/dashboard";

/**
 * The built-in layout, reproducing the pre-configurable dashboard: three
 * compact stat cards, two medium cards, and the full-width sync/best-leaf
 * rows. Used when the user has never customized (no `dashboard` key in
 * config.toml) and as the "Reset" target.
 */
export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayout = {
  version: DASHBOARD_LAYOUT_VERSION,
  widgets: [
    { id: "default-leaf-height", widgetType: "leaf_height", size: "s" },
    { id: "default-peers", widgetType: "peers", size: "s" },
    { id: "default-mempool", widgetType: "mempool", size: "m" },
    { id: "default-mining", widgetType: "mining", size: "m" },
    { id: "default-validator", widgetType: "validator", size: "m" },
    { id: "default-sync-progress", widgetType: "sync_progress", size: "xl" },
    { id: "default-best-leaf", widgetType: "best_leaf", size: "xl" },
  ],
};
