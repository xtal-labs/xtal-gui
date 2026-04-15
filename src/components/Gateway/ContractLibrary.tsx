import { useState } from "react";
import { Search, Plus, Download } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ContractCard } from "./ContractCard";
import { useGatewayStore, useUiStore } from "@/stores";
import { tauriCommand } from "@/hooks/useTauriCommand";
import type { ContractAbi, ContractInfo } from "@/types/contract";

const MODAL_DEPLOY = "gateway-deploy";
const MODAL_IMPORT = "gateway-import";

export function ContractLibrary() {
  const { cachedContracts, selectContract } = useGatewayStore();
  const { openModal, addToast } = useUiStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [loadAddress, setLoadAddress] = useState("");
  const [isLoadingAddr, setIsLoadingAddr] = useState(false);

  const filtered = searchQuery
    ? cachedContracts.filter(
        (c) =>
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : cachedContracts;

  const handleOpen = (address: string) => {
    selectContract(address);
  };

  const handleLoadByAddress = async () => {
    if (!loadAddress.trim()) return;

    setIsLoadingAddr(true);
    try {
      const addr = loadAddress.trim().replace(/^0x/, "");

      // Check if contract exists
      const info = await tauriCommand<ContractInfo>("get_contract_info", {
        contractAddress: addr,
      });

      if (!info.exists || !info.isContract) {
        addToast({
          type: "error",
          title: "Not a Contract",
          message: "Address does not contain a deployed contract",
          duration: 4000,
        });
        setIsLoadingAddr(false);
        return;
      }

      // Try to load ABI (checks local cache, on-chain CID, then IPFS gateways)
      const abi = await tauriCommand<ContractAbi | null>("load_contract_abi", {
        contractAddress: addr,
      });

      if (abi) {
        addToast({
          type: "success",
          title: "ABI Loaded",
          message: `Found ABI for "${abi.name}"`,
          duration: 3000,
        });
        selectContract(addr);
      } else {
        // No ABI found — prompt import
        addToast({
          type: "warning",
          title: "No ABI Found",
          message: "Import an ABI to interact with this contract",
          duration: 4000,
        });
        openModal(MODAL_IMPORT, addr);
      }
    } catch (err) {
      addToast({
        type: "error",
        title: "Load Failed",
        message: err instanceof Error ? err.message : String(err),
        duration: 5000,
      });
    } finally {
      setIsLoadingAddr(false);
      setLoadAddress("");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-heading font-semibold text-lg tracking-wider">
            CONTRACT LIBRARY
          </h2>
          <p className="text-sm text-foreground-secondary mt-0.5">
            Interact with deployed smart contracts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => openModal(MODAL_IMPORT)}>
            <Download className="h-3.5 w-3.5" />
            Import ABI
          </Button>
          <Button variant="default" size="sm" onClick={() => openModal(MODAL_DEPLOY)}>
            <Plus className="h-3.5 w-3.5" />
            Deploy
          </Button>
        </div>
      </div>

      {/* Search + load-by-address */}
      <div className="flex gap-3">
        <div className="flex-1">
          <Input
            placeholder="Search contracts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={<Search className="h-4 w-4" />}
          />
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Load by address (0x...)"
            value={loadAddress}
            onChange={(e) => setLoadAddress(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLoadByAddress()}
            className="w-72 font-mono text-sm"
          />
          <Button
            variant="outline"
            onClick={handleLoadByAddress}
            disabled={!loadAddress.trim() || isLoadingAddr}
            isLoading={isLoadingAddr}
          >
            Load
          </Button>
        </div>
      </div>

      <div className="divider-angular" />

      {/* Contract grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((contract) => (
            <ContractCard
              key={contract.address}
              contract={contract}
              onOpen={handleOpen}
            />
          ))}
        </div>
      ) : cachedContracts.length === 0 ? (
        <div className="text-center py-12">
          <div
            className="icon-hex mx-auto mb-4 bg-muted/50"
            style={{ width: "4rem", height: "4rem" }}
          >
            <Download className="h-6 w-6 text-foreground-muted" />
          </div>
          <p className="text-foreground-muted font-heading tracking-wide">
            No contracts yet
          </p>
          <p className="text-sm text-foreground-muted mt-1">
            Deploy a new contract or import an ABI for an existing one
          </p>
        </div>
      ) : (
        <div className="text-center py-8">
          <p className="text-foreground-muted text-sm">
            No contracts match "{searchQuery}"
          </p>
        </div>
      )}
    </div>
  );
}
