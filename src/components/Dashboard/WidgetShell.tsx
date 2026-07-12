import type { HTMLAttributes, ReactNode } from "react";
import { GripVertical, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { WidgetSize } from "@/types/dashboard";
import { WIDGET_SIZES } from "@/types/dashboard";

const SIZE_LABELS: Record<WidgetSize, string> = {
  s: "Small",
  m: "Medium",
  l: "Large",
  xl: "Extra large",
};

/** Standard hex-badge icon used in widget headers. */
export function WidgetIcon({
  icon: Icon,
  wrapClass = "bg-primary/20",
  iconClass = "text-primary",
}: {
  icon: LucideIcon;
  wrapClass?: string;
  iconClass?: string;
}) {
  return (
    <div className={cn("icon-hex icon-hex-sm", wrapClass)}>
      <Icon className={cn("h-3.5 w-3.5", iconClass)} />
    </div>
  );
}

export interface WidgetShellProps {
  title: string;
  /** Fully rendered icon slot (typically a <WidgetIcon/>). */
  icon?: ReactNode;
  /** Extra header content (badges etc.), rendered before the icon. */
  headerRight?: ReactNode;
  children: ReactNode;

  // Edit-mode chrome, injected by DashboardGrid — widgets never set these.
  editing?: boolean;
  size?: WidgetSize;
  allowedSizes?: WidgetSize[];
  onSizeChange?: (size: WidgetSize) => void;
  onRemove?: () => void;
  dragHandleProps?: HTMLAttributes<HTMLElement>;
}

/**
 * Shared card chrome for dashboard widgets: crystalline Card, compact heading
 * row with an icon slot, and (in edit mode) drag/size/remove controls.
 */
export function WidgetShell({
  title,
  icon,
  headerRight,
  children,
  editing = false,
  size = "s",
  allowedSizes = WIDGET_SIZES,
  onSizeChange,
  onRemove,
  dragHandleProps,
}: WidgetShellProps) {
  return (
    <Card
      variant="crystalline"
      className={cn("h-full", editing && "ring-1 ring-primary/40")}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        {/* The whole grip+title cluster is the drag activator (bigger target
            than the grip alone); size/remove/icon stay outside it so their
            clicks can't start a drag. */}
        <div
          className={cn(
            "flex items-center gap-1.5 min-w-0",
            editing && "cursor-grab touch-none select-none"
          )}
          aria-label={editing ? `Move ${title} widget` : undefined}
          {...(editing ? dragHandleProps : undefined)}
        >
          {editing && (
            <span className="text-foreground-muted -ml-1" aria-hidden="true">
              <GripVertical className="h-4 w-4" />
            </span>
          )}
          <CardTitle className="text-sm font-heading font-medium tracking-wide text-foreground-secondary truncate">
            {title}
          </CardTitle>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {headerRight}
          {icon}
          {editing && (
            <>
              {/* modal={false}: modal menus take Radix's shared body
                  pointer-events lock; with one menu per widget, overlapping
                  open/close cycles can leave <body> stuck at
                  pointer-events: none (radix-ui/primitives#1241). */}
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 font-mono text-xs uppercase"
                  >
                    {size}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuRadioGroup
                    value={size}
                    onValueChange={(value) => onSizeChange?.(value as WidgetSize)}
                  >
                    {allowedSizes.map((s) => (
                      <DropdownMenuRadioItem key={s} value={s}>
                        {SIZE_LABELS[s]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-foreground-muted hover:text-destructive"
                aria-label={`Remove ${title} widget`}
                onClick={onRemove}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
