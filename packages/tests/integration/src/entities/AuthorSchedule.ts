import { AuthorScheduleCodegen, authorScheduleConfig as config } from "./entities";

export class AuthorSchedule extends AuthorScheduleCodegen {
  /** How many sibling schedules each rule's `em.find` saw. */
  transientFields = {
    regularRuleFindCount: -1,
    flushRuleFindCount: -1,
    flushRuleFoundSelf: false,
  };
}

// A *regular* validation rule: runs pre-flush, so its `em.find` only sees rows already committed
// to the db, i.e. NOT the sibling schedules being INSERTed in this same `em.flush`.
config.addRule("author", async (as) => {
  const author = as.author.get.fullNonReactiveAccess;
  as.transientFields.regularRuleFindCount = (await as.em.find(AuthorSchedule, { author })).length;
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
