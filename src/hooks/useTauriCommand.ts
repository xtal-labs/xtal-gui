import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { snakeToCamel } from "@/lib/caseConvert";

interface UseTauriCommandState<T> {
  data: T | null;
  error: string | null;
  isLoading: boolean;
}

interface UseTauriCommandResult<T> extends UseTauriCommandState<T> {
  execute: (params?: Record<string, unknown>) => Promise<T | null>;
  reset: () => void;
}

/**
 * Hook for executing Tauri commands with loading and error state
 *
 * @example
 * const { data, error, isLoading, execute } = useTauriCommand<BlockchainInfo>('get_blockchain_info');
 *
 * // Execute on mount
 * useEffect(() => { execute(); }, [execute]);
 *
 * // Execute with params
 * execute({ height: 100 });
 */
export function useTauriCommand<T>(
  command: string
): UseTauriCommandResult<T> {
  const [state, setState] = useState<UseTauriCommandState<T>>({
    data: null,
    error: null,
    isLoading: false,
  });

  const execute = useCallback(
    async (params?: Record<string, unknown>): Promise<T | null> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const result = await invoke<T>(command, params);
        const converted = snakeToCamel<T>(result);
        setState({ data: converted, error: null, isLoading: false });
        return converted;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : String(err);
        setState((prev) => ({
          ...prev,
          error: message,
          isLoading: false,
        }));
        return null;
      }
    },
    [command]
  );

  const reset = useCallback(() => {
    setState({ data: null, error: null, isLoading: false });
  }, []);

  return {
    ...state,
    execute,
    reset,
  };
}

/**
 * Execute a Tauri command once and return the result
 * Useful for one-off commands
 */
export async function tauriCommand<T>(
  command: string,
  params?: Record<string, unknown>
): Promise<T> {
  const result = await invoke<T>(command, params);
  return snakeToCamel<T>(result);
}

/**
 * Execute a Tauri command with error handling
 * Returns [result, error] tuple
 */
export async function tauriCommandSafe<T>(
  command: string,
  params?: Record<string, unknown>
): Promise<[T | null, string | null]> {
  try {
    const result = await invoke<T>(command, params);
    return [snakeToCamel<T>(result), null];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return [null, message];
  }
}

export default useTauriCommand;
