import { AuthorScheduleCodegen, authorScheduleConfig as config } from "./entities";

export class AuthorSchedule extends AuthorScheduleCodegen {
  transientFields = {
    /** How many sibling schedules the flush rule's `em.find` saw. */
    flushRuleFindCount: -1,
    /** Whether the flush rule's `em.find` returned this same in-memory instance. */
    flushRuleFoundSelf: false,
    /** Opt-in to have the regular rule attempt an (illegal) `em.find`, to exercise the guard. */
    tryFindInRegularRule: false,
  };
}

// A *regular* validation rule may NOT call `em.find*` (Joist rejects the find), because it runs pre-flush
// and would query stale, pre-flush data; this rule attempts it only when a test opts in, to exercise the guard.
config.addRule((as) => {
  if (as.transientFields.tryFindInRegularRule) {
    return as.em.find(AuthorSchedule, {}).then(() => undefined);
  }
});

// A *flush* rule: runs post-flush/pre-commit, so its `em.find` sees the changed state, i.e. the
// sibling schedules that were just INSERTed (within the transaction). This lets us enforce a
// cross-row invariant that a regular rule cannot express, e.g. "at most 2 schedules per author".
config.addFlushRule("author", async (as) => {
  const author = as.author.get.fullNonReactiveAccess;
  const found = await as.em.find(AuthorSchedule, { author });
  as.transientFields.flushRuleFindCount = found.length;
  // The found rows are hydrated back to the same in-memory instances (not duplicates).
  as.transientFields.flushRuleFoundSelf = found.includes(as.fullNonReactiveAccess);
  if (found.length > 2) {
    return "An author cannot have more than 2 schedules";
  }
});
