import { ArrowRight, Box } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getFruitColor } from "@/lib/fruitColors";
import type { CachedContract } from "@/types/contract";

interface ContractCardProps {
  contract: CachedContract;
  onOpen: (address: string) => void;
}

const ICON_MAP: Record<string, string> = {
  bridge: "Bridge",
  token: "Token",
  nft: "NFT",
  dao: "DAO",
  swap: "Swap",
};

export function ContractCard({ contract, onOpen }: ContractCardProps) {
  const displayName = contract.name || "Unnamed Contract";
  const displayIcon = contract.icon ? ICON_MAP[contract.icon] || contract.icon : null;
  const truncatedAddr =
    contract.address.length > 12
      ? `${contract.address.slice(0, 6)}...${contract.address.slice(-4)}`
      : contract.address;

  return (
    <div className="chamfered crystalline overflow-hidden group transition-all duration-200 hover:shadow-crystalline">
      {/* Decorative top edge */}
      <div className="h-0.5 bg-gradient-to-r from-primary/40 via-accent/60 to-primary/40" />

      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="icon-hex bg-accent/15 shrink-0"
              style={{ width: "2.5rem", height: "2.5rem" }}
            >
              {displayIcon ? (
                <span className="text-xs font-heading font-bold text-accent">
                  {displayIcon.slice(0, 2).toUpperCase()}
                </span>
              ) : (
                <Box className="h-4 w-4 text-accent" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="font-heading font-semibold tracking-wide text-sm truncate">
                {displayName}
              </h3>
              <p className="font-mono text-xs text-foreground-muted truncate">
                0x{truncatedAddr}
              </p>
            </div>
          </div>
        </div>

        {/* Description */}
        {contract.description && (
          <p className="text-xs text-foreground-secondary line-clamp-2 leading-relaxed">
            {contract.description}
          </p>
        )}

        {/* Meta row */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="default" shape="chamfered">
            {contract.methodCount} methods
          </Badge>
          {contract.fruitType && (() => {
            const colors = getFruitColor(contract.fruitType);
            return (
              <Badge
                shape="chamfered"
                className={cn(
                  "bg-gradient-to-br",
                  colors.bg,
                  colors.border
                )}
                style={{
                  boxShadow: `0 0 8px 0 ${colors.glow.replace("shadow-", "")}`,
                }}
              >
                <span className={colors.icon}>{colors.emoji}</span>
                {contract.fruitType}
              </Badge>
            );
          })()}
          {contract.source === "builtin" && (
            <Badge variant="info" shape="chamfered">
              Built-in
            </Badge>
          )}
          {contract.source === "ipfs" && (
            <Badge variant="success" shape="chamfered">
              IPFS
            </Badge>
          )}
        </div>

        {/* Open button */}
        <Button
          variant="outline"
          size="sm"
          className="w-full group-hover:border-accent/50 group-hover:text-accent transition-colors"
          onClick={() => onOpen(contract.address)}
        >
          Open
          <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </div>
    </div>
  );
}
