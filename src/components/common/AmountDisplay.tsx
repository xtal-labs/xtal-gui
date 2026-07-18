import { formatXtalFull, cn, type ShardAmount } from "@/lib/utils";

interface AmountDisplayProps {
  amount: ShardAmount; // in shards
  className?: string;
  showSymbol?: boolean;
  showFull?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  positive?: boolean;
  negative?: boolean;
}

const sizeClasses = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-xl font-semibold",
  xl: "text-3xl font-bold",
};

export function AmountDisplay({
  amount,
  className,
  showSymbol = true,
  showFull = false,
  size = "md",
  positive,
  negative,
}: AmountDisplayProps) {
  const displayAmount = showFull ? formatXtalFull(amount) : formatXtalFull(amount);

  const colorClass = positive
    ? "text-success"
    : negative
    ? "text-destructive"
    : "text-foreground";

  return (
    <span
      className={cn(
        "font-mono tabular-nums",
        sizeClasses[size],
        colorClass,
        className
      )}
    >
      {positive && "+"}
      {negative && "-"}
      {displayAmount}
      {showSymbol && (
        <span className="ml-1 text-foreground-secondary font-sans font-normal">
          XTAL
        </span>
      )}
    </span>
  );
}

export default AmountDisplay;
