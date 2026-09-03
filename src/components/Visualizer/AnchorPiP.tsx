/**
 * Picture-in-picture window onto a fruit's anchor stem when that stem falls outside
 * the main viewport.
 *
 * The conduit runs off the edge of the main canvas and re-enters here, arriving at
 * the anchor — the window is parked against the edge the conduit crosses so the two
 * halves read as one line. It is a genuine second viewport, not a diagram: it mounts
 * the same `ChainScene` under a translate, so the anchor's own label, its fruit
 * cluster and its neighbouring stems are all really there.
 *
 * Transient but reachable: the parent holds it open for a grace period after the gem
 * hover ends, and hovering the window itself cancels that release — so it can be
 * travelled to and its nodes clicked like any others. It still holds no state, so it
 * cannot outlive the pointer the way an earlier pin-on-click version did.
 *
 * Layering note: the window must read as sitting *above* the canvas, or the backbone
 * and carrier lines running up to its edge look like they continue into its contents —
 * which are a different stretch of chain entirely. `clip-path` clips an element's own
 * box-shadow, so the chamfered frame cannot carry that separation itself; the shadow
 * lives on an unclipped parent as `drop-shadow-sm`, which follows the chamfered silhouette
 * instead of being eaten by it. Two background-coloured passes form an opaque moat that
 * stops strokes short of the frame, then a dark pass gives it depth.
 */
import type {
  ChainLayout,
  PositionedFruit,
  PositionedStem,
} from "./chainLayout";
import { ChainScene } from "./ChainScene";

export const PIP_WIDTH = 288;
export const PIP_HEIGHT = 156;
/** Where the backbone sits inside the window — biased up to leave room for gems. */
const PIP_BACKBONE_Y = 46;
const EDGE_MARGIN = 12;

interface AnchorPiPProps {
  layout: ChainLayout;
  anchorStem: PositionedStem;
  hovered: PositionedFruit | null;
  /** Backbone positions between the anchor and its carrier. */
  stemsBack: number | null;
  /** Set when the anchor sits in an earlier epoch than the fruit's carrier. */
  anchorEpoch: number | null;
  /** Which edge of the canvas the conduit crosses. */
  side: "left" | "right";
  /** Y (canvas px) where the conduit crosses that edge. */
  edgeY: number;
  /** Canvas height, to clamp the window inside it. */
  canvasHeight: number;
  /** Hovering the window keeps it open; leaving it starts the release timer. */
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onSelectFruit: (fruit: PositionedFruit) => void;
  onSelectBlock: (hash: string) => void;
}

export function AnchorPiP({
  layout,
  anchorStem,
  hovered,
  stemsBack,
  anchorEpoch,
  side,
  edgeY,
  canvasHeight,
  onPointerEnter,
  onPointerLeave,
  onSelectFruit,
  onSelectBlock,
}: AnchorPiPProps) {
  const top = Math.min(
    Math.max(edgeY - PIP_HEIGHT / 2, EDGE_MARGIN),
    Math.max(EDGE_MARGIN, canvasHeight - PIP_HEIGHT - EDGE_MARGIN),
  );

  // Centre the anchor stem horizontally, and sit the backbone near the top.
  const offsetX = PIP_WIDTH / 2 - anchorStem.x;
  const offsetY = PIP_BACKBONE_Y - anchorStem.y;

  const caption =
    stemsBack !== null
      ? `${side === "left" ? "↤" : "↦"} ${stemsBack} stem${
          stemsBack === 1 ? "" : "s"
        } back`
      : "anchor stem";

  return (
    <div
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className="absolute isolate z-40"
      style={{
        top,
        [side]: EDGE_MARGIN,
        width: PIP_WIDTH,
        filter:
          "drop-shadow(0 0 5px hsl(var(--background))) drop-shadow(0 0 5px hsl(var(--background))) drop-shadow(0 10px 22px rgb(0 0 0 / 0.55))",
      }}
    >
      <div className="chamfered-border-wrap">
        <div className="chamfered bg-background text-foreground">
          <div className="flex items-center gap-2 border-b border-border/60 px-2 py-1">
            <span
              className="diamond h-2 w-2 shrink-0 bg-crystal-stem"
              aria-hidden
            />
            <span className="truncate font-mono text-[10px] tracking-wide text-foreground-muted">
              {caption}
              {anchorEpoch !== null && (
                <span className="text-foreground-muted/70">
                  {" "}
                  · epoch {anchorEpoch}
                </span>
              )}
            </span>
          </div>

          <div
            className="relative w-full overflow-hidden"
            style={{ height: PIP_HEIGHT }}
          >
            <div
              className="absolute left-0 top-0"
              style={{ transform: `translate(${offsetX}px, ${offsetY}px)` }}
            >
              <ChainScene
                layout={layout}
                viewport={{
                  left: anchorStem.x - PIP_WIDTH,
                  right: anchorStem.x + PIP_WIDTH,
                }}
                hovered={hovered}
                anchorStem={anchorStem}
                selectedHash={null}
                typeFilter={null}
                ambient={false}
                onSelectFruit={onSelectFruit}
                onSelectBlock={onSelectBlock}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AnchorPiP;
