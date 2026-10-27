import type { ConsensusParams } from "@/types";

/** Round a duration to the unit a reader would use: "19 seconds", "10 minutes", "17 hours". */
export function approxDuration(secs: number): string {
  const unit = (value: number, name: string) => `${value} ${name}${value === 1 ? "" : "s"}`;

  if (secs < 90) return unit(Math.round(secs), "second");
  if (secs < 90 * 60) return unit(Math.round(secs / 60), "minute");
  return unit(Math.round(secs / 3600), "hour");
}

/** "100 leaves (about 17 hours)" */
export function leavesWithDuration(leaves: number, params: ConsensusParams): string {
  const label = leaves === 1 ? "leaf" : "leaves";
  return `${leaves} ${label} (about ${approxDuration(leaves * params.leafIntervalSecs)})`;
}

/** Target seconds between stems. */
export function stemIntervalSecs(params: ConsensusParams): number {
  return params.leafIntervalSecs / params.stemsPerLeaf;
}
