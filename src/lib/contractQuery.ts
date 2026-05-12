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
