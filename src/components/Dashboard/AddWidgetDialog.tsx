import { useState } from "react";
import { ArrowLeft, ChevronRight, X } from "lucide-react";

import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/ui/modal-shell";
import { WidgetIcon } from "@/components/Dashboard/WidgetShell";
import { inferCardStyle } from "@/components/common/ContractValueDisplay";
import { tauriCommand } from "@/hooks/useTauriCommand";
import { isDashboardMethod } from "@/hooks/useContractDashboard";
import { useDashboardStore } from "@/stores";
import { truncateAddress } from "@/lib/utils";
import type { AbiMethod, CachedContract, ContractAbi } from "@/types/contract";
import { WIDGET_REGISTRY } from "./widgets/registry";
import type { WidgetDefinition } from "./widgets/registry";

interface AddWidgetDialogProps {
  onClose: () => void;
}

type Step = "pick" | "contract" | "method";

const pickerItemClass =
  "w-full flex items-center gap-3 rounded-md border border-border p-3 text-left transition-colors hover:bg-muted disabled:opacity-50 disabled:pointer-events-none";

export default function AddWidgetDialog({ onClose }: AddWidgetDialogProps) {
  const widgets = useDashboardStore((s) => s.layout.widgets);
  const addWidget = useDashboardStore((s) => s.addWidget);

  const [step, setStep] = useState<Step>("pick");
  const [pendingDefinition, setPendingDefinition] = useState<WidgetDefinition | null>(null);
  const [contracts, setContracts] = useState<CachedContract[] | null>(null);
  const [selectedContract, setSelectedContract] = useState<CachedContract | null>(null);
  const [methods, setMethods] = useState<AbiMethod[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const placedTypes = new Set(widgets.map((w) => w.widgetType));

  const handlePick = async (definition: WidgetDefinition) => {
    if (!definition.requiresConfig) {
      addWidget(definition.type, { size: definition.defaultSize });
      onClose();
      return;
    }

    // Contract widgets need a contract + method choice. Fetched locally —
    // gatewayStore's selection state belongs to the Gateway tab.
    setPendingDefinition(definition);
    setStep("contract");
    setError(null);
    try {
      const entries = await tauriCommand<CachedContract[]>("list_cached_contracts");
      setContracts(entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setContracts([]);
    }
  };

  const handlePickContract = async (contract: CachedContract) => {
    setSelectedContract(contract);
    setStep("method");
    setMethods(null);
    setError(null);
    try {
      const abi = await tauriCommand<ContractAbi | null>("load_contract_abi", {
        contractAddress: contract.address,
      });
      if (!abi) {
        setError("No ABI found for this contract");
        setMethods([]);
        return;
      }
      setMethods(abi.methods.filter(isDashboardMethod));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setMethods([]);
    }
  };

  const handlePickMethod = (method: AbiMethod) => {
    if (!pendingDefinition || !selectedContract) return;
    addWidget(pendingDefinition.type, {
      size: pendingDefinition.defaultSize,
      contractAddress: selectedContract.address,
      method: method.name,
    });
    onClose();
  };

  const goBack = () => {
    setError(null);
    if (step === "method") {
      setStep("contract");
      setSelectedContract(null);
      setMethods(null);
    } else if (step === "contract") {
      setStep("pick");
      setPendingDefinition(null);
      setContracts(null);
    }
  };

  const title =
    step === "pick" ? "ADD WIDGET"
    : step === "contract" ? "CHOOSE CONTRACT"
    : "CHOOSE VALUE";

  return (
    <ModalShell title="Add Widget" onClose={onClose} cardClassName="max-w-md">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {step !== "pick" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={goBack}
                aria-label="Back"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <CardTitle className="font-heading tracking-wide">{title}</CardTitle>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close widget selector">
            <X className="h-4 w-4" />
          </Button>
        </div>
        {step === "method" && selectedContract && (
          <p className="text-xs text-foreground-muted font-mono mt-1">
            {selectedContract.name} &bull; 0x{truncateAddress(selectedContract.address.replace(/^0x/, ""), 6)}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-1.5">
        {error && (
          <p className="text-xs text-destructive font-mono break-all">{error}</p>
        )}

        {step === "pick" &&
          Object.values(WIDGET_REGISTRY).map((definition) => {
            const alreadyPlaced =
              !definition.multiInstance && placedTypes.has(definition.type);

            return (
              <button
                key={definition.type}
                type="button"
                disabled={alreadyPlaced}
                onClick={() => handlePick(definition)}
                className={pickerItemClass}
              >
                <WidgetIcon icon={definition.icon} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-heading font-medium tracking-wide text-foreground">
                    {definition.title}
                  </div>
                  <div className="text-xs text-foreground-muted truncate">
                    {definition.description}
                  </div>
                </div>
                {alreadyPlaced ? (
                  <span className="text-xs text-foreground-muted font-mono shrink-0">
                    Added
                  </span>
                ) : definition.requiresConfig ? (
                  <ChevronRight className="h-4 w-4 text-foreground-muted shrink-0" />
                ) : null}
              </button>
            );
          })}

        {step === "contract" && (
          contracts === null ? (
            <div className="h-16 bg-muted/40 animate-pulse chamfered-sm" />
          ) : contracts.length === 0 ? (
            <p className="text-xs text-foreground-muted font-mono">
              No contracts in your library. Import one from the Gateway tab first.
            </p>
          ) : (
            contracts.map((contract) => (
              <button
                key={contract.address}
                type="button"
                onClick={() => handlePickContract(contract)}
                className={pickerItemClass}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-heading font-medium tracking-wide text-foreground">
                    {contract.name}
                  </div>
                  <div className="text-xs text-foreground-muted font-mono truncate">
                    0x{truncateAddress(contract.address.replace(/^0x/, ""), 8)}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-foreground-muted shrink-0" />
              </button>
            ))
          )
        )}

        {step === "method" && (
          methods === null ? (
            <div className="h-16 bg-muted/40 animate-pulse chamfered-sm" />
          ) : methods.length === 0 ? (
            !error && (
              <p className="text-xs text-foreground-muted font-mono">
                This contract has no zero-parameter read methods to display.
              </p>
            )
          ) : (
            methods.map((method) => {
              const { icon } = inferCardStyle(method.name);
              return (
                <button
                  key={method.name}
                  type="button"
                  onClick={() => handlePickMethod(method)}
                  className={pickerItemClass}
                >
                  <WidgetIcon icon={icon} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-heading font-medium tracking-wide text-foreground">
                      {(method.displayName || method.name).toUpperCase().replace(/_/g, " ")}
                    </div>
                    {method.returns?.description && (
                      <div className="text-xs text-foreground-muted truncate">
                        {method.returns.description}
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          )
        )}
      </CardContent>
    </ModalShell>
  );
}
