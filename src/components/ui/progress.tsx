import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

interface ProgressProps
  extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
  indicatorClassName?: string;
  showValue?: boolean;
  variant?: "default" | "success" | "warning" | "info";
  geometric?: boolean;
}

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(
  (
    {
      className,
      value,
      indicatorClassName,
      showValue = false,
      variant = "default",
      geometric = true,
      ...props
    },
    ref
  ) => (
    <div className="relative">
      <ProgressPrimitive.Root
        ref={ref}
        className={cn(
          "relative h-2.5 w-full overflow-hidden",
          geometric ? "chamfered-sm" : "rounded-full",
          "bg-muted",
          className
        )}
        {...props}
      >
        <ProgressPrimitive.Indicator
          className={cn(
            "h-full w-full flex-1 transition-all duration-300",
            geometric ? "chamfered-sm" : "rounded-full",
            variant === "default" && [
              "bg-gradient-to-r from-primary via-crystal-facet-light to-primary",
            ],
            variant === "success" && "bg-gradient-to-r from-success via-emerald-400 to-success",
            variant === "warning" && "bg-gradient-to-r from-warning via-amber-400 to-warning",
            variant === "info" && "bg-gradient-to-r from-info via-blue-400 to-info",
            indicatorClassName
          )}
          style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
        />
      </ProgressPrimitive.Root>
      {showValue && (
        <span className="absolute right-0 top-1/2 -translate-y-1/2 text-xs font-medium font-heading text-foreground-secondary">
          {Math.round(value || 0)}%
        </span>
      )}
    </div>
  )
);
Progress.displayName = ProgressPrimitive.Root.displayName;

// Indeterminate progress bar
const ProgressIndeterminate = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { geometric?: boolean }
>(({ className, geometric = true, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "relative h-2.5 w-full overflow-hidden bg-muted",
      geometric ? "chamfered-sm" : "rounded-full",
      className
    )}
    {...props}
  >
    <div
      className={cn(
        "absolute inset-0 w-1/3 animate-[progress-indeterminate_1.5s_ease-in-out_infinite]",
        geometric ? "chamfered-sm" : "rounded-full",
        "bg-gradient-to-r from-primary via-crystal-facet-light to-primary"
      )}
    />
  </div>
));
ProgressIndeterminate.displayName = "ProgressIndeterminate";

export { Progress, ProgressIndeterminate };
