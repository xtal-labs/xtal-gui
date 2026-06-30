/**
 * SVG layer drawn behind the chain nodes. Shares the layout's px coordinate space.
 *
 * - Static spine beam through the stem column.
 * - Persistent carrier traces (fruit → its bundling stem), faint; the hovered
 *   fruit's carrier brightens.
 * - Always-on dashed neighbor traces between sibling fruits.
 * - On hover, a solid fruit-coloured conduit drawn from the fruit to its ANCHOR
 *   stem (resolved by the parent); that stem glows.
 */
import { cn } from "@/lib/utils";
import { SPINE_X, type ChainLayout, type PositionedFruit } from "./chainLayout";

interface ConnectorLayerProps {
  layout: ChainLayout;
  hovered: PositionedFruit | null;
  /** Tailwind `text-*` class of the hovered fruit; drives the conduit's currentColor. */
  hoveredColorClass?: string;
  /** Position of the hovered fruit's anchor stem, when it's in the current view. */
  anchorTarget: { x: number; y: number } | null;
}

export function ConnectorLayer({
  layout,
  hovered,
  hoveredColorClass,
  anchorTarget,
}: ConnectorLayerProps) {
  const { fruits, edges, spineTop, spineBottom, width, height } = layout;
  const hasSpine =
    spineTop !== null && spineBottom !== null && spineBottom > spineTop;
  // Animating hundreds of dashed traces is costly — keep them static in big epochs.
  const animateDashes = edges.length <= 350;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="absolute inset-0 pointer-events-none overflow-visible"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="cv-spine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--crystal-stem))" stopOpacity="0.04" />
          <stop offset="12%" stopColor="hsl(var(--crystal-stem))" stopOpacity="0.5" />
          <stop offset="88%" stopColor="hsl(var(--crystal-stem))" stopOpacity="0.5" />
          <stop offset="100%" stopColor="hsl(var(--crystal-stem))" stopOpacity="0.04" />
        </linearGradient>
      </defs>

      {/* Static spine beam */}
      {hasSpine && (
        <line
          x1={SPINE_X}
          y1={spineTop! - 24}
          x2={SPINE_X}
          y2={spineBottom! + 24}
          stroke="url(#cv-spine)"
          strokeWidth={2}
          style={{ filter: "drop-shadow(0 0 6px hsl(var(--crystal-stem) / 0.45))" }}
        />
      )}

      {/* Persistent carrier traces: each fruit → its bundling stem. */}
      <g stroke="hsl(var(--crystal-stem))">
        {fruits.map((f) => {
          const isActive = hovered?.hash === f.hash;
          return (
            <line
              key={`carrier-${f.hash}`}
              x1={f.x}
              y1={f.y}
              x2={f.stemX}
              y2={f.stemY}
              strokeWidth={isActive ? 2 : 1.2}
              strokeOpacity={isActive ? 0.7 : 0.22}
              strokeLinecap="round"
              style={
                isActive
                  ? { filter: "drop-shadow(0 0 4px hsl(var(--crystal-stem) / 0.7))" }
                  : undefined
              }
            />
          );
        })}
      </g>

      {/* Always-on dashed neighbor traces */}
      <g className="text-primary" stroke="currentColor">
        {edges.map((e) => (
          <line
            key={e.id}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            strokeWidth={1.2}
            strokeOpacity={0.18}
            strokeLinecap="round"
            strokeDasharray="4 6"
            className={cn(animateDashes && "dash-flow")}
          />
        ))}
      </g>

      {/* Hover conduit: fruit → ANCHOR stem. Keyed so the draw-in restarts per fruit. */}
      {hovered && anchorTarget && (
        <g
          key={`anchor-${hovered.hash}`}
          className={cn(hoveredColorClass)}
          stroke="currentColor"
        >
          <line
            x1={hovered.x}
            y1={hovered.y}
            x2={anchorTarget.x}
            y2={anchorTarget.y}
            strokeWidth={6}
            strokeOpacity={0.16}
            strokeLinecap="round"
            style={{ filter: "drop-shadow(0 0 8px currentColor)" }}
          />
          <line
            x1={hovered.x}
            y1={hovered.y}
            x2={anchorTarget.x}
            y2={anchorTarget.y}
            strokeWidth={2}
            strokeOpacity={0.95}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={1}
            className="trace-draw"
            style={{ filter: "drop-shadow(0 0 4px currentColor)" }}
          />
        </g>
      )}
    </svg>
  );
}

export default ConnectorLayer;
