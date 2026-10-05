import { AdvanceStatus, BookAdvanceCodegen, bookAdvanceConfig as config } from "./entities";

export class BookAdvance extends BookAdvanceCodegen {
  transientFields = {
    /** The `to` state of each transition our `onTransition` handled, so tests can assert exactly which fired. */
    transitions: [] as AdvanceStatus[],
    /** The transition the Signed reaction handled, and the state the advance was in when it ran. */
    signedTransition: undefined as
      | { from: AdvanceStatus | undefined; to: AdvanceStatus; current: AdvanceStatus }
      | undefined,
    /** Makes the Signed reaction immediately pay the advance, to test chained changes within one flush. */
    payWhenSigned: false,
    /** Makes the Pending reaction sign the advance, to test transitions of a new entity during its first flush. */
    signWhenPending: false,
    /** The book title the Signed reaction saw, to test that `onTransition` loads its hint. */
    signedTitle: undefined as string | undefined,
    /** How many times the commit-phase reaction ran. */
    onPaidCommitInvoked: 0,
  };
}

// Declare our allowed transitions: Paid is terminal, and Signed may go back to Pending (i.e. the signature
// was rescinded), which also lets tests cycle between states, like Pending -> Signed -> Pending
config.transitions("status", {
  Pending: ["Signed"],
  Signed: ["Paid", "Pending"],
  Paid: [],
});

// For testing that guards only run on matching transitions, load their hint, reject transitions (even
// ones the state has moved past), and stop rejected transitions from firing `onTransition`s
config.guardTransition("status", { to: "Paid" }, "book", (ba) => {
  if (ba.book.get.title === "Unpublished") {
    return "Cannot pay an advance for an unpublished book";
  }
});

// For testing which transitions fire, and in what order, including creation (since `onCreate` defaults to true)
config.onTransition("status", {}, (ba, _ctx, transition) => {
  ba.transientFields.transitions.push(transition.to);
});

// For testing `from` matches (which never fire on creation), loading the hint, receiving the `transition`
// after the state has moved on, and chained transitions within one flush (with `payWhenSigned`)
config.onTransition("observeSignature", "status", { from: "Pending", to: "Signed" }, "book", (ba, _ctx, transition) => {
  ba.transientFields.signedTitle = ba.book.get.title;
  ba.transientFields.signedTransition = { ...transition, current: ba.status };
  if (ba.transientFields.payWhenSigned) ba.status = AdvanceStatus.Paid;
});

// For testing that once a flush's reactions have seen a new entity, later assignments to it are
// transitions, not part of its creation (with `signWhenPending`)
config.onTransition("status", { to: "Pending" }, (ba) => {
  if (ba.transientFields.signWhenPending) ba.status = AdvanceStatus.Signed;
});

// For testing commit-phase reactions, and `onCreate: false`, since this only counts paying an existing advance
config.onTransition("countPaidCommit", "status", { to: "Paid", onCreate: false, phase: "commit" }, (ba) => {
  ba.transientFields.onPaidCommitInvoked++;
});

// For testing that revoking a signature doesn't bypass its guard when status is clean again.
config.guardTransition("status", { to: "Signed" }, "book", (ba) => {
  if (ba.book.get.title === "Unapproved") {
    return "Cannot sign an advance for an unapproved book";
  }
});
