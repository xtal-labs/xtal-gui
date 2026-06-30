import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export type Tab = "dashboard" | "mining" | "mempool" | "validator" | "wallet" | "gateway" | "network" | "explorer" | "visualizer" | "console" | "settings";

export type NodeConnectionState = "connecting" | "connected" | "disconnected";

export interface Toast {
  id: string;
  type: "success" | "error" | "warning" | "info" | "fruit" | "stem" | "leaf" | "stake" | "unstake";
  title: string;
  message?: string;
  duration?: number;
  /** Fruit type name (e.g., "Apple", "Orange"). Used when type === "fruit" */
  fruitType?: string;
}

// Import RpcHistoryEntry from types
import type { RpcHistoryEntry } from "@/types";

interface UiState {
  // Navigation
  activeTab: Tab;

  // Setup
  needsSetup: boolean | null;
  isInitializing: boolean;

  // Sidebar
  sidebarCollapsed: boolean;
  /** Whether the compact-viewport navigation drawer is open (overlay mode). */
  mobileNavOpen: boolean;

  // Node connection
  nodeConnectionState: NodeConnectionState;

  // Toasts
  toasts: Toast[];
  toastsEnabled: boolean;

  // Modals
  activeModal: string | null;
  modalData: unknown;

  // Loading states
  isLoading: Record<string, boolean>;

  // RPC Console History
  rpcHistory: RpcHistoryEntry[];

  // Actions
  setActiveTab: (tab: Tab) => void;
  setNeedsSetup: (needs: boolean) => void;
  setIsInitializing: (initializing: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setMobileNavOpen: (open: boolean) => void;
  closeMobileNav: () => void;
  setNodeConnectionState: (state: NodeConnectionState) => void;
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
  setToastsEnabled: (enabled: boolean) => void;
  hydrateToastsEnabled: (enabled: boolean) => void;
  openModal: (modalId: string, data?: unknown) => void;
  closeModal: () => void;
  setLoading: (key: string, loading: boolean) => void;

  // RPC History Actions
  addRpcEntry: (entry: RpcHistoryEntry) => void;
  setRpcHistory: (entries: RpcHistoryEntry[]) => void;
  clearRpcHistory: () => void;
  reset: () => void;
}

let toastIdCounter = 0;

const initialState = {
  activeTab: "dashboard" as Tab,
  needsSetup: null,
  isInitializing: true,
  sidebarCollapsed: false,
  mobileNavOpen: false,
  nodeConnectionState: "disconnected" as NodeConnectionState,
  toasts: [],
  activeModal: null,
  modalData: null,
  isLoading: {},
  rpcHistory: [],
};

export const useUiStore = create<UiState>((set, get) => ({
  ...initialState,
  toastsEnabled: true,

  setActiveTab: (tab) => set({ activeTab: tab }),

  setNeedsSetup: (needs) => set({ needsSetup: needs }),

  setIsInitializing: (initializing) => set({ isInitializing: initializing }),

  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

  setNodeConnectionState: (state) => set({ nodeConnectionState: state }),

  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  setMobileNavOpen: (open) => set({ mobileNavOpen: open }),

  closeMobileNav: () => set({ mobileNavOpen: false }),

  addToast: (toast) => {
    if (!get().toastsEnabled) return;
    const id = `toast-${++toastIdCounter}`;
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
    }));

    // Auto-remove after duration
    const duration = toast.duration ?? 5000;
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, duration);
    }
  },

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  setToastsEnabled: (enabled) => {
    const previousEnabled = get().toastsEnabled;
    set({ toastsEnabled: enabled });

    void invoke("set_gui_toasts_enabled", { enabled }).catch((error) => {
      console.error("Failed to save toast preference:", error);
      set({ toastsEnabled: previousEnabled });
    });
  },

  hydrateToastsEnabled: (enabled) => set({ toastsEnabled: enabled }),

  openModal: (modalId, data) =>
    set({
      activeModal: modalId,
      modalData: data,
    }),

  closeModal: () =>
    set({
      activeModal: null,
      modalData: null,
    }),

  setLoading: (key, loading) =>
    set((state) => ({
      isLoading: {
        ...state.isLoading,
        [key]: loading,
      },
    })),

  // RPC History Actions
  addRpcEntry: (entry) =>
    set((state) => ({
      rpcHistory: [...state.rpcHistory, entry],
    })),

  setRpcHistory: (entries) =>
    set({
      rpcHistory: entries,
    }),

  clearRpcHistory: () =>
    set({
      rpcHistory: [],
    }),

  reset: () => set(initialState),
}));
