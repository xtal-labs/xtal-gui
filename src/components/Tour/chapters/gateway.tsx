import type { TourChapter } from "../types";

const CONTRACT_OPEN_NOTE = "Return to the contract library to see this on the page.";

export const gatewayChapter: TourChapter = {
  id: "gateway",
  title: "Contracts",
  tab: "gateway",
  steps: [
    {
      id: "vm",
      title: "The VM and CAGE",
      body: () => (
        <>
          <p>
            Contracts run in Crystal's VM, and their gas is paid from your VM balance. Fruits carry
            contract calls; stems execute them.
          </p>
          <p>
            <strong>CAGE</strong> is the system contract that connects the VM to your UTXO coins. A
            deposit hands it a UTXO and it credits your VM account. A withdrawal debits the account
            and pays out a new UTXO. Deposits through the wallet use sponsored gas. Withdrawals
            pay gas and a CAGE bridge fee; review the current amounts before signing.
          </p>
          <p>
            CAGE was deployed at genesis and lives on the Apple shard. Its fees and treasury are
            governed by a group of three signers, any two of whom must agree.
          </p>
        </>
      ),
    },
    {
      id: "library",
      target: "gateway-library",
      missingNote: CONTRACT_OPEN_NOTE,
      title: "Your contract library",
      body: () => (
        <>
          <p>
            Contracts you have deployed or imported are kept here. Open one to read its state and
            call its methods.
          </p>
          <p>
            A contract lives on one fruit shard, chosen when it is deployed, and stays there for
            good.
          </p>
        </>
      ),
    },
    {
      id: "load",
      target: "gateway-load",
      missingNote: CONTRACT_OPEN_NOTE,
      title: "Loading a contract",
      body: () => (
        <>
          <p>
            Paste a contract's address and choose Load. Crystal needs the contract's ABI, the
            description of its methods, and looks for it in your local cache, then on chain, then on
            IPFS.
          </p>
          <p>If none turns up, Import ABI lets you supply the file yourself.</p>
        </>
      ),
    },
    {
      id: "deploy",
      target: "gateway-actions",
      missingNote: CONTRACT_OPEN_NOTE,
      title: "Deploying a contract",
      body: () => (
        <p>
          Deploy publishes a compiled <code>.wasm</code> contract to the fruit shard you pick. Its{" "}
          <code>.abi.json</code> is optional, but attach it so the contract can be called by method
          name.
        </p>
      ),
    },
    {
      id: "sponsor",
      title: "Sponsoring a contract",
      body: () => (
        <>
          <p>
            A validator can point stake at a specific contract. That stake still counts in full
            toward fruit eligibility. Once the stake on one contract reaches the minimum for that
            contract's fruit type, the validator may produce fruits carrying gas-free calls to it.
          </p>
          <p>
            It is a threshold, not a sliding scale: stake beyond the minimum buys nothing more.
          </p>
          <p>
            Sponsoring is an expert control. Turn on Advanced mode in Settings, then stake from the
            Validator page.
          </p>
        </>
      ),
    },
  ],
};
