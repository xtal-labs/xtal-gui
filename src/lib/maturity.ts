import type { MaturityStatus } from "@/types";

export interface MaturityDisplay {
  label: string;
  detail: string;
  tone: "warning" | "muted";
}

export function getMaturityDisplay(status?: MaturityStatus): MaturityDisplay | null {
  if (!status) return null;

  const leaves = status.blocksUntilMature.toLocaleString();
  const leafLabel = status.blocksUntilMature === 1 ? "leaf" : "leaves";

  if (status.phase === "awaiting_epoch") {
    return {
      label: "Awaiting epoch",
      detail:
        status.blocksUntilMature > 0
          ? `Eligible for recognition after the next epoch refresh in ${leaves} ${leafLabel}.`
          : "Eligible for recognition at the next epoch refresh.",
      tone: "warning",
    };
  }

  if (status.isImmature) {
    const isStakeActivation = status.kind === "stake_activation";
    return {
      label: `Immature (${leaves})`,
      detail: isStakeActivation
        ? `Stake becomes eligible in ${leaves} ${leafLabel}.`
        : `Spendable in ${leaves} ${leafLabel}.`,
      tone: "warning",
    };
  }

  return null;
}
