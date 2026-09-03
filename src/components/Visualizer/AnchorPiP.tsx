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
 * Placement is a suggestion, not a rule: the window spawns against the edge the conduit
 * crosses, but the title bar drags it anywhere on the canvas and the resulting offset is
 * remembered by the parent, so every later spawn lands where the user last put it. A
 * double-click on the bar (or the reset button that appears once it has been moved) puts
 * the spawn point back on the edge.
 *
 * Layering note: the window must read as sitting *above* the canvas, or the backbone
 * and carrier lines running up to its edge look like they continue into its contents —
 * which are a different stretch of chain entirely. `clip-path` clips an element's own
 * box-shadow, so the chamfered frame cannot carry that separation itself; the shadow
 * lives on an unclipped parent as `drop-shadow-sm`, which follows the chamfered silhouette
 * instead of being eaten by it. Two background-coloured passes form an opaque moat that
 * stops strokes short of the frame, then a dark pass gives it depth.
 */
import { useCallback, useRef } from "react";
import { RotateCcw } from "lucide-react";
import type {
  ChainLayout,
  PositionedFruit,
  PositionedStem,
} from "./chainLayout";
import { ChainScene } from "./ChainScene";

export const PIP_WIDTH = 288;
export const PIP_HEIGHT = 156;
/** Title bar height, counted when clamping the window inside the canvas. */
const PIP_CHROME_HEIGHT = 24;
/** Where the backbone sits inside the window — biased up to leave room for gems. */
const PIP_BACKBONE_Y = 46;
const EDGE_MARGIN = 12;

/** User adjustment to the spawn point, in canvas px from the computed edge position. */
export interface PiPOffset {
  x: number;
  y: number;
}

export const PIP_OFFSET_NONE: PiPOffset = { x: 0, y: 0 };

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
  /** Canvas size, to clamp the window inside it. */
  canvasWidth: number;
  canvasHeight: number;
  /** Where the user dragged the window, relative to the computed edge position. */
  offset: PiPOffset;
  onOffsetChange: (offset: PiPOffset) => void;
  /** The parent's grace period has run out — fade rather than cut, then it unmounts. */
  fading: boolean;
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
  canvasWidth,
  canvasHeight,
  offset,
  onOffsetChange,
  fading,
  onPointerEnter,
  onPointerLeave,
  onSelectFruit,
  onSelectBlock,
}: AnchorPiPProps) {
  const dragRef = useRef<{
    pointerX: number;
    pointerY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const clampX = (x: number) =>
    Math.min(
      Math.max(x, EDGE_MARGIN),
      Math.max(EDGE_MARGIN, canvasWidth - PIP_WIDTH - EDGE_MARGIN),
    );
  const clampY = (y: number) =>
    Math.min(
      Math.max(y, EDGE_MARGIN),
      Math.max(
        EDGE_MARGIN,
        canvasHeight - PIP_HEIGHT - PIP_CHROME_HEIGHT - EDGE_MARGIN,
      ),
    );

  const spawnLeft =
    side === "left" ? EDGE_MARGIN : canvasWidth - PIP_WIDTH - EDGE_MARGIN;
  const left = clampX(spawnLeft + offset.x);
  const top = clampY(edgeY - PIP_HEIGHT / 2 + offset.y);

  const isMoved = offset.x !== 0 || offset.y !== 0;

  const handleDragStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        pointerX: e.clientX,
        pointerY: e.clientY,
        originX: offset.x,
        originY: offset.y,
      };
    },
    [offset.x, offset.y],
  );

  const handleDragMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      onOffsetChange({
        x: drag.originX + (e.clientX - drag.pointerX),
        y: drag.originY + (e.clientY - drag.pointerY),
      });
    },
    [onOffsetChange],
  );

  const handleDragEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  // Dragging routinely takes the pointer outside the window; the release timer must
  // not start until the drag ends, or the window vanishes from under the cursor.
  const handlePointerLeave = useCallback(() => {
    if (dragRef.current) return;
    onPointerLeave();
  }, [onPointerLeave]);

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
      onPointerLeave={handlePointerLeave}
      className="animate-in fade-in absolute isolate z-40 duration-200"
      style={{
        top,
        left,
        width: PIP_WIDTH,
        opacity: fading ? 0 : 1,
        // A fading window is on its way out — don't let it swallow the pointer.
        pointerEvents: fading ? "none" : undefined,
        transition: "opacity 220ms ease-out",
        filter:
          "drop-shadow(0 0 5px hsl(var(--background))) drop-shadow(0 0 5px hsl(var(--background))) drop-shadow(0 10px 22px rgb(0 0 0 / 0.55))",
      }}
    >
      <div className="chamfered-border-wrap">
        <div className="chamfered bg-background text-foreground">
          <div
            onPointerDown={handleDragStart}
            onPointerMove={handleDragMove}
            onPointerUp={handleDragEnd}
            onPointerCancel={handleDragEnd}
            onDoubleClick={() => onOffsetChange(PIP_OFFSET_NONE)}
            title="Drag to move · double-click to reset"
            className="flex cursor-grab touch-none select-none items-center gap-2 border-b border-border/60 px-2 py-1 active:cursor-grabbing"
          >
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
            {isMoved && (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onOffsetChange(PIP_OFFSET_NONE)}
                title="Reset the spawn point to the canvas edge"
                className="ml-auto shrink-0 cursor-pointer rounded-sm p-0.5 text-foreground-muted/70 hover:bg-muted hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            )}
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
