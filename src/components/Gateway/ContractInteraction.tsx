import { ArrowLeft, Book, Eye, Pencil, Coins } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AmountDisplay } from "@/components/common/AmountDisplay";
import { cn } from "@/lib/utils";
import { useGatewayStore, useWalletStore } from "@/stores";
import { MethodForm } from "./MethodForm";
import { UtxoDepositForm } from "./UtxoDepositForm";
import { ContractDashboard } from "./ContractDashboard";
import type { AbiMethod, Mutability } from "@/types/contract";

const MUTABILITY_ICON: Record<Mutability, React.ElementType> = {
  read: Eye,
  write: Pencil,
  payable: Coins,
};

const MUTABILITY_COLOR: Record<Mutability, string> = {
  read: "text-success",
  write: "text-info",
  payable: "text-warning",
};

export function ContractInteraction() {
  const { selectedAddress, selectedAbi, selectedMethod, selectMethod, backToLibrary } =
    useGatewayStore();
  const vmBalance = useWalletStore((s) => s.vmBalance);

  if (!selectedAbi || !selectedAddress) return null;

  const activeMethod = selectedMethod
    ? selectedAbi.methods.find((m) => m.name === selectedMethod)
    : null;

  // Group methods by mutability
  const readMethods = selectedAbi.methods.filter((m) => m.mutability === "read");
  const writeMethods = selectedAbi.methods.filter((m) => m.mutability === "write");
  const payableMethods = selectedAbi.methods.filter((m) => m.mutability === "payable");

  const groups: { label: string; methods: AbiMethod[] }[] = [];
  if (payableMethods.length > 0) groups.push({ label: "Payable", methods: payableMethods });
  if (writeMethods.length > 0) groups.push({ label: "Write", methods: writeMethods });
  if (readMethods.length > 0) groups.push({ label: "Read", methods: readMethods });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={backToLibrary}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h2 className="font-heading font-semibold text-lg tracking-wider truncate">
            {selectedAbi.name}
          </h2>
          <p className="font-mono text-xs text-foreground-muted truncate">
            0x{selectedAddress}
          </p>
        </div>
        {vmBalance && (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs font-heading tracking-wide text-foreground-muted">VM</span>
            <AmountDisplay amount={vmBalance.balance} size="sm" showSymbol />
          </div>
        )}
        <Badge variant="outline" className={cn("shrink-0", !vmBalance && "ml-auto")}>
          <Book className="h-3 w-3 mr-1" />
          {selectedAbi.methods.length} methods
        </Badge>
      </div>

      <div className="divider-angular" />

      {/* Two-column layout */}
      <div className="flex gap-6 min-h-0">
        {/* Left: Method sidebar */}
        <div className="w-64 shrink-0 space-y-4">
          {groups.map((group) => (
            <div key={group.label} className="space-y-1">
              <span className="text-xs font-heading tracking-wide text-foreground-muted px-2">
                {group.label.toUpperCase()}
              </span>
              {group.methods.map((method) => {
                const Icon = MUTABILITY_ICON[method.mutability];
                const isActive = selectedMethod === method.name;

                return (
                  <button
                    key={method.name}
                    onClick={() => selectMethod(method.name)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 chamfered-sm text-left",
                      "transition-all duration-150 text-sm",
                      isActive
                        ? "bg-primary/15 text-foreground"
                        : "text-foreground-secondary hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        isActive
                          ? MUTABILITY_COLOR[method.mutability]
                          : "text-foreground-muted"
                      )}
                    />
                    <span className="truncate font-heading tracking-wide">
                      {method.displayName || method.name}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Right: Method form */}
        <div className="flex-1 min-w-0">
          {activeMethod ? (
            <div className="chamfered crystalline p-5 overflow-hidden">
              {activeMethod.name === "consume_utxo" && activeMethod.encoding === "raw" ? (
                <UtxoDepositForm
                  method={activeMethod}
                  contractAddress={selectedAddress}
                />
              ) : (
                <MethodForm
                  method={activeMethod}
                  contractAddress={selectedAddress}
                />
              )}
            </div>
          ) : (
            <ContractDashboard
              contractAddress={selectedAddress}
              abi={selectedAbi}
            />
          )}
        </div>
      </div>
    </div>
  );
}
