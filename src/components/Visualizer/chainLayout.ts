/**
 * Pure layout engine for the Chain Visualizer.
 *
 * Maps the backend `EpochStrip[]` (stems → leaf intervals) into absolute px
 * coordinates for a **horizontal** backbone: time runs left → right, oldest →
 * newest, with each stem's fruit cluster hanging below it. This is the single
 * source of truth for positions so the SVG connector layer and the HTML node
 * layer agree on geometry — and so a second viewport (the anchor picture-in-
 * picture) can render the same scene under a different transform for free.
 *
 * Dedup: consecutive stems re-reference the same fruits as they carry them forward,
 * so a fruit hash recurs across stems. We attribute each fruit to ONE carrier — the
 * stem whose receipts recorded it (`receiptTxCount != null`), tie-broken by earliest
 * height — and render it exactly once beneath that stem.
 */
import type {
  EpochStrip,
  FruitBodyState,
  StripFruit,
  StripLeaf,
  StripStem,
} from "@/types";

// --- Layout constants (px). All node coordinates are CENTER-anchored. ---
/** Y of the backbone rule. Shared with the connector layer. */
export const BACKBONE_Y = 52;
/** Horizontal advance per stem / leaf column. */
export const STEM_COL_W = 72;
export const LEAF_COL_W = 48;
/** Extra advance inserted where one epoch hands off to the next. */
const EPOCH_GAP = 40;
const LEFT_PAD = 40;
const RIGHT_PAD = 64;
const BOTTOM_PAD = 32;
/**
 * Fruit gems lay out on a fixed grid so columns stay aligned; the gem *drawn*
 * inside a cell varies in size by body state, which is what carries the meaning.
 */
export const GEM_CELL = 24;
/**
 * Two per row, not three: a 3-wide cluster spans almost the whole stem column, so
 * neighbouring clusters merge into one band and you lose which stem carries what.
 * Two leaves a ~24px gutter that reads as a column boundary.
 */
const GEMS_PER_ROW = 2;
/** Gap between the stem's own label and the top of its cluster. */
const CLUSTER_TOP = BACKBONE_Y + 30;
/** Gems rendered per stem before collapsing the tail into a `+N` chip. */
export const FRUITS_PER_STEM_CAP = 12;

/**
 * Centre of the `index`-th cell in a cluster of `totalCells`, for a stem at `stemX`.
 * Rows that are not full are centred rather than left-packed — a stem carrying one
 * fruit should hang it directly below itself, not off to one side.
 */
function cellPosition(
  stemX: number,
  index: number,
  totalCells: number,
): { x: number; y: number } {
  const row = Math.floor(index / GEMS_PER_ROW);
  const col = index % GEMS_PER_ROW;
  const inRow = Math.min(GEMS_PER_ROW, totalCells - row * GEMS_PER_ROW);
  const rowWidth = inRow * GEM_CELL;
  return {
    x: stemX - rowWidth / 2 + col * GEM_CELL + GEM_CELL / 2,
    y: CLUSTER_TOP + row * GEM_CELL + GEM_CELL / 2,
  };
}

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
  timestamp: number;
  epoch: number;
  /** Position along the backbone, oldest = 0. Drives the "N stems back" readout. */
  index: number;
  /** Number of fruits actually rendered under this stem (after dedup/filter). */
  fruitCount: number;
  /** Fruits owned but not rendered because the cluster is capped. */
  hiddenFruitCount: number;
  /** Y of the last cluster row's centre, or null when the stem carries nothing. */
  clusterBottom: number | null;
  isTip: boolean;
  x: number;
  y: number;
};

export type PositionedLeaf = {
  hash: string;
  leafHeight: number;
  timestamp: number;
  txCount: number;
  epoch: number;
  x: number;
  y: number;
};

/** Where one epoch hands off to the next, for the divider rule and its label. */
export type EpochDivider = {
  x: number;
  /** The epoch starting to the right of this divider. */
  epoch: number;
};

export type ChainLayout = {
  stems: PositionedStem[];
  leaves: PositionedLeaf[];
  fruits: PositionedFruit[];
  dividers: EpochDivider[];
  /** Backbone order by normalised stem hash — lets callers measure anchor distance. */
  stemOrder: Map<string, number>;
  /** X of the first / last backbone node — drives the backbone rule's extent. */
  backboneStart: number | null;
  backboneEnd: number | null;
  width: number;
  height: number;
};

export interface BuildLayoutOptions {
  /** When true, only fruits with a payload (≥1 tx) are rendered. */
  payloadsOnly?: boolean;
  /** Stems (normalised hashes) whose cluster should render uncapped. */
  expandedStems?: ReadonlySet<string>;
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

type Unit =
  | { type: "stem"; stem: StripStem; epoch: number }
  | { type: "leaf"; leaf: StripLeaf; epoch: number };

type Owner = { stem: string; rank: number; height: number };

export function buildChainLayout(
  strips: EpochStrip[],
  options: BuildLayoutOptions = {},
): ChainLayout {
  const { payloadsOnly = false, expandedStems } = options;

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

  const stems: PositionedStem[] = [];
  const leaves: PositionedLeaf[] = [];
  const fruits: PositionedFruit[] = [];
  const dividers: EpochDivider[] = [];
  const stemOrder = new Map<string, number>();

  let x = LEFT_PAD;
  let maxClusterRows = 0;
  let prevEpoch: number | null = null;
  let backboneStart: number | null = null;
  let backboneEnd: number | null = null;
  let stemIndex = 0;

  // Pass 2 — position the units along the backbone.
  for (const unit of chain) {
    if (prevEpoch !== null && unit.epoch !== prevEpoch) {
      dividers.push({ x: x + EPOCH_GAP / 2, epoch: unit.epoch });
      x += EPOCH_GAP;
    }
    prevEpoch = unit.epoch;

    if (unit.type === "leaf") {
      const cx = x + LEAF_COL_W / 2;
      leaves.push({
        hash: unit.leaf.hash,
        leafHeight: unit.leaf.leafHeight,
        timestamp: unit.leaf.timestamp,
        txCount: unit.leaf.txCount,
        epoch: unit.epoch,
        x: cx,
        y: BACKBONE_Y,
      });
      if (backboneStart === null) backboneStart = cx;
      backboneEnd = cx;
      x += LEAF_COL_W;
      continue;
    }

    const stem = unit.stem;
    const sh = normHash(stem.hash);
    const cx = x + STEM_COL_W / 2;

    // Only the fruits this stem actually owns (deduped).
    let owned = stem.fruits.filter(
      (f) => owner.get(normHash(f.hash))?.stem === sh,
    );
    // Drop "orphan" fruits: produced/anchored but never actually included in a
    // carrier stem (no retrievable body AND no carrier receipt). Keep payload/empty/
    // missing (missing = a carrier receipt recorded it; body just failed to archive).
    owned = owned.filter((f) => classifyFruit(f) !== "orphan");
    if (payloadsOnly) {
      owned = owned.filter((f) => classifyFruit(f) === "payload");
    }

    // Cap the cluster unless this stem has been expanded. When capped we render
    // one fewer gem so the `+N` chip occupies the final cell.
    const expanded = expandedStems?.has(sh) ?? false;
    const capped = !expanded && owned.length > FRUITS_PER_STEM_CAP;
    const shown = capped ? owned.slice(0, FRUITS_PER_STEM_CAP - 1) : owned;
    const hidden = owned.length - shown.length;

    const cells = shown.length + (hidden > 0 ? 1 : 0);
    const rows = Math.ceil(cells / GEMS_PER_ROW);
    maxClusterRows = Math.max(maxClusterRows, rows);
    const clusterBottom =
      rows > 0 ? CLUSTER_TOP + (rows - 1) * GEM_CELL + GEM_CELL / 2 : null;

    stemOrder.set(sh, stemIndex);
    stems.push({
      hash: stem.hash,
      timestamp: stem.timestamp,
      epoch: unit.epoch,
      index: stemIndex,
      fruitCount: shown.length,
      hiddenFruitCount: hidden,
      clusterBottom,
      isTip: stem.hash === tipHash,
      x: cx,
      y: BACKBONE_Y,
    });
    stemIndex += 1;

    if (backboneStart === null) backboneStart = cx;
    backboneEnd = cx;

    // Gems hang below the stem on a fixed grid, centred on the column.
    shown.forEach((f, i) => {
      const { x: fx, y: fy } = cellPosition(cx, i, cells);
      fruits.push({
        hash: f.hash,
        fruitType: f.fruitType,
        bodyState: classifyFruit(f),
        txCount: fruitTxCount(f),
        x: fx,
        y: fy,
        stemHash: stem.hash,
        stemX: cx,
        stemY: BACKBONE_Y,
      });
    });

    x += STEM_COL_W;
  }

  return {
    stems,
    leaves,
    fruits,
    dividers,
    stemOrder,
    backboneStart,
    backboneEnd,
    width: x + RIGHT_PAD,
    height: CLUSTER_TOP + maxClusterRows * GEM_CELL + BOTTOM_PAD,
  };
}

/**
 * Cell centre for a stem's `+N` overflow chip — the cell immediately after the
 * last rendered gem. Kept here so the node layer never re-derives grid maths.
 */
export function overflowChipPosition(stem: PositionedStem): {
  x: number;
  y: number;
} {
  const index = stem.fruitCount;
  const row = Math.floor(index / GEMS_PER_ROW);
  const col = index % GEMS_PER_ROW;
  const clusterLeft = stem.x - (GEMS_PER_ROW * GEM_CELL) / 2;
  return {
    x: clusterLeft + col * GEM_CELL + GEM_CELL / 2,
    y: CLUSTER_TOP + row * GEM_CELL + GEM_CELL / 2,
  };
}
