/**
 * Crystal difficulty helpers (frontend).
 *
 * `difficultyBits` is a compact, float-like encoding of the difficulty target
 * (top byte = exponent, low 3 bytes = mantissa), so a percentage on the raw
 * integer is meaningless — it must be decoded to the full U256 target first.
 * JS `BigInt` gives exact arbitrary-precision (true U256) arithmetic.
 */

/**
 * Decode compact difficulty bits into the full U256 target.
 * Mirrors `Difficulty::to_target` (xtal `src/difficulty/core.rs`).
 */
export function compactBitsToTarget(bits: number): bigint {
  const exponent = bits >>> 24;
  const mantissa = BigInt(bits & 0x00ff_ffff);
  return exponent >= 3
    ? mantissa << BigInt(8 * (exponent - 3))
    : mantissa >> BigInt(8 * (3 - exponent));
}

export interface DifficultyDelta {
  /** true ⇒ harder (render red), false ⇒ easier (render green) */
  harder: boolean;
  /** Worded magnitude, e.g. "8% harder", "12% easier", "2.4× harder" */
  label: string;
}

/**
 * Epoch-over-epoch difficulty change.
 *
 * Hardness ∝ work = MAX/target, so a *smaller* target means *harder*. The
 * hardness ratio between epochs is therefore `prevTarget / currentTarget`
 * (> 1 ⇒ this epoch is harder). Returns `null` when difficulty is unchanged
 * or the change rounds to nothing.
 */
export function difficultyDelta(currentBits: number, prevBits: number): DifficultyDelta | null {
  if (currentBits === prevBits) return null;

  const cur = compactBitsToTarget(currentBits);
  const prev = compactBitsToTarget(prevBits);
  if (cur === 0n || prev === 0n) return null;

  const SCALE = 1_000_000n;
  const ratio = Number((prev * SCALE) / cur) / Number(SCALE); // prevTarget/curTarget; >1 = harder
  if (!isFinite(ratio) || ratio <= 0) return null;

  // Large drift reads better as a multiplier than a huge percentage.
  if (ratio >= 2) return { harder: true, label: `${ratio.toFixed(1)}× harder` };
  if (ratio <= 0.5) return { harder: false, label: `${(1 / ratio).toFixed(1)}× easier` };

  const pct = Math.round(Math.abs((ratio - 1) * 100));
  if (pct === 0) return null;
  return { harder: ratio > 1, label: `${pct}% ${ratio > 1 ? "harder" : "easier"}` };
}
