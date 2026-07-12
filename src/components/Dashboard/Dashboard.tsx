import { useState } from "react";
import { Check, Plus, RotateCcw, SlidersHorizontal } from "lucide-react";

import { StatusBadge } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useBlockchainStore, useDashboardStore, useNetworkStore } from "@/stores";

import AddWidgetDialog from "./AddWidgetDialog";
import DashboardGrid from "./DashboardGrid";

export default function Dashboard() {
  const isSynced = useBlockchainStore((s) => s.isSynced);
  const syncProgress = useBlockchainStore((s) => s.syncProgress);
  const peerCount = useNetworkStore((s) => s.peerCount);

  const editMode = useDashboardStore((s) => s.editMode);
  const setEditMode = useDashboardStore((s) => s.setEditMode);
  const resetLayout = useDashboardStore((s) => s.resetLayout);
  const flushLayout = useDashboardStore((s) => s.flushLayout);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const handleReset = () => {
    if (!confirmingReset) {
      setConfirmingReset(true);
      return;
    }
    resetLayout();
    setConfirmingReset(false);
  };

  const exitEditMode = () => {
    flushLayout();
    setEditMode(false);
    setConfirmingReset(false);
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold tracking-wide text-foreground">
            DASHBOARD
          </h1>
          <p className="text-foreground-secondary text-sm mt-1 font-heading tracking-wide">
            Crystal Node Overview
          </p>
        </div>
        <div className="flex items-center gap-2">
          {editMode ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowAddDialog(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Widget
              </Button>
              <Button
                variant={confirmingReset ? "destructive" : "outline"}
                size="sm"
                onClick={handleReset}
                onBlur={() => setConfirmingReset(false)}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                {confirmingReset ? "Confirm reset?" : "Reset"}
              </Button>
              <Button variant="default" size="sm" onClick={exitEditMode}>
                <Check className="h-3.5 w-3.5 mr-1" />
                Done
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditMode(true)}
                aria-label="Customize dashboard"
              >
                <SlidersHorizontal className="h-3.5 w-3.5 mr-1" />
                Customize
              </Button>
              <StatusBadge status={
                isSynced ? "synced"
                : peerCount === 0 ? "no_peers"
                : syncProgress.phase === "Idle" ? "synced"
                : "syncing"
              } />
            </>
          )}
        </div>
      </div>

      <DashboardGrid />

      {showAddDialog && <AddWidgetDialog onClose={() => setShowAddDialog(false)} />}
    </div>
  );
}
