/**
 * Chain Visualizer — a futuristic constellation of the Crystal chain.
 *
 * Stems form a static vertical spine (newest at top); leaves cap each interval;
 * each stem's *included* fruits (deduped) fan to the right with persistent carrier
 * traces + always-on dashed neighbor traces. Hovering a fruit ignites a conduit to
 * its **anchor** stem (resolved via get_fruit_detail) which glows. Clicking a fruit
 * opens FruitDetailPanel; clicking a stem/leaf opens the shared BlockDetailPanel.
 * Pages by epoch and live-follows the chain tip.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Orbit,
  Sprout,
  Loader2,
  Radio,
  Filter,
  ChevronLeft,
  ChevronRight,
  SkipForward,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTauriCommand } from "@/hooks";
import { useBlockchainStore } from "@/stores";
import { FruitDetailPanel } from "@/components/Explorer/FruitDetailPanel";
import { BlockDetailPanel } from "@/components/common/BlockDetailPanel";
import { getFruitColor } from "@/lib/fruitColors";
import type { BlockDetail, EpochStrip, FruitDetail } from "@/types";

import {
  buildChainLayout,
  normHash,
  SPINE_X,
  type PositionedFruit,
} from "./chainLayout";
import { ConnectorLayer } from "./ConnectorLayer";
import { FruitNode } from "./FruitNode";
import { StemNode, LeafNode } from "./SpineNodes";

function LegendItem({
  swatch,
  label,
}: {
  swatch: React.ReactNode;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      {swatch}
      {label}
    </span>
  );
}

export default function ChainVisualizer() {
  const refreshTrigger = useBlockchainStore((s) => s.refreshTrigger);

  const [currentEpoch, setCurrentEpoch] = useState<number | null>(null);
  const [viewEpoch, setViewEpoch] = useState<number | null>(null);
  const [strips, setStrips] = useState<EpochStrip[] | null>(null);
  const [payloadsOnly, setPayloadsOnly] = useState(false);

  const [hoveredFruit, setHoveredFruit] = useState<PositionedFruit | null>(null);
  const [hoveredAnchorHash, setHoveredAnchorHash] = useState<string | null>(null);

  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [isFruitDetailOpen, setIsFruitDetailOpen] = useState(false);
  const [isBlockDetailOpen, setIsBlockDetailOpen] = useState(false);

  const currentEpochRef = useRef<number | null>(null);
  const viewEpochRef = useRef<number | null>(null);
  const hoveredFruitRef = useRef<PositionedFruit | null>(null);
  const anchorCacheRef = useRef<Map<string, string | null>>(new Map());
  const anchorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { execute: execCurrentEpoch } = useTauriCommand<number>("get_current_epoch");
  const { execute: execStrip, isLoading: isStripLoading } =
    useTauriCommand<EpochStrip[]>("get_epoch_strip");
  // Separate hook instance for hover anchor lookups so it never clobbers the panel.
  const { execute: execAnchor } = useTauriCommand<FruitDetail | null>("get_fruit_detail");
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

  const loadEpoch = useCallback(
    async (epoch: number) => {
      const result = await execStrip({ fromEpoch: epoch, toEpoch: epoch });
      if (result) setStrips(result);
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
      await loadEpoch(ce);
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
      if (wasFollowing && viewEpochRef.current !== ce) {
        viewEpochRef.current = ce;
        setViewEpoch(ce);
      }
      await loadEpoch(target);
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
  }, [strips]);

  // Cancel any pending anchor lookup on unmount.
  useEffect(
    () => () => {
      if (anchorTimerRef.current) clearTimeout(anchorTimerRef.current);
    },
    [],
  );

  const goEpoch = useCallback(
    (epoch: number) => {
      const max = currentEpochRef.current ?? epoch;
      const clamped = Math.max(0, Math.min(epoch, max));
      setViewEpoch(clamped);
      viewEpochRef.current = clamped;
      void loadEpoch(clamped);
    },
    [loadEpoch],
  );

  const resolveAnchor = useCallback(
    async (fruit: PositionedFruit) => {
      const fh = normHash(fruit.hash);
      const cached = anchorCacheRef.current.get(fh);
      if (cached !== undefined) {
        if (normHash(hoveredFruitRef.current?.hash ?? "") === fh) {
          setHoveredAnchorHash(cached);
        }
        return;
      }
      const detail = await execAnchor({ hash: fruit.hash, blockHash: fruit.stemHash });
      const anchor = detail?.stem ? normHash(detail.stem) : null;
      anchorCacheRef.current.set(fh, anchor);
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

  const openFruitDetail = useCallback(
    async (fruitHash: string, stemHash: string) => {
      setIsBlockDetailOpen(false); // panels are mutually exclusive
      setSelectedHash(fruitHash);
      setIsFruitDetailOpen(true);
      const detail = await execFruitDetail({ hash: fruitHash, blockHash: stemHash });
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

  const layout = useMemo(
    () => (strips ? buildChainLayout(strips, { payloadsOnly }) : null),
    [strips, payloadsOnly],
  );

  const hoveredAnchorStem = useMemo(() => {
    if (!layout || !hoveredAnchorHash) return null;
    return layout.stems.find((s) => normHash(s.hash) === hoveredAnchorHash) ?? null;
  }, [layout, hoveredAnchorHash]);

  const anchorTarget = hoveredAnchorStem
    ? { x: hoveredAnchorStem.x, y: hoveredAnchorStem.y }
    : null;
  const anchorStemHash = hoveredAnchorStem ? normHash(hoveredAnchorStem.hash) : null;
  const carrierStemHash = hoveredFruit ? normHash(hoveredFruit.stemHash) : null;
  const hoveredColorClass = hoveredFruit
    ? getFruitColor(hoveredFruit.fruitType).icon
    : undefined;

  const isFollowingTip =
    viewEpoch !== null && currentEpoch !== null && viewEpoch === currentEpoch;
  const isEmpty =
    !!layout && layout.stems.length === 0 && layout.leaves.length === 0;
  const isInitialLoading =
    currentEpoch === null || (layout === null && isStripLoading);
  const showEmpty = !isInitialLoading && (!layout || isEmpty);

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
            Live constellation of stems, leaves &amp; fruits
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
            <span className="min-w-[5.5rem] text-center font-mono text-xs text-foreground">
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

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-foreground-muted">
        <LegendItem
          label="Payload"
          swatch={
            <span className="h-3 w-3 rounded-[3px] border border-primary/40 bg-gradient-to-br from-primary/50 to-primary/10 crystal-glow-sm" />
          }
        />
        <LegendItem
          label="Empty"
          swatch={
            <span className="h-2.5 w-2.5 chamfered-sm border border-foreground-muted/40 bg-transparent" />
          }
        />
        <LegendItem
          label="Missing"
          swatch={
            <span className="h-2.5 w-2.5 chamfered-sm border border-dashed border-warning/60 bg-transparent" />
          }
        />
        <span className="hidden h-3 w-px bg-border md:block" />
        <LegendItem
          label="Stem"
          swatch={
            <span className="h-3 w-3 chamfered-sm border border-emerald-500/40 bg-emerald-500/25" />
          }
        />
        <LegendItem
          label="Leaf"
          swatch={
            <span className="h-3 w-3 chamfered-sm border border-amber-500/40 bg-amber-500/25" />
          }
        />
        <span className="hidden h-3 w-px bg-border md:block" />
        <LegendItem
          label="Carrier"
          swatch={<span className="inline-block w-4 border-t-2 border-emerald-500/60 align-middle" />}
        />
        <LegendItem
          label="Anchor (hover)"
          swatch={<span className="inline-block w-4 border-t-2 border-primary/70 align-middle" />}
        />
        <LegendItem
          label="Neighbors"
          swatch={
            <span className="inline-block w-4 border-t-2 border-dashed border-primary/40 align-middle" />
          }
        />
        <span className="text-foreground-muted/70">· colour = fruit type</span>
      </div>

      {/* Canvas */}
      <Card variant="crystalline" className="relative overflow-hidden p-0">
        <div className="relative h-[calc(100vh-17rem)] min-h-[420px] overflow-auto">
          {layout && !isEmpty && (
            <div
              className="relative min-w-full"
              style={{ width: layout.width, height: layout.height }}
            >
              {/* Atmosphere: faint grid + spine glow */}
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage: `radial-gradient(circle at ${SPINE_X}px 16%, hsl(var(--crystal-stem) / 0.06), transparent 55%), linear-gradient(hsl(var(--border) / 0.16) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border) / 0.16) 1px, transparent 1px)`,
                  backgroundSize: "100% 100%, 34px 34px, 34px 34px",
                }}
              />

              <ConnectorLayer
                layout={layout}
                hovered={hoveredFruit}
                hoveredColorClass={hoveredColorClass}
                anchorTarget={anchorTarget}
              />

              {layout.stems.map((stem) => (
                <StemNode
                  key={stem.hash}
                  stem={stem}
                  isAnchor={anchorStemHash != null && normHash(stem.hash) === anchorStemHash}
                  isCarrier={carrierStemHash != null && normHash(stem.hash) === carrierStemHash}
                  onClick={openBlockDetail}
                />
              ))}
              {layout.leaves.map((leaf) => (
                <LeafNode key={leaf.hash} leaf={leaf} onClick={openBlockDetail} />
              ))}
              {layout.fruits.map((fruit) => (
                <FruitNode
                  key={fruit.hash}
                  fruit={fruit}
                  isHovered={hoveredFruit?.hash === fruit.hash}
                  isSelected={selectedHash === fruit.hash}
                  onHover={handleHover}
                  onSelect={(f) => openFruitDetail(f.hash, f.stemHash)}
                />
              ))}
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
