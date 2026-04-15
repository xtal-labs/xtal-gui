import { parseXtalToShards } from "@/lib/utils";
import { decodeBase58Address } from "@/lib/address";
import type { ParamType } from "@/types/contract";

// ---------------------------------------------------------------------------
// Hex ↔ byte conversion
// ---------------------------------------------------------------------------

export function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Little-endian encoding helpers
// ---------------------------------------------------------------------------

export function toLEHex(n: number, bytes: number): string {
  let hex = "";
  for (let i = 0; i < bytes; i++) {
    hex += ((n >> (i * 8)) & 0xff).toString(16).padStart(2, "0");
  }
  return hex;
}

export function toLEHex64(n: number): string {
  const low = n >>> 0;
  const high = Math.floor(n / 4294967296) >>> 0;
  return toLEHex(low, 4) + toLEHex(high, 4);
}

// ---------------------------------------------------------------------------
// Param encoding (value → hex)
// ---------------------------------------------------------------------------

export function encodeParamHex(type: string, value: string): string {
  switch (type) {
    case "u8": {
      const n = parseInt(value) || 0;
      return n.toString(16).padStart(2, "0");
    }
    case "u16": {
      const n = parseInt(value) || 0;
      return toLEHex(n, 2);
    }
    case "u32": {
      const n = parseInt(value) || 0;
      return toLEHex(n, 4);
    }
    case "u64": {
      const n = Number(value) || 0;
      return toLEHex64(n);
    }
    case "xtal_amount": {
      const shards = parseXtalToShards(value);
      if (shards === null) {
        throw new Error("XTAL amounts support up to 8 decimal places");
      }
      return toLEHex64(shards);
    }
    case "bool":
      return value === "true" ? "01" : "00";
    case "utxo_address": {
      const pkh = decodeBase58Address(value.trim());
      if (!pkh) {
        // Fallback: accept raw 40-char hex PKH
        const raw = value.toLowerCase();
        if (/^[0-9a-f]{40}$/.test(raw)) return raw;
        return "00".repeat(20);
      }
      return Array.from(pkh).map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    case "vm_address":
    case "bytes20": {
      const hex = value.replace(/^0x/, "").toLowerCase();
      return hex.padEnd(40, "0").slice(0, 40);
    }
    case "bytes32": {
      const hex = value.replace(/^0x/, "").toLowerCase();
      return hex.padEnd(64, "0").slice(0, 64);
    }
    case "string": {
      const encoded = new TextEncoder().encode(value);
      const lenHex = toLEHex(encoded.length, 4);
      const bodyHex = Array.from(encoded)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      return lenHex + bodyHex;
    }
    case "bytes": {
      const hex = value.replace(/^0x/, "");
      const byteLen = hex.length / 2;
      const lenHex = toLEHex(byteLen, 4);
      return lenHex + hex;
    }
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// Selector / call-data helpers
// ---------------------------------------------------------------------------

export function encodeSelectorHex(selector: number[]): string {
  return selector.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function buildCallData(selector: number[], params: { type: string; value: string }[]): string {
  let data = encodeSelectorHex(selector);
  for (const p of params) {
    data += encodeParamHex(p.type, p.value);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Return value decoding (hex → typed value)
// ---------------------------------------------------------------------------

export function decodeReturnValue(hex: string, returnType: ParamType): string {
  if (!hex) return "(empty)";

  try {
    const bytes = hexToBytes(hex);

    switch (returnType) {
      case "u8":
        return bytes.length >= 1 ? String(bytes[0]) : hex;
      case "u16":
        return bytes.length >= 2
          ? String(bytes[0] | (bytes[1] << 8))
          : hex;
      case "u32":
        return bytes.length >= 4
          ? String(
              (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0
            )
          : hex;
      case "u64":
      case "xtal_amount": {
        if (bytes.length < 8) return hex;
        const low =
          (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0;
        const high =
          (bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24)) >>> 0;
        return String(low + high * 4294967296);
      }
      case "bool":
        return bytes.length >= 1 ? (bytes[0] !== 0 ? "true" : "false") : hex;
      case "string": {
        if (bytes.length < 4) return hex;
        const len =
          (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0;
        return new TextDecoder().decode(bytes.slice(4, 4 + len));
      }
      case "vm_address":
      case "bytes20":
        return bytes.length >= 20 ? `0x${hex.slice(0, 40)}` : hex;
      case "bytes32":
        return bytes.length >= 32 ? `0x${hex.slice(0, 64)}` : hex;
      case "vm_address[]": {
        const addrs: string[] = [];
        for (let i = 0; i + 40 <= hex.length; i += 40) {
          addrs.push(`0x${hex.slice(i, i + 40)}`);
        }
        return addrs.length > 0 ? addrs.join("\n") : hex;
      }
      case "bytes":
        return `0x${hex}`;
      default:
        return hex;
    }
  } catch {
    return hex;
  }
}

/**
 * Decode a LE u64 from hex, returning numeric value.
 */
export function decodeU64(hex: string): number {
  const bytes = hexToBytes(hex);
  if (bytes.length < 8) return 0;
  const low =
    (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0;
  const high =
    (bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24)) >>> 0;
  return low + high * 4294967296;
}
