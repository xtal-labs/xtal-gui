/**
 * Static spine nodes: stems (emerald) stacked vertically, leaves (amber) capping
 * each interval. Stem/leaf colours follow the toast palette per design. Both are
 * clickable (→ BlockDetailPanel).
 *
 * `StemNode` also glows when it's the hovered fruit's anchor (`isAnchor`, strong) or
 * carrier (`isCarrier`, subtle).
 *
 * Layout note: the glow sits on an unclipped wrapper around the chamfered gem —
 * `clip-path` would otherwise clip the node's own box-shadow.
 */
import { Sprout, Leaf } from "lucide-react";

import { cn, formatTimeAgo } from "@/lib/utils";
import type { PositionedStem, PositionedLeaf } from "./chainLayout";

const STEM_SIZE = 44;
const LEAF_SIZE = 48;

export function StemNode({
  stem,
  isAnchor,
  isCarrier,
  onClick,
}: {
  stem: PositionedStem;
  isAnchor: boolean;
  isCarrier: boolean;
  onClick: (hash: string) => void;
}) {
  const highlighted = isAnchor || isCarrier;
  return (
    <div
      className={cn("absolute flex flex-col items-center", highlighted && "z-30")}
      style={{
        left: stem.x,
        top: stem.y,
        marginLeft: -STEM_SIZE / 2,
        marginTop: -STEM_SIZE / 2,
      }}
      title={`Stem #${stem.height} — ${stem.fruitCount} ${
        stem.fruitCount === 1 ? "fruit" : "fruits"
      } · ${formatTimeAgo(stem.timestamp)}`}
    >
      <button
        type="button"
        onClick={() => onClick(stem.hash)}
        className={cn(
          "rounded-[5px] cursor-pointer transition-[transform,box-shadow] duration-200",
          "hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400",
          stem.isTip && "pulse-live",
          isAnchor && "scale-110 crystal-glow",
          isCarrier && !isAnchor && "crystal-glow-sm",
        )}
      >
        <div
          className={cn(
            "flex items-center justify-center chamfered-sm border bg-gradient-to-br",
            "from-emerald-500/25 via-green-500/15 to-teal-500/10 border-emerald-500/40 text-emerald-400",
            highlighted && "border-emerald-400",
          )}
          style={{ width: STEM_SIZE, height: STEM_SIZE }}
        >
          <Sprout className="h-5 w-5" />
        </div>
      </button>
      <span className="mt-1 font-mono text-[9px] tabular-nums text-emerald-300/70">
        #{stem.height}
      </span>
    </div>
  );
}

export function LeafNode({
  leaf,
  onClick,
}: {
  leaf: PositionedLeaf;
  onClick: (hash: string) => void;
}) {
  return (
    <div
      className="absolute flex flex-col items-center"
      style={{
        left: leaf.x,
        top: leaf.y,
        marginLeft: -LEAF_SIZE / 2,
        marginTop: -LEAF_SIZE / 2,
      }}
      title={`Leaf #${leaf.leafHeight} — ${leaf.txCount} tx · ${formatTimeAgo(
        leaf.timestamp,
      )}`}
    >
      <button
        type="button"
        onClick={() => onClick(leaf.hash)}
        className={cn(
          "rounded-[5px] cursor-pointer transition-transform duration-200",
          "hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400",
        )}
      >
        <div
          className={cn(
            "flex items-center justify-center chamfered border bg-gradient-to-br",
            "from-amber-600/30 via-orange-400/15 to-yellow-600/10 border-amber-500/40 text-amber-400",
          )}
          style={{ width: LEAF_SIZE, height: LEAF_SIZE }}
        >
          <Leaf className="h-5 w-5" />
        </div>
      </button>
      <span className="mt-1 font-mono text-[9px] tabular-nums text-amber-300/70">
        #{leaf.leafHeight} · {leaf.txCount}tx
      </span>
    </div>
  );
}
