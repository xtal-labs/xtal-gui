import { IOColorLegend } from "../IOColorLegend";
import { approxDuration, leavesWithDuration } from "../format";
import type { TourChapter } from "../types";

const NO_WALLET_NOTE = "Load or create a wallet to see this on the page.";

export const walletChapter: TourChapter = {
  id: "wallet",
  title: "Wallet",
  tab: "wallet",
  steps: [
    {
      id: "layers",
      target: "wallet-subtabs",
      fallbackTarget: "wallet-empty",
      missingNote: NO_WALLET_NOTE,
      title: "One wallet, two kinds of balance",
      body: () => (
        <>
          <p>
            XTAL is held in two forms. <strong>UTXO</strong> is coin-style money: separate outputs
            that you send, receive and mine into. <strong>VM</strong> is an account balance that
            pays gas and is what contracts work with.
          </p>
          <p>TOTAL, at the top of the page, is the two added together.</p>
        </>
      ),
    },
    {
      id: "balances",
      target: "wallet-balance",
      fallbackTarget: "wallet-empty",
      missingNote: NO_WALLET_NOTE,
      title: "What you can spend",
      body: () => (
        <>
          <p>
            <strong>Available</strong> is confirmed and spendable now.
          </p>
          <p>
            Two more figures appear beneath it when they are not zero. <strong>Pending</strong> is
            on its way but not yet confirmed. <strong>Immature</strong> has arrived but is still
            inside its maturity window, which the last step of this chapter explains.
          </p>
          <p>
            The address list shows what each address holds. Select one to send from it alone,
            with change returned to it, and to see only its transactions.
          </p>
        </>
      ),
    },
    {
      id: "bridge",
      target: "wallet-actions",
      fallbackTarget: "wallet-empty",
      missingNote: NO_WALLET_NOTE,
      title: "Moving between UTXO and VM",
      body: ({ params }) => (
        <>
          <p>
            <strong>Deposit</strong> hands UTXO coins to CAGE, the system bridge contract, which
            credits your VM account. <strong>Withdraw</strong>, on the VM tab, goes the other way
            and pays you a new UTXO output.
          </p>
          <p>
            A withdrawn output matures like a mining reward: it cannot be spent for{" "}
            {leavesWithDuration(params.coinbaseMaturityLeaves, params)}.
          </p>
        </>
      ),
    },
    {
      id: "whole-utxos",
      target: "wallet-actions",
      fallbackTarget: "wallet-empty",
      missingNote: NO_WALLET_NOTE,
      title: "A deposit consumes a whole UTXO",
      body: () => (
        <>
          <p>
            A UTXO is one unspent transaction output, identified by its transaction ID and output
            index. Consuming it spends the <strong>entire output</strong>; you cannot consume
            only part of it.
          </p>
          <p>
            Deposit offers <strong>Enter amount</strong> and <strong>Select UTXO</strong>.
            Enter amount prepares an output for your exact VM credit plus the bridge fee,
            returning the remainder as change. Select UTXO consumes the entire chosen output.
          </p>
          <p>
            A normal UTXO send also spends whole inputs, but creates new outputs for the recipient
            and any change. The original inputs are gone; change is a new UTXO.
          </p>
        </>
      ),
    },
    {
      id: "prepare-deposit",
      target: "wallet-actions",
      fallbackTarget: "wallet-empty",
      missingNote: NO_WALLET_NOTE,
      title: "Prepare the amount you want to deposit",
      body: () => (
        <>
          <p>
            Choose <strong>Enter amount</strong>, enter the XTAL you want to receive in the VM,
            and choose an account in this wallet. Coin selection and any preparation send happen
            automatically. The review shows the preparation fee and bridge fee.
          </p>
          <p>
            Spendable mining rewards and VM withdrawal outputs can fund preparation. Locked
            and staked coins remain unavailable. If a matching standard output already exists
            at the destination, preparation is skipped.
          </p>
          <p>
            You can follow these explanations without sending anything. Next only advances the tour.
          </p>
        </>
      ),
    },
    {
      id: "select-deposit",
      target: "wallet-actions",
      fallbackTarget: "wallet-empty",
      missingNote: NO_WALLET_NOTE,
      title: "Deposit: select an eligible output",
      body: () => (
        <>
          <p>
            On the UTXO tab, choose <strong>Deposit</strong>, then <strong>Select UTXO</strong>.
            The dialog lists outputs with their amounts and transaction IDs. Disabled rows
            explain why they cannot be deposited.
          </p>
          <p>
            Select the output you want to consume and choose <strong>Review deposit</strong>.
            Its owner’s VM account receives the output value less the bridge fee. The list
            refreshes automatically.
          </p>
          <p>
            The tour and highlight hide while the dialog is open. Close it to return to this step.
          </p>
        </>
      ),
    },
    {
      id: "confirm-deposit",
      target: "wallet-actions",
      fallbackTarget: "wallet-empty",
      missingNote: NO_WALLET_NOTE,
      title: "Deposit: review, sign and wait",
      body: () => (
        <>
          <p>
            Review the VM credit, destination, bridge fee and any preparation fee. Enter your
            wallet password and choose <strong>Confirm deposit</strong>. Back lets you change
            the amount or selected output.
          </p>
          <p>
            This deposit uses sponsored gas, so you do not need an existing VM gas balance. CAGE
            credits the VM account belonging to the selected output's owner.
          </p>
          <p>
            Progress is saved in the wallet, and both transaction IDs appear in the dialog.
            Keep the node running and this wallet loaded to continue automatically. If the
            wallet locks before the deposit can be signed, unlock it from Deposit progress.
            Wait for confirmation before relying on the VM balance.
          </p>
        </>
      ),
    },
    {
      id: "check-deposit",
      walletView: "vm",
      target: "wallet-vm-balance",
      fallbackTarget: "wallet-empty",
      missingNote: NO_WALLET_NOTE,
      title: "Check your VM balance",
      body: () => (
        <>
          <p>
            The VM tab shows your account balance and VM transaction history. After a successful
            deposit executes, the consumed UTXO is gone and its value is held in the VM account.
          </p>
          <p>
            VM Send transfers account funds; contract calls use account funds for gas. These do
            not create spendable UTXOs. Use <strong>Withdraw</strong> to move value back to the UTXO side.
          </p>
          <p>
            The VM accounts list shows each account’s balance. Select one to send, withdraw
            and call contracts from it alone and to see only its history; <strong>All
            accounts</strong> lets the wallet draw on every account.
          </p>
        </>
      ),
    },
    {
      id: "withdraw-form",
      walletView: "vm",
      target: "wallet-vm-actions",
      fallbackTarget: "wallet-empty",
      missingNote: NO_WALLET_NOTE,
      title: "Withdraw: choose a destination and amount",
      body: () => (
        <>
          <p>
            Choose <strong>Withdraw</strong> on the VM tab. Enter a UTXO receive address, or use
            My address to send back to your own wallet. A VM address is not a valid withdrawal
            destination.
          </p>
          <p>
            A withdrawal lets you enter an amount. Max uses the current
            withdrawable balance while reserving gas. Choose Continue to prepare a review;
            this step does not broadcast anything.
          </p>
        </>
      ),
    },
    {
      id: "withdraw-review",
      walletView: "vm",
      target: "wallet-vm-actions",
      fallbackTarget: "wallet-empty",
      missingNote: NO_WALLET_NOTE,
      title: "Withdraw: review fees and sign",
      body: () => (
        <>
          <p>
            Review the destination, requested amount, CAGE bridge fee, net amount received and
            maximum gas cost. The withdrawal needs VM funds for gas; unused gas is refunded.
          </p>
          <p>
            If funds span several VM accounts and none is selected, the review can show several
            transactions. Each reserves its own gas. Check the combined cost before entering your wallet password
            and choosing <strong>Withdraw</strong> to sign and submit.
          </p>
          <p>
            Back lets you edit the request. Closing the dialog leaves this tour step available
            so you can continue at your own pace.
          </p>
        </>
      ),
    },
    {
      id: "withdraw-result",
      target: "wallet-transactions",
      fallbackTarget: "wallet-empty",
      missingNote: NO_WALLET_NOTE,
      title: "Withdraw: confirmation comes before spending",
      body: ({ params }) => (
        <>
          <p>
            Save the submitted transaction IDs and check their status in VM history. Once the
            withdrawal executes, it creates a new UTXO for the recipient. A withdrawal to another
            wallet appears in that wallet's UTXO balance.
          </p>
          <p>
            Your new output stays <strong>Immature</strong> for{" "}
            {leavesWithDuration(params.coinbaseMaturityLeaves, params)} before it becomes spendable.
            Broadcasting successfully does not skip confirmation or this maturity window.
          </p>
          <p>
            If only part of a multi-transaction withdrawal submits, check the listed transaction
            IDs first. Start a new withdrawal only for the remainder; repeating the original
            full amount could withdraw twice.
          </p>
        </>
      ),
    },
    {
      id: "io-colours",
      target: "wallet-transactions",
      fallbackTarget: "wallet-empty",
      missingNote: NO_WALLET_NOTE,
      title: "Reading a transaction",
      body: () => (
        <>
          <p>
            Select any transaction to see its inputs and outputs. The coloured edge on each row
            shows whose coins they are:
          </p>
          <IOColorLegend />
        </>
      ),
    },
    {
      id: "maturity",
      target: "wallet-transactions",
      fallbackTarget: "wallet-empty",
      missingNote: NO_WALLET_NOTE,
      title: "The maturity window",
      body: ({ params }) => (
        <>
          <p>
            Mining rewards and VM withdrawals are locked for{" "}
            {leavesWithDuration(params.coinbaseMaturityLeaves, params)} after they land. Until then
            the amount sits under Immature, and the transaction shows a countdown such as{" "}
            <span className="text-warning">Immature (42)</span>.
          </p>
          <p>
            The countdown is in leaves, not stems, so it drops by one about every{" "}
            {approxDuration(params.leafIntervalSecs)}.
          </p>
        </>
      ),
    },
  ],
};
