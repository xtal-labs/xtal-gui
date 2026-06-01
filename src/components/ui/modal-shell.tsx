import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Card } from "./card";
import { cn } from "@/lib/utils";

interface ModalShellProps extends React.HTMLAttributes<HTMLDivElement> {
  cardClassName?: string;
  onClose?: () => void;
  title?: string;
}

const ModalShell = React.forwardRef<HTMLDivElement, ModalShellProps>(
  ({ className, cardClassName, children, onClose, title = "Modal", ...props }, ref) => (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose?.();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-black/50 text-foreground",
            className
          )}
          {...props}
        />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 overflow-y-auto overscroll-contain text-foreground"
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <div className="flex min-h-full w-full items-center justify-center p-3 sm:p-4">
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
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
);

ModalShell.displayName = "ModalShell";

export { ModalShell };
