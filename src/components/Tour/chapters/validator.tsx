import { formatXtalExact } from "@/lib/utils";

import { leavesWithDuration } from "../format";
import type { TourChapter } from "../types";

const NOT_LOADED_NOTE = "Load a validator wallet to see this on the page.";

export const validatorChapter: TourChapter = {
  id: "validator",
  title: "Validator",
  tab: "validator",
  steps: [
    {
      id: "create",
      target: "validator-wallet-cta",
      fallbackTarget: "validator-stake",
      missingNote: "Your validator wallet is already loaded, so the card for this step is hidden.",
      title: "A wallet just for validating",
      done: ({ validator }) => validator.loaded,
      body: () => (
        <>
          <p>
            Validating uses its own UTXO wallet, kept separate from your everyday one. Create one
            here, or import one you already have.
          </p>
          <p>Back up its recovery phrase as carefully as your main wallet's.</p>
        </>
      ),
    },
    {
      id: "fund",
      target: "validator-stake",
      fallbackTarget: "validator-wallet-cta",
      missingNote: NOT_LOADED_NOTE,
      title: "Fund it",
      done: ({ validator }) => validator.funded || validator.staked,
      body: () => (
        <p>
          A new validator wallet is empty. Send XTAL to its address from your main wallet. Once
          confirmed, it appears here as available balance, ready to stake.
        </p>
      ),
    },
    {
      id: "stake",
      target: "validator-stake",
      fallbackTarget: "validator-wallet-cta",
      missingNote: NOT_LOADED_NOTE,
      title: "Stake to take part",
      done: ({ validator }) => validator.staked,
      body: ({ params }) => (
        <>
          <p>
            Staking locks XTAL so that it counts as your weight in consensus. Each stake must be at
            least {formatXtalExact(params.minStakeOutput)} XTAL.
          </p>
          <p>
            New stake is locked for at least{" "}
            {leavesWithDuration(params.minStakeLockLeaves, params)} and shows as pending. It then
            becomes active at the next epoch boundary; an epoch is {params.leavesPerEpoch} leaves.
          </p>
          <p>
            Choose Stake, enter the amount and review the details before signing. Submitting a
            stake does not make it active immediately; watch the pending and active amounts here.
          </p>
        </>
      ),
    },
    {
      id: "fruits",
      target: "validator-fruits",
      fallbackTarget: "validator-requirements",
      missingNote:
        "Load a validator wallet to switch fruit types on. Their minimum stakes are listed on this page.",
      title: "Choose which fruits to produce",
      done: ({ validator }) => validator.producing,
      body: () => (
        <>
          <p>
            Each fruit type is a transaction shard with its own minimum stake, shown on its card.
            Switch on any you qualify for and your validator starts producing them.
          </p>
          <p>
            Stake is counted in whole XTAL, so a fraction of a coin does not help you reach a
            minimum.
          </p>
          <p>
            Fruits carry transactions and reference stems. Those references are what earn stems
            their mining credit.
          </p>
        </>
      ),
    },
    {
      id: "unstake",
      target: "validator-stake",
      fallbackTarget: "validator-wallet-cta",
      missingNote: NOT_LOADED_NOTE,
      title: "Unstaking",
      body: ({ params }) => (
        <>
          <p>
            Unstake takes XTAL back out of your stake. Only stake that has passed its initial lock
            can be withdrawn.
          </p>
          <p>
            The unstaked coins are then locked for a further{" "}
            {leavesWithDuration(params.unstakeLockLeaves, params)} before you can spend them.
          </p>
          <p>
            Choose Unstake and review the amount before signing. This releases validator stake
            back to UTXO funds; it is a different operation from withdrawing VM funds through CAGE.
          </p>
        </>
      ),
    },
    {
      id: "rewards",
      target: "validator-stake",
      fallbackTarget: "validator-wallet-cta",
      missingNote: NOT_LOADED_NOTE,
      title: "Fruit rewards",
      body: () => (
        <>
          <p>
            Rewards for the fruits you produce are added straight to your stake. There is nothing
            to claim.
          </p>
          <p>
            They are subject to the same staking delay as manually created staking transactions, so
            they show as pending first and then start counting on their own.
          </p>
        </>
      ),
    },
  ],
};
