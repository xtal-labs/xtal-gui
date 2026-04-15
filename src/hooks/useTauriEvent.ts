import { useEffect, useRef, useCallback } from "react";
import { listen, emit, type UnlistenFn } from "@tauri-apps/api/event";
import { snakeToCamel } from "@/lib/caseConvert";

/**
 * Hook for subscribing to Tauri events
 *
 * @example
 * useTauriEvent<SyncProgress>('gui-event', (payload) => {
 *   if (payload.type === 'SyncProgress') {
 *     setSyncState(payload.data);
 *   }
 * });
 */
export function useTauriEvent<T>(
  eventName: string,
  handler: (payload: T) => void,
  deps: React.DependencyList = []
) {
  const handlerRef = useRef(handler);

  // Keep handler ref updated without triggering effect
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let mounted = true;

    listen<T>(eventName, (event) => {
      if (mounted) {
        handlerRef.current(snakeToCamel<T>(event.payload));
      }
    }).then((fn) => {
      if (mounted) {
        unlisten = fn;
      } else {
        // Component unmounted before listen resolved
        fn();
      }
    });

    return () => {
      mounted = false;
      if (unlisten) {
        unlisten();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventName, ...deps]);
}

/**
 * Hook that returns a function to emit Tauri events
 */
export function useTauriEmit() {
  const emitEvent = useCallback(
    async (eventName: string, payload?: unknown) => {
      await emit(eventName, payload);
    },
    []
  );

  return emitEvent;
}

export default useTauriEvent;
