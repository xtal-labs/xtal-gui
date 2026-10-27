import type { ReactNode } from "react";

import type { Tab } from "@/stores/uiStore";
import type { ConsensusParams } from "@/types";

export type TourChapterId = "welcome" | "wallet" | "mining" | "validator" | "gateway";

/** Values a step may quote or react to, read when the card renders. */
export interface TourContext {
  params: ConsensusParams;
  /** Where the user's own validator stands, so lifecycle steps can mark themselves done. */
  validator: {
    loaded: boolean;
    funded: boolean;
    staked: boolean;
    producing: boolean;
  };
}

export interface TourStep {
  id: string;
  /** Wallet view needed for this explanation. Never opens or submits a transaction. */
  walletView?: "utxo" | "vm";
  /** `data-tour` anchor to spotlight. Omit for a centred card. */
  target?: string;
  /**
   * Anchor to spotlight when `target` is not on screen because the page is in
   * another state (no wallet loaded, a contract open). `missingNote` then says why.
   */
  fallbackTarget?: string;
  /** Shown when `target` is not on screen. */
  missingNote?: string;
  title: string;
  body: (ctx: TourContext) => ReactNode;
  /** The user has already done what this step describes. */
  done?: (ctx: TourContext) => boolean;
}

export interface TourChapter {
  id: TourChapterId;
  /** Short label shown above each step's title. */
  title: string;
  /** Page the chapter runs on. Omit to stay on the current page. */
  tab?: Tab;
  steps: TourStep[];
}
