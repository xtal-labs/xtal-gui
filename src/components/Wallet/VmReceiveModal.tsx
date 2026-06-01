import { useState, useEffect, useCallback, useMemo } from "react";
import { Download, X, Copy, Check, RefreshCw, QrCode } from "lucide-react";
import QRCode from "qrcode";

import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ModalShell } from "@/components/ui/modal-shell";
import { cn } from "@/lib/utils";
import { formatVmAddress } from "@/lib/address";
import { tauriCommand } from "@/hooks";
import { useUiStore } from "@/stores";
import type { VmAddress } from "@/types";

interface VmReceiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  vmAddresses: VmAddress[];
  onAddressGenerated: () => void;
}

export function VmReceiveModal({
  isOpen,
  onClose,
  vmAddresses,
  onAddressGenerated,
}: VmReceiveModalProps) {
  const { addToast } = useUiStore();

  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [justGenerated, setJustGenerated] = useState<string | null>(null);

  // Format address for display
  const toDisplayAddress = useCallback((addr: string): string => {
    return formatVmAddress(addr);
  }, []);

  // Selected address in 0x format for display
  const selectedDisplayAddress = useMemo(() => {
    return selectedAddress ? toDisplayAddress(selectedAddress) : null;
  }, [selectedAddress, toDisplayAddress]);

  const selectAddress = useCallback((address: string) => {
    setJustGenerated(null);
    setSelectedAddress(address);
  }, []);

  const defaultAddress = useMemo(() => {
    if (vmAddresses.length === 0) return null;
    return (
      vmAddresses.find((addr) => addr.label === "Primary")?.address ??
      vmAddresses[vmAddresses.length - 1].address
    );
  }, [vmAddresses]);

  // Pick a default only when needed. Refreshes replace the address array, so
  // preserve the selected address as long as it still exists.
  useEffect(() => {
    if (!isOpen) return;

    if (vmAddresses.length === 0) {
      setSelectedAddress(null);
      return;
    }

    if (justGenerated && vmAddresses.some((addr) => addr.address === justGenerated)) {
      setSelectedAddress(justGenerated);
      return;
    }

    setSelectedAddress((current) => {
      if (current && vmAddresses.some((addr) => addr.address === current)) {
        return current;
      }
      return defaultAddress;
    });
  }, [isOpen, vmAddresses, justGenerated, defaultAddress]);

  // Reset justGenerated when modal closes
  useEffect(() => {
    if (!isOpen) {
      setJustGenerated(null);
      setSelectedAddress(null);
    }
  }, [isOpen]);

  // Generate QR code when selected address changes
  const generateQrCode = useCallback(async (address: string) => {
    try {
      const dataUrl = await QRCode.toDataURL(address, {
        width: 200,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
        errorCorrectionLevel: "M",
      });
      setQrDataUrl(dataUrl);
    } catch (err) {
      console.error("Failed to generate QR code:", err);
      setQrDataUrl(null);
    }
  }, []);

  useEffect(() => {
    if (selectedDisplayAddress) {
      generateQrCode(selectedDisplayAddress);
    }
  }, [selectedDisplayAddress, generateQrCode]);

  const handleGenerateNew = async () => {
    setIsGenerating(true);
    try {
      const newAddress = await tauriCommand<string>("generate_vm_address");
      setJustGenerated(newAddress);
      setSelectedAddress(newAddress);
      onAddressGenerated();
      addToast({
        type: "success",
        title: "VM Address Generated",
        message: "New VM account address created",
        duration: 3000,
      });
    } catch (err) {
      console.error("Failed to generate VM address:", err);
      addToast({
        type: "error",
        title: "Generation Failed",
        message: err instanceof Error ? err.message : String(err),
        duration: 5000,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async (address: string) => {
    const displayAddress = toDisplayAddress(address);
    try {
      await navigator.clipboard.writeText(displayAddress);
      setCopiedAddress(address);
      setTimeout(() => setCopiedAddress(null), 2000);
      addToast({
        type: "success",
        title: "Copied",
        message: "Address copied to clipboard",
        duration: 2000,
      });
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalShell
      className="bg-black/60 backdrop-blur-sm"
      cardClassName="max-w-lg relative"
      onClose={onClose}
      title="VM receive"
    >
        {/* Decorative elements */}
        <div className="absolute inset-0 opacity-5 pointer-events-none">
          <div
            className="absolute top-0 left-0 w-40 h-40 bg-gradient-to-br from-accent/50 to-transparent"
            style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }}
          />
        </div>

        <CardHeader className="relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="icon-hex bg-accent/20" style={{ width: "2.5rem", height: "2.5rem" }}>
                <Download className="h-5 w-5 text-accent" />
              </div>
              <div>
                <CardTitle className="font-heading tracking-wide">RECEIVE VM TRANSFER</CardTitle>
                <CardDescription>Share your VM address to receive funds</CardDescription>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 relative">
          {/* QR Code Display */}
          {selectedAddress && (
            <div className="flex flex-col items-center p-6 chamfered bg-white dark:bg-muted/10">
              {/* QR Code */}
              <div className="w-40 h-40 relative mb-4">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="QR Code"
                    className="w-full h-full object-contain rounded"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-muted/50 rounded">
                    <QrCode className="h-12 w-12 text-foreground-muted animate-pulse" />
                  </div>
                )}
                {/* Decorative corner accents */}
                <div className="absolute -top-1 -left-1 w-4 h-4 border-l-2 border-t-2 border-accent" />
                <div className="absolute -top-1 -right-1 w-4 h-4 border-r-2 border-t-2 border-accent" />
                <div className="absolute -bottom-1 -left-1 w-4 h-4 border-l-2 border-b-2 border-accent" />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 border-r-2 border-b-2 border-accent" />
              </div>

              <p className="text-xs text-foreground-muted font-heading mb-1">YOUR VM ADDRESS</p>
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono bg-muted/50 px-2 py-1 chamfered-sm">
                  {selectedDisplayAddress}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleCopy(selectedAddress)}
                >
                  {copiedAddress === selectedAddress ? (
                    <Check className="h-3.5 w-3.5 text-success" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Full address with copy */}
          {selectedAddress && selectedDisplayAddress && (
            <div className="space-y-2">
              <label className="text-xs font-heading tracking-wide text-foreground-secondary">
                FULL ADDRESS
              </label>
              <div
                className="group relative p-3 chamfered-sm bg-muted/50 cursor-pointer hover:bg-muted/70 transition-colors"
                onClick={() => handleCopy(selectedAddress)}
              >
                <code className="text-xs font-mono break-all text-foreground-secondary group-hover:text-foreground">
                  {selectedDisplayAddress}
                </code>
                <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                  {copiedAddress === selectedAddress ? (
                    <Check className="h-4 w-4 text-success" />
                  ) : (
                    <Copy className="h-4 w-4 text-foreground-muted" />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Address list */}
          {vmAddresses.length > 1 && (
            <div className="space-y-2">
              <label className="text-xs font-heading tracking-wide text-foreground-secondary">
                YOUR VM ADDRESSES
              </label>
              <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                {vmAddresses.map((addr) => {
                  const displayAddr = toDisplayAddress(addr.address);
                  return (
                    <button
                      key={addr.address}
                      type="button"
                      onClick={() => selectAddress(addr.address)}
                      className={cn(
                        "w-full flex items-center justify-between p-2 chamfered-sm transition-all text-left",
                        selectedAddress === addr.address
                          ? "bg-accent/10 border border-accent"
                          : "bg-muted/30 border border-transparent hover:border-accent/30"
                      )}
                    >
                      <code className="text-xs font-mono">
                        {displayAddr}
                      </code>
                      <Badge
                        variant="info"
                        shape="chamfered"
                        className="text-[10px]"
                        diamond
                      >
                        {addr.label ?? "Account"}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Generate new address button */}
          <Button
            variant="outline-crystalline"
            className="w-full text-foreground"
            onClick={handleGenerateNew}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <QrCode className="h-4 w-4 mr-2" />
            )}
            Generate New VM Address
          </Button>
        </CardContent>
    </ModalShell>
  );
}
