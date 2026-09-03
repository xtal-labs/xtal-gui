/**
 * A single fruit gem on the backbone — a hexagonal crystal whose colour is its
 * fruit type. Body availability is encoded by **size + facets + count** so payload
 * fruits read at a glance:
 *   payload → largest, faceted, glowing, tx-count badge
 *   missing → medium, warning ring (the body failed to archive)
 *   empty   → small, flat, dim
 *   orphan  → smallest, ghosted (normally filtered out before layout)
 *
 * Layout note: `clip-path` clips an element's own box-shadow, so the glow and the
 * count badge live on the OUTER (unclipped) button while the hexagon is an inner
 * span. The same constraint rules out a border on the hexagon itself, so the
 * `missing` ring is a padded hexagon wrapper — the technique `.chamfered-border-wrap`
 * uses in globals.css.
 */
import { cn } from "@/lib/utils";
import { getFruitColor, fruitGemVars } from "@/lib/fruitColors";
import type { FruitBodyState } from "@/types";
import type { PositionedFruit } from "./chainLayout";

/** Drawn gem width per state; the layout cell it sits in is a fixed GEM_CELL. */
const SIZE_BY_STATE: Record<FruitBodyState, number> = {
  payload: 20,
  missing: 17,
  empty: 13,
  orphan: 10,
};

/** Hexagons read best a touch wider than tall, matching the clip-path's geometry. */
const ASPECT = 0.86;

export function fruitStateLabel(
  state: FruitBodyState,
  txCount: number | null,
): string {
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
  /** A type filter is active and this gem is not of that type. */
  isDimmed: boolean;
  /** Low zoom: drop the badge and the glow so the overview stays legible. */
  ambient: boolean;
  onHover: (fruit: PositionedFruit | null) => void;
  onSelect: (fruit: PositionedFruit) => void;
}

export function FruitNode({
  fruit,
  isHovered,
  isSelected,
  isDimmed,
  ambient,
  onHover,
  onSelect,
}: FruitNodeProps) {
  const color = getFruitColor(fruit.fruitType);
  const state = fruit.bodyState;
  const hasPayload = state === "payload";
  const isMissing = state === "missing";
  const lifted = isHovered || isSelected;
  const width = SIZE_BY_STATE[state];
  const height = Math.round(width * ASPECT);

  const gemStyle = {
    ...fruitGemVars(fruit.fruitType),
    backgroundColor: `hsl(${color.hsl} / ${hasPayload ? 0.95 : 0.62})`,
  } as React.CSSProperties;

  return (
    <button
      type="button"
      onMouseEnter={() => onHover(fruit)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(fruit)}
      onBlur={() => onHover(null)}
      onClick={() => onSelect(fruit)}
      aria-label={`${fruit.fruitType} fruit — ${fruitStateLabel(state, fruit.txCount)}`}
      className={cn(
        "absolute flex items-center justify-center cursor-pointer",
        "transition-[transform,opacity,filter] duration-200 will-change-transform",
        "focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary",
        hasPayload && !ambient && "drop-shadow-[0_0_4px_currentColor]",
        lifted && "z-20 scale-125",
        isDimmed && "opacity-20",
        isSelected && "drop-shadow-[0_0_6px_currentColor]",
      )}
      style={{
        left: fruit.x,
        top: fruit.y,
        width,
        height,
        marginLeft: -width / 2,
        marginTop: -height / 2,
        color: `hsl(${color.hsl})`,
      }}
    >
      {isMissing ? (
        // Padded outer hexagon = a ring the clip-path cannot eat.
        <span
          className="hexagon h-full w-full p-[1.5px]"
          style={{ backgroundColor: "hsl(var(--warning))" }}
        >
          <span
            className={cn("hexagon block h-full w-full", !ambient && "hex-gem")}
            style={gemStyle}
          />
        </span>
      ) : (
        <span
          className={cn(
            "hexagon h-full w-full",
            hasPayload && !ambient && "hex-gem",
            state === "orphan" && "opacity-50 grayscale",
          )}
          style={gemStyle}
        />
      )}

      {hasPayload && !ambient && fruit.txCount ? (
        <span className="absolute -top-1 -right-1.5 flex h-[13px] min-w-[13px] items-center justify-center rounded-full bg-primary px-[3px] text-[8px] font-mono font-bold leading-none text-primary-foreground">
          {fruit.txCount > 99 ? "99+" : fruit.txCount}
        </span>
      ) : null}
    </button>
  );
}

export default FruitNode;
