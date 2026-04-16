import bs58 from "bs58";
import { blake3 } from "@noble/hashes/blake3.js";

/**
 * XTAL address version byte
 */
const XTAL_VERSION_BYTE = 0xC7;

/**
 * Calculate the 4-byte checksum used in Base58Check: double Blake3 hash.
 * This matches the Rust implementation in src/address.rs
 */
function blake3Checksum(data: Uint8Array): Uint8Array {
  const firstHash = blake3(data);
  const secondHash = blake3(firstHash);
  return secondHash.slice(0, 4);
}

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Convert Uint8Array to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Encode a 20-byte PKH to Base58Check address.
 * Format: <version:1><pkh:20><checksum:4> -> Base58
 */
export function encodeBase58Address(pkh: Uint8Array): string {
  if (pkh.length !== 20) {
    throw new Error(`Invalid PKH length: expected 20 bytes, got ${pkh.length}`);
  }

  // Build payload: version + pkh
  const payload = new Uint8Array(21);
  payload[0] = XTAL_VERSION_BYTE;
  payload.set(pkh, 1);

  // Calculate checksum over version + pkh
  const checksum = blake3Checksum(payload);

  // Combine all parts
  const result = new Uint8Array(25);
  result.set(payload, 0);
  result.set(checksum, 21);

  return bs58.encode(result);
}

/**
 * Decode a Base58Check address to 20-byte PKH.
 * Returns null if invalid (checksum mismatch, wrong version, wrong length).
 */
export function decodeBase58Address(address: string): Uint8Array | null {
  try {
    const decoded = bs58.decode(address);

    // Must be exactly 25 bytes: version(1) + pkh(20) + checksum(4)
    if (decoded.length !== 25) {
      return null;
    }

    // Check version byte
    if (decoded[0] !== XTAL_VERSION_BYTE) {
      return null;
    }

    // Extract parts
    const payload = decoded.slice(0, 21); // version + pkh
    const givenChecksum = decoded.slice(21, 25);
    const calculatedChecksum = blake3Checksum(payload);

    // Verify checksum
    for (let i = 0; i < 4; i++) {
      if (givenChecksum[i] !== calculatedChecksum[i]) {
        return null;
      }
    }

    // Return the PKH (bytes 1-20)
    return decoded.slice(1, 21);
  } catch {
    return null;
  }
}

/**
 * Check if a string looks like a valid hex address (40 hex characters).
 */
export function isValidHexAddress(address: string): boolean {
  return /^[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Check if a string looks like a valid 0x-prefixed hex address (0x + 40 hex chars).
 */
export function isValid0xHexAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/i.test(address);
}

/**
 * Format a hex PKH as a 0x-prefixed address for VM display.
 */
export function formatVmAddress(hexPkh: string): string {
  const clean = hexPkh.startsWith("0x") ? hexPkh.slice(2) : hexPkh;
  return `0x${clean.toLowerCase()}`;
}

/**
 * Parse an address input, auto-detecting the format.
 * Accepts both Base58Check and 40-char hex formats.
 * Returns the PKH as hex string, or null if invalid.
 */
export function parseAddressInput(input: string): { pkh: string; format: "base58" | "hex" | "0x-hex" } | null {
  const trimmed = input.trim();

  // Try Base58 first (more likely for user input)
  const pkh = decodeBase58Address(trimmed);
  if (pkh) {
    return { pkh: bytesToHex(pkh), format: "base58" };
  }

  // Try 0x-prefixed hex format (common for VM addresses)
  if (isValid0xHexAddress(trimmed)) {
    return { pkh: trimmed.slice(2).toLowerCase(), format: "0x-hex" };
  }

  // Try raw hex format
  if (isValidHexAddress(trimmed)) {
    return { pkh: trimmed.toLowerCase(), format: "hex" };
  }

  return null;
}

/**
 * Convert a hex PKH to Base58Check address.
 */
export function hexToBase58Address(hexPkh: string): string | null {
  if (!isValidHexAddress(hexPkh)) {
    return null;
  }
  const pkh = hexToBytes(hexPkh);
  return encodeBase58Address(pkh);
}

/**
 * Validate an address in either format.
 */
export function isValidAddress(address: string): boolean {
  return parseAddressInput(address) !== null;
}
