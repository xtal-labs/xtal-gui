import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  variant?: "default" | "crystal";
}

const sizeClasses = {
  sm: { container: "h-4 w-4", inner: "h-2 w-2" },
  md: { container: "h-6 w-6", inner: "h-3 w-3" },
  lg: { container: "h-8 w-8", inner: "h-4 w-4" },
  xl: { container: "h-12 w-12", inner: "h-6 w-6" },
};

// Geometric crystal spinner - hexagonal rotating shape
export function LoadingSpinner({ size = "md", className, variant = "crystal" }: LoadingSpinnerProps) {
  if (variant === "default") {
    return (
      <svg
        className={cn("animate-spin text-primary", sizeClasses[size].container, className)}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    );
  }

  // Crystal variant - geometric hexagon spinner
  return (
    <div className={cn("relative", sizeClasses[size].container, className)}>
      {/* Outer hexagon - rotating */}
      <svg
        className="absolute inset-0 animate-spin text-primary"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M12 2L21.5 7.5V16.5L12 22L2.5 16.5V7.5L12 2Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeOpacity="0.3"
          fill="none"
        />
        {/* Partial highlight for spinning effect */}
        <path
          d="M12 2L21.5 7.5V12"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
      {/* Inner diamond - counter-rotating shimmer */}
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center",
          "animate-pulse"
        )}
      >
        <div
          className={cn(
            sizeClasses[size].inner,
            "bg-gradient-to-br from-primary via-accent to-primary",
            "diamond opacity-60"
          )}
        />
      </div>
    </div>
  );
}

// Full page loading state with geometric design
export function LoadingScreen({ message = "Loading..." }: { message?: string }) {
  return (
    <div className="flex min-h-dvh min-w-[800px] items-center justify-center overflow-auto bg-background hex-grid-bg p-4">
      <div className="relative flex flex-col items-center gap-6">
        {/* Crystal logo with loading animation */}
        <div className="relative">
          {/* Outer rotating hexagon */}
          <svg
            className="h-20 w-20 animate-spin text-primary"
            style={{ animationDuration: "3s" }}
            viewBox="0 0 80 80"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M40 5L72 22.5V57.5L40 75L8 57.5V22.5L40 5Z"
              stroke="currentColor"
              strokeWidth="1"
              strokeOpacity="0.2"
              fill="none"
            />
            {/* Animated segment */}
            <path
              d="M40 5L72 22.5V40"
              stroke="url(#loadingGradient)"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />
            <defs>
              <linearGradient id="loadingGradient" x1="40" y1="5" x2="72" y2="40" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="hsl(var(--primary))" />
                <stop offset="100%" stopColor="hsl(var(--accent))" />
              </linearGradient>
            </defs>
          </svg>

          {/* Inner crystal */}
          <div className="absolute inset-0 flex items-center justify-center">
            <svg
              className="h-10 w-10"
              viewBox="0 0 32 32"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Crystal body */}
              <path
                d="M16 4L26 10V22L16 28L6 22V10L16 4Z"
                fill="url(#crystalFill)"
                stroke="hsl(var(--primary))"
                strokeWidth="0.5"
              />
              {/* Left facet */}
              <path
                d="M6 10L16 16V28L6 22V10Z"
                fill="hsl(var(--crystal-facet-dark))"
                fillOpacity="0.4"
              />
              {/* Right facet */}
              <path
                d="M26 10L16 16V28L26 22V10Z"
                fill="hsl(var(--crystal-facet-light))"
                fillOpacity="0.3"
              />
              {/* Top facet */}
              <path
                d="M16 4L26 10L16 16L6 10L16 4Z"
                fill="hsl(var(--crystal-facet-light))"
                fillOpacity="0.5"
              />
              <defs>
                <linearGradient id="crystalFill" x1="6" y1="4" x2="26" y2="28" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="hsl(var(--primary))" />
                  <stop offset="50%" stopColor="hsl(var(--accent))" />
                  <stop offset="100%" stopColor="hsl(var(--primary))" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>

        {/* Loading text */}
        <div className="text-center">
          <p className="text-sm font-heading tracking-wider text-foreground-secondary">
            {message}
          </p>
          {/* Animated dots */}
          <div className="flex justify-center gap-1 mt-2">
            <span className="status-diamond-sm bg-primary animate-pulse" style={{ animationDelay: "0ms" }} />
            <span className="status-diamond-sm bg-primary animate-pulse" style={{ animationDelay: "150ms" }} />
            <span className="status-diamond-sm bg-primary animate-pulse" style={{ animationDelay: "300ms" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoadingSpinner;
