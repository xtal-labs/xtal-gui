import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { truncateHash, copyToClipboard, cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface HashDisplayProps {
  hash: string;
  chars?: number;
  className?: string;
  copyable?: boolean;
  showTooltip?: boolean;
  truncate?: boolean;
}

export function HashDisplay({
  hash,
  chars = 8,
  className,
  copyable = true,
  showTooltip = true,
  truncate = true,
}: HashDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const success = await copyToClipboard(hash);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const displayHash = truncate ? truncateHash(hash, chars) : hash;

  const content = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-sm text-foreground",
        copyable && "cursor-pointer hover:text-primary transition-colors",
        className
      )}
      onClick={copyable ? handleCopy : undefined}
    >
      <span>{displayHash}</span>
      {copyable && (
        <span className="text-foreground-muted">
          {copied ? (
            <Check className="h-3.5 w-3.5 text-success" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </span>
      )}
    </span>
  );

  if (!showTooltip) return content;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent>
        <span className="font-mono text-xs break-all max-w-xs">{hash}</span>
      </TooltipContent>
    </Tooltip>
  );
}

export default HashDisplay;
