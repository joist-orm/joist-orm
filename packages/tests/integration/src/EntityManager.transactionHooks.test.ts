import { Plugin, table } from "joist-orm";
import { EntityManager, Tag, newAuthor } from "src/entities";
import { select } from "src/entities/inserts";
import { newEntityManager, queries } from "src/testEm";

describe("EntityManager.transactionHooks", () => {
  it("skips transactions and ordinary hooks on a write-less flush", async () => {
    // Given an EntityManager with ordinary transaction hooks and no entity changes
    const em = newEntityManager();
    const lifecycle: string[] = [];
    em.beforeBegin(() => lifecycle.push("beforeBegin"));
    em.afterBegin(() => lifecycle.push("afterBegin"));
    em.beforeCommit(() => lifecycle.push("beforeCommit"));
    em.afterCommit(() => lifecycle.push("afterCommit"));
    // And explicitly unforced hooks of each kind
    for (const hook of ["beforeBegin", "afterBegin", "beforeCommit", "afterCommit"] as const) {
      em[hook](() => lifecycle.push(`explicitly unforced ${hook}`), { forceTransaction: false });
    }

    // When flushing without entity writes
    await em.flush();

    // Then neither a transaction nor its hooks ran
    expect(queries).toEqual([]);
    expect(lifecycle).toEqual([]);
  });

  it("commits SQL from a forced hook on a write-less flush", async () => {
    // Given no entity changes and a forced hook that inserts a tag through SQL
    const em = newEntityManager();
    const lifecycle: string[] = [];
    const hookTransactions: unknown[] = [];
    em.beforeBegin(() => lifecycle.push("beforeBegin"));
    em.afterBegin(() => lifecycle.push("afterBegin"));
    em.beforeCommit(
      async (hookEm, txn) => {
        lifecycle.push("beforeCommit");
        hookTransactions.push(txn);
        await hookEm.execute({ insert: table(Tag), values: [{ name: "queued job" }] });
      },
      { forceTransaction: true },
    );
    // And an ordinary hook is registered after the forced hook
    em.beforeCommit(() => lifecycle.push("ordinary beforeCommit"), { forceTransaction: false });
    em.afterCommit(() => lifecycle.push("afterCommit"));

    // When flushing without entity writes
    const flushed = await em.flush();

    // Then the full transaction lifecycle committed the hook's SQL without flushing any entities
    expect(lifecycle).toEqual(["beforeBegin", "afterBegin", "beforeCommit", "ordinary beforeCommit", "afterCommit"]);
    expect(hookTransactions[0]).toBeDefined();
    expect(flushed).toEqual([]);
    expect(await select("tags")).toMatchObject([{ name: "queued job" }]);
    expect(em.txn).toBeUndefined();
  });

  it("rolls back SQL and propagates a forced hook's error", async () => {
    // Given a forced hook that writes SQL and then fails
    const em = newEntityManager();
    const failure = new Error("job enqueue failed");
    const committed: boolean[] = [];
    em.beforeCommit(
      async (hookEm) => {
        await hookEm.execute({ insert: table(Tag), values: [{ name: "rolled back job" }] });
        throw failure;
      },
      { forceTransaction: true },
    );
    // And a hook that must not run after the failed commit
    em.afterCommit(() => committed.push(true));

    // When flushing without entity writes
    // Then the original failure propagates and the SQL was rolled back
    await expect(em.flush()).rejects.toBe(failure);
    expect(await select("tags")).toEqual([]);
    expect(committed).toEqual([]);
    expect(em.txn).toBeUndefined();
  });

  it("validates entity writes before opening the forced transaction", async () => {
    // Given an author whose normal hooks and rules must run before the transaction
    const em = newEntityManager();
    const author = newAuthor(em);
    const validationInTransaction: boolean[] = [];
    class ObserveValidation extends Plugin {
      /** Records whether regular validation finished before the transaction opened. */
      afterValidate(): void {
        validationInTransaction.push(em.txn !== undefined);
      }
    }
    em.addPlugin(new ObserveValidation());
    // And both forced and ordinary commit hooks
    const lifecycle: string[] = [];
    em.beforeBegin(() => lifecycle.push("beforeBegin"));
    em.beforeCommit(
      async (hookEm) => {
        lifecycle.push("forced beforeCommit");
        await hookEm.execute({ insert: table(Tag), values: [{ name: "author job" }] });
      },
      { forceTransaction: true },
    );
    em.beforeCommit(() => lifecycle.push("ordinary beforeCommit"));
    em.afterCommit(() => lifecycle.push("afterCommit"));

    // When flushing the new author
    await em.flush();

    // Then validation stayed outside the transaction and both kinds of commit hooks ran normally
    // Reactive-query fields can trigger another validation pass after writing, inside the transaction.
    expect(validationInTransaction[0]).toBe(false);
    expect(author.transientFields.afterValidationRan).toBe(true);
    expect(author.transientFields.beforeCommitRan).toBe(true);
    expect(lifecycle).toEqual(["beforeBegin", "forced beforeCommit", "ordinary beforeCommit", "afterCommit"]);
    expect(await select("authors")).toMatchObject([{ first_name: author.firstName }]);
    expect(await select("tags")).toMatchObject([{ name: "author job" }]);
  });

  it("reuses an existing transaction and runs commit hooks only once", async () => {
    // Given a forced hook inside an explicitly managed transaction
    const em = newEntityManager();
    const hookTransactions: unknown[] = [];
    let existingTransaction: unknown;
    em.beforeCommit(
      async (hookEm, txn) => {
        hookTransactions.push(txn);
        await hookEm.execute({ insert: table(Tag), values: [{ name: "existing transaction job" }] });
      },
      { forceTransaction: true },
    );

    // When flushing multiple times in that transaction without entity writes
    await em.transaction(async (txn) => {
      existingTransaction = txn;
      await em.flush();
      await em.flush();
    });

    // Then the hook ran once on the existing transaction and its SQL committed
    expect(hookTransactions).toEqual([existingTransaction]);
    expect(await select("tags")).toMatchObject([{ name: "existing transaction job" }]);
    expect(queries.filter((query) => query === "BEGIN;")).toEqual(["BEGIN;"]);
  });

  it("preserves forced hooks when cloning an EntityManager", async () => {
    // Given an EntityManager with a forced hook that uses its callback's EntityManager
    const em = newEntityManager();
    const hookManagers: unknown[] = [];
    em.beforeCommit(
      async (hookEm) => {
        hookManagers.push(hookEm);
        await hookEm.execute({ insert: table(Tag), values: [{ name: "cloned job" }] });
      },
      { forceTransaction: true },
    );
    // And an EntityManager cloned through the constructor
    const clone = new EntityManager(em.ctx, { em });

    // When flushing the clone without entity writes
    await clone.flush();

    // Then the clone ran the copied hook and committed its SQL
    expect(hookManagers).toEqual([clone]);
    expect(await select("tags")).toMatchObject([{ name: "cloned job" }]);
  });

  it("preserves forced registrations across forked write-less flushes", async () => {
    // Given a fork of an EntityManager with a forced hook
    const em = newEntityManager();
    em.beforeCommit(
      async (hookEm) => {
        await hookEm.execute({ insert: table(Tag), values: [{ name: "forked job" }] });
      },
      { forceTransaction: true },
    );
    // And a fork that inherits the forced registration
    const fork = em.fork();

    // When the fork flushes twice without entity writes
    await fork.flush();
    await fork.flush();

    // Then the copied registration remains forced on both flushes
    expect(await select("tags")).toMatchObject([{ name: "forked job" }, { name: "forked job" }]);
  });

  it("does not force the original EntityManager when a fork opts in", async () => {
    // Given an EntityManager with an ordinary hook
    const em = newEntityManager();
    const hookManagers: unknown[] = [];
    em.beforeCommit((hookEm) => hookManagers.push(hookEm));
    // And a fork with its own forced hook
    const fork = em.fork();
    fork.beforeCommit(() => {}, { forceTransaction: true });

    // When flushing both managers without entity writes
    await fork.flush();
    await em.flush();

    // Then only the fork ran the ordinary hook
    expect(hookManagers).toEqual([fork]);
  });

  it.each(["beforeBegin", "afterBegin", "beforeCommit", "afterCommit"] as const)(
    "preserves the full write-less transaction lifecycle when %s forces a transaction on a fork",
    async (hook) => {
      // Given an EntityManager whose selected hook requires a transaction
      const em = newEntityManager();
      const lifecycle: string[] = [];
      em[hook](() => {}, { forceTransaction: true });
      // And ordinary hooks that observe the full transaction lifecycle
      em.beforeBegin(() => lifecycle.push("beforeBegin"));
      em.afterBegin(() => lifecycle.push("afterBegin"));
      em.beforeCommit(() => lifecycle.push("beforeCommit"));
      em.afterCommit(() => lifecycle.push("afterCommit"));
      // And a fork that inherits the selected hook's opt-in
      const fork = em.fork();

      // When flushing the fork without entity writes
      await fork.flush();

      // Then the full transaction lifecycle ran once
      expect(lifecycle).toEqual(["beforeBegin", "afterBegin", "beforeCommit", "afterCommit"]);
      expect(queries).toEqual(["BEGIN;", "COMMIT;"]);
    },
  );
});
