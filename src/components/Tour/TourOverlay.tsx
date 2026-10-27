import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, GripHorizontal, RotateCcw, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn, toShards } from "@/lib/utils";
import { useTourStore, useUiStore, useValidatorStore } from "@/stores";
import type { ConsensusParams } from "@/types";
import { TOUR_CHAPTERS } from "./chapters";
import type { TourChapter, TourContext, TourStep } from "./types";

interface Size {
  width: number;
  height: number;
}

interface Box extends Size {
  top: number;
  left: number;
}

interface Position {
  top: number;
  left: number;
}

function clampPosition(position: Position, card: Size, viewport: Size): Position {
  return {
    top: Math.max(VIEWPORT_MARGIN, Math.min(position.top, viewport.height - card.height - VIEWPORT_MARGIN)),
    left: Math.max(VIEWPORT_MARGIN, Math.min(position.left, viewport.width - card.width - VIEWPORT_MARGIN)),
  };
}

type Anchor =
  /** Waiting for the step's anchor to mount (tab switch, lazy-loaded page). */
  | { state: "searching" }
  /** The step has no anchor, or it never appeared: show a centred card. */
  | { state: "none" }
  /** `box` is the visible part of the anchor; null while it is scrolled out of view. */
  | { state: "found"; box: Box | null; isFallback: boolean };

/** Breathing room between an anchor and the edge of its spotlight. */
const SPOTLIGHT_PADDING = 6;
const CARD_GAP = 14;
const VIEWPORT_MARGIN = 16;
/** How long a step waits for its anchor before settling for a centred card. */
const ANCHOR_WAIT_MS = 700;

function findAnchor(name: string | undefined): HTMLElement | null {
  if (!name) return null;
  const element = document.querySelector<HTMLElement>(`[data-tour="${name}"]`);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? element : null;
}

/** Nearest ancestor that scrolls vertically, i.e. the page's scroll area. */
function scrollParent(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
      return node;
    }
  }
  return null;
}

/**
 * Scroll the page so the anchor and the card beneath it sit together in the
 * window. A plain `scrollIntoView` centres the anchor alone, which leaves room
 * for the card on neither side of it.
 */
function bringIntoView(element: HTMLElement, container: HTMLElement | null, cardHeight: number) {
  if (!container) return;
  const rect = element.getBoundingClientRect();
  const areaTop = Math.max(container.getBoundingClientRect().top, 0);
  const stack = rect.height + 2 * SPOTLIGHT_PADDING + CARD_GAP + cardHeight;
  const centred = areaTop + (window.innerHeight - areaTop - stack) / 2;
  // When the two do not fit, pin the anchor's top edge and let the card overlap it.
  const desiredTop = Math.max(areaTop + VIEWPORT_MARGIN, centred) + SPOTLIGHT_PADDING;
  container.scrollBy({ top: rect.top - desiredTop, behavior: "smooth" });
}

/** The part of `rect` inside `clip`, or null when none of it is. */
function clipBox(rect: DOMRect, clip: DOMRect | null): Box | null {
  const top = clip ? Math.max(rect.top, clip.top) : rect.top;
  const left = clip ? Math.max(rect.left, clip.left) : rect.left;
  const bottom = clip ? Math.min(rect.bottom, clip.bottom) : rect.bottom;
  const right = clip ? Math.min(rect.right, clip.right) : rect.right;
  if (bottom <= top || right <= left) return null;
  return { top, left, width: right - left, height: bottom - top };
}

/**
 * Follow a step's anchor on screen. Polls every frame rather than observing:
 * the anchor moves with page scroll, window resizes, entry animations and
 * live data reflowing the page, and one read per frame covers all of them.
 */
function useAnchor(step: TourStep, cardHeight: RefObject<number>): Anchor {
  const [anchor, setAnchor] = useState<Anchor>({ state: "searching" });
  const { target, fallbackTarget } = step;

  useEffect(() => {
    if (!target) {
      setAnchor({ state: "none" });
      return;
    }

    setAnchor({ state: "searching" });
    const startedAt = performance.now();
    let frame = 0;
    let scrolledTo: HTMLElement | null = null;
    let container: HTMLElement | null = null;
    let last: { box: Box | null; isFallback: boolean } | null = null;
    let gaveUp = false;

    const tick = () => {
      const primary = findAnchor(target);
      const element = primary ?? findAnchor(fallbackTarget);

      if (element) {
        if (scrolledTo !== element) {
          scrolledTo = element;
          container = scrollParent(element);
          bringIntoView(element, container, cardHeight.current);
        }

        // Clipped to the scroll area, so the spotlight never spills onto the
        // top bar when the anchor is scrolled partly out of it.
        const box = clipBox(
          element.getBoundingClientRect(),
          container?.getBoundingClientRect() ?? null
        );
        const isFallback = !primary;
        const moved =
          !last ||
          last.isFallback !== isFallback ||
          (last.box === null) !== (box === null) ||
          (last.box !== null &&
            box !== null &&
            (Math.abs(last.box.top - box.top) > 0.5 ||
              Math.abs(last.box.left - box.left) > 0.5 ||
              Math.abs(last.box.width - box.width) > 0.5 ||
              Math.abs(last.box.height - box.height) > 0.5));
        if (moved) {
          last = { box, isFallback };
          gaveUp = false;
          setAnchor({ state: "found", box, isFallback });
        }
      } else if (!gaveUp && (last || performance.now() - startedAt > ANCHOR_WAIT_MS)) {
        last = null;
        scrolledTo = null;
        gaveUp = true;
        setAnchor({ state: "none" });
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, fallbackTarget, cardHeight]);

  return anchor;
}

function useViewport(): Size {
  const [size, setSize] = useState<Size>(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return size;
}

/** An anchor's visible box padded for the spotlight, kept inside the window. */
function spotlightBox(box: Box, viewport: Size): Box | null {
  const top = Math.max(box.top - SPOTLIGHT_PADDING, 0);
  const left = Math.max(box.left - SPOTLIGHT_PADDING, 0);
  const bottom = Math.min(box.top + box.height + SPOTLIGHT_PADDING, viewport.height);
  const right = Math.min(box.left + box.width + SPOTLIGHT_PADDING, viewport.width);
  if (bottom <= top || right <= left) return null;
  return { top, left, width: right - left, height: bottom - top };
}

/** Put the card beside the spotlight without covering it, or centre it when there is none. */
function placeCard(spotlight: Box | null, card: Size, viewport: Size): { top: number; left: number } {
  const clampX = (x: number) =>
    Math.max(VIEWPORT_MARGIN, Math.min(x, viewport.width - card.width - VIEWPORT_MARGIN));
  const clampY = (y: number) =>
    Math.max(VIEWPORT_MARGIN, Math.min(y, viewport.height - card.height - VIEWPORT_MARGIN));

  if (!spotlight) {
    return {
      top: clampY((viewport.height - card.height) / 2),
      left: clampX((viewport.width - card.width) / 2),
    };
  }

  const alignedX = clampX(spotlight.left + spotlight.width / 2 - card.width / 2);
  const alignedY = clampY(spotlight.top + spotlight.height / 2 - card.height / 2);

  const below = spotlight.top + spotlight.height + CARD_GAP;
  if (below + card.height <= viewport.height - VIEWPORT_MARGIN) return { top: below, left: alignedX };

  const above = spotlight.top - CARD_GAP - card.height;
  if (above >= VIEWPORT_MARGIN) return { top: above, left: alignedX };

  const right = spotlight.left + spotlight.width + CARD_GAP;
  if (right + card.width <= viewport.width - VIEWPORT_MARGIN) return { top: alignedY, left: right };

  const left = spotlight.left - CARD_GAP - card.width;
  if (left >= VIEWPORT_MARGIN) return { top: alignedY, left };

  // Nothing fits. Take the roomier side and cover as little of the anchor as possible.
  const roomBelow = viewport.height - (spotlight.top + spotlight.height);
  return { top: clampY(roomBelow >= spotlight.top ? below : above), left: alignedX };
}

function useTourContext(params: ConsensusParams): TourContext {
  const loaded = useValidatorStore((state) => state.isLoaded);
  const funded = useValidatorStore((state) => toShards(state.availableBalance) > 0n);
  const staked = useValidatorStore((state) => toShards(state.totalStake) > 0n);
  const producing = useValidatorStore((state) =>
    Object.values(state.productions).some((production) => production.isActive)
  );

  return { params, validator: { loaded, funded, staked, producing } };
}

interface TourStepViewProps {
  chapter: TourChapter;
  step: TourStep;
  stepIndex: number;
  params: ConsensusParams;
  /** Label of the chapter that follows this one in the run, if any. */
  nextChapterTitle: string | null;
  /** First step of the whole run: there is nothing to go back to. */
  isFirst: boolean;
  /** Chapters in the run and the index of the current one, for the progress strip. */
  runLength: number;
  chapterIndex: number;
}

function TourStepView({
  chapter,
  step,
  stepIndex,
  params,
  nextChapterTitle,
  isFirst,
  runLength,
  chapterIndex,
}: TourStepViewProps) {
  const next = useTourStore((state) => state.next);
  const back = useTourStore((state) => state.back);
  const stop = useTourStore((state) => state.stop);
  const setActiveTab = useUiStore((state) => state.setActiveTab);

  const titleId = useId();
  const bodyId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const [cardSize, setCardSize] = useState<Size | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [manualPosition, setManualPosition] = useState<Position | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ pointerId: number; x: number; y: number; origin: Position } | null>(null);
  // Read when a step first scrolls its anchor into place. A ref, so that the
  // card resizing does not restart the anchor search.
  const cardHeight = useRef(0);

  const context = useTourContext(params);
  const anchor = useAnchor(step, cardHeight);
  const viewport = useViewport();

  useEffect(() => {
    if (chapter.tab) setActiveTab(chapter.tab);
  }, [chapter.tab, setActiveTab]);

  // The walkthrough is non-modal: highlighted controls keep their normal
  // pointer and keyboard behavior.
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const card = cardRef.current;
    return () => {
      if (
        previouslyFocused instanceof HTMLElement &&
        (document.activeElement === document.body || card?.contains(document.activeElement))
      ) {
        previouslyFocused.focus();
      }
    };
  }, []);

  // Yield to dialogs, side panels and dropdowns, including ones owned locally
  // by a component. Resume the same step and position when they close.
  useEffect(() => {
    const update = () => {
      const popups = document.querySelectorAll<HTMLElement>(
        '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [role="tooltip"]'
      );
      setDialogOpen(Array.from(popups).some((popup) =>
        popup !== cardRef.current &&
        popup.getAttribute("aria-hidden") !== "true" &&
        popup.getClientRects().length > 0 &&
        getComputedStyle(popup).visibility !== "hidden"
      ));
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["role", "aria-modal", "aria-hidden", "data-state", "hidden"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!dialogOpen) primaryRef.current?.focus({ preventScroll: true });
  }, [chapter.id, step.id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Inputs, sliders, dropdowns and dialogs own their keyboard events.
      if (
        event.defaultPrevented ||
        event.metaKey || event.ctrlKey || event.altKey ||
        !(event.target instanceof Node) ||
        !cardRef.current?.contains(event.target)
      ) return;
      if (event.key === "Escape") stop();
      else if (event.key === "ArrowRight") next();
      else if (event.key === "ArrowLeft") back();
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [next, back, stop]);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const measure = () => {
      // Keep the last size while hidden behind a popup.
      if (card.offsetWidth && card.offsetHeight) {
        setCardSize({ width: card.offsetWidth, height: card.offsetHeight });
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  // Measured synchronously on each step: the resize observer above reports a
  // frame too late for the anchor's first scroll.
  useLayoutEffect(() => {
    cardHeight.current = cardRef.current?.offsetHeight ?? 0;
  }, [chapter.id, step.id]);

  const spotlight =
    anchor.state === "found" && anchor.box ? spotlightBox(anchor.box, viewport) : null;
  const cardPosition = cardSize
    ? manualPosition
      ? clampPosition(manualPosition, cardSize, viewport)
      : placeCard(spotlight, cardSize, viewport)
    : null;
  const showNote =
    step.missingNote !== undefined &&
    (anchor.state === "none" || (anchor.state === "found" && anchor.isFallback));
  const isLastInChapter = stepIndex === chapter.steps.length - 1;
  const primaryLabel = !isLastInChapter
    ? "Next"
    : nextChapterTitle
      ? `Next: ${nextChapterTitle}`
      : "Finish";

  return createPortal(
    <div className={cn("pointer-events-none fixed inset-0 z-60 text-foreground", dialogOpen && "hidden")}>
      {/* The dim is this element's shadow, so the spotlight is a real hole in it.
          With no anchor it collapses to a point and the shadow covers the window. */}
      <div
        className={cn(
          "pointer-events-none absolute rounded-md border-2 transition-all duration-150 ease-out",
          spotlight ? "border-accent" : "border-transparent"
        )}
        style={{
          ...(spotlight ?? { top: viewport.height / 2, left: viewport.width / 2, width: 0, height: 0 }),
          boxShadow: "0 0 0 200vmax rgb(0 0 0 / 0.6)",
        }}
      />

      <Card
        ref={cardRef}
        variant="crystalline"
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className={cn(
          "pointer-events-auto absolute w-[360px] max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto p-5",
          !manualPosition && "transition-[top,left,opacity] duration-200 ease-out",
          // Hidden until placed, and while the anchor is still mounting, so the
          // card does not flash in the centre before jumping to its anchor.
          (!cardPosition || anchor.state === "searching") && "opacity-0"
        )}
        style={cardPosition ?? { top: 0, left: 0 }}
      >
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            aria-label="Move walkthrough card"
            title="Drag to move; use arrow keys when focused"
            className={cn(
              "flex min-w-0 flex-1 touch-none select-none items-center gap-2 rounded-sm text-left text-xs font-heading tracking-wide text-accent focus-visible:outline-2 focus-visible:outline-accent",
              dragging ? "cursor-grabbing" : "cursor-grab"
            )}
            onPointerDown={(event) => {
              if (event.button !== 0 || !cardPosition) return;
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = {
                pointerId: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                origin: cardPosition,
              };
              setManualPosition(cardPosition);
              setDragging(true);
            }}
            onPointerMove={(event) => {
              const start = drag.current;
              if (!start || start.pointerId !== event.pointerId || !cardSize) return;
              setManualPosition(clampPosition({
                left: start.origin.left + event.clientX - start.x,
                top: start.origin.top + event.clientY - start.y,
              }, cardSize, viewport));
            }}
            onPointerUp={(event) => {
              if (drag.current?.pointerId === event.pointerId) {
                event.currentTarget.releasePointerCapture(event.pointerId);
                drag.current = null;
                setDragging(false);
              }
            }}
            onLostPointerCapture={() => {
              drag.current = null;
              setDragging(false);
            }}
            onPointerCancel={() => {
              drag.current = null;
              setDragging(false);
            }}
            onKeyDown={(event) => {
              if (!cardPosition || !cardSize || event.metaKey || event.ctrlKey || event.altKey) return;
              const delta = event.shiftKey ? 40 : 10;
              const offsets: Record<string, Position> = {
                ArrowLeft: { top: 0, left: -delta },
                ArrowRight: { top: 0, left: delta },
                ArrowUp: { top: -delta, left: 0 },
                ArrowDown: { top: delta, left: 0 },
              };
              const offset = offsets[event.key];
              if (!offset) return;
              event.preventDefault();
              event.stopPropagation();
              setManualPosition(clampPosition({
                top: cardPosition.top + offset.top,
                left: cardPosition.left + offset.left,
              }, cardSize, viewport));
            }}
          >
            <GripHorizontal className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {chapter.title.toUpperCase()}
              {chapter.steps.length > 1 && (
                <span className="text-foreground-muted">
                  {" "}· {stepIndex + 1} / {chapter.steps.length}
                </span>
              )}
            </span>
          </button>
          {manualPosition && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setManualPosition(null)}
              aria-label="Restore automatic walkthrough position"
              title="Restore automatic position"
            >
              <RotateCcw />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className="-mr-2 -mt-1 text-foreground-muted hover:text-foreground"
            onClick={stop}
            aria-label="Close walkthrough"
          >
            <X />
          </Button>
        </div>

        <h2 id={titleId} className="mt-1 font-heading text-lg font-semibold tracking-wide">
          {step.title}
        </h2>

        {step.done?.(context) && (
          <Badge variant="success" className="mt-2 gap-1">
            <CheckCircle2 className="h-3 w-3" />
            You have done this
          </Badge>
        )}

        <div
          id={bodyId}
          className={cn(
            "mt-3 space-y-3 text-sm leading-relaxed text-foreground-secondary",
            "[&_strong]:font-semibold [&_strong]:text-foreground [&_code]:text-foreground"
          )}
        >
          {step.body(context)}
        </div>

        {showNote && (
          <p className="mt-3 chamfered-sm bg-warning/10 px-3 py-2 text-xs text-warning">
            {step.missingNote}
          </p>
        )}

        {runLength > 1 && (
          <div className="mt-4 flex gap-1" aria-hidden="true">
            {Array.from({ length: runLength }, (_, index) => (
              <span
                key={index}
                className={cn(
                  "h-1 flex-1",
                  index < chapterIndex ? "bg-accent" : index === chapterIndex ? "bg-accent/50" : "bg-muted"
                )}
              />
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          {isFirst ? (
            runLength > 1 && (
              <Button variant="ghost" size="sm" onClick={stop}>
                Skip tour
              </Button>
            )
          ) : (
            <Button variant="ghost" size="sm" onClick={back}>
              Back
            </Button>
          )}
          <Button ref={primaryRef} size="sm" onClick={next}>
            {primaryLabel}
          </Button>
        </div>
      </Card>
    </div>,
    document.body
  );
}

/**
 * The guided walkthrough: a dimmed overlay that spotlights one part of a page
 * at a time and explains it. Mount it with the main shell only, so a
 * walkthrough queued by the setup wizard starts once the node is up rather than
 * over the bootstrap screen.
 */
export function TourOverlay() {
  const run = useTourStore((state) => state.run);
  const chapterIndex = useTourStore((state) => state.chapterIndex);
  const stepIndex = useTourStore((state) => state.stepIndex);
  const params = useTourStore((state) => state.params);
  const pending = useTourStore((state) => state.pending);
  const start = useTourStore((state) => state.start);

  useEffect(() => {
    if (pending) void start();
  }, [pending, start]);

  const chapterId = run[chapterIndex];
  if (!chapterId || !params) return null;

  const chapter = TOUR_CHAPTERS[chapterId];
  const step = chapter.steps[stepIndex];
  if (!step) return null;

  const nextChapterId = run[chapterIndex + 1];

  return (
    <TourStepView
      chapter={chapter}
      step={step}
      stepIndex={stepIndex}
      params={params}
      nextChapterTitle={nextChapterId ? TOUR_CHAPTERS[nextChapterId].title : null}
      isFirst={chapterIndex === 0 && stepIndex === 0}
      runLength={run.length}
      chapterIndex={chapterIndex}
    />
  );
}
