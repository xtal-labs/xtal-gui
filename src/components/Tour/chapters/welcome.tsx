import type { TourChapter } from "../types";

export const welcomeChapter: TourChapter = {
  id: "welcome",
  title: "Welcome",
  steps: [
    {
      id: "welcome",
      title: "A quick tour of your node",
      body: () => (
        <>
          <p>
            Four short chapters cover the parts of Crystal you will use most: your wallet, mining,
            validating and contracts.
          </p>
          <p>
            The tour explains each section and switches to the view it describes. It never sends
            funds or starts mining for you. You can use the highlighted controls yourself, or
            follow along without making a transaction.
          </p>
          <p>
            Drag the card by its header to move it out of the way. The curved-arrow button restores
            automatic placement. When you open a dialog or popup, the card and highlight hide
            until you close it. Use the X to leave at any time.
          </p>
          <p>
            To replay a chapter later, use the ? beside its page title, or Help ▸ Start Walkthrough
            for the whole tour.
          </p>
        </>
      ),
    },
  ],
};
