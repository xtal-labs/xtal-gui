import type { TourChapter, TourChapterId } from "../types";
import { gatewayChapter } from "./gateway";
import { miningChapter } from "./mining";
import { validatorChapter } from "./validator";
import { walletChapter } from "./wallet";
import { welcomeChapter } from "./welcome";

export const TOUR_CHAPTERS: Record<TourChapterId, TourChapter> = {
  welcome: welcomeChapter,
  wallet: walletChapter,
  mining: miningChapter,
  validator: validatorChapter,
  gateway: gatewayChapter,
};

/** The whole walkthrough, in the order it is offered after setup. */
export const FULL_TOUR: TourChapterId[] = ["welcome", "wallet", "mining", "validator", "gateway"];
