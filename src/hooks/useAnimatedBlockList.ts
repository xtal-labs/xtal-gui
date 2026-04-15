import { useMemo, useRef, useCallback } from "react";

import type { BlockSummary } from "@/types";

export interface AnimatedBlock {
  block: BlockSummary;
  isNew: boolean;
}

const BASE_DURATION_MS = 400;
const MIN_DURATION_MS = 120;
const WINDOW_MS = 10_000; // 10-second sliding window for backpressure

export function useAnimatedBlockList(blocks: BlockSummary[]) {
  const seenHashesRef = useRef<Set<string> | null>(null);
  const arrivalTimesRef = useRef<number[]>([]);

  const { items, animationDuration } = useMemo(() => {
    const now = Date.now();
    const seen = seenHashesRef.current;

    // First render or after reset — populate seen set, nothing is "new"
    if (seen === null) {
      seenHashesRef.current = new Set(blocks.map((b) => b.hash));
      return {
        items: blocks.map((block) => ({ block, isNew: false })),
        animationDuration: `${BASE_DURATION_MS}ms`,
      };
    }

    // Identify new hashes
    const newHashes = new Set<string>();
    for (const b of blocks) {
      if (!seen.has(b.hash)) {
        newHashes.add(b.hash);
      }
    }

    // Record arrival timestamp if there are new blocks
    if (newHashes.size > 0) {
      arrivalTimesRef.current.push(now);
    }

    // Prune old timestamps outside the window
    arrivalTimesRef.current = arrivalTimesRef.current.filter(
      (t) => now - t < WINDOW_MS
    );

    // Compute backpressure-adaptive duration
    // More arrivals in the window → faster animation
    const arrivals = arrivalTimesRef.current.length;
    // ratio: 0 (no pressure) to 1 (high pressure, 10+ arrivals in window)
    const ratio = Math.min(arrivals / 10, 1);
    const durationMs = Math.round(
      BASE_DURATION_MS - ratio * (BASE_DURATION_MS - MIN_DURATION_MS)
    );

    // Rebuild seen set from current blocks (bounded memory)
    seenHashesRef.current = new Set(blocks.map((b) => b.hash));

    return {
      items: blocks.map((block) => ({
        block,
        isNew: newHashes.has(block.hash),
      })),
      animationDuration: `${durationMs}ms`,
    };
  }, [blocks]);

  const resetSeen = useCallback(() => {
    seenHashesRef.current = null;
    arrivalTimesRef.current = [];
  }, []);

  return { items, animationDuration, resetSeen };
}
