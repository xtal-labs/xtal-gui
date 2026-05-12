import * as React from "react";
import { Card } from "./card";
import { cn } from "@/lib/utils";

interface ModalShellProps extends React.HTMLAttributes<HTMLDivElement> {
  cardClassName?: string;
}

const ModalShell = React.forwardRef<HTMLDivElement, ModalShellProps>(
  ({ className, cardClassName, children, ...props }, ref) => (
    <div
      className={cn(
        "fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-black/50 text-foreground",
        className
      )}
      {...props}
    >
      <div className="flex min-h-full w-full items-start justify-center p-3 sm:p-4 min-[900px]:items-center">
        <Card
          ref={ref}
          variant="crystalline"
          className={cn(
            "my-2 w-full max-h-[calc(100dvh-1rem)] overflow-y-auto sm:my-4 sm:max-h-[calc(100dvh-2rem)]",
            cardClassName
          )}
        >
          {children}
        </Card>
      </div>
    </div>
  )
);

ModalShell.displayName = "ModalShell";

export { ModalShell };
