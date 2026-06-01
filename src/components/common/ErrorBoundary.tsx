import React from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  React.PropsWithChildren,
  ErrorBoundaryState
> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught render error:", error);
    console.error("[ErrorBoundary] Component stack:", errorInfo.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-dvh min-w-[var(--app-min-width)] bg-background flex items-center justify-center overflow-auto p-4">
          <div className="max-w-md w-full">
            {/* Outer border */}
            <div
              className="chamfered-lg p-[2px]"
              style={{
                background:
                  "linear-gradient(135deg, hsl(var(--destructive) / 0.6), hsl(var(--accent) / 0.5))",
              }}
            >
              {/* Inner border */}
              <div
                className="chamfered-lg p-[1px]"
                style={{
                  background:
                    "linear-gradient(135deg, hsl(var(--accent) / 0.5), hsl(var(--primary) / 0.6))",
                }}
              >
                {/* Card body */}
                <div className="chamfered-lg crystalline p-6 flex flex-col gap-4 shadow-2xl">
                  {/* Title */}
                  <div className="text-center space-y-1.5">
                    <h1 className="font-heading text-lg font-semibold tracking-wider text-destructive">
                      Something Went Wrong
                    </h1>
                    <p className="font-heading text-sm text-foreground-secondary tracking-wide">
                      The interface encountered an unexpected error
                    </p>
                  </div>

                  {/* Divider */}
                  <div className="divider-angular" />

                  {/* Error message */}
                  <div className="chamfered-border-wrap">
                    <div className="chamfered bg-background-secondary p-4 overflow-y-auto max-h-40">
                      <p className="font-mono text-xs text-foreground-muted break-all leading-relaxed">
                        {this.state.error?.message ?? "Unknown error"}
                      </p>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="divider-angular" />

                  {/* Retry button */}
                  <Button variant="default" className="w-full" onClick={this.handleRetry}>
                    <RotateCcw className="h-4 w-4" />
                    Retry
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
