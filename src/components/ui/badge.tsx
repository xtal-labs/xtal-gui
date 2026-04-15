import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  [
    "inline-flex items-center gap-1.5 px-2.5 py-0.5",
    "text-xs font-medium font-heading tracking-wide",
    "transition-colors",
  ],
  {
    variants: {
      variant: {
        default: "bg-primary/15 text-primary",
        secondary: "bg-secondary text-secondary-foreground",
        success: "bg-success/15 text-success",
        warning: "bg-warning/15 text-warning",
        destructive: "bg-destructive/15 text-destructive",
        info: "bg-info/15 text-info",
        outline: "border border-border text-foreground-secondary",
        // Crystal-specific
        stem: "bg-crystal-stem/15 text-crystal-stem",
        leaf: "bg-crystal-leaf/15 text-crystal-leaf",
        fruit: "bg-crystal-fruit/15 text-crystal-fruit",
        // Transaction types (matching toast colors)
        stake: "bg-violet-500/20 text-violet-400",
        unstake: "bg-sky-500/20 text-sky-400",
        // Status badges
        synced: "bg-success/15 text-success",
        syncing: "bg-info/15 text-info",
        offline: "bg-destructive/15 text-destructive",
        no_peers: "bg-warning/15 text-warning",
        mining: "bg-primary/15 text-primary",
        validating: "bg-crystal-fruit/15 text-crystal-fruit",
      },
      shape: {
        rounded: "rounded-full",
        chamfered: "chamfered-sm",
        hexagon: "hexagon px-3 py-1",
      },
      size: {
        default: "",
        "block-type": "w-[4.5rem] justify-center",
      },
    },
    defaultVariants: {
      variant: "default",
      shape: "chamfered",
      size: "default",
    },
  }
);

// Maps variant → CSS custom properties for the hex-gem gradient
const GEM_COLORS: Record<string, Record<string, string>> = {
  stem: {
    "--gem-specular": "var(--crystal-stem-specular)",
    "--gem-highlight": "var(--crystal-stem-highlight)",
    "--gem-base": "var(--crystal-stem)",
    "--gem-shadow": "var(--crystal-stem-shadow)",
  },
  leaf: {
    "--gem-specular": "var(--crystal-leaf-specular)",
    "--gem-highlight": "var(--crystal-leaf-highlight)",
    "--gem-base": "var(--crystal-leaf)",
    "--gem-shadow": "var(--crystal-leaf-shadow)",
  },
  fruit: {
    "--gem-specular": "var(--crystal-fruit-specular)",
    "--gem-highlight": "var(--crystal-fruit-highlight)",
    "--gem-base": "var(--crystal-fruit)",
    "--gem-shadow": "var(--crystal-fruit-shadow)",
  },
};

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
  pulse?: boolean;
  diamond?: boolean;
  faceted?: boolean;
}

function Badge({
  className,
  variant,
  shape,
  size,
  dot = false,
  pulse = false,
  diamond = false,
  faceted = false,
  style,
  children,
  ...props
}: BadgeProps) {
  const isGem = faceted && shape === "hexagon" && !!variant && variant in GEM_COLORS;
  const gemStyle = isGem ? GEM_COLORS[variant!] : undefined;

  return (
    <div
      className={cn(badgeVariants({ variant, shape, size }), isGem && "hex-gem", className)}
      style={gemStyle ? { ...gemStyle, ...style } as React.CSSProperties : style}
      {...props}
    >
      {(dot || diamond) && (
        <span
          className={cn(
            diamond ? "status-diamond-sm" : "h-1.5 w-1.5 rounded-full",
            "bg-current shrink-0",
            pulse && "animate-pulse"
          )}
        />
      )}
      {children}
    </div>
  );
}

export { Badge, badgeVariants };
