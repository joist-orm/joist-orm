import { AdvanceStatus, BookAdvanceCodegen, bookAdvanceConfig as config } from "./entities";

export class BookAdvance extends BookAdvanceCodegen {
  transientFields = {
    /** The `to` state of each transition our `onTransition` handled, so tests can assert exactly which fired. */
    transitions: [] as AdvanceStatus[],
    /** The transition the Signed reaction handled, and the state the advance was in when it ran. */
    signedTransition: undefined as { from: AdvanceStatus | undefined; to: AdvanceStatus; current: AdvanceStatus } | undefined,
    /** Makes the Signed reaction immediately pay the advance, to test chained changes within one flush. */
    payWhenSigned: false,
    /** The book title the Signed reaction saw, to test that `onTransition` loads its hint. */
    signedTitle: undefined as string | undefined,
    /** How many times the commit-phase reaction ran. */
    committedPaid: 0,
  };
}

// Tables and matches take the enum's accessors as plain strings
config.transitions("status", {
  Pending: ["Signed"],
  Signed: ["Paid", "Pending"],
  Paid: [],
});

config.guardTransition("status", { to: "Paid" }, "book", (ba) => {
  if (ba.book.get.title === "Unpublished") {
    return "Cannot pay an advance for an unpublished book";
  }
});

config.onTransition("status", {}, (ba, _ctx, transition) => {
  ba.transientFields.transitions.push(transition.to);
});

config.onTransition("status", { from: "Pending", to: "Signed" }, "book", (ba, _ctx, transition) => {
  ba.transientFields.signedTitle = ba.book.get.title;
  ba.transientFields.signedTransition = { ...transition, current: ba.status };
  if (ba.transientFields.payWhenSigned) ba.status = AdvanceStatus.Paid;
});

// Only counts paying an existing advance, to test `onCreate: false`
config.onTransition("status", { to: "Paid", onCreate: false, phase: "commit" }, (ba) => {
  ba.transientFields.committedPaid++;
});
