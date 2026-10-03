import { AdvanceStatus, BookAdvanceCodegen, bookAdvanceConfig as config } from "./entities";

export class BookAdvance extends BookAdvanceCodegen {
  transientFields = {
    /** Each value our `onTransition` observed, so tests can assert exactly which changes fired. */
    transitions: [] as AdvanceStatus[],
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

config.guardTransition("status", { to: "Paid" }, { book: "title" }, (ba) => {
  if (ba.book.get.title === "Unpublished") return "Cannot pay an advance for an unpublished book";
});

// Declared before the Signed reaction, so it sees Signed before that reaction moves on to Paid
config.onTransition("status", {}, (ba) => {
  ba.transientFields.transitions.push(ba.status);
});

config.onTransition("status", { from: "Pending", to: "Signed" }, "book", (ba) => {
  ba.transientFields.signedTitle = ba.book.get.title;
  if (ba.transientFields.payWhenSigned) ba.status = AdvanceStatus.Paid;
});

// Only counts paying an existing advance, to test `onCreate: false`
config.onTransition("status", { to: "Paid", onCreate: false, phase: "commit" }, (ba) => {
  ba.transientFields.committedPaid++;
});
