/**
 * Chain Visualizer — the Crystal chain as a horizontal backbone.
 *
 * Time runs left → right, oldest → newest. Stems and leaves are diamonds threaded
 * on the backbone rule; each stem's *included* fruits (deduped) hang beneath it as
 * hexagonal gems. Hovering a gem ignites a conduit to its **anchor** stem, resolved
 * via `get_fruit_detail`.
 *
 * When that anchor lies outside the viewport — including in an earlier epoch, which
 * is legal up to `FRUIT_EXPIRATION_EPOCHS` — the conduit runs off the edge and an
 * `AnchorPiP` opens onto it. The anchor's epoch is fetched lazily at that moment
 * rather than widened into every refresh, because `get_epoch_strip` walks every
 * stem and fruit in the range and the cross-epoch anchor is the rare tail case.
 *
 * Pages by epoch and live-follows the chain tip.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Orbit,
  Sprout,
  Loader2,
  Radio,
  Filter,
  ChevronLeft,
  ChevronRight,
  SkipForward,
  Minus,
  Plus,
  Maximize2,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTauriCommand } from "@/hooks";
import { useBlockchainStore } from "@/stores";
import { FruitDetailPanel } from "@/components/Explorer/FruitDetailPanel";
import { BlockDetailPanel } from "@/components/common/BlockDetailPanel";
import type { BlockDetail, EpochStrip, FruitDetail } from "@/types";

import {
  buildChainLayout,
  normHash,
  type PositionedFruit,
} from "./chainLayout";
import { ChainScene } from "./ChainScene";
import {
  AnchorPiP,
  PIP_HEIGHT,
  PIP_OFFSET_NONE,
  PIP_WIDTH,
  type PiPOffset,
} from "./AnchorPiP";
import { TypeChips } from "./TypeChips";

/** Zoom bounds, and the scale below which the scene drops to its ambient tier. */
const MIN_SCALE = 0.35;
const MAX_SCALE = 1.4;
const AMBIENT_BELOW = 0.6;
const ZOOM_STEP = 0.15;

/**
 * How many epochs back an anchor may live. Mirrors `FRUIT_EXPIRATION_EPOCHS` in the
 * node (`src/fruit/core.rs`) — a fruit cannot anchor further back than it survives.
 */
const MAX_ANCHOR_BACKFILL = 2;

/**
 * Slack (scene px, ~two-thirds of a stem column) added to the band counted as
 * on-screen. It absorbs the sub-frame lag on ordinary scrolling, and keeps a stem
 * sitting just past the edge — whose neighbours are visible anyway — from opening a
 * window that shows nothing you cannot already see.
 */
const ANCHOR_VISIBLE_MARGIN = 48;

/**
 * Grace period between losing the gem hover and dismissing the anchor window. The
 * window is parked at the canvas edge, often nowhere near the cursor, so dropping it
 * the instant the pointer leaves the gem makes it impossible to reach. Entering the
 * window cancels the release; leaving it starts a fresh one.
 */
const ANCHOR_RELEASE_MS = 500;
/** Exit transition after the grace period — kept in step with the CSS in `AnchorPiP`. */
const ANCHOR_FADE_MS = 220;

type Viewport = {
  scrollLeft: number;
  scrollTop: number;
  width: number;
  height: number;
};

export default function ChainVisualizer() {
  const refreshTrigger = useBlockchainStore((s) => s.refreshTrigger);

  const [currentEpoch, setCurrentEpoch] = useState<number | null>(null);
  const [viewEpoch, setViewEpoch] = useState<number | null>(null);
  /** View epoch plus any epochs pulled in to resolve an off-view anchor. */
  const [stripsByEpoch, setStripsByEpoch] = useState<Map<number, EpochStrip>>(
    new Map(),
  );
  const [payloadsOnly, setPayloadsOnly] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [expandedStems, setExpandedStems] = useState<Set<string>>(new Set());
  const [isBackfilling, setIsBackfilling] = useState(false);
  /** The anchor pair on screen — held briefly past the hover so it can be reached. */
  const [heldAnchor, setHeldAnchor] = useState<{
    fruit: PositionedFruit;
    anchorHash: string;
  } | null>(null);
  /** Set for the length of the exit transition, between the grace period and unmount. */
  const [isAnchorFading, setIsAnchorFading] = useState(false);

  const [hoveredFruit, setHoveredFruit] = useState<PositionedFruit | null>(
    null,
  );
  const [hoveredAnchorHash, setHoveredAnchorHash] = useState<string | null>(
    null,
  );

  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [isFruitDetailOpen, setIsFruitDetailOpen] = useState(false);
  const [isBlockDetailOpen, setIsBlockDetailOpen] = useState(false);

  const [scale, setScale] = useState(1);
  const [viewport, setViewport] = useState<Viewport>({
    scrollLeft: 0,
    scrollTop: 0,
    width: 0,
    height: 0,
  });

  /**
   * Where the user last dragged the anchor window, as a delta from the edge position
   * the conduit implies. Held here rather than in `AnchorPiP` so it survives the window
   * unmounting between hovers — every later anchor spawns where the last one was left.
   */
  const [pipOffset, setPipOffset] = useState<PiPOffset>(PIP_OFFSET_NONE);

  const currentEpochRef = useRef<number | null>(null);
  const viewEpochRef = useRef<number | null>(null);
  const hoveredFruitRef = useRef<PositionedFruit | null>(null);
  const anchorCacheRef = useRef<Map<string, string | null>>(new Map());
  const anchorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backfilledRef = useRef<Set<number>>(new Set());
  const pipHoverRef = useRef(false);
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scaleRef = useRef(1);
  const scrollToEndRef = useRef(true);
  const syncFrameRef = useRef<number | null>(null);
  /** Lowest epoch and total width of the last layout, to absorb backfill prepends. */
  const extentRef = useRef<{ minEpoch: number; width: number } | null>(null);
  const panFromRef = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);

  const { execute: execCurrentEpoch } =
    useTauriCommand<number>("get_current_epoch");
  const { execute: execStrip, isLoading: isStripLoading } =
    useTauriCommand<EpochStrip[]>("get_epoch_strip");
  // Separate instance so a backfill never clobbers the main loading state.
  const { execute: execBackfill } =
    useTauriCommand<EpochStrip[]>("get_epoch_strip");
  // Separate instance for hover anchor lookups so it never clobbers the panel.
  const { execute: execAnchor } = useTauriCommand<FruitDetail | null>(
    "get_fruit_detail",
  );
  const {
    data: fruitDetail,
    execute: execFruitDetail,
    reset: resetFruitDetail,
    isLoading: isFruitDetailLoading,
  } = useTauriCommand<FruitDetail | null>("get_fruit_detail");
  const {
    data: blockDetail,
    execute: execBlockDetail,
    reset: resetBlockDetail,
    isLoading: isBlockDetailLoading,
    error: blockDetailError,
  } = useTauriCommand<BlockDetail | null>("get_block_detail");

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  /** Load the view epoch, dropping any backfill that belonged to the old view. */
  const loadEpoch = useCallback(
    async (epoch: number, keepBackfill: boolean) => {
      const result = await execStrip({ fromEpoch: epoch, toEpoch: epoch });
      if (!result) return;
      const fresh = result.find((s) => s.epoch === epoch);
      setStripsByEpoch((prev) => {
        const next = keepBackfill
          ? new Map(prev)
          : new Map<number, EpochStrip>();
        if (fresh) next.set(epoch, fresh);
        return next;
      });
      if (!keepBackfill) backfilledRef.current = new Set();
    },
    [execStrip],
  );

  // Initial load: resolve the tip epoch and fetch it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ce = await execCurrentEpoch();
      if (cancelled || ce == null) return;
      setCurrentEpoch(ce);
      setViewEpoch(ce);
      currentEpochRef.current = ce;
      viewEpochRef.current = ce;
      await loadEpoch(ce, false);
    })();
    return () => {
      cancelled = true;
    };
  }, [execCurrentEpoch, loadEpoch]);

  // Live refresh: re-resolve the tip on chain advance; follow it if we were at the tip.
  useEffect(() => {
    if (refreshTrigger === 0) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const ce = await execCurrentEpoch();
      if (cancelled || ce == null) return;
      const wasFollowing =
        viewEpochRef.current !== null &&
        viewEpochRef.current === currentEpochRef.current;
      currentEpochRef.current = ce;
      setCurrentEpoch(ce);

      const target = wasFollowing ? ce : viewEpochRef.current;
      if (target == null) return;
      const epochChanged = wasFollowing && viewEpochRef.current !== ce;
      if (epochChanged) {
        viewEpochRef.current = ce;
        setViewEpoch(ce);
      }
      await loadEpoch(target, !epochChanged);
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [refreshTrigger, execCurrentEpoch, loadEpoch]);

  // Hovered fruit positions go stale across a data refresh.
  useEffect(() => {
    hoveredFruitRef.current = null;
    setHoveredFruit(null);
    setHoveredAnchorHash(null);
    if (anchorTimerRef.current) {
      clearTimeout(anchorTimerRef.current);
      anchorTimerRef.current = null;
    }
  }, [stripsByEpoch]);

  useEffect(
    () => () => {
      if (anchorTimerRef.current) clearTimeout(anchorTimerRef.current);
    },
    [],
  );

  const layout = useMemo(() => {
    if (stripsByEpoch.size === 0) return null;
    return buildChainLayout([...stripsByEpoch.values()], {
      payloadsOnly,
      expandedStems,
    });
  }, [stripsByEpoch, payloadsOnly, expandedStems]);

  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!layout) return counts;
    for (const f of layout.fruits) {
      const key = f.fruitType.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [layout]);

  /* --- Viewport tracking (drives virtualization and the PiP's edge maths) --- */

  const syncViewport = useCallback(() => {
    if (syncFrameRef.current !== null) return; // already queued for this frame
    syncFrameRef.current = requestAnimationFrame(() => {
      syncFrameRef.current = null;
      const el = scrollRef.current;
      if (!el) return;
      setViewport({
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
        width: el.clientWidth,
        height: el.clientHeight,
      });
    });
  }, []);

  /**
   * Write the viewport straight through. Used after every scroll position we set
   * ourselves: the throttled path would leave the anchor-visibility test reading a
   * `scrollLeft` the DOM has already moved past, which is what made the window open
   * over stems that were plainly on screen.
   */
  const syncViewportNow = useCallback(() => {
    if (syncFrameRef.current !== null) {
      cancelAnimationFrame(syncFrameRef.current);
      syncFrameRef.current = null;
    }
    const el = scrollRef.current;
    if (!el) return;
    setViewport({
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
      width: el.clientWidth,
      height: el.clientHeight,
    });
  }, []);

  useEffect(
    () => () => {
      if (syncFrameRef.current !== null)
        cancelAnimationFrame(syncFrameRef.current);
    },
    [],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    syncViewport();
    const observer = new ResizeObserver(syncViewport);
    observer.observe(el);
    return () => observer.disconnect();
  }, [syncViewport]);

  // Newest is at the right edge, so a fresh epoch should open there. A backfill
  // instead prepends older epochs on the left; absorb that shift so the stems the
  // user is looking at stay under the cursor.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !layout) return;
    const hasNodes = layout.stems.length > 0 || layout.leaves.length > 0;
    const minEpoch = Math.min(
      ...(hasNodes
        ? [
            ...layout.stems.map((s) => s.epoch),
            ...layout.leaves.map((l) => l.epoch),
          ]
        : [Number.POSITIVE_INFINITY]),
    );
    const prev = extentRef.current;
    extentRef.current = hasNodes ? { minEpoch, width: layout.width } : null;

    if (!hasNodes) return;
    if (scrollToEndRef.current) {
      el.scrollLeft = el.scrollWidth;
      scrollToEndRef.current = false;
      syncViewportNow();
      return;
    }
    if (prev && minEpoch < prev.minEpoch && layout.width > prev.width) {
      el.scrollLeft += (layout.width - prev.width) * scaleRef.current;
      syncViewportNow();
    }
  }, [layout, syncViewportNow]);

  /* --- Zoom --- */

  const zoomTo = useCallback(
    (next: number, anchorClientX?: number) => {
      const el = scrollRef.current;
      const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
      if (el) {
        const rect = el.getBoundingClientRect();
        const focus =
          anchorClientX == null
            ? el.clientWidth / 2
            : anchorClientX - rect.left;
        const sceneX = (el.scrollLeft + focus) / scaleRef.current;
        // Re-anchor the point under the cursor after the scale change.
        requestAnimationFrame(() => {
          if (!scrollRef.current) return;
          scrollRef.current.scrollLeft = sceneX * clamped - focus;
          syncViewportNow();
        });
      }
      scaleRef.current = clamped;
      setScale(clamped);
    },
    [syncViewportNow],
  );

  const fitToWidth = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !layout || layout.width === 0) return;
    const next = Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, el.clientWidth / layout.width),
    );
    scaleRef.current = next;
    setScale(next);
    requestAnimationFrame(syncViewportNow);
  }, [layout, syncViewportNow]);

  // Non-passive so Cmd/Ctrl+wheel can preventDefault and zoom instead of scrolling.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const direction = e.deltaY > 0 ? -1 : 1;
      zoomTo(scaleRef.current + direction * ZOOM_STEP, e.clientX);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomTo]);

  /* --- Drag to pan (on empty canvas only; nodes handle their own pointers) --- */

  const onPanStart = useCallback((e: React.PointerEvent) => {
    // Anywhere that isn't a node: the scene's own root covers the whole canvas.
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    const el = scrollRef.current;
    if (!el) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    panFromRef.current = {
      x: e.clientX,
      y: e.clientY,
      left: el.scrollLeft,
      top: el.scrollTop,
    };
  }, []);

  const onPanMove = useCallback(
    (e: React.PointerEvent) => {
      const from = panFromRef.current;
      const el = scrollRef.current;
      if (!from || !el) return;
      el.scrollLeft = from.left - (e.clientX - from.x);
      el.scrollTop = from.top - (e.clientY - from.y);
      syncViewport();
    },
    [syncViewport],
  );

  const onPanEnd = useCallback((e: React.PointerEvent) => {
    panFromRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  /* --- Anchor resolution and lazy backfill --- */

  /**
   * Pull in the epochs before the view epoch until the anchor stem is present, or
   * we reach the expiration bound. Each epoch is attempted at most once per view.
   */
  const backfillForAnchor = useCallback(
    async (anchorHash: string) => {
      const view = viewEpochRef.current;
      if (view == null) return;
      // Epochs we have not already tried for this view. Empty means the anchor is
      // genuinely unreachable, and the caller should say so rather than spin.
      const pending: number[] = [];
      for (let back = 1; back <= MAX_ANCHOR_BACKFILL; back++) {
        const epoch = view - back;
        if (epoch >= 0 && !backfilledRef.current.has(epoch))
          pending.push(epoch);
      }
      if (pending.length === 0) return;

      setIsBackfilling(true);
      try {
        for (const epoch of pending) {
          backfilledRef.current.add(epoch);
          const result = await execBackfill({
            fromEpoch: epoch,
            toEpoch: epoch,
          });
          const strip = result?.find((s) => s.epoch === epoch);
          if (!strip) continue;
          let found = false;
          setStripsByEpoch((prev) => {
            const next = new Map(prev);
            next.set(epoch, strip);
            return next;
          });
          for (const interval of strip.intervals) {
            if (interval.stems.some((s) => normHash(s.hash) === anchorHash))
              found = true;
          }
          if (found) return;
        }
      } finally {
        setIsBackfilling(false);
      }
    },
    [execBackfill],
  );

  const resolveAnchor = useCallback(
    async (fruit: PositionedFruit) => {
      const fh = normHash(fruit.hash);
      let anchor = anchorCacheRef.current.get(fh);
      if (anchor === undefined) {
        const detail = await execAnchor({
          hash: fruit.hash,
          blockHash: fruit.stemHash,
        });
        anchor = detail?.stem ? normHash(detail.stem) : null;
        anchorCacheRef.current.set(fh, anchor);
      }
      if (normHash(hoveredFruitRef.current?.hash ?? "") === fh) {
        setHoveredAnchorHash(anchor);
      }
    },
    [execAnchor],
  );

  const handleHover = useCallback(
    (fruit: PositionedFruit | null) => {
      hoveredFruitRef.current = fruit;
      setHoveredFruit(fruit);
      if (anchorTimerRef.current) {
        clearTimeout(anchorTimerRef.current);
        anchorTimerRef.current = null;
      }
      if (!fruit) {
        setHoveredAnchorHash(null);
        return;
      }
      const cached = anchorCacheRef.current.get(normHash(fruit.hash));
      if (cached !== undefined) {
        setHoveredAnchorHash(cached);
        return;
      }
      setHoveredAnchorHash(null);
      anchorTimerRef.current = setTimeout(() => void resolveAnchor(fruit), 120);
    },
    [resolveAnchor],
  );

  // The anchor exists but isn't in the loaded window — pull its epoch in.
  useEffect(() => {
    if (!layout || !hoveredAnchorHash) return;
    if (layout.stemOrder.has(hoveredAnchorHash)) return;
    void backfillForAnchor(hoveredAnchorHash);
  }, [layout, hoveredAnchorHash, backfillForAnchor]);

  /* --- Detail panels --- */

  const openFruitDetail = useCallback(
    async (fruitHash: string, stemHash: string) => {
      setIsBlockDetailOpen(false); // panels are mutually exclusive
      setSelectedHash(fruitHash);
      setIsFruitDetailOpen(true);
      const detail = await execFruitDetail({
        hash: fruitHash,
        blockHash: stemHash,
      });
      if (detail) {
        anchorCacheRef.current.set(
          normHash(fruitHash),
          detail.stem ? normHash(detail.stem) : null,
        );
      } else {
        setIsFruitDetailOpen(false);
        setSelectedHash(null);
      }
    },
    [execFruitDetail],
  );

  const handleSelectFruit = useCallback(
    (fruit: PositionedFruit) => {
      void openFruitDetail(fruit.hash, fruit.stemHash);
    },
    [openFruitDetail],
  );

  const openBlockDetail = useCallback(
    async (hash: string) => {
      setIsFruitDetailOpen(false); // panels are mutually exclusive
      setSelectedHash(null);
      setIsBlockDetailOpen(true);
      const detail = await execBlockDetail({ hash });
      if (!detail) setIsBlockDetailOpen(false);
    },
    [execBlockDetail],
  );

  const closeFruitDetail = useCallback(() => {
    setIsFruitDetailOpen(false);
    setSelectedHash(null);
    resetFruitDetail();
  }, [resetFruitDetail]);

  const closeBlockDetail = useCallback(() => {
    setIsBlockDetailOpen(false);
    resetBlockDetail();
  }, [resetBlockDetail]);

  const goEpoch = useCallback(
    (epoch: number) => {
      const max = currentEpochRef.current ?? epoch;
      const clamped = Math.max(0, Math.min(epoch, max));
      setViewEpoch(clamped);
      viewEpochRef.current = clamped;
      setExpandedStems(new Set());
      scrollToEndRef.current = true;
      void loadEpoch(clamped, false);
    },
    [loadEpoch],
  );

  const expandStem = useCallback((stemHash: string) => {
    setExpandedStems((prev) => new Set(prev).add(normHash(stemHash)));
  }, []);

  /* --- Anchor window placement --- */

  // Cancelling mid-fade takes the window back to full opacity rather than letting it
  // vanish and re-enter, so a pointer returning late reads as one continuous window.
  const cancelAnchorRelease = useCallback(() => {
    if (releaseTimerRef.current) {
      clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }
    if (fadeTimerRef.current) {
      clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
    setIsAnchorFading(false);
  }, []);

  /** Grace period, then a fade, then unmount — never a hard cut. */
  const scheduleAnchorRelease = useCallback(() => {
    cancelAnchorRelease();
    releaseTimerRef.current = setTimeout(() => {
      releaseTimerRef.current = null;
      if (pipHoverRef.current) return;
      setIsAnchorFading(true);
      fadeTimerRef.current = setTimeout(() => {
        fadeTimerRef.current = null;
        setIsAnchorFading(false);
        setHeldAnchor(null);
      }, ANCHOR_FADE_MS);
    }, ANCHOR_RELEASE_MS);
  }, [cancelAnchorRelease]);

  // Adopt whatever the pointer is over; release it (on a delay) when it moves off.
  useEffect(() => {
    if (hoveredFruit && hoveredAnchorHash) {
      cancelAnchorRelease();
      setHeldAnchor({ fruit: hoveredFruit, anchorHash: hoveredAnchorHash });
    } else if (hoveredFruit) {
      // Moved onto a different gem whose anchor has not resolved yet — drop the old
      // window rather than leaving it captioned for a fruit the pointer has left.
      setHeldAnchor((prev) =>
        prev && prev.fruit.hash !== hoveredFruit.hash ? null : prev,
      );
    } else {
      scheduleAnchorRelease();
    }
  }, [
    hoveredFruit,
    hoveredAnchorHash,
    cancelAnchorRelease,
    scheduleAnchorRelease,
  ]);

  useEffect(() => cancelAnchorRelease, [cancelAnchorRelease]);

  const activeAnchor = heldAnchor;

  const anchorStem = useMemo(() => {
    if (!layout || !activeAnchor) return null;
    return (
      layout.stems.find((s) => normHash(s.hash) === activeAnchor.anchorHash) ??
      null
    );
  }, [layout, activeAnchor]);

  /**
   * The anchor stem is not always reachable: it can predate the epochs we are allowed
   * to pull in, or sit on a fork we no longer store. Saying so is the whole point of
   * the rework — the previous build rendered nothing at all in this case.
   */
  const anchorStatus = useMemo(():
    "ok" | "resolving" | "unavailable" | null => {
    if (!hoveredFruit || !layout) return null;
    if (hoveredAnchorHash === null) return isBackfilling ? "resolving" : null;
    if (layout.stemOrder.has(hoveredAnchorHash)) return "ok";
    return isBackfilling ? "resolving" : "unavailable";
  }, [hoveredFruit, layout, hoveredAnchorHash, isBackfilling]);

  /**
   * The scene is only as tall as the deepest fruit cluster, which is usually well
   * short of the canvas. Centre it rather than letting it hang from the top edge.
   */
  const sceneOffsetY = useMemo(() => {
    if (!layout) return 0;
    return Math.max(0, (viewport.height - layout.height * scale) / 2);
  }, [layout, viewport.height, scale]);

  /**
   * Where the conduit leaves the viewport, and on which side — null when the anchor
   * is on screen, in which case the plain conduit already tells the whole story.
   */
  const pip = useMemo(() => {
    if (!layout || !anchorStem || !activeAnchor || viewport.width === 0)
      return null;
    const left = viewport.scrollLeft / scale;
    const right = (viewport.scrollLeft + viewport.width) / scale;
    if (
      anchorStem.x >= left - ANCHOR_VISIBLE_MARGIN &&
      anchorStem.x <= right + ANCHOR_VISIBLE_MARGIN
    ) {
      return null; // already on screen — the conduit alone tells the whole story
    }

    const side: "left" | "right" = anchorStem.x < left ? "left" : "right";
    const edgeX = side === "left" ? left : right;
    const { fruit } = activeAnchor;
    const dx = anchorStem.x - fruit.x;
    // Where the fruit→anchor line crosses that edge, in scene space.
    const t = dx === 0 ? 0 : (edgeX - fruit.x) / dx;
    const sceneY =
      fruit.y + (anchorStem.y - fruit.y) * Math.min(1, Math.max(0, t));
    const edgeY = sceneY * scale + sceneOffsetY - viewport.scrollTop;

    const carrierIndex = layout.stemOrder.get(normHash(fruit.stemHash));
    const stemsBack =
      carrierIndex === undefined
        ? null
        : Math.max(0, carrierIndex - anchorStem.index);
    const carrierStem = layout.stems.find(
      (s) => normHash(s.hash) === normHash(fruit.stemHash),
    );
    const anchorEpoch =
      carrierStem && carrierStem.epoch !== anchorStem.epoch
        ? anchorStem.epoch
        : null;

    return { side, edgeY, stemsBack, anchorEpoch };
  }, [layout, anchorStem, activeAnchor, viewport, scale, sceneOffsetY]);

  const isFollowingTip =
    viewEpoch !== null && currentEpoch !== null && viewEpoch === currentEpoch;
  const isEmpty =
    !!layout && layout.stems.length === 0 && layout.leaves.length === 0;
  const isInitialLoading =
    currentEpoch === null || (layout === null && isStripLoading);
  const showEmpty = !isInitialLoading && (!layout || isEmpty);
  const ambient = scale < AMBIENT_BELOW;

  return (
    <div className="space-y-4 animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-heading font-bold tracking-wide text-foreground">
            <Orbit className="h-6 w-6 text-primary" />
            VISUALIZER
          </h1>
          <p className="mt-1 text-sm font-heading tracking-wide text-foreground-secondary">
            The chain as a backbone — stems, leaves &amp; the fruits they carry
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isFollowingTip && (
            <Badge variant="success" className="gap-1.5">
              <Radio className="h-3 w-3 animate-pulse" />
              LIVE
            </Badge>
          )}
          <Button
            variant={payloadsOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setPayloadsOnly((v) => !v)}
            title="Show only fruits that carry a payload"
          >
            <Filter className="h-3.5 w-3.5" />
            Payloads only
          </Button>

          {/* Zoom */}
          <div className="flex items-center gap-0.5 chamfered-sm border border-border/60 bg-card p-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => zoomTo(scale - ZOOM_STEP)}
              disabled={scale <= MIN_SCALE}
              title="Zoom out"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="min-w-12 text-center font-mono text-xs tabular-nums text-foreground">
              {Math.round(scale * 100)}%
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => zoomTo(scale + ZOOM_STEP)}
              disabled={scale >= MAX_SCALE}
              title="Zoom in"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={fitToWidth}
              title="Fit to width"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>

          {/* Epoch stepper */}
          <div className="flex items-center gap-0.5 chamfered-sm border border-border/60 bg-card p-1">
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={viewEpoch === null || viewEpoch <= 0}
              onClick={() => viewEpoch !== null && goEpoch(viewEpoch - 1)}
              title="Older epoch"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-22 text-center font-mono text-xs text-foreground">
              Epoch {viewEpoch ?? "—"}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={isFollowingTip}
              onClick={() => viewEpoch !== null && goEpoch(viewEpoch + 1)}
              title="Newer epoch"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={isFollowingTip}
              onClick={() => currentEpoch !== null && goEpoch(currentEpoch)}
              title="Jump to latest"
            >
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Type chips double as the colour legend and the filter */}
      <div className="flex flex-col gap-2">
        <TypeChips
          counts={typeCounts}
          selected={typeFilter}
          onSelect={setTypeFilter}
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-foreground-muted">
          <span className="flex items-center gap-1.5">
            <span className="hexagon h-3 w-[13px] bg-foreground-muted" />
            Payload
          </span>
          <span className="flex items-center gap-1.5">
            <span className="hexagon h-2 w-[9px] bg-foreground-muted/50" />
            Empty
          </span>
          <span className="hidden h-3 w-px bg-border md:block" />
          <span className="flex items-center gap-1.5">
            <span className="diamond h-2.5 w-2.5 bg-crystal-stem" />
            Stem
          </span>
          <span className="flex items-center gap-1.5">
            <span className="diamond h-3 w-3 bg-crystal-leaf" />
            Leaf
          </span>
          <span className="hidden h-3 w-px bg-border md:block" />
          <span className="text-foreground-muted/70">
            hover a gem for its anchor · drag to pan · ⌘/Ctrl + scroll to zoom
          </span>
        </div>
      </div>

      {/* Canvas */}
      <Card variant="crystalline" className="relative overflow-hidden p-0">
        <div
          ref={scrollRef}
          onScroll={syncViewport}
          className="relative h-[calc(100vh-20rem)] min-h-[360px] overflow-auto"
        >
          {layout && !isEmpty && (
            <div
              className="relative"
              style={{
                width: layout.width * scale,
                height: layout.height * scale,
              }}
              onPointerDown={onPanStart}
              onPointerMove={onPanMove}
              onPointerUp={onPanEnd}
              onPointerCancel={onPanEnd}
            >
              {/* Atmosphere: faint grid, fixed to the scene so it pans with it */}
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage: `linear-gradient(hsl(var(--border) / 0.14) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border) / 0.14) 1px, transparent 1px)`,
                  backgroundSize: "34px 34px, 34px 34px",
                }}
              />
              <div
                className="absolute left-0 top-0 origin-top-left"
                style={{
                  transform: `translateY(${sceneOffsetY}px) scale(${scale})`,
                }}
              >
                <ChainScene
                  layout={layout}
                  viewport={{
                    left: viewport.scrollLeft / scale,
                    right: (viewport.scrollLeft + viewport.width) / scale,
                  }}
                  hovered={hoveredFruit ?? activeAnchor?.fruit ?? null}
                  anchorStem={anchorStem}
                  selectedHash={selectedHash}
                  typeFilter={typeFilter}
                  ambient={ambient}
                  onHoverFruit={handleHover}
                  onSelectFruit={handleSelectFruit}
                  onSelectBlock={openBlockDetail}
                  onExpandStem={expandStem}
                />
              </div>
            </div>
          )}

          {isInitialLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-heading text-foreground-muted">
                Mapping the chain…
              </p>
            </div>
          )}

          {showEmpty && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Sprout className="h-8 w-8 text-foreground-muted" />
              <p className="text-sm font-heading text-foreground-muted">
                No blocks in this epoch yet
              </p>
            </div>
          )}
        </div>

        {(anchorStatus === "resolving" || anchorStatus === "unavailable") && (
          <div
            className="pointer-events-none absolute bottom-3 left-1/2 z-40 -translate-x-1/2"
            style={{
              // Same clip-path/box-shadow trap as the anchor window: the shadow has to
              // sit on this unclipped parent, and the pill's own fill must be fully
              // opaque or the backbone shows straight through it.
              filter:
                "drop-shadow(0 0 4px hsl(var(--background))) drop-shadow(0 4px 10px rgb(0 0 0 / 0.5))",
            }}
          >
            <span className="chamfered-sm flex items-center gap-2 border border-border/60 bg-background px-2.5 py-1 font-mono text-[10px] text-foreground-secondary">
              {anchorStatus === "resolving" ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  Fetching the anchor&apos;s epoch…
                </>
              ) : (
                <>
                  <span className="diamond h-2 w-2 bg-warning" aria-hidden />
                  Anchor stem is outside the loaded range
                </>
              )}
            </span>
          </div>
        )}

        {/* The anchor window rides above the scroller in canvas space, not scene space */}
        {layout && anchorStem && activeAnchor && pip && (
          <AnchorPiP
            layout={layout}
            anchorStem={anchorStem}
            hovered={activeAnchor.fruit}
            stemsBack={pip.stemsBack}
            anchorEpoch={pip.anchorEpoch}
            side={pip.side}
            edgeY={pip.edgeY}
            canvasWidth={Math.max(viewport.width, PIP_WIDTH + 32)}
            canvasHeight={Math.max(viewport.height, PIP_HEIGHT + 32)}
            offset={pipOffset}
            onOffsetChange={setPipOffset}
            fading={isAnchorFading}
            onPointerEnter={() => {
              pipHoverRef.current = true;
              cancelAnchorRelease();
            }}
            onPointerLeave={() => {
              pipHoverRef.current = false;
              scheduleAnchorRelease();
            }}
            onSelectFruit={handleSelectFruit}
            onSelectBlock={openBlockDetail}
          />
        )}
      </Card>

      <BlockDetailPanel
        detail={blockDetail}
        isOpen={isBlockDetailOpen}
        onClose={closeBlockDetail}
        isLoading={isBlockDetailLoading}
        error={blockDetailError}
        onFruitClick={openFruitDetail}
      />

      <FruitDetailPanel
        detail={fruitDetail}
        isOpen={isFruitDetailOpen}
        onClose={closeFruitDetail}
        isLoading={isFruitDetailLoading}
      />
    </div>
  );
}
