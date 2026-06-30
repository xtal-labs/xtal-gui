export type IOFlow = "input" | "output";

/**
 * Left-border color for a transaction input/output row, signalling wallet
 * ownership and direction:
 * - owned input (coins being spent)        → red    (border-l-destructive)
 * - owned output, tx still pending          → yellow (border-l-amber-400, ripe-banana gold)
 * - owned output, tx confirmed              → green  (border-l-success)
 * - not owned                               → grey   (border-l-border)
 */
export function ownershipBorderClass(opts: {
  isMine?: boolean;
  flow: IOFlow;
  pending: boolean;
}): string {
  if (!opts.isMine) return "border-l-border";
  if (opts.flow === "input") return "border-l-destructive"; // spent — red
  return opts.pending ? "border-l-amber-400" : "border-l-success"; // pending receive — banana gold / received — green
}
