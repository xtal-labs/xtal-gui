/**
 * Phase 1 Diagnostic Monitor
 *
 * Instruments WebSocket message rates and React render frequency.
 * Only active in development builds (process.env.NODE_ENV === 'development').
 *
 * Usage: Call useDiagnosticMonitor() once in App.tsx.
 * Results are logged to console every 10 seconds with [DIAG] prefix.
 */

import { useEffect, useRef, useCallback } from "react";

// ──────────────────────────────────────────────
// WebSocket Message Rate Tracker
// ──────────────────────────────────────────────

/**
 * Returns a wrapper function that tracks WebSocket message rates.
 * Pass this as the `onMessage` callback to useNodeWebSocket.
 */
export function createWsMessageTracker(): (msg: { type: string; data?: unknown }) => void {
  const stats = { total: 0, byType: {} as Record<string, number> };
  const start = Date.now();
  let lastLog = start;

  return (msg: { type: string; data?: unknown }) => {
    stats.total++;
    stats.byType[msg.type] = (stats.byType[msg.type] || 0) + 1;

    const now = Date.now();
    if (now - lastLog >= 10_000) {
      const elapsed = (now - start) / 1000;
      const rate = stats.total / elapsed;
      const byTypeRates = Object.entries(stats.byType).map(
        ([type, count]) => `  ${type}: ${count} (${(count / elapsed).toFixed(2)}/s)`
      );

      if (typeof window !== "undefined") {
        console.log(
          `[DIAG-WS] ${elapsed.toFixed(0)}s elapsed | total_msgs=${stats.total} | rate=${rate.toFixed(2)}/s\n${byTypeRates.join("\n")}`
        );
      }

      lastLog = now;
    }
  };
}

// ──────────────────────────────────────────────
// Tauri Event Rate Tracker
// ──────────────────────────────────────────────

/**
 * Wraps a useTauriEvent handler to track emission rates.
 * Returns a new handler that counts events before delegating to the original.
 */
export function createTauriEventTracker<T>(): {
  wrappedHandler: (payload: T) => void;
  getStats: () => { total: number; byType: Record<string, number> };
} {
  const stats = { total: 0, byType: {} as Record<string, number> };
  const start = Date.now();
  let lastLog = start;

  const handler = (payload: T) => {
    stats.total++;
    const eventType = (payload as { type?: string })?.type ?? "unknown";
    stats.byType[eventType] = (stats.byType[eventType] || 0) + 1;

    const now = Date.now();
    if (now - lastLog >= 10_000) {
      const elapsed = (now - start) / 1000;
      const rate = stats.total / elapsed;
      const byTypeRates = Object.entries(stats.byType).map(
        ([type, count]) => `  ${type}: ${count} (${(count / elapsed).toFixed(2)}/s)`
      );

      console.log(
        `[DIAG-TAURI] ${elapsed.toFixed(0)}s elapsed | total_events=${stats.total} | rate=${rate.toFixed(2)}/s\n${byTypeRates.join("\n")}`
      );
      lastLog = now;
    }
  };

  return {
    wrappedHandler: handler,
    getStats: () => ({ ...stats }),
  };
}

// ──────────────────────────────────────────────
// Render Counter Hook
// ──────────────────────────────────────────────

/**
 * Tracks render frequency for a specific component.
 * Call inside any component to log how often it re-renders.
 *
 * @example
 * const trackRender = useRenderTracker("BlockExplorer");
 * useEffect(() => trackRender(), []); // fires on every render
 */
export function useRenderTracker(componentName: string) {
  const countRef = useRef(0);
  const lastLogRef = useRef(Date.now());
  const nameRef = useRef(componentName);

  return useCallback(() => {
    countRef.current++;
    const now = Date.now();
    if (now - lastLogRef.current >= 10_000) {
      const elapsed = (now - (lastLogRef.current - 10_000)) / 1000;
      const renders = countRef.current;
      console.log(
        `[DIAG-RENDER] ${nameRef.current}: ${renders} renders in last 10s (${(renders / elapsed).toFixed(1)}/s)`
      );
      lastLogRef.current = now;
    }
  }, []);
}

// ──────────────────────────────────────────────
// Main Diagnostic Monitor Hook
// ──────────────────────────────────────────────

/**
 * Top-level diagnostic monitor. Logs a periodic summary to console.
 * No-op in production builds.
 */
export function useDiagnosticMonitor() {
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    const viteEnv = (import.meta as unknown as { env?: { PROD?: boolean } }).env;

    if (viteEnv?.PROD) {
      return;
    }

    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      console.log(`[DIAG] Session alive: ${elapsed.toFixed(0)}s`);
    }, 30_000);

    return () => clearInterval(interval);
  }, []);
}

export default useDiagnosticMonitor;
