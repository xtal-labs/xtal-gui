/**
 * Types for the configurable dashboard layout.
 *
 * Mirrors the Rust `DashboardLayoutConfig` / `DashboardWidgetConfig` structs in
 * `src-tauri/src/config.rs`. Widget type and size are plain strings on the wire
 * so configs written by newer builds round-trip untouched; unknown values are
 * resolved (never rewritten) at render time.
 */

export type WidgetSize = "s" | "m" | "l" | "xl";

export const WIDGET_SIZES: WidgetSize[] = ["s", "m", "l", "xl"];

export function isWidgetSize(value: string): value is WidgetSize {
  return (WIDGET_SIZES as string[]).includes(value);
}

export interface DashboardWidget {
  /** Stable instance id ("default-peers" or generated for user-added widgets). */
  id: string;
  /** Widget registry key. Unknown values (from newer builds) are preserved. */
  widgetType: string;
  /** Size preset; unknown values fall back to the registry default at render. */
  size: string;
  /** contract_value widgets only */
  contractAddress?: string;
  /** contract_value widgets only */
  method?: string;
}

export const DASHBOARD_LAYOUT_VERSION = 1;

export interface DashboardLayout {
  version: number;
  widgets: DashboardWidget[];
}
