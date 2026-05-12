import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind classes with clsx
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Number of shards (minimum indivisible units) per 1 XTAL.
 * Keep this mirrored with xtal::config::SHARDS_PER_XTAL.
 */
export const SHARDS_PER_XTAL = 1_000_000_000;
export const XTAL_DECIMALS = String(SHARDS_PER_XTAL).length - 1;

const XTAL_INPUT_PATTERN = new RegExp(`^\\d*(?:\\.\\d{0,${XTAL_DECIMALS}})?$`);

/**
 * Convert shards to XTAL (raw number, not formatted)
 */
export function shardsToXtal(shards: number | bigint): number {
  const value = typeof shards === "bigint" ? Number(shards) : shards;
  return value / SHARDS_PER_XTAL;
}

/**
 * Format XTAL amounts.
 */
export function formatXtal(shards: number | bigint): string {
  const value = typeof shards === "bigint" ? Number(shards) : shards;
  const xtal = value / SHARDS_PER_XTAL;

  if (xtal === 0) return "0";
  if (xtal < 1 / SHARDS_PER_XTAL) return `< ${(1 / SHARDS_PER_XTAL).toFixed(XTAL_DECIMALS)}`;
  if (xtal >= 1_000_000) {
    return `${(xtal / 1_000_000).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}M`;
  }
  if (xtal >= 1_000) {
    return `${(xtal / 1_000).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}K`;
  }

  return xtal.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: XTAL_DECIMALS,
  });
}

/**
 * Format full XTAL amount with all decimals
 */
export function formatXtalFull(shards: number | bigint): string {
  const value = typeof shards === "bigint" ? Number(shards) : shards;
  const xtal = value / SHARDS_PER_XTAL;
  return xtal.toFixed(XTAL_DECIMALS);
}

/**
 * Format a decimal number for input display, preventing exponential notation.
 */
export function formatDecimalInput(value: number, decimals: number = XTAL_DECIMALS): string {
  if (value === 0) return "0";
  return value.toFixed(decimals).replace(/\.?0+$/, "");
}

/**
 * Check whether a user-entered XTAL amount can be accepted into input state.
 */
export function isValidXtalInput(value: string): boolean {
  if (value !== value.trim()) return false;
  return parseXtalToShards(value) !== null;
}

/**
 * Convert a user-entered XTAL decimal string to shards without float math.
 */
export function parseXtalToShards(value: string): number | null {
  const trimmed = value.trim();

  if (trimmed === "" || trimmed === ".") return 0;
  if (!XTAL_INPUT_PATTERN.test(trimmed)) return null;

  const [wholePartRaw = "0", fractionPartRaw = ""] = trimmed.split(".");
  const wholePart = wholePartRaw === "" ? "0" : wholePartRaw;

  if (!/^\d+$/.test(wholePart) || !/^\d*$/.test(fractionPartRaw)) return null;

  const shardsString = `${wholePart}${fractionPartRaw.padEnd(XTAL_DECIMALS, "0")}`;
  const normalized = shardsString.replace(/^0+(?=\d)/, "");
  const shards = Number(normalized || "0");

  return Number.isSafeInteger(shards) ? shards : null;
}

export function getXtalInputError(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (!XTAL_INPUT_PATTERN.test(trimmed)) return `XTAL supports up to ${XTAL_DECIMALS} decimal places`;
  if (parseXtalToShards(trimmed) === null) return "Amount is too large";
  return null;
}

/**
 * Truncate hash for display
 */
export function truncateHash(hash: string, chars = 8): string {
  if (!hash) return "";
  if (hash.length <= chars * 2 + 3) return hash;
  return `${hash.slice(0, chars)}...${hash.slice(-chars)}`;
}

/**
 * Truncate address for display
 */
export function truncateAddress(address: string, chars = 6): string {
  return truncateHash(address, chars);
}

/**
 * Format hashrate from MH/s input (backend sends MH/s directly)
 */
export function formatHashRateMH(mhPerSecond: number): string {
  if (mhPerSecond === 0) return "0 H/s";
  if (mhPerSecond >= 1000) {
    return `${(mhPerSecond / 1000).toFixed(2)} GH/s`;
  }
  if (mhPerSecond >= 1) {
    return `${mhPerSecond.toFixed(2)} MH/s`;
  }
  return `${(mhPerSecond * 1000).toFixed(2)} KH/s`;
}

/**
 * Format duration in human readable format
 */
export function formatDuration(seconds: number): string {
  if (seconds < 0) return "0s";

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

/**
 * Format timestamp to relative time
 * Handles both seconds and milliseconds (auto-detects based on magnitude)
 */
export function formatTimeAgo(timestamp: number | Date): string {
  const now = Date.now();
  let time = typeof timestamp === "number" ? timestamp : timestamp.getTime();

  // Convert seconds to milliseconds if timestamp appears to be in seconds
  // Timestamps < 1 trillion are in seconds (before ~2001 in ms, or valid unix seconds)
  if (typeof timestamp === "number" && time < 1_000_000_000_000) {
    time = time * 1000;
  }

  const diff = Math.floor((now - time) / 1000);

  if (diff < 0) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;

  const date = new Date(time);
  return date.toLocaleDateString();
}

/**
 * Format timestamp to locale string
 * Handles both seconds and milliseconds (auto-detects based on magnitude)
 */
export function formatTimestamp(timestamp: number | Date): string {
  let time = typeof timestamp === "number" ? timestamp : timestamp.getTime();

  // Convert seconds to milliseconds if needed
  if (typeof timestamp === "number" && time < 1_000_000_000_000) {
    time = time * 1000;
  }

  return new Date(time).toLocaleString();
}

/**
 * Format large numbers with K/M/B suffixes
 */
export function formatNumber(num: number): string {
  if (num === 0) return "0";
  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(1)}B`;
  }
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toLocaleString();
}

/**
 * Format block height with commas
 */
export function formatBlockHeight(height: number): string {
  return height.toLocaleString();
}

/**
 * Format percentage
 */
export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let unitIndex = 0;
  let value = bytes;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand("copy");
      return true;
    } catch {
      return false;
    } finally {
      document.body.removeChild(textArea);
    }
  }
}

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Throttle function
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}
