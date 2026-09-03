/**
 * The chain scene: connectors plus nodes, in the layout's absolute px space.
 *
 * Rendered twice — once by the main canvas and once, under a different transform,
 * by the anchor picture-in-picture. Because both share this component and the pure
 * `buildChainLayout` coordinates, the hover conduit that runs off the edge of the
 * main view reappears inside the PiP arriving at its anchor stem, with no second
 * data path and no bespoke rendering.
 *
 * Only nodes whose `x` falls inside `viewport` (plus a margin) are mounted. A full
 * epoch is ~200 backbone nodes and up to a few hundred gems; at a wide zoom-out the
 * whole window would otherwise be live DOM.
 */
import { useMemo } from "react";

import { getFruitColor } from "@/lib/fruitColors";
import {
  normHash,
  type ChainLayout,
  type PositionedFruit,
  type PositionedStem,
} from "./chainLayout";
import { ConnectorLayer } from "./ConnectorLayer";
import { FruitNode } from "./FruitNode";
import { StemNode, LeafNode, ClusterOverflowChip } from "./BackboneNodes";

/** Scene-space x window to mount nodes for, plus the slack kept either side. */
export interface SceneViewport {
  left: number;
  right: number;
}
const VIRTUALIZE_MARGIN = 240;

export interface ChainSceneProps {
  layout: ChainLayout;
  /** Omit to mount everything (small scenes, e.g. the PiP). */
  viewport?: SceneViewport;
  hovered: PositionedFruit | null;
  anchorStem: PositionedStem | null;
  selectedHash: string | null;
  /** Lower-cased fruit type to keep lit; others dim. */
  typeFilter: string | null;
  ambient: boolean;
  /** The PiP renders a read-only copy — no handlers, no focusable nodes. */
  interactive?: boolean;
  onHoverFruit?: (fruit: PositionedFruit | null) => void;
  onSelectFruit?: (fruit: PositionedFruit) => void;
  onSelectBlock?: (hash: string) => void;
  onExpandStem?: (stemHash: string) => void;
}

const noop = () => {};

export function ChainScene({
  layout,
  viewport,
  hovered,
  anchorStem,
  selectedHash,
  typeFilter,
  ambient,
  interactive = true,
  onHoverFruit,
  onSelectFruit,
  onSelectBlock,
  onExpandStem,
}: ChainSceneProps) {
  const inView = useMemo(() => {
    if (!viewport) return null;
    return {
      min: viewport.left - VIRTUALIZE_MARGIN,
      max: viewport.right + VIRTUALIZE_MARGIN,
    };
  }, [viewport]);

  const visible = useMemo(() => {
    if (!inView) {
      return {
        stems: layout.stems,
        leaves: layout.leaves,
        fruits: layout.fruits,
      };
    }
    const keep = (x: number) => x >= inView.min && x <= inView.max;
    return {
      stems: layout.stems.filter((s) => keep(s.x)),
      leaves: layout.leaves.filter((l) => keep(l.x)),
      fruits: layout.fruits.filter((f) => keep(f.x)),
    };
  }, [layout, inView]);

  const anchorHash = anchorStem ? normHash(anchorStem.hash) : null;
  const carrierHash = hovered ? normHash(hovered.stemHash) : null;
  const hoveredHsl = hovered ? getFruitColor(hovered.fruitType).hsl : undefined;

  return (
    <div
      className="absolute left-0 top-0"
      style={{ width: layout.width, height: layout.height }}
    >
      <ConnectorLayer
        layout={layout}
        stems={visible.stems}
        fruits={visible.fruits}
        hovered={hovered}
        hoveredHsl={hoveredHsl}
        anchorTarget={anchorStem ? { x: anchorStem.x, y: anchorStem.y } : null}
        ambient={ambient}
      />

      {visible.stems.map((stem) => (
        <StemNode
          key={stem.hash}
          stem={stem}
          isAnchor={anchorHash !== null && normHash(stem.hash) === anchorHash}
          isCarrier={
            carrierHash !== null && normHash(stem.hash) === carrierHash
          }
          ambient={ambient}
          onClick={interactive ? (onSelectBlock ?? noop) : noop}
        />
      ))}

      {visible.leaves.map((leaf) => (
        <LeafNode
          key={leaf.hash}
          leaf={leaf}
          ambient={ambient}
          onClick={interactive ? (onSelectBlock ?? noop) : noop}
        />
      ))}

      {visible.fruits.map((fruit) => (
        <FruitNode
          key={fruit.hash}
          fruit={fruit}
          isHovered={hovered?.hash === fruit.hash}
          isSelected={selectedHash === fruit.hash}
          isDimmed={
            typeFilter !== null && fruit.fruitType.toLowerCase() !== typeFilter
          }
          ambient={ambient}
          onHover={interactive ? (onHoverFruit ?? noop) : noop}
          onSelect={interactive ? (onSelectFruit ?? noop) : noop}
        />
      ))}

      {interactive &&
        onExpandStem &&
        visible.stems.map((stem) =>
          stem.hiddenFruitCount > 0 ? (
            <ClusterOverflowChip
              key={`overflow-${stem.hash}`}
              stem={stem}
              onExpand={onExpandStem}
            />
          ) : null,
        )}
    </div>
  );
}

export default ChainScene;
