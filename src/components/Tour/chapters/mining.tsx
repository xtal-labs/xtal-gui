import { approxDuration, leavesWithDuration, stemIntervalSecs } from "../format";
import type { TourChapter } from "../types";

export const miningChapter: TourChapter = {
  id: "mining",
  title: "Mining",
  tab: "mining",
  steps: [
    {
      id: "blocks",
      target: "mining-found",
      title: "Two kinds of block",
      body: ({ params }) => (
        <>
          <p>
            Your miner works on both. A <strong>leaf</strong> arrives about every{" "}
            {approxDuration(params.leafIntervalSecs)} and finalises the chain's state.{" "}
            <strong>Stems</strong> arrive about every {approxDuration(stemIntervalSecs(params))} in
            between and execute the transactions that fruits carry.
          </p>
          <p>
            A stale block is one that lost the race to another miner's. It is not part of the chain
            and pays nothing.
          </p>
        </>
      ),
    },
    {
      // No anchor: the split is a rule of the chain, not something on this page.
      id: "coinbase",
      title: "How the reward is split",
      body: ({ params }) => (
        <>
          <p>Each leaf releases one block subsidy, paid out in its coinbase:</p>
          <ul className="list-disc space-y-1 pl-4">
            <li>
              <strong>Leaf:</strong> {params.leafMinerPct}% to its miner, plus the fees of
              transactions included directly in the leaf.
            </li>
            <li>
              <strong>Stems:</strong> {params.stemPoolPct}% is pooled for stems which prefixed to the prior leaf.
            </li>
            <li>
              <strong>Fruits:</strong> when stems carry fruits, {params.fruitFromStemPct}%
              of the stem pool goes to the validators who produced them.
            </li>
          </ul>
          <p>
            Contract fees are pooled as well: {params.minerFeePct}% to the credited stems and the
            rest to fruit producers.
          </p>
        </>
      ),
    },
    {
      id: "threads",
      target: "mining-threads",
      title: "Thread count",
      body: () => (
        <>
          <p>
            Each thread is one CPU core hashing. More threads give a higher hash rate and a better
            chance at each block, at the cost of heat and of whatever else the machine is doing.
          </p>
          <p>Stop mining to change the count.</p>
        </>
      ),
    },
    {
      id: "wallet",
      target: "mining-wallet",
      title: "Where rewards go",
      body: ({ params }) => (
        <>
          <p>
            Rewards are paid to the wallet shown here. If a wallet is already open it is used
            automatically; otherwise choose one. The choice is locked while mining runs.
          </p>
          <p>
            Rewards land in that wallet's UTXO balance as Immature and become spendable after{" "}
            {leavesWithDuration(params.coinbaseMaturityLeaves, params)}.
          </p>
        </>
      ),
    },
    {
      id: "start-stop",
      target: "mining-toggle",
      title: "Start, monitor and stop",
      body: () => (
        <>
          <p>
            Load a wallet and choose your thread count, then use <strong>Start Mining</strong>
            when you want to begin. The tour never starts it automatically.
          </p>
          <p>
            Watch the hash-rate chart and blocks found to see your progress. A higher hash rate
            improves your chances but does not guarantee when you will find a block.
          </p>
          <p>
            <strong>Stop Mining</strong> stops the hashing work. Stop first to change threads or
            the reward wallet, then start again when ready.
          </p>
        </>
      ),
    },
    {
      id: "history",
      target: "mining-blocks",
      title: "What you have found",
      body: () => (
        <p>
          Every stem and leaf this node mines is listed here. A stem shows how many fruits it
          carried; a leaf shows how many transactions it included.
        </p>
      ),
    },
  ],
};
