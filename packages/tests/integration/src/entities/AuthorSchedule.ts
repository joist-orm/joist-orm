import { AuthorScheduleCodegen, authorScheduleConfig as config } from "./entities";

export class AuthorSchedule extends AuthorScheduleCodegen {
  transientFields = {
    /** How many sibling schedules the commit rule's `em.find` saw. */
    commitRuleFindCount: -1,
    /** Whether the commit rule's `em.find` returned this same in-memory instance. */
    commitRuleFoundSelf: false,
    /** Opt-in to have the regular rule attempt an (illegal) `em.find`, to exercise the guard. */
    tryFindInRegularRule: false,
    /** How many times this entity's delete rule has run. */
    deleteRuleRuns: 0,
    /** Opt-in to have the delete rule attempt an (illegal) `em.find`. */
    tryFindInDeleteRule: false,
    /** Opt-in to reject deletion from the pre-flush delete rule. */
    preventDelete: false,
    /** The rows that the commit delete rule's `em.find` saw. */
    commitDeleteRuleFindOverviews: [] as (string | undefined)[],
    /** Whether the commit delete rule's `em.find` returned the deleted entity. */
    commitDeleteRuleFoundSelf: false,
    /** Opt-in to run and reject from the commit delete rule. */
    preventDeleteAtCommit: false,
  };
}

// A *regular* validation rule may NOT call `em.find*` (Joist rejects the find), because it runs pre-flush
// and would query stale, pre-flush data; this rule attempts it only when a test opts in, to exercise the guard.
config.addRule((as) => {
  if (as.transientFields.tryFindInRegularRule) {
    return as.em.find(AuthorSchedule, {}).then(() => undefined);
  }
});

// A *commit* rule: runs post-flush/pre-commit, so its `em.find` sees the changed state, i.e. the
// sibling schedules that were just INSERTed (within the transaction). This lets us enforce a
// cross-row invariant that a regular rule cannot express, e.g. "at most 2 schedules per author".
config.addCommitRule("author", async (as) => {
  const author = as.author.get.fullNonReactiveAccess;
  const found = await as.em.find(AuthorSchedule, { author });
  as.transientFields.commitRuleFindCount = found.length;
  // The found rows are hydrated back to the same in-memory instances (not duplicates).
  as.transientFields.commitRuleFoundSelf = found.includes(as.fullNonReactiveAccess);
  if (found.length > 2) {
    return "An author cannot have more than 2 schedules";
  }
});

// A regular delete rule that cannot call `em.find*` because it runs pre-flush.
config.addDeleteRule(async (as) => {
  as.transientFields.deleteRuleRuns++;
  if (as.transientFields.tryFindInDeleteRule) {
    await as.em.find(AuthorSchedule, {});
  }
  if (as.transientFields.preventDelete) {
    return "This schedule cannot be deleted";
  }
});

// A commit delete rule that runs post-flush/pre-commit, so its `em.find` sees the changed state.
config.addCommitDeleteRule(async (as) => {
  if (as.transientFields.preventDeleteAtCommit) {
    const found = await as.em.find(AuthorSchedule, {});
    as.transientFields.commitDeleteRuleFindOverviews = found.map((schedule) => schedule.overview).sort();
    as.transientFields.commitDeleteRuleFoundSelf = found.includes(as);
    return "This schedule cannot be deleted at commit";
  }
});
