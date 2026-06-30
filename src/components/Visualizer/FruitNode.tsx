/**
 * A single fruit node in the constellation — a colour-coded crystal (no glyph;
 * colour = fruit type, from fruitColors). Body-availability is encoded by
 * **size + glow + count** so payload fruits are obvious at a glance:
 *   payload → big, filled, glowing, tx-count badge
 *   missing → medium, dashed outline, ⚠
 *   empty   → small, dim, hollow
 *   orphan  → tiny, faint
 *
 * Layout note: the glow/ring/count-badge live on the OUTER (unclipped) button
 * while the chamfered "gem" is an inner span — `clip-path` clips an element's own
 * box-shadow, so a glow on the chamfered element itself would be invisible.
 */
import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";
import { getFruitColor } from "@/lib/fruitColors";
import type { FruitBodyState } from "@/types";
import type { PositionedFruit } from "./chainLayout";

const SIZE_BY_STATE: Record<FruitBodyState, number> = {
  payload: 40,
  missing: 30,
  empty: 22,
  orphan: 16,
};

function stateLabel(state: FruitBodyState, txCount: number | null): string {
  switch (state) {
    case "payload":
      return `payload · ${txCount ?? 0} tx`;
    case "empty":
      return "empty (0 tx)";
    case "missing":
      return `missing body · receipt ${txCount ?? "?"} tx`;
    case "orphan":
    default:
      return "orphan (no payload)";
  }
}

interface FruitNodeProps {
  fruit: PositionedFruit;
  isHovered: boolean;
  isSelected: boolean;
  onHover: (fruit: PositionedFruit | null) => void;
  onSelect: (fruit: PositionedFruit) => void;
}

export function FruitNode({
  fruit,
  isHovered,
  isSelected,
  onHover,
  onSelect,
}: FruitNodeProps) {
  const color = getFruitColor(fruit.fruitType);
  const state = fruit.bodyState;
  const hasPayload = state === "payload";
  const isEmpty = state === "empty";
  const isMissing = state === "missing";
  const isOrphan = state === "orphan";
  const lifted = isHovered || isSelected;
  const size = SIZE_BY_STATE[state];

  return (
    <button
      type="button"
      onMouseEnter={() => onHover(fruit)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(fruit)}
      onBlur={() => onHover(null)}
      onClick={() => onSelect(fruit)}
      title={`${color.emoji} ${fruit.fruitType} — ${stateLabel(state, fruit.txCount)}`}
      className={cn(
        "absolute flex items-center justify-center rounded-[5px] cursor-pointer",
        "transition-[transform,box-shadow] duration-200 will-change-transform",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        // payload glows at rest so it reads instantly; everything lifts on hover/select
        hasPayload && cn(color.glow, "crystal-glow-sm"),
        lifted && cn("z-20 scale-110 crystal-glow", color.glow),
        isSelected && "ring-2 ring-primary",
      )}
      style={{
        left: fruit.x,
        top: fruit.y,
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
      }}
    >
      <span
        className={cn(
          "h-full w-full chamfered-sm border bg-gradient-to-br",
          color.border,
          hasPayload
            ? cn(color.bg, "saturate-150")
            : "from-transparent to-transparent",
          isEmpty && "opacity-70",
          isMissing && "border-dashed opacity-80",
          isOrphan && "bg-foreground-muted/15 opacity-40 grayscale border-border/40",
        )}
      />

      {hasPayload && fruit.txCount ? (
        <span className="absolute -top-1.5 -right-1.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-mono font-bold text-primary-foreground shadow">
          {fruit.txCount > 99 ? "99+" : fruit.txCount}
        </span>
      ) : null}

      {isMissing && (
        <span className="absolute -top-1.5 -right-1.5 text-warning">
          <AlertTriangle className="h-3 w-3" />
        </span>
      )}
    </button>
  );
}

export default FruitNode;
