/**
 * Backbone nodes: stems and leaves threaded on the horizontal rule.
 *
 * Stems are labelled by a trailing hash slice, not by height. In the triple-block
 * model a stem's block height is not the chain position it looks like — leaf height
 * is what advances the chain, and putting a `#n` on a stem invites reading the two as
 * the same counter. Leaves keep their height, which is exactly the meaningful number.
 *
 * Both are diamonds — the shape vocabulary of the public network visualizer —
 * distinguished by size and by the crystal tokens: `--crystal-stem` (green) for
 * stems, `--crystal-leaf` (cyan) for leaves. Both are clickable (→ BlockDetailPanel).
 *
 * `StemNode` also glows when it is the hovered fruit's anchor (`isAnchor`, strong)
 * or its carrier (`isCarrier`, subtle).
 *
 * Layout note: `clip-path` clips an element's own box-shadow, so the glow sits on
 * an unclipped wrapper around the diamond rather than on the diamond itself.
 *
 * Centring note: these wrappers shrink-wrap to their widest child, which is the label,
 * not the diamond. Pulling back by half the *diamond* therefore leaves the diamond
 * sitting right of its own x — visibly detached from the carrier spine, which is drawn
 * at the true coordinate. Centring must be `-translate-x-1/2`, which is relative to the
 * element's real width whatever the label turns out to be.
 */
import { cn, formatTimeAgo } from "@/lib/utils";
import type { PositionedStem, PositionedLeaf } from "./chainLayout";
import { overflowChipPosition } from "./chainLayout";

const STEM_SIZE = 13;
const LEAF_SIZE = 18;

/** Trailing slice of a hash — enough to tell adjacent stems apart at a glance. */
function shortTrailingHash(hash: string): string {
  return hash.replace(/^0x/i, "").slice(-6);
}

export function StemNode({
  stem,
  isAnchor,
  isCarrier,
  ambient,
  onClick,
}: {
  stem: PositionedStem;
  isAnchor: boolean;
  isCarrier: boolean;
  ambient: boolean;
  onClick: (hash: string) => void;
}) {
  const highlighted = isAnchor || isCarrier;
  const size = ambient ? STEM_SIZE - 3 : STEM_SIZE;
  return (
    <div
      className={cn(
        "absolute flex -translate-x-1/2 flex-col items-center",
        highlighted && "z-30",
      )}
      style={{ left: stem.x, top: stem.y, marginTop: -size / 2 }}
    >
      <button
        type="button"
        onClick={() => onClick(stem.hash)}
        title={`Stem ${shortTrailingHash(stem.hash)} — carried ${stem.fruitCount} ${
          stem.fruitCount === 1 ? "fruit" : "fruits"
        } · ${formatTimeAgo(stem.timestamp)}`}
        aria-label={`Stem ${shortTrailingHash(stem.hash)}`}
        className={cn(
          "cursor-pointer transition-[transform,filter] duration-200",
          "hover:scale-150 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-crystal-stem",
          stem.isTip && "pulse-live",
          isAnchor &&
            "scale-150 drop-shadow-[0_0_6px_hsl(var(--crystal-stem))]",
          isCarrier &&
            !isAnchor &&
            "drop-shadow-[0_0_4px_hsl(var(--crystal-stem)/0.7)]",
        )}
        style={{ width: size, height: size }}
      >
        <span
          className={cn(
            "diamond block h-full w-full bg-crystal-stem",
            !highlighted && !stem.isTip && "opacity-80",
          )}
        />
      </button>
      {!ambient && (
        <span className="mt-1 font-mono text-[9px] leading-none text-crystal-stem/70">
          {shortTrailingHash(stem.hash)}
        </span>
      )}
    </div>
  );
}

/**
 * The `+N` chip closing a capped fruit cluster. Clicking expands that stem so the
 * remaining gems render.
 */
export function ClusterOverflowChip({
  stem,
  onExpand,
}: {
  stem: PositionedStem;
  onExpand: (stemHash: string) => void;
}) {
  const { x, y } = overflowChipPosition(stem);
  return (
    <button
      type="button"
      onClick={() => onExpand(stem.hash)}
      title={`Show ${stem.hiddenFruitCount} more ${
        stem.hiddenFruitCount === 1 ? "fruit" : "fruits"
      } carried by this stem`}
      className="absolute -translate-x-1/2 -translate-y-1/2 chamfered-sm bg-card px-1 py-px font-mono text-[8px] leading-tight text-foreground-muted transition-colors hover:bg-card-elevated hover:text-foreground"
      style={{ left: x, top: y }}
    >
      +{stem.hiddenFruitCount}
    </button>
  );
}

export function LeafNode({
  leaf,
  ambient,
  onClick,
}: {
  leaf: PositionedLeaf;
  ambient: boolean;
  onClick: (hash: string) => void;
}) {
  const size = ambient ? LEAF_SIZE - 4 : LEAF_SIZE;
  return (
    <div
      className="absolute flex -translate-x-1/2 flex-col items-center"
      style={{ left: leaf.x, top: leaf.y, marginTop: -size / 2 }}
    >
      <button
        type="button"
        onClick={() => onClick(leaf.hash)}
        title={`Leaf #${leaf.leafHeight} — ${leaf.txCount} tx · ${formatTimeAgo(
          leaf.timestamp,
        )}`}
        aria-label={`Leaf ${leaf.leafHeight}`}
        className={cn(
          "cursor-pointer transition-[transform,filter] duration-200",
          "hover:scale-125 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-crystal-leaf",
          "drop-shadow-[0_0_5px_hsl(var(--crystal-leaf)/0.5)]",
        )}
        style={{ width: size, height: size }}
      >
        <span className="diamond block h-full w-full bg-crystal-leaf" />
      </button>
      {!ambient && (
        <span className="mt-1 font-mono text-[9px] leading-none tabular-nums text-crystal-leaf/80">
          #{leaf.leafHeight}
        </span>
      )}
    </div>
  );
}
