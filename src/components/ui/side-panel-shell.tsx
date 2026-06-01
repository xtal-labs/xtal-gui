import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

interface SidePanelShellProps extends React.HTMLAttributes<HTMLDivElement> {
  open: boolean;
  onClose: () => void;
  overlayClassName?: string;
  title?: string;
}

const SidePanelShell = React.forwardRef<HTMLDivElement, SidePanelShellProps>(
  (
    {
      open,
      onClose,
      overlayClassName,
      className,
      children,
      title = "Detail panel",
      ...props
    },
    ref
  ) => (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-40 bg-black/40 backdrop-blur-sm",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
            "duration-300",
            overlayClassName
          )}
        />
        <DialogPrimitive.Content
          ref={ref}
          className={cn(
            "fixed top-0 right-0 z-50 h-full",
            "w-full sm:w-[420px] lg:w-[480px]",
            "border-l border-border bg-background text-foreground",
            "flex flex-col",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-right",
            "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right",
            "data-[state=closed]:pointer-events-none",
            "duration-300",
            className
          )}
          {...props}
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
);

SidePanelShell.displayName = "SidePanelShell";

export { SidePanelShell };
