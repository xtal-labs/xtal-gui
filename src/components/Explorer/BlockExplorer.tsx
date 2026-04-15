import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Blocks, Search, Hash, Clock, Database, Layers } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HashDisplay, Pagination, StatusBadge, TransactionDetailPanel } from "@/components/common";
import { useTauriCommand, useAnimatedBlockList } from "@/hooks";
import { useBlockchainStore } from "@/stores";
import { formatBlockHeight, formatTimeAgo, cn } from "@/lib/utils";
import type { BestLeafInfo, BlockDetail, BlockSummary, FruitDetail, TransactionDetail } from "@/types";

import BlockDetailPage from "./BlockDetailPage";
import FruitDetailPanel from "./FruitDetailPanel";

const PAGE_SIZE = 15;

function isNumeric(value: string) {
  return /^\d+$/.test(value);
}

function isHash(value: string) {
  return /^(0x)?[0-9a-fA-F]{64}$/.test(value);
}

export default function BlockExplorer() {
  const {
    stemHeight,
    stemsSinceLastLeaf,
    syncProgress,
    isSynced,
    refreshTrigger,
  } = useBlockchainStore();

  const [page, setPage] = useState(1);
  const [blocks, setBlocks] = useState<BlockSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedBlockHash, setSelectedBlockHash] = useState<string | null>(null);
  const [isTxDetailOpen, setIsTxDetailOpen] = useState(false);
  const [isFruitDetailOpen, setIsFruitDetailOpen] = useState(false);

  const hasLoadedRef = useRef(false);
  const { items: animatedBlocks, animationDuration, resetSeen } = useAnimatedBlockList(blocks);

  const {
    execute: fetchBlocks,
    isLoading: isBlocksLoading,
    error: blocksError,
  } = useTauriCommand<BlockSummary[]>("get_recent_blocks");

  const {
    data: blockDetail,
    execute: fetchBlockDetail,
    reset: resetBlockDetail,
    isLoading: isDetailLoading,
    error: detailError,
  } = useTauriCommand<BlockDetail | null>("get_block_detail");

  const {
    execute: fetchBlockByHeight,
    isLoading: isSearchLoading,
  } = useTauriCommand<BlockSummary | null>("get_block_by_height");

  const {
    data: txDetail,
    execute: fetchTxDetail,
    reset: resetTxDetail,
    isLoading: isTxDetailLoading,
  } = useTauriCommand<TransactionDetail | null>("get_transaction_detail_explorer");

  const {
    data: fruitDetail,
    execute: fetchFruitDetail,
    reset: resetFruitDetail,
    isLoading: isFruitDetailLoading,
  } = useTauriCommand<FruitDetail | null>("get_fruit_detail");

  const {
    data: bestLeaf,
    execute: fetchBestLeaf,
  } = useTauriCommand<BestLeafInfo | null>("get_best_leaf_info");

  const totalPages = useMemo(() => {
    const totalBlocks = Math.max(1, stemHeight + 1);
    return Math.max(1, Math.ceil(totalBlocks / PAGE_SIZE));
  }, [stemHeight]);

  const loadBlocks = useCallback(async () => {
    const offset = (page - 1) * PAGE_SIZE;
    const result = await fetchBlocks({ limit: PAGE_SIZE, offset });
    if (result) {
      setBlocks(result);
      hasLoadedRef.current = true;
    }
  }, [fetchBlocks, page]);

  useEffect(() => {
    loadBlocks();
    fetchBestLeaf();
  }, [loadBlocks, fetchBestLeaf]);

  // Debounced refetch when new blocks arrive or chain reorgs
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (refreshTrigger === 0) return;

    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }

    refreshTimerRef.current = setTimeout(() => {
      loadBlocks();
      fetchBestLeaf();
      refreshTimerRef.current = null;
    }, 500);

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [refreshTrigger, loadBlocks, fetchBestLeaf]);

  // Reset skeleton gate and animation tracking on page change
  const prevPageRef = useRef(page);
  useEffect(() => {
    if (prevPageRef.current !== page) {
      hasLoadedRef.current = false;
      resetSeen();
      prevPageRef.current = page;
    }
  }, [page, resetSeen]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const handleOpenDetail = useCallback(
    async (hash: string) => {
      setSearchError(null);
      setIsTxDetailOpen(false);
      resetTxDetail();
      setIsFruitDetailOpen(false);
      resetFruitDetail();
      setSelectedBlockHash(hash);
      const detail = await fetchBlockDetail({ hash });
      if (!detail) {
        setSelectedBlockHash(null);
        setSearchError("Block not found.");
      }
    },
    [fetchBlockDetail, resetTxDetail, resetFruitDetail]
  );

  const handleBack = () => {
    setSelectedBlockHash(null);
    resetBlockDetail();
    setIsTxDetailOpen(false);
    resetTxDetail();
    setIsFruitDetailOpen(false);
    resetFruitDetail();
  };

  const handleCloseTxDetail = () => {
    setIsTxDetailOpen(false);
    resetTxDetail();
  };

  const handleCloseFruitDetail = () => {
    setIsFruitDetailOpen(false);
    resetFruitDetail();
  };

  const handleOpenTxDetail = useCallback(
    async (txid: string, blockHash?: string) => {
      setSearchError(null);
      setIsTxDetailOpen(true);
      const detail = await fetchTxDetail({ txid, blockHash });
      if (!detail) {
        setIsTxDetailOpen(false);
        setSearchError("Transaction not found.");
      }
    },
    [fetchTxDetail]
  );

  const handleOpenFruitDetail = useCallback(
    async (fruitHash: string, blockHash: string) => {
      setSearchError(null);
      setIsFruitDetailOpen(true);
      const detail = await fetchFruitDetail({ hash: fruitHash, blockHash });
      if (!detail) {
        setIsFruitDetailOpen(false);
        setSearchError("Fruit not found.");
      }
    },
    [fetchFruitDetail]
  );

  const handleSearch = async (event?: FormEvent) => {
    event?.preventDefault();
    const trimmed = searchQuery.trim();

    if (!trimmed) return;

    setSearchError(null);
    setSelectedBlockHash(null);
    resetBlockDetail();
    setIsTxDetailOpen(false);
    resetTxDetail();

    if (isNumeric(trimmed)) {
      const height = Number(trimmed);
      const summary = await fetchBlockByHeight({ height });
      if (!summary) {
        setSearchError("Block not found at that height.");
        return;
      }
      await handleOpenDetail(summary.hash);
      return;
    }

    if (!isHash(trimmed)) {
      setSearchError("Enter a valid height or 64-char block hash.");
      return;
    }
    const block = await fetchBlockDetail({ hash: trimmed });
    if (block) {
      setSelectedBlockHash(trimmed);
      return;
    }

    const tx = await fetchTxDetail({ txid: trimmed });
    if (tx) {
      setIsTxDetailOpen(true);
      return;
    }

    setSearchError("No block or transaction found for that hash.");
  };

  const status = isSynced
    ? "synced"
    : stemHeight === 0
    ? "offline"
    : syncProgress.phase === "Idle"
    ? "synced"
    : "syncing";

  const gridClass =
    "grid grid-cols-[90px_1fr_90px] md:grid-cols-[110px_1fr_110px_110px] lg:grid-cols-[120px_1fr_120px_120px_140px]";

  // -- Detail sub-view --
  if (selectedBlockHash) {
    return (
      <div className="relative space-y-6">
        <BlockDetailPage
          detail={blockDetail}
          isLoading={isDetailLoading}
          error={detailError}
          onBack={handleBack}
          onTransactionClick={handleOpenTxDetail}
          onFruitClick={handleOpenFruitDetail}
          onNavigateBlock={(hash) => handleOpenDetail(hash)}
        />

        <TransactionDetailPanel
          detail={txDetail}
          isOpen={isTxDetailOpen}
          onClose={handleCloseTxDetail}
          isLoading={isTxDetailLoading}
        />

        <FruitDetailPanel
          detail={fruitDetail}
          isOpen={isFruitDetailOpen}
          onClose={handleCloseFruitDetail}
          isLoading={isFruitDetailLoading}
        />
      </div>
    );
  }

  // -- Block list view --
  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold tracking-wide text-foreground">
            BLOCK EXPLORER
          </h1>
          <p className="text-foreground-secondary text-sm mt-1 font-heading tracking-wide">
            Inspect blocks, heights, and transactions
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={status} />
          <Badge variant="outline" shape="chamfered" className="font-mono text-xs">
            Tip {formatBlockHeight(stemHeight)}
          </Badge>
        </div>
      </div>

      <Card variant="crystalline">
        <CardContent className="p-4">
          <form
            onSubmit={handleSearch}
            className="flex flex-col gap-3 lg:flex-row lg:items-center"
          >
            <div className="flex-1">
              <Input
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  if (searchError) setSearchError(null);
                }}
                placeholder="Search by block hash or height"
                icon={<Search className="h-4 w-4" />}
                error={Boolean(searchError)}
                className="font-mono"
              />
              {searchError && (
                <p className="mt-2 text-xs text-destructive font-heading">
                  {searchError}
                </p>
              )}
            </div>
            <Button
              type="submit"
              variant="secondary"
              className="font-heading tracking-wide"
              disabled={isSearchLoading || isDetailLoading || isTxDetailLoading}
            >
              Search
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card variant="crystalline" className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-crystal-leaf/8 via-transparent to-transparent pointer-events-none" />
        <CardContent className="relative p-5">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="icon-hex bg-crystal-leaf/20">
                  <Blocks className="h-5 w-5 text-crystal-leaf" />
                </div>
                <div>
                  <p className="text-[10px] font-heading tracking-wider uppercase text-foreground-muted">
                    BEST LEAF
                  </p>
                  <div className="text-3xl font-heading font-bold tabular-nums text-foreground">
                    {bestLeaf ? formatBlockHeight(bestLeaf.leafHeight) : "—"}
                  </div>
                </div>
              </div>
              <div className="text-right space-y-1">
                <p className="text-[10px] font-heading tracking-wider uppercase text-foreground-muted">
                  CHAIN TIP
                </p>
                <p className="text-sm font-heading font-bold tabular-nums">
                  {formatBlockHeight(stemHeight)}
                </p>
                <p className="text-[10px] font-mono text-foreground-muted">
                  + {bestLeaf?.stemsSinceLastLeaf ?? stemsSinceLastLeaf} stems
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 pt-3 border-t border-border/50">
              <div className="space-y-1">
                <p className="text-[10px] font-heading tracking-wider uppercase text-foreground-muted flex items-center gap-1.5">
                  <Hash className="h-3 w-3" />
                  LEAF HASH
                </p>
                {bestLeaf?.hash ? (
                  <HashDisplay hash={bestLeaf.hash} chars={14} className="text-sm" />
                ) : (
                  <span className="text-sm text-foreground-muted font-mono">—</span>
                )}
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-heading tracking-wider uppercase text-foreground-muted flex items-center gap-1.5">
                  <Database className="h-3 w-3" />
                  STATE ROOT
                </p>
                {bestLeaf?.stateRoot ? (
                  <HashDisplay hash={bestLeaf.stateRoot} chars={14} className="text-sm" />
                ) : (
                  <span className="text-sm text-foreground-muted font-mono">—</span>
                )}
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-heading tracking-wider uppercase text-foreground-muted flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />
                  TIMESTAMP
                </p>
                <p className="text-sm font-mono text-foreground">
                  {bestLeaf ? formatTimeAgo(bestLeaf.timestamp) : "—"}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-heading tracking-wider uppercase text-foreground-muted flex items-center gap-1.5">
                  <Layers className="h-3 w-3" />
                  TRANSACTIONS
                </p>
                <p className="text-sm font-mono text-foreground">
                  {bestLeaf ? `${bestLeaf.txCount} tx` : "—"}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card variant="crystalline" className="overflow-hidden">
        <CardHeader className="border-b border-border/50">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-heading tracking-wide">
              RECENT BLOCKS
            </CardTitle>
            <Badge variant="outline" shape="chamfered" className="font-mono text-xs">
              Page {page} / {totalPages}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div
            className={cn(
              gridClass,
              "px-4 py-2 border-b border-border/50",
              "text-[10px] font-heading tracking-wider uppercase text-foreground-muted"
            )}
          >
            <div>Type</div>
            <div>Hash</div>
            <div className="text-right">Height</div>
            <div className="hidden md:block text-right">Leaf</div>
            <div className="hidden lg:block text-right">Activity</div>
          </div>

          {isBlocksLoading && !hasLoadedRef.current ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={`skeleton-${idx}`}
                  className="h-10 w-full shimmer rounded-md"
                />
              ))}
            </div>
          ) : blocksError ? (
            <div className="p-6 text-sm text-destructive">
              {blocksError}
            </div>
          ) : blocks.length === 0 ? (
            <div className="p-10 text-center text-foreground-muted">
              <div className="icon-hex mx-auto mb-3 bg-muted">
                <Blocks className="h-5 w-5 opacity-50" />
              </div>
              <p className="font-heading">No blocks available yet</p>
            </div>
          ) : (
            <div>
              {animatedBlocks.map(({ block, isNew }) => (
                <div
                  key={block.hash}
                  className={cn(
                    "border-b border-border/50",
                    isNew && "block-enter-shell"
                  )}
                  style={isNew ? { "--block-anim-duration": animationDuration } as React.CSSProperties : undefined}
                >
                  <button
                    onClick={() => handleOpenDetail(block.hash)}
                    className={cn(
                      gridClass,
                      "w-full text-left items-center gap-4 px-4 py-3",
                      "hover:bg-card/50 transition-colors",
                      isNew && "block-enter-content"
                    )}
                  >
                    <Badge
                      variant={block.blockType === "Leaf" ? "leaf" : "stem"}
                      shape="hexagon"
                      size="block-type"
                      faceted
                    >
                      {block.blockType}
                    </Badge>

                    <div className="flex flex-col">
                      <HashDisplay hash={block.hash} chars={10} className="text-sm" />
                      <span className="text-[10px] font-mono text-foreground-muted">
                        {formatTimeAgo(block.timestamp)}
                      </span>
                    </div>

                    <div className="text-right font-mono text-sm">
                      {formatBlockHeight(block.height)}
                    </div>

                    <div className="hidden md:block text-right font-mono text-xs text-foreground-muted">
                      {formatBlockHeight(block.leafHeight)}
                    </div>

                    <div className="hidden lg:block text-right text-xs font-mono text-foreground-muted">
                      {block.blockType === "Stem"
                        ? `${block.fruitCount} fruit${block.fruitCount !== 1 ? "s" : ""}`
                        : `${block.txCount} tx${block.txCount !== 1 ? "s" : ""}`}
                    </div>
                  </button>
                </div>
              ))}
            </div>
          )}

          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
            isLoading={isBlocksLoading}
          />
        </CardContent>
      </Card>

      <TransactionDetailPanel
        detail={txDetail}
        isOpen={isTxDetailOpen}
        onClose={handleCloseTxDetail}
        isLoading={isTxDetailLoading}
      />
    </div>
  );
}
