import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

import { DEFAULT_DASHBOARD_LAYOUT } from "@/components/Dashboard/defaultLayout";
import { camelToSnake } from "@/lib/caseConvert";
import type { DashboardLayout, DashboardWidget, WidgetSize } from "@/types/dashboard";
import { DASHBOARD_LAYOUT_VERSION } from "@/types/dashboard";

interface DashboardState {
  layout: DashboardLayout;
  /** True once the persisted layout (or its absence) has been applied. */
  hydrated: boolean;
  editMode: boolean;

  /** Apply the persisted layout from get_gui_config; null = never customized. */
  hydrateLayout: (layout: DashboardLayout | null) => void;
  setEditMode: (on: boolean) => void;
  addWidget: (widgetType: string, extra?: Partial<DashboardWidget>) => void;
  removeWidget: (id: string) => void;
  setWidgetSize: (id: string, size: WidgetSize) => void;
  /** Live-preview reorder while a drag is in flight; state only, no persistence. */
  reorderWidgets: (activeId: string, overId: string) => void;
  /** Persist the current layout once (drag commit). */
  commitLayout: () => void;
  /** Immediately write any debounced layout change, if one is pending. */
  flushLayout: () => void;
  /** Restore a pre-drag snapshot (drag cancel); no persistence — the snapshot
   *  is by definition the already-persisted order. */
  restoreWidgetOrder: (widgets: DashboardWidget[]) => void;
  resetLayout: () => void;
}

const PERSIST_DEBOUNCE_MS = 800;

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingLayout: DashboardLayout | null = null;
let widgetCounter = 0;

function persistLayout(layout: DashboardLayout) {
  void invoke("set_gui_dashboard_layout", {
    layout: camelToSnake(layout),
  }).catch((error) => {
    console.error("Failed to persist dashboard layout:", error);
  });
}

/** Write and clear the pending layout, or force-write an explicit layout. */
function flushPersist(layout?: DashboardLayout) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;

  const next = layout ?? pendingLayout;
  pendingLayout = null;
  if (next) persistLayout(next);
}

/**
 * Debounced write-behind to config.toml. Keeps optimistic state on failure —
 * reverting a layout mid-edit is more disruptive than a missed save.
 */
function schedulePersist(layout: DashboardLayout) {
  if (persistTimer) clearTimeout(persistTimer);
  pendingLayout = layout;
  persistTimer = setTimeout(flushPersist, PERSIST_DEBOUNCE_MS);
}

function generateWidgetId(): string {
  widgetCounter += 1;
  return `w-${Date.now()}-${widgetCounter}`;
}

export const useDashboardStore = create<DashboardState>((set, get) => {
  const updateLayout = (widgets: DashboardWidget[]) => {
    const layout: DashboardLayout = { ...get().layout, widgets };
    set({ layout });
    schedulePersist(layout);
  };

  return {
    layout: DEFAULT_DASHBOARD_LAYOUT,
    hydrated: false,
    editMode: false,

    hydrateLayout: (layout) =>
      set({
        layout: layout ?? DEFAULT_DASHBOARD_LAYOUT,
        hydrated: true,
      }),

    setEditMode: (on) => set({ editMode: on }),

    addWidget: (widgetType, extra) =>
      updateLayout([
        ...get().layout.widgets,
        { id: generateWidgetId(), widgetType, size: "s", ...extra },
      ]),

    removeWidget: (id) =>
      updateLayout(get().layout.widgets.filter((w) => w.id !== id)),

    setWidgetSize: (id, size) =>
      updateLayout(
        get().layout.widgets.map((w) => (w.id === id ? { ...w, size } : w))
      ),

    reorderWidgets: (activeId, overId) => {
      const widgets = get().layout.widgets;
      const from = widgets.findIndex((w) => w.id === activeId);
      const to = widgets.findIndex((w) => w.id === overId);
      if (from === -1 || to === -1 || from === to) return;

      const reordered = [...widgets];
      const [moved] = reordered.splice(from, 1);
      reordered.splice(to, 0, moved);
      set({ layout: { ...get().layout, widgets: reordered } });
    },

    // Drag reordering is state-only until drop, so commit it immediately.
    commitLayout: () => flushPersist(get().layout),

    // Add/remove/resize/reset already queued a debounced write. "Done" flushes
    // that write without persisting an untouched built-in default layout.
    flushLayout: () => flushPersist(),

    restoreWidgetOrder: (widgets) =>
      set({ layout: { ...get().layout, widgets } }),

    resetLayout: () => {
      const layout: DashboardLayout = {
        version: DASHBOARD_LAYOUT_VERSION,
        widgets: [...DEFAULT_DASHBOARD_LAYOUT.widgets],
      };
      set({ layout });
      schedulePersist(layout);
    },
  };
});
