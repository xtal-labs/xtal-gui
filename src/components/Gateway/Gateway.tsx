import { useEffect } from "react";
import { Loader2 } from "lucide-react";

import { useGatewayStore, useUiStore } from "@/stores";
import { ContractLibrary } from "./ContractLibrary";
import { ContractInteraction } from "./ContractInteraction";
import { DeployContractModal } from "./DeployContractModal";
import { ImportAbiModal } from "./ImportAbiModal";

const MODAL_DEPLOY = "gateway-deploy";
const MODAL_IMPORT = "gateway-import";

export default function Gateway() {
  const { selectedAddress, selectedAbi, isLoading, error, loadLibrary } =
    useGatewayStore();
  const { activeModal, modalData, closeModal } = useUiStore();

  // Load library on mount
  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  const isInteracting = selectedAddress !== null && selectedAbi !== null;

  // Pre-fill address for import modal (passed via modalData)
  const importPrefill =
    activeModal === MODAL_IMPORT && typeof modalData === "string"
      ? modalData
      : undefined;

  return (
    <div className="h-full flex flex-col">
      {/* Loading overlay for contract selection */}
      {isLoading && !isInteracting && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 text-accent animate-spin" />
          <span className="ml-3 font-heading text-foreground-secondary tracking-wide">
            Loading...
          </span>
        </div>
      )}

      {/* Error message */}
      {error && !isInteracting && (
        <div className="p-4 chamfered-sm bg-destructive/10 border border-destructive/20 mb-6">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Main view */}
      {!isLoading && (
        <>
          {isInteracting ? <ContractInteraction /> : <ContractLibrary />}
        </>
      )}

      {/* Modals */}
      <DeployContractModal
        isOpen={activeModal === MODAL_DEPLOY}
        onClose={closeModal}
      />
      <ImportAbiModal
        isOpen={activeModal === MODAL_IMPORT}
        onClose={closeModal}
        prefillAddress={importPrefill}
      />
    </div>
  );
}
