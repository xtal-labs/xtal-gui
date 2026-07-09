/**
 * Pure layout engine for the Chain Visualizer.
 *
 * Maps the backend `EpochStrip[]` (stems → leaf intervals) into absolute px
 * coordinates for a vertical stem spine with fruit clusters fanning to the right.
 * This is the single source of truth for positions so the SVG connector layer and
 * the HTML node layer agree on geometry.
 *
 * Dedup: consecutive stems re-reference the same fruits as they carry them forward,
 * so a fruit hash recurs across stems. We attribute each fruit to ONE carrier — the
 * stem whose receipts recorded it (`receiptTxCount != null`), tie-broken by earliest
 * height — and render it exactly once beside that stem.
 */
import type {
  EpochStrip,
  FruitBodyState,
  StripFruit,
  StripLeaf,
  StripStem,
} from "@/types";

// --- Layout constants (px). All node coordinates are CENTER-anchored. ---
/** X of the stem spine centre. Shared with the connector layer. */
export const SPINE_X = 56;
const TOP_PAD = 40;
const BOTTOM_PAD = 56;
const ROW_H = 78;
const LEAF_H = 64;
const EPOCH_GAP = 30;
const FRUIT_GAP_X = 120;
const FRUIT_DX = 88;
const MAX_FRUITS_PER_ROW = 6;
const FRUIT_SUBROW_DY = 46;
const JITTER_Y = 7;
const MIN_WIDTH = 640;
const RIGHT_PAD = 64;

/** Normalise a hash for comparison/keys (strip `0x`, lowercase). */
export function normHash(hash: string): string {
  return hash.replace(/^0x/i, "").toLowerCase();
}

export type PositionedFruit = {
  hash: string;
  fruitType: string;
  bodyState: FruitBodyState;
  /** Tx count to surface (body count when present, else receipt count, else null). */
  txCount: number | null;
  x: number;
  y: number;
  /** Carrier (including) stem — used for the carrier trace and the detail fetch. */
  stemHash: string;
  stemX: number;
  stemY: number;
};

export type PositionedStem = {
  hash: string;
  height: number;
  timestamp: number;
  /** Number of fruits actually rendered under this stem (after dedup/filter). */
  fruitCount: number;
  isTip: boolean;
  x: number;
  y: number;
};

export type PositionedLeaf = {
  hash: string;
  leafHeight: number;
  timestamp: number;
  txCount: number;
  x: number;
  y: number;
};

export type NeighborEdge = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type ChainLayout = {
  stems: PositionedStem[];
  leaves: PositionedLeaf[];
  fruits: PositionedFruit[];
  edges: NeighborEdge[];
  /** Y of the topmost / bottommost stem centre — drives the static spine beam. */
  spineTop: number | null;
  spineBottom: number | null;
  width: number;
  height: number;
};

export interface BuildLayoutOptions {
  /** When true, only fruits with a payload (≥1 tx) are rendered. */
  payloadsOnly?: boolean;
}

/**
 * Body-availability classification driving the fruit glyph. See `FruitBodyState`
 * in types/blockchain.ts for the encoding rationale.
 */
export function classifyFruit(f: StripFruit): FruitBodyState {
  if (f.bodyPresent) {
    return (f.bodyTxCount ?? 0) > 0 ? "payload" : "empty";
  }
  if ((f.receiptTxCount ?? 0) > 0) return "missing";
  return f.headerPresent ? "empty" : "orphan";
}

function fruitTxCount(f: StripFruit): number | null {
  if (f.bodyPresent) return f.bodyTxCount ?? 0;
  return f.receiptTxCount ?? null;
}

/** Stable pseudo-random seed from a hash so jitter is deterministic across renders. */
function hashSeed(hash: string): number {
  let h = 0;
  const start = hash.startsWith("0x") ? 2 : 0;
  for (let i = start; i < Math.min(hash.length, start + 12); i++) {
    h = (h * 31 + hash.charCodeAt(i)) >>> 0;
  }
  return h;
}

type Unit =
  | { type: "stem"; stem: StripStem; epoch: number }
  | { type: "leaf"; leaf: StripLeaf; epoch: number };

type Owner = { stem: string; rank: number; height: number };

export function buildChainLayout(
  strips: EpochStrip[],
  options: BuildLayoutOptions = {},
): ChainLayout {
  const { payloadsOnly = false } = options;

  // Pass 1 — chain order (oldest → newest), dedup stems, build the fruit-owner map.
  const ordered = [...strips].sort((a, b) => a.epoch - b.epoch);
  const chain: Unit[] = [];
  const seenStems = new Set<string>();
  const owner = new Map<string, Owner>();
  let tipHash: string | null = null;
  let tipHeight = -Infinity;

  for (const ep of ordered) {
    for (const interval of ep.intervals) {
      const stems = [...interval.stems].sort((a, b) => a.height - b.height);
      for (const stem of stems) {
        const sh = normHash(stem.hash);
        if (seenStems.has(sh)) continue; // dedup stems by hash
        seenStems.add(sh);
        chain.push({ type: "stem", stem, epoch: ep.epoch });
        if (stem.height > tipHeight) {
          tipHeight = stem.height;
          tipHash = stem.hash;
        }
        // Attribute each fruit to its richest/earliest stem (the true carrier).
        for (const f of stem.fruits) {
          const fh = normHash(f.hash);
          const rank = f.receiptTxCount != null ? 1 : 0;
          const cur = owner.get(fh);
          if (
            !cur ||
            rank > cur.rank ||
            (rank === cur.rank && stem.height < cur.height)
          ) {
            owner.set(fh, { stem: sh, rank, height: stem.height });
          }
        }
      }
      if (interval.leaf) {
        chain.push({ type: "leaf", leaf: interval.leaf, epoch: ep.epoch });
      }
    }
  }

  // Newest at top — render the whole epoch (no cap).
  const topOrder = chain.slice().reverse();

  const stems: PositionedStem[] = [];
  const leaves: PositionedLeaf[] = [];
  const fruits: PositionedFruit[] = [];
  const edges: NeighborEdge[] = [];

  let y = TOP_PAD;
  let maxX = MIN_WIDTH - RIGHT_PAD;
  let prevEpoch: number | null = null;
  let spineTop: number | null = null;
  let spineBottom: number | null = null;

  // Pass 2 — position the rendered units.
  for (const unit of topOrder) {
    if (prevEpoch !== null && unit.epoch !== prevEpoch) y += EPOCH_GAP;
    prevEpoch = unit.epoch;

    if (unit.type === "leaf") {
      const cy = y + LEAF_H / 2;
      leaves.push({
        hash: unit.leaf.hash,
        leafHeight: unit.leaf.leafHeight,
        timestamp: unit.leaf.timestamp,
        txCount: unit.leaf.txCount,
        x: SPINE_X,
        y: cy,
      });
      y += LEAF_H;
      continue;
    }

    const stem = unit.stem;
    const sh = normHash(stem.hash);

    // Only the fruits this stem actually owns (deduped).
    let owned = stem.fruits.filter((f) => owner.get(normHash(f.hash))?.stem === sh);
    // Drop "orphan" fruits: produced/anchored but never actually included in a
    // carrier stem (no retrievable body AND no carrier receipt). Keep payload/empty/
    // missing (missing = a carrier receipt recorded it; body just failed to archive).
    owned = owned.filter((f) => classifyFruit(f) !== "orphan");
    if (payloadsOnly) {
      owned = owned.filter((f) => classifyFruit(f) === "payload");
    }

    const rows = Math.max(1, Math.ceil(owned.length / MAX_FRUITS_PER_ROW));
    const rowHeight = ROW_H + (rows - 1) * FRUIT_SUBROW_DY;
    const cy = y + rowHeight / 2;

    if (spineTop === null) spineTop = cy;
    spineBottom = cy;

    stems.push({
      hash: stem.hash,
      height: stem.height,
      timestamp: stem.timestamp,
      fruitCount: owned.length,
      isTip: stem.hash === tipHash,
      x: SPINE_X,
      y: cy,
    });

    // Fruits fan to the right; track per-row predecessor for neighbor edges.
    const rowLast: Record<number, PositionedFruit> = {};
    owned.forEach((f, i) => {
      const row = Math.floor(i / MAX_FRUITS_PER_ROW);
      const col = i % MAX_FRUITS_PER_ROW;
      const fx = SPINE_X + FRUIT_GAP_X + col * FRUIT_DX;
      const jitter = ((hashSeed(f.hash) % 1000) / 1000 - 0.5) * 2 * JITTER_Y;
      const fy = cy + (row - (rows - 1) / 2) * FRUIT_SUBROW_DY + jitter;
      const pf: PositionedFruit = {
        hash: f.hash,
        fruitType: f.fruitType,
        bodyState: classifyFruit(f),
        txCount: fruitTxCount(f),
        x: fx,
        y: fy,
        stemHash: stem.hash,
        stemX: SPINE_X,
        stemY: cy,
      };
      fruits.push(pf);
      maxX = Math.max(maxX, fx);

      const prev = rowLast[row];
      if (prev) {
        edges.push({
          id: `${sh}-${row}-${col}`,
          x1: prev.x,
          y1: prev.y,
          x2: fx,
          y2: fy,
        });
      }
      rowLast[row] = pf;
    });

    y += rowHeight;
  }

  return {
    stems,
    leaves,
    fruits,
    edges,
    spineTop,
    spineBottom,
    width: Math.max(MIN_WIDTH, maxX + RIGHT_PAD),
    height: y + BOTTOM_PAD,
  };
}
