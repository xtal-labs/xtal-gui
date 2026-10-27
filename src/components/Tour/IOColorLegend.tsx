import { cn } from "@/lib/utils";
import { ownershipBorderClass, type IOFlow } from "@/lib/txOwnership";

interface LegendRow {
  label: string;
  isMine: boolean;
  flow: IOFlow;
  pending: boolean;
}

const INPUT_ROWS: LegendRow[] = [
  { label: "Yours, being spent", isMine: true, flow: "input", pending: false },
  { label: "Someone else's", isMine: false, flow: "input", pending: false },
];

const OUTPUT_ROWS: LegendRow[] = [
  { label: "To you, confirmed", isMine: true, flow: "output", pending: false },
  { label: "To you, still pending", isMine: true, flow: "output", pending: true },
  { label: "To someone else", isMine: false, flow: "output", pending: false },
];

function LegendGroup({ title, rows }: { title: string; rows: LegendRow[] }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-heading tracking-wide text-foreground-muted">{title}</p>
      {rows.map((row) => (
        <div
          key={row.label}
          className={cn(
            "px-3 py-1.5 text-xs text-foreground",
            "chamfered-sm bg-background/50 border-l-2",
            ownershipBorderClass(row)
          )}
        >
          {row.label}
        </div>
      ))}
    </div>
  );
}

/**
 * Key to the left-edge colours on a transaction's input and output rows. Drawn
 * from {@link ownershipBorderClass} so it cannot drift from the real rows, and
 * deliberately carries no addresses or amounts: it is a key, not sample data.
 */
export function IOColorLegend() {
  return (
    <div className="grid grid-cols-2 gap-3" aria-label="Example: input and output row colours">
      <LegendGroup title="INPUTS" rows={INPUT_ROWS} />
      <LegendGroup title="OUTPUTS" rows={OUTPUT_ROWS} />
    </div>
  );
}
