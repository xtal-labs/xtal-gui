/**
 * SVG layer drawn behind the chain nodes. Shares the layout's px coordinate space,
 * so the anchor picture-in-picture renders it under a different transform for free.
 *
 * - The backbone rule: a hairline that fades in and out at the ends, which every
 *   stem and leaf sits on.
 * - A carrier ladder per stem: a spine dropping from the backbone through the fruit
 *   cluster, plus a short tick joining every gem to it. The spine alone conveyed
 *   carriage by mere proximity, which left gems looking unattached to any stem.
 *   Ticks are only ~12px because gems sit directly beneath their carrier, so this
 *   stays a diagram rather than the hairball a fruit→stem line per gem would give.
 * - Epoch dividers where one epoch hands off to the next.
 * - On hover, a solid fruit-coloured conduit from the fruit to its ANCHOR stem
 *   (resolved by the parent), plus a brightened stalk to its carrier.
 */
import { useId } from "react";

import {
  BACKBONE_Y,
  type ChainLayout,
  type PositionedFruit,
  type PositionedStem,
} from "./chainLayout";

interface ConnectorLayerProps {
  layout: ChainLayout;
  /** Stems currently mounted — the ladder follows the node layer's virtualization. */
  stems: PositionedStem[];
  /** Gems currently mounted, for the ticks binding each to its carrier spine. */
  fruits: PositionedFruit[];
  hovered: PositionedFruit | null;
  /** HSL triplet of the hovered fruit; drives the conduit's colour. */
  hoveredHsl?: string;
  /** Position of the hovered fruit's anchor stem, when it is in the layout. */
  anchorTarget: { x: number; y: number } | null;
  /** Low zoom: skip the per-stem stalks, which turn to mush below ~0.6. */
  ambient: boolean;
}

export function ConnectorLayer({
  layout,
  stems,
  fruits,
  hovered,
  hoveredHsl,
  anchorTarget,
  ambient,
}: ConnectorLayerProps) {
  const { dividers, backboneStart, backboneEnd, width, height } = layout;
  // The main canvas and the anchor window both mount a scene, so a fixed gradient
  // id would collide in the document and both would resolve to the first one.
  const backboneGradient = `cv-backbone-${useId().replace(/:/g, "")}`;
  const hasBackbone =
    backboneStart !== null &&
    backboneEnd !== null &&
    backboneEnd > backboneStart;
  const carrierHash = hovered?.stemHash;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="absolute inset-0 pointer-events-none"
      aria-hidden="true"
    >
      <defs>
        {/*
          userSpaceOnUse is required, not cosmetic: the backbone is a perfectly
          horizontal line, so its object bounding box has zero height, and the SVG
          spec disables objectBoundingBox gradients on a zero-area box — the stroke
          silently does not paint at all.
        */}
        <linearGradient
          id={backboneGradient}
          gradientUnits="userSpaceOnUse"
          x1={(backboneStart ?? 0) - 24}
          y1={BACKBONE_Y}
          x2={(backboneEnd ?? 0) + 24}
          y2={BACKBONE_Y}
        >
          <stop
            offset="0%"
            stopColor="hsl(var(--crystal-stem))"
            stopOpacity="0"
          />
          <stop
            offset="8%"
            stopColor="hsl(var(--crystal-stem))"
            stopOpacity="0.35"
          />
          <stop
            offset="92%"
            stopColor="hsl(var(--crystal-stem))"
            stopOpacity="0.35"
          />
          <stop
            offset="100%"
            stopColor="hsl(var(--crystal-stem))"
            stopOpacity="0"
          />
        </linearGradient>
      </defs>

      {/* Epoch dividers — drawn first so everything else sits above them. */}
      {dividers.map((d) => (
        <g key={`divider-${d.epoch}`}>
          <line
            x1={d.x}
            y1={16}
            x2={d.x}
            y2={height - 12}
            stroke="hsl(var(--border))"
            strokeWidth={1}
            strokeDasharray="3 5"
          />
          <text
            x={d.x + 5}
            y={24}
            className="fill-foreground-muted font-mono"
            style={{ fontSize: 9, letterSpacing: "0.08em" }}
          >
            EPOCH {d.epoch}
          </text>
        </g>
      ))}

      {/* The backbone itself */}
      {hasBackbone && (
        <line
          x1={backboneStart! - 24}
          y1={BACKBONE_Y}
          x2={backboneEnd! + 24}
          y2={BACKBONE_Y}
          stroke={`url(#${backboneGradient})`}
          strokeWidth={1.5}
        />
      )}

      {/* Carrier ladder: a spine per stem, and a tick from every gem onto it */}
      {!ambient && (
        <g stroke="hsl(var(--crystal-stem))" strokeLinecap="round">
          {stems.map((s) => {
            if (s.clusterBottom === null) return null;
            const isCarrier = carrierHash === s.hash;
            return (
              <line
                key={`spine-${s.hash}`}
                x1={s.x}
                y1={BACKBONE_Y}
                x2={s.x}
                y2={s.clusterBottom}
                strokeWidth={isCarrier ? 1.6 : 1}
                strokeOpacity={isCarrier ? 0.75 : 0.22}
              />
            );
          })}
          {fruits.map((f) => {
            // Gems centred on the spine (a lone gem on its row) need no tick.
            if (f.x === f.stemX) return null;
            const isCarrier = carrierHash === f.stemHash;
            return (
              <line
                key={`tick-${f.hash}`}
                x1={f.stemX}
                y1={f.y}
                x2={f.x}
                y2={f.y}
                strokeWidth={isCarrier ? 1.6 : 1}
                strokeOpacity={isCarrier ? 0.7 : 0.22}
              />
            );
          })}
        </g>
      )}

      {/* Hover conduit: fruit → ANCHOR stem. Keyed so the draw-in restarts per fruit. */}
      {hovered && anchorTarget && hoveredHsl && (
        <g key={`anchor-${hovered.hash}`} stroke={`hsl(${hoveredHsl})`}>
          <line
            x1={hovered.x}
            y1={hovered.y}
            x2={anchorTarget.x}
            y2={anchorTarget.y}
            strokeWidth={6}
            strokeOpacity={0.16}
            strokeLinecap="round"
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
            style={{ filter: `drop-shadow(0 0 4px hsl(${hoveredHsl}))` }}
          />
        </g>
      )}
    </svg>
  );
}

export default ConnectorLayer;
