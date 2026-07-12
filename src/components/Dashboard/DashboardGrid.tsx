import { useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import type { SortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { HelpCircle, X } from "lucide-react";

import { WidgetIcon, WidgetShell } from "@/components/Dashboard/WidgetShell";
import type { WidgetShellProps } from "@/components/Dashboard/WidgetShell";
import { SIZE_CLASSES } from "@/components/Dashboard/sizing";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDashboardStore } from "@/stores";
import type { DashboardWidget } from "@/types/dashboard";
import { WIDGET_REGISTRY, resolveWidgetSize } from "./widgets/registry";

/**
 * Live reordering in onDragOver makes the real grid reflow — the DOM itself is
 * the drop preview. Strategy transforms would displace tiles a second time on
 * top of the reordered DOM (and their rect math assumes uniform tiles), so
 * they're disabled; item motion comes from useSortable's derived FLIP
 * animation and the DragOverlay carries the pointer.
 */
const noSortingStrategy: SortingStrategy = () => null;

/**
 * Placeholder for widget types this build doesn't know (config written by a
 * newer build). Hidden in view mode, visible and removable in edit mode so
 * the entry is never silently dropped from the persisted layout.
 */
function UnknownWidget({
  widget,
  shellProps,
}: {
  widget: DashboardWidget;
  shellProps: Partial<WidgetShellProps>;
}) {
  const removeWidget = useDashboardStore((s) => s.removeWidget);

  return (
    <WidgetShell
      title="UNKNOWN WIDGET"
      icon={<WidgetIcon icon={HelpCircle} wrapClass="bg-muted" iconClass="text-foreground-muted" />}
      {...shellProps}
    >
      <p className="text-xs text-foreground-muted font-mono break-all">
        Type "{widget.widgetType}" is not supported by this build.
      </p>
      <Button
        variant="ghost"
        size="sm"
        className="mt-2 h-7 px-2 text-xs text-foreground-muted hover:text-destructive"
        onClick={() => removeWidget(widget.id)}
      >
        <X className="h-3 w-3 mr-1" />
        Remove
      </Button>
    </WidgetShell>
  );
}

/** Renders one widget with the shell chrome appropriate for the mode. */
function WidgetCell({
  widget,
  shellProps,
}: {
  widget: DashboardWidget;
  shellProps: Partial<WidgetShellProps>;
}) {
  const definition = WIDGET_REGISTRY[widget.widgetType];
  if (!definition) {
    return <UnknownWidget widget={widget} shellProps={shellProps} />;
  }

  const Component = definition.component;
  return (
    <Component
      widget={widget}
      size={resolveWidgetSize(widget, definition)}
      shellProps={shellProps}
    />
  );
}

/**
 * Presentational-only DragOverlay copy. Rendering the real widget here would
 * mount a second component while dragging and repeat its effects (polling,
 * contract queries, or the expensive validator-earnings scan).
 */
function WidgetDragPreview({ widget }: { widget: DashboardWidget }) {
  const definition = WIDGET_REGISTRY[widget.widgetType];
  const title = definition?.title ?? "UNKNOWN WIDGET";
  const icon = definition?.icon ?? HelpCircle;

  return (
    <div className={SIZE_CLASSES[resolveWidgetSize(widget, definition)]}>
      <WidgetShell
        title={title}
        icon={
          <WidgetIcon
            icon={icon}
            wrapClass={definition ? undefined : "bg-muted"}
            iconClass={definition ? undefined : "text-foreground-muted"}
          />
        }
        editing
        size={resolveWidgetSize(widget, definition)}
        allowedSizes={definition?.allowedSizes}
      >
        <p className="text-xs text-foreground-muted font-mono">Moving widget</p>
      </WidgetShell>
    </div>
  );
}

/** Sortable grid cell used in edit mode; injects edit chrome into the shell. */
function SortableWidgetCell({ widget }: { widget: DashboardWidget }) {
  const setWidgetSize = useDashboardStore((s) => s.setWidgetSize);
  const removeWidget = useDashboardStore((s) => s.removeWidget);

  const definition = WIDGET_REGISTRY[widget.widgetType];
  const size = resolveWidgetSize(widget, definition);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id });

  const shellProps: Partial<WidgetShellProps> = {
    editing: true,
    size,
    allowedSizes: definition?.allowedSizes,
    onSizeChange: (s) => setWidgetSize(widget.id, s),
    onRemove: () => removeWidget(widget.id),
    dragHandleProps: { ...attributes, ...listeners },
  };

  return (
    <div
      ref={setNodeRef}
      // Translate only — CSS.Transform would apply the scaleX/scaleY that the
      // derived FLIP delta carries between different-span tiles.
      style={{ transform: CSS.Translate.toString(transform), transition }}
      // Stay mounted while dragging: the cell keeps its grid slot (and its
      // droppable rect); the DragOverlay is the only visible mover.
      className={cn(SIZE_CLASSES[size], isDragging && "opacity-0")}
    >
      <WidgetCell widget={widget} shellProps={shellProps} />
    </div>
  );
}

export default function DashboardGrid() {
  const widgets = useDashboardStore((s) => s.layout.widgets);
  const editMode = useDashboardStore((s) => s.editMode);
  const reorderWidgets = useDashboardStore((s) => s.reorderWidgets);
  const commitLayout = useDashboardStore((s) => s.commitLayout);
  const restoreWidgetOrder = useDashboardStore((s) => s.restoreWidgetOrder);

  const [activeId, setActiveId] = useState<string | null>(null);
  const preDragOrderRef = useRef<DashboardWidget[] | null>(null);
  const lastOverRef = useRef<{ overId: string | null; x: number; y: number }>({
    overId: null,
    x: NaN,
    y: NaN,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = ({ active }: DragStartEvent) => {
    preDragOrderRef.current = useDashboardStore.getState().layout.widgets;
    lastOverRef.current = { overId: null, x: NaN, y: NaN };
    setActiveId(String(active.id));
  };

  const handleDragOver = ({ active, over, delta }: DragOverEvent) => {
    if (!over) return;
    const overId = String(over.id);

    if (overId === String(active.id)) {
      // Pointer settled on the active widget's own cell: the last reorder
      // landed under the pointer. Re-arm so dragging back over the same
      // neighbor counts as a genuine new crossing.
      lastOverRef.current.overId = null;
      return;
    }

    // Anti-oscillation: with MeasuringStrategy.Always, a reorder reflows the
    // grid and can flip `over` without any pointer motion, ping-ponging two
    // tiles forever. Only reorder on a new over-target AND actual pointer
    // movement since the last processed reorder.
    const last = lastOverRef.current;
    const pointerMoved = delta.x !== last.x || delta.y !== last.y;
    if (overId === last.overId || !pointerMoved) return;

    lastOverRef.current = { overId, x: delta.x, y: delta.y };
    reorderWidgets(String(active.id), overId);
  };

  const handleDragEnd = () => {
    // Order was already applied live in onDragOver — the preview the user saw
    // is exactly what persists. No final reorder from event.over.
    preDragOrderRef.current = null;
    setActiveId(null);
    commitLayout();
  };

  const handleDragCancel = () => {
    // Escape means "never mind": restore the snapshot (never persisted).
    if (preDragOrderRef.current) restoreWidgetOrder(preDragOrderRef.current);
    preDragOrderRef.current = null;
    setActiveId(null);
  };

  const gridClass = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4";

  if (!editMode) {
    return (
      <div className={cn(gridClass, "stagger-children")}>
        {widgets.map((widget) => {
          const definition = WIDGET_REGISTRY[widget.widgetType];
          if (!definition) return null;
          return (
            <div
              key={widget.id}
              className={SIZE_CLASSES[resolveWidgetSize(widget, definition)]}
            >
              <WidgetCell widget={widget} shellProps={{}} />
            </div>
          );
        })}
      </div>
    );
  }

  const activeWidget = activeId
    ? widgets.find((w) => w.id === activeId) ?? null
    : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext
        items={widgets.map((w) => w.id)}
        strategy={noSortingStrategy}
      >
        <div className={gridClass}>
          {widgets.map((widget) => (
            <SortableWidgetCell key={widget.id} widget={widget} />
          ))}
        </div>
      </SortableContext>
      <DragOverlay className="cursor-grabbing">
        {activeWidget ? <WidgetDragPreview widget={activeWidget} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
