/**
 * Utility functions for converting between snake_case and camelCase
 * Used to bridge Rust (snake_case) and TypeScript (camelCase) conventions
 */

/**
 * Convert snake_case keys to camelCase recursively
 * @example snakeToCamel({ leaf_height: 2 }) => { leafHeight: 2 }
 */
export function snakeToCamel<T>(obj: unknown): T {
  if (Array.isArray(obj)) {
    return obj.map(snakeToCamel) as T;
  }
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [
        key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
        snakeToCamel(value),
      ])
    ) as T;
  }
  return obj as T;
}

/**
 * Convert camelCase keys to snake_case recursively
 * @example camelToSnake({ leafHeight: 2 }) => { leaf_height: 2 }
 */
export function camelToSnake<T>(obj: unknown): T {
  if (Array.isArray(obj)) {
    return obj.map(camelToSnake) as T;
  }
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [
        key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`),
        camelToSnake(value),
      ])
    ) as T;
  }
  return obj as T;
}
