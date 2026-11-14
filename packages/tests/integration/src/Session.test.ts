import { type Entity, Plugin, Session, ValidationErrors, getInstanceData } from "joist-orm";
import {
  AdvanceStatus,
  Author,
  AuthorSchedule,
  Book,
  BookAdvance,
  BookReview,
  SmallPublisher,
  Tag,
} from "src/entities";
import { insertAuthor, insertBook, insertBookAdvance, insertPublisher, insertTag, select } from "src/entities/inserts";
import { newEntityManager, queries, resetQueryCount } from "src/testEm";

describe("Session", () => {
  it("returns JSON without exposing staging entities", async () => {
    // Given a session with a staged tag
    const session = newSession();
    await session.apply({ op: "create", type: "Tag", key: "tag", values: { name: "draft" } });
    // When reading its fields
    const result = await session.read({ target: { ref: "tag" }, fields: ["name"] });
    // Then the caller receives only a JSON snapshot
    expect(JSON.parse(JSON.stringify(result))).toEqual({ ref: "tag", type: "Tag", values: { name: "draft" } });
  });

  it("preserves structured validation errors", async () => {
    // Given an author rejected by an existing domain rule
    const session = newSession();
    await session.apply({
      op: "create",
      type: "Author",
      key: "author",
      values: { firstName: "Alice", lastName: "NotAllowedLastName" },
    });
    // When requesting advisory validation
    const result = await session.validateChanges();
    // Then the error refers to the session entity and preserves its field and code
    expect(result).toMatchObject({
      status: "invalid",
      errors: [{ ref: "author", field: "lastName", code: "invalid-name", message: "lastName is invalid" }],
    });
  });

  it("keeps the same physical EM after validation corrections", async () => {
    // Given a factory that records which staging managers it creates
    const managers: ReturnType<typeof newEntityManager>[] = [];
    const session = new Session({
      types: [Tag],
      createEm: () => {
        const em = newEntityManager();
        managers.push(em);
        return em;
      },
    });
    // And a tag with a missing required name
    await session.apply({ op: "create", type: "Tag", key: "tag", values: {} });
    await session.validateChanges();
    // When correcting it and validating twice
    await session.apply({ op: "set", target: { ref: "tag" }, values: { name: "fixed" } });
    await session.validateChanges();
    await session.validateChanges();
    // Then no replacement manager was created
    expect(managers.length).toEqual(1);
  });

  it("can repeatedly validate new entities before their SQL-dependent fields are derived", async () => {
    // Given a new author and book whose derived values participate in flush
    const session = newSession();
    await session.apply({ op: "create", type: "Author", key: "author", values: { firstName: "Alice" } });
    await session.apply({
      op: "create",
      type: "Book",
      key: "book",
      values: { title: "Draft", author: { ref: "author" } },
    });
    await session.validateChanges();
    // When validating again without writing the graph
    const result = await session.validateChanges();
    // Then the pending graph still validates successfully
    expect(result.status).toEqual("valid");
  });

  it("never persists advisory validation", async () => {
    // Given a new tag
    const session = newSession();
    await session.apply({ op: "create", type: "Tag", key: "tag", values: { name: "draft" } });
    // When validating repeatedly
    await session.validateChanges();
    await session.validateChanges();
    // Then no tag reached durable storage
    expect(await select("tags")).toEqual([]);
  });

  it("previews and commits the corrected intent on fresh managers", async () => {
    // Given original work followed by a validation correction
    const session = newSession();
    await session.apply({ op: "create", type: "Tag", key: "tag", values: {} });
    await session.validateChanges();
    await session.apply({ op: "set", target: { ref: "tag" }, values: { name: "fixed" } });
    // When reviewing and approving the corrected log
    const review = await session.previewChanges();
    if (review.status !== "valid") throw new Error("Expected a valid review");
    await session.commitChanges({ reviewToken: review.reviewToken });
    // Then exactly the reviewed tag is committed
    expect(await select("tags")).toMatchObject([{ name: "fixed" }]);
  });

  it("commits replayed intent without comparing against the advisory preview", async () => {
    // Given an approved rename
    await insertTag({ name: "original" });
    const session = newSession();
    await session.apply({ op: "set", target: { ref: "t:1" }, values: { name: "reviewed" } });
    const review = await session.previewChanges();
    if (review.status !== "valid") throw new Error("Expected a valid review");
    // And a different writer changes the approved original
    const other = newEntityManager();
    const tag = await other.load(Tag, "t:1");
    tag.name = "concurrent";
    await other.flush();
    // When trying to commit the old review
    await session.commitChanges({ reviewToken: review.reviewToken });
    // Then the ordinary fresh flush applies the requested name
    expect(await select("tags")).toMatchObject([{ name: "reviewed" }]);
  });

  it("invalidates a review after another command", async () => {
    // Given a reviewed new tag
    const session = newSession();
    await session.apply({ op: "create", type: "Tag", key: "tag", values: { name: "reviewed" } });
    const review = await session.previewChanges();
    if (review.status !== "valid") throw new Error("Expected a valid review");
    // And an edit after review
    await session.apply({ op: "set", target: { ref: "tag" }, values: { name: "unreviewed" } });
    // When committing the earlier review
    // Then the stale token is rejected
    await expect(session.commitChanges({ reviewToken: review.reviewToken })).rejects.toThrow("review");
  });

  it("finds existing entities as JSON snapshots", async () => {
    // Given an existing tag
    await insertTag({ name: "existing" });
    const session = newSession();
    // When finding it through the JSON boundary
    const result = await session.find({ type: "Tag", where: { name: "existing" }, fields: ["name"] });
    // Then neither the entity nor its manager escapes
    expect(result).toEqual([{ ref: "t:1", type: "Tag", values: { name: "existing" } }]);
  });

  it("retains relationship keys rather than provisional IDs", async () => {
    // Given explicitly created author and book references
    const session = newSession();
    await session.apply({ op: "create", type: "Author", key: "author", values: { firstName: "Alice" } });
    await session.apply({
      op: "create",
      type: "Book",
      key: "book",
      values: { title: "Draft", author: { ref: "author" } },
    });
    // When previewing after IDs have been allocated
    const review = await session.previewChanges();
    if (review.status !== "valid") throw new Error("Expected a valid review");
    // Then the reference still names the explicit creation
    expect(review.changes.find((change) => change.ref === "book")?.fields.author).toEqual({
      originalValue: null,
      newValue: { ref: "author" },
    });
  });

  it("retains many-to-many edits across pre-write validations", async () => {
    // Given an author tagged with a newly created tag
    const session = newSession();
    await session.apply({ op: "create", type: "Author", key: "author", values: { firstName: "Alice" } });
    await session.apply({ op: "create", type: "Tag", key: "tag", values: { name: "tagged" } });
    await session.apply({ op: "add", target: { ref: "author" }, field: "tags", value: { ref: "tag" } });
    await session.validateChanges();
    // When validating the same pending membership again
    const result = await session.validateChanges();
    if (result.status !== "valid") throw new Error("Expected valid changes");
    // Then its pending membership remains visible
    expect(result.changes.find((change) => change.ref === "author")?.relationships.tags).toEqual({
      added: [{ ref: "tag" }],
      removed: [],
    });
  });

  it("commits reviewed many-to-many changes", async () => {
    // Given an existing author and a new tag
    await insertAuthor({ first_name: "Alice" });
    const session = newSession();
    await session.apply({ op: "create", type: "Tag", key: "tag", values: { name: "tagged" } });
    await session.apply({ op: "add", target: { ref: "a:1" }, field: "tags", value: { ref: "tag" } });
    // When reviewing and committing the log
    const review = await session.previewChanges();
    if (review.status !== "valid") throw new Error("Expected a valid review");
    await session.commitChanges({ reviewToken: review.reviewToken });
    // Then one join row reached the database
    expect((await select("authors_to_tags")).length).toEqual(1);
  });

  it("recalculates database-query derived values during preview after staging validation", async () => {
    // Given a publisher with a new review in its author graph
    await insertPublisher({ name: "publisher" });
    await insertAuthor({ first_name: "Alice", publisher_id: 1 });
    await insertBook({ title: "Draft", author_id: 1 });
    const session = newSession();
    await session.apply({
      op: "create",
      type: "BookReview",
      key: "review",
      values: { book: { ref: "b:1" }, rating: 1 },
    });
    await session.validateChanges();
    // When previewing the pending review with real SQL and an RQF loop
    const result = await session.previewChanges();
    if (result.status !== "valid") throw new Error("Expected valid changes");
    // Then the publisher's SQL-derived value still includes the review
    expect(result.changes.find((change) => change.ref === "p:1")?.fields.numberOfBookReviews.newValue).toEqual(1);
  });

  it("keeps staging editable after preview rejects a commit rule", async () => {
    // Given three schedules that violate the real post-write rule
    const session = newSession();
    await session.apply({ op: "create", type: "Author", key: "author", values: { firstName: "Alice" } });
    for (const key of ["one", "two", "three"]) {
      await session.apply({ op: "create", type: "AuthorSchedule", key, values: { author: { ref: "author" } } });
    }
    const invalid = await session.previewChanges();
    if (invalid.status !== "invalid") throw new Error("Expected the commit rule to reject three schedules");
    // When correcting the same staging graph and trying again
    await session.apply({ op: "delete", target: { ref: "three" } });
    const corrected = await session.previewChanges();
    // Then fresh replay sees the corrected graph
    expect(corrected.status).toEqual("valid");
  });

  it("retains cascade deletes across pre-write validations", async () => {
    // Given a persisted author whose book is cascade-deleted
    await insertAuthor({ first_name: "Alice" });
    await insertBook({ title: "Draft", author_id: 1 });
    const session = newSession();
    await session.apply({ op: "delete", target: { ref: "a:1" } });
    await session.validateChanges();
    // When validating those pending deletions again
    const result = await session.validateChanges();
    if (result.status !== "valid") throw new Error("Expected valid deletions");
    // Then both effective deletions remain represented
    expect(result.changes.map((change) => change.ref)).toEqual(["a:1", "b:1"]);
  });

  it("skips transaction beforeCommit callbacks during preview", async () => {
    // Given a transaction callback that vetoes persistence
    const session = new Session({
      types: [Tag],
      createEm: () => {
        const em = newEntityManager();
        em.beforeCommit(() => {
          throw new ValidationErrors("transaction veto");
        });
        return em;
      },
    });
    await session.apply({ op: "create", type: "Tag", key: "tag", values: { name: "draft" } });
    // When preparing a review
    const result = await session.previewChanges();
    // Then the transaction veto is outside the preview contract
    expect(result.status).toEqual("valid");
  });

  it("does not run successful-after-commit effects during validation or review", async () => {
    // Given an application factory with an after-commit effect
    let effects = 0;
    const session = new Session({
      types: [Tag],
      createEm: () => {
        const em = newEntityManager();
        em.afterCommit(() => {
          effects++;
        });
        return em;
      },
    });
    await session.apply({ op: "create", type: "Tag", key: "tag", values: { name: "draft" } });
    // When executing both speculative paths
    await session.validateChanges();
    await session.previewChanges();
    // Then neither reports a successful commit
    expect(effects).toEqual(0);
  });

  it("enforces factory-installed plugins again at commit", async () => {
    // Given authorization that permits the reviewed work
    const permission = { allowed: true };
    class Authorize extends Plugin {
      /** Rejects writes when the request no longer has permission. */
      beforeValidate(): void {
        if (!permission.allowed) throw new Error("Permission denied");
      }
    }
    const session = new Session({
      types: [Tag],
      createEm: () => {
        const em = newEntityManager();
        em.addPlugin(new Authorize());
        return em;
      },
    });
    await session.apply({ op: "create", type: "Tag", key: "tag", values: { name: "draft" } });
    await session.validateChanges();
    const review = await session.previewChanges();
    if (review.status !== "valid") throw new Error("Expected a valid review");
    // And permission is revoked before commit
    permission.allowed = false;
    // When committing the reviewed log
    // Then a fresh plugin still denies the operation
    await expect(session.commitChanges({ reviewToken: review.reviewToken })).rejects.toThrow("Permission denied");
  });

  it("leaves ordinary failed flushes terminal", async () => {
    // Given an ordinary EM that failed validation
    const em = newEntityManager();
    const tag = em.create(Tag, { name: "" });
    await expect(em.flush()).rejects.toThrow(ValidationErrors);
    // When fixing it without opting into dry-run recovery
    tag.name = "fixed";
    // Then ordinary failed-flush behavior is unchanged
    await expect(em.flush()).rejects.toThrow("previous");
  });

  it("excludes sticky staging hook creations from authoritative review", async () => {
    // Given a hook that creates another tag every time its parent is prepared
    const session = newSession();
    await session.apply({ op: "create", type: "Tag", key: "parent", values: { name: "create sibling" } });
    await session.validateChanges();
    await session.validateChanges();
    // When rebuilding an authoritative review from caller intent only
    const review = await session.previewChanges();
    if (review.status !== "valid") throw new Error("Expected a valid review");
    // Then only one execution's generated sibling is included
    expect(review.changes.map((change) => change.fields.name.newValue).sort()).toEqual([
      "create sibling",
      "generated sibling",
    ]);
  });

  it("commits hook-created entities together with caller intent", async () => {
    // Given a reviewed parent whose hook creates a sibling
    const session = newSession();
    await session.apply({ op: "create", type: "Tag", key: "parent", values: { name: "create sibling" } });
    const review = await session.previewChanges();
    if (review.status !== "valid") throw new Error("Expected a valid review");
    // When committing through a fresh ordinary flush
    await session.commitChanges({ reviewToken: review.reviewToken });
    // Then both reviewed entities are durable
    expect((await select("tags")).map((row) => row.name).sort()).toEqual(["create sibling", "generated sibling"]);
  });

  it("prevents edits targeting execution-generated references", async () => {
    // Given a generated sibling visible in advisory changes
    const session = newSession();
    await session.apply({ op: "create", type: "Tag", key: "parent", values: { name: "create sibling" } });
    await session.validateChanges();
    // When attempting to turn its diagnostic identity into a logged target
    // Then replay cannot silently lose that edit
    await expect(session.apply({ op: "set", target: { ref: "@Tag:1" }, values: { name: "edited" } })).rejects.toThrow(
      "reference",
    );
  });

  it("does not expose a trusted-only field in review JSON", async () => {
    // Given a policy that permits ORM-internal reads but denies caller reads
    class ReadPolicy extends Plugin {
      /** Keeps entities visible while enabling per-access field authorization. */
      canViewEntity(): boolean {
        return true;
      }

      /** Trusted reads must not cache permission for the caller-facing preview. */
      beforeGetField(entity: Entity, field: string): void {
        if (field !== "name") return;
        if (getInstanceData(entity).data.name === undefined) return;
        throw new Error("Cannot read name");
      }
    }
    const session = new Session({
      types: [Tag],
      createEm: () => {
        const em = newEntityManager();
        em.addPlugin(new ReadPolicy());
        return em;
      },
    });
    await session.apply({ op: "create", type: "Tag", key: "tag", values: { name: "secret" } });
    // When serializing the effective changes outside trusted execution
    // Then internal access does not become an authorization bypass
    await expect(session.previewChanges()).rejects.toThrow("Cannot read name");
  });

  it("keeps standalone read errors recoverable", async () => {
    // Given an editing session and a missing durable row
    const session = newSession();
    await expect(session.read({ target: { ref: "t:404" }, fields: ["name"] })).rejects.toThrow();
    // When staging work after that failed read
    await session.apply({ op: "create", type: "Tag", key: "tag", values: { name: "still editable" } });
    // Then the failed read did not taint staging
    expect(await session.read({ target: { ref: "tag" }, fields: ["name"] })).toMatchObject({
      values: { name: "still editable" },
    });
  });

  it("taints staging after an unexpected flush failure", async () => {
    // Given a plugin that breaks the flush rather than returning validation feedback
    class Broken extends Plugin {
      /** Models a non-recoverable application failure during flush. */
      beforeValidate(): void {
        throw new Error("broken flush");
      }
    }
    const session = new Session({
      types: [Tag],
      createEm: () => {
        const em = newEntityManager();
        em.addPlugin(new Broken());
        return em;
      },
    });
    await session.apply({ op: "create", type: "Tag", key: "tag", values: { name: "draft" } });
    await expect(session.validateChanges()).rejects.toThrow("broken flush");
    // When attempting more edits after the failed flush
    // Then the workspace explicitly rejects reuse
    await expect(session.apply({ op: "set", target: { ref: "tag" }, values: { name: "retry" } })).rejects.toThrow(
      "tainted",
    );
  });

  it("does not allow returned JSON to modify logged intent", async () => {
    // Given a reviewed tag and a caller that changes its returned copy
    const session = newSession();
    await session.apply({ op: "create", type: "Tag", key: "tag", values: { name: "reviewed" } });
    const review = await session.previewChanges();
    if (review.status !== "valid") throw new Error("Expected a valid review");
    review.changes[0].fields.name.newValue = "tampered";
    // When committing the logged commands
    await session.commitChanges({ reviewToken: review.reviewToken });
    // Then the original command value becomes durable
    expect(await select("tags")).toMatchObject([{ name: "reviewed" }]);
  });

  it("runs successful-after-commit effects only for the real commit", async () => {
    // Given a session factory with an after-commit effect
    let effects = 0;
    const session = new Session({
      types: [Tag],
      createEm: () => {
        const em = newEntityManager();
        em.afterCommit(() => {
          effects++;
        });
        return em;
      },
    });
    await session.apply({ op: "create", type: "Tag", key: "tag", values: { name: "draft" } });
    await session.validateChanges();
    const review = await session.previewChanges();
    if (review.status !== "valid") throw new Error("Expected a valid review");
    // When committing the reviewed log
    await session.commitChanges({ reviewToken: review.reviewToken });
    // Then exactly one successful commit effect was released
    expect(effects).toEqual(1);
  });

  it("commits a create-then-delete log without reporting a nonexistent ID", async () => {
    // Given a creation that the caller undoes before review
    const session = newSession();
    await session.apply({ op: "create", type: "Tag", key: "tag", values: { name: "temporary" } });
    await session.apply({ op: "delete", target: { ref: "tag" } });
    const review = await session.previewChanges();
    if (review.status !== "valid") throw new Error("Expected a valid empty review");
    // When committing that effective no-op
    const result = await session.commitChanges({ reviewToken: review.reviewToken });
    // Then the result contains no durable identity for the discarded creation
    expect(result).toEqual({ ids: {} });
  });

  it("keeps edits available after an ordinary read's database error", async () => {
    // Given a PostgreSQL read containing a NUL byte that text columns cannot represent
    const session = newSession();
    await expect(session.find({ type: "Tag", where: { name: "bad\u0000name" }, fields: ["name"] })).rejects.toThrow();
    // When issuing a valid read on the same workspace
    const result = await session.find({ type: "Tag", where: {}, fields: ["name"] });
    // Then a transient read failure does not poison the session
    expect(result).toEqual([]);
  });

  it("retries transition guards after correcting a validation failure", async () => {
    // Given an existing advance whose signature guard rejects the book
    await insertPublisher({ name: "publisher" });
    await insertAuthor({ first_name: "Alice" });
    await insertBook({ title: "Unapproved", author_id: 1 });
    await insertBookAdvance({ book_id: 1, publisher_id: 1 });
    const managers: ReturnType<typeof newEntityManager>[] = [];
    const session = new Session({
      types: [Author, Book, BookAdvance, SmallPublisher],
      createEm: () => {
        const em = newEntityManager();
        managers.push(em);
        return em;
      },
    });
    // And a signature followed by revocation, leaving no net status change
    await session.apply({ op: "set", target: { ref: "ba:1" }, values: { status: AdvanceStatus.Signed } });
    await session.apply({ op: "set", target: { ref: "ba:1" }, values: { status: AdvanceStatus.Pending } });
    const invalid = await session.validateChanges();
    if (invalid.status !== "invalid") throw new Error("Expected the signature guard to fail");
    // When correcting the book and validating the same transition history
    await session.apply({ op: "set", target: { ref: "b:1" }, values: { title: "Approved" } });
    await session.validateChanges();
    // Then both transitions run after recovery on the original manager
    expect((managers[0].getEntity("ba:1") as BookAdvance).transientFields.transitions).toEqual([
      AdvanceStatus.Signed,
      AdvanceStatus.Pending,
    ]);
  });

  it("rejects reuse after an after-commit failure with a durable write", async () => {
    // Given an effect that fails after the database commit
    const session = new Session({
      types: [Tag],
      createEm: () => {
        const em = newEntityManager();
        em.afterCommit(() => {
          throw new Error("effect failed");
        });
        return em;
      },
    });
    await session.apply({ op: "create", type: "Tag", key: "tag", values: { name: "committed" } });
    const review = await session.previewChanges();
    if (review.status !== "valid") throw new Error("Expected a valid review");
    await expect(session.commitChanges({ reviewToken: review.reviewToken })).rejects.toThrow("effect failed");
    // When attempting to prepare another commit of that intent
    // Then ambiguous retries are rejected instead of duplicating a durable write
    await expect(session.previewChanges()).rejects.toThrow("tainted");
  });

  it("captures an explicit touch even when hooks produce field updates", async () => {
    // Given an existing author whose timestamp and derived values can change on flush
    await insertAuthor({ first_name: "Alice" });
    const session = newSession();
    await session.apply({ op: "touch", target: { ref: "a:1" } });
    // When capturing its effective changes
    const review = await session.previewChanges();
    if (review.status !== "valid") throw new Error("Expected a valid review");
    // Then the original touch intent is not erased by generated field changes
    expect(review.changes.find((change) => change.ref === "a:1")?.touched).toEqual(true);
  });

  it("decodes array fields using their column shape", async () => {
    // Given explicit caller-provided author nicknames
    const session = newSession();
    await session.apply({
      op: "create",
      type: "Author",
      key: "author",
      values: { firstName: "Alice", nickNames: ["Al", "Alice"] },
    });
    // When reading the staged array
    const result = await session.read({ target: { ref: "author" }, fields: ["nickNames"] });
    // Then JSON array input is not mistaken for a scalar string field
    expect(result.values.nickNames).toEqual(["Al", "Alice"]);
  });

  it("does not turn a null equality filter into an unfiltered query", async () => {
    // Given a named tag that does not match a null name
    await insertTag({ name: "existing" });
    const session = newSession();
    // When searching explicitly for null rather than omitting the filter
    const result = await session.find({ type: "Tag", where: { name: null }, fields: ["name"] });
    // Then the nonmatching row is not returned
    expect(result).toEqual([]);
  });

  it("skips transaction beforeCommit checks during staging validation", async () => {
    // Given a veto followed by another transaction check that queries the inserted tag
    let checkedTags = 0;
    const session = new Session({
      types: [Tag],
      createEm: () => {
        const em = newEntityManager();
        em.beforeCommit(() => {
          throw new ValidationErrors("veto");
        });
        em.beforeCommit(async (hookEm) => {
          checkedTags = (await hookEm.find(Tag, { name: "draft" })).length;
        });
        return em;
      },
    });
    await session.apply({ op: "create", type: "Tag", key: "tag", values: { name: "draft" } });
    // When validating without attempting to commit
    await session.validateChanges();
    // Then neither transaction callback runs
    expect(checkedTags).toEqual(0);
  });
  it("validates a publisher updated both before and during the RQF loop", async () => {
    // Given a persisted publisher with an author and book
    // Exact milliseconds expose any legacy trigger that would silently advance the lock version.
    await insertPublisher({ name: "publisher", updated_at: new Date("2020-01-01T00:00:00.000Z") });
    await insertAuthor({ first_name: "Alice", publisher_id: 1 });
    await insertBook({ title: "Draft", author_id: 1 });
    const session = newSession();
    // And a rename that writes the publisher before its review count is recalculated
    await session.apply({ op: "set", target: { ref: "p:1" }, values: { name: "renamed" } });
    await session.apply({
      op: "create",
      type: "BookReview",
      key: "review",
      values: { book: { ref: "b:1" }, rating: 1 },
    });
    // When preview derives the count after staging validation
    await session.validateChanges();
    const result = await session.previewChanges();
    // Then speculative writes retain a valid optimistic-lock baseline across both updates
    expect(result.status).toEqual("valid");
  });
  it("does not write SQL or begin a transaction during staging validation", async () => {
    // Given a publisher rename and a new review that will require RQF processing at preview
    await insertPublisher({ name: "publisher" });
    await insertAuthor({ first_name: "Alice", publisher_id: 1 });
    await insertBook({ title: "Draft", author_id: 1 });
    const session = newSession();
    await session.apply({ op: "set", target: { ref: "p:1" }, values: { name: "renamed" } });
    await session.apply({
      op: "create",
      type: "BookReview",
      key: "review",
      values: { book: { ref: "b:1" }, rating: 1 },
    });
    resetQueryCount();
    // When validating repeatedly on the warm staging graph
    await session.validateChanges();
    await session.validateChanges();
    // Then ORM persistence and transaction operations are deferred to preview
    expect(queries.filter((sql) => /\b(INSERT INTO|UPDATE|DELETE FROM|BEGIN|COMMIT|ROLLBACK)\b/i.test(sql))).toEqual(
      [],
    );
  });

  it("defers commit-rule failures until preview", async () => {
    // Given three schedules that violate the SQL-dependent commit rule
    const session = newSession();
    await session.apply({ op: "create", type: "Author", key: "author", values: { firstName: "Alice" } });
    for (const key of ["one", "two", "three"]) {
      await session.apply({ op: "create", type: "AuthorSchedule", key, values: { author: { ref: "author" } } });
    }
    // When asking only for pre-write feedback
    const result = await session.validateChanges();
    // Then staging explicitly reports partial coverage rather than executing the commit rule
    expect(result).toMatchObject({ status: "valid", scope: "pre-write" });
  });
  it("awaits application context and plugins for staging, preview, and commit", async () => {
    // Given an application context initialized asynchronously for each execution
    const requests: string[] = [];
    let executions = 0;
    class ReportValidation extends Plugin {
      /** Uses the application's initialized service through the entity's original context. */
      async beforeValidate(entities: readonly Entity[]): Promise<void> {
        for (const entity of entities) {
          if (entity instanceof Tag) await entity.em.ctx.makeApiCall(entity.name);
        }
      }
    }
    const session = new Session({
      types: [Tag],
      createEm: async () => {
        const execution = ++executions;
        const context = await Promise.resolve({
          makeApiCall: async (name: string) => {
            requests.push(`${execution}:${name}`);
          },
        });
        const em = newEntityManager();
        Object.assign(em.ctx, context);
        em.addPlugin(new ReportValidation());
        return em;
      },
    });
    // When staging and previewing a tag with the initialized application service
    await session.apply({ op: "create", type: "Tag", key: "tag", values: { name: "draft" } });
    await session.validateChanges();
    const review = await session.previewChanges();
    if (review.status !== "valid") throw new Error("Expected a valid review");
    // Then neither execution persists the tag
    expect(await select("tags")).toEqual([]);
    // When committing the reviewed tag through another initialized application EM
    await session.commitChanges({ reviewToken: review.reviewToken });
    // Then the original context and plugin execute in all three roles
    expect(requests).toEqual(["1:draft", "2:draft", "3:draft"]);
    // And the ordinary commit persists the tag
    expect(await select("tags")).toMatchObject([{ name: "draft" }]);
    // When attempting another operation after success
    // Then the Session remains terminal
    await expect(session.validateChanges()).rejects.toThrow("Session is committed");
  });

  it("retries staging initialization after a factory rejection without logging the rejected command", async () => {
    // Given an application factory whose context service is initially unavailable
    let unavailable = true;
    const session = new Session({
      types: [Tag],
      createEm: async () => {
        await Promise.resolve();
        if (unavailable) throw new Error("Context unavailable");
        return newEntityManager();
      },
    });
    // When staging while initialization fails
    // Then the caller observes the factory error
    await expect(session.apply({ op: "create", type: "Tag", key: "tag", values: { name: "lost" } })).rejects.toThrow(
      "Context unavailable",
    );
    // And the context service recovers
    unavailable = false;
    // When retrying the same creation key and committing
    await session.apply({ op: "create", type: "Tag", key: "tag", values: { name: "saved" } });
    const review = await session.previewChanges();
    if (review.status !== "valid") throw new Error("Expected a valid review");
    await session.commitChanges({ reviewToken: review.reviewToken });
    // Then only the accepted command was replayed
    expect(await select("tags")).toMatchObject([{ name: "saved" }]);
  });

  it("does not initialize an application EM when disposed before first use", async () => {
    // Given an unused Session whose application factory would fail
    let executions = 0;
    const session = new Session({
      types: [Tag],
      createEm: async () => {
        executions++;
        throw new Error("Context unavailable");
      },
    });
    // When abandoning the Session before staging any work
    session.dispose();
    // Then no asynchronous initialization was started
    expect(executions).toEqual(0);
    // When attempting to use the abandoned Session
    // Then it rejects without starting initialization
    await expect(session.validateChanges()).rejects.toThrow("Session is disposed");
  });

  it("retains staged edits after preview factory rejection", async () => {
    // Given a staged tag and an application factory that can become unavailable
    let unavailable = false;
    const session = new Session({
      types: [Tag],
      createEm: async () => {
        await Promise.resolve();
        if (unavailable) throw new Error("Context unavailable");
        return newEntityManager();
      },
    });
    await session.apply({ op: "create", type: "Tag", key: "tag", values: { name: "draft" } });
    // And the context service becomes unavailable before preview
    unavailable = true;
    // When requesting a preview
    // Then the factory error reaches the caller
    await expect(session.previewChanges()).rejects.toThrow("Context unavailable");
    // And the context service recovers
    unavailable = false;
    // When correcting the retained tag and obtaining a new preview
    await session.apply({ op: "set", target: { ref: "tag" }, values: { name: "corrected" } });
    const review = await session.previewChanges();
    if (review.status !== "valid") throw new Error("Expected a valid review");
    await session.commitChanges({ reviewToken: review.reviewToken });
    // Then replay includes the original creation and its correction
    expect(await select("tags")).toMatchObject([{ name: "corrected" }]);
  });

  it("requires a new review after commit factory rejection", async () => {
    // Given a reviewed tag and an application factory that can become unavailable
    let unavailable = false;
    const session = new Session({
      types: [Tag],
      createEm: async () => {
        await Promise.resolve();
        if (unavailable) throw new Error("Context unavailable");
        return newEntityManager();
      },
    });
    await session.apply({ op: "create", type: "Tag", key: "tag", values: { name: "draft" } });
    const review = await session.previewChanges();
    if (review.status !== "valid") throw new Error("Expected a valid review");
    // And the context service becomes unavailable before commit
    unavailable = true;
    // When committing the reviewed command
    // Then the factory error reaches the caller
    await expect(session.commitChanges({ reviewToken: review.reviewToken })).rejects.toThrow("Context unavailable");
    // And the context service recovers
    unavailable = false;
    // When retrying the consumed token
    // Then a new review is required even though commit never reached SQL
    await expect(session.commitChanges({ reviewToken: review.reviewToken })).rejects.toThrow(
      "Invalid or stale review token",
    );
    // When obtaining a new review and committing
    const retry = await session.previewChanges();
    if (retry.status !== "valid") throw new Error("Expected a valid review");
    await session.commitChanges({ reviewToken: retry.reviewToken });
    // Then the tag is persisted once
    expect(await select("tags")).toMatchObject([{ name: "draft" }]);
  });

  it("keeps asynchronous staging initialization and a batch inside one exclusive operation", async () => {
    // Given an application context that has not finished initializing
    let finishInitialization!: () => void;
    const initialized = new Promise<void>((resolve) => {
      finishInitialization = resolve;
    });
    const session = new Session({
      types: [Tag],
      createEm: async () => {
        await initialized;
        return newEntityManager();
      },
    });
    const applying = session.applyBatch([
      { op: "create", type: "Tag", key: "tag", values: { name: "draft" } },
      { op: "set", target: { ref: "tag" }, values: { name: "edited" } },
    ]);
    try {
      // When another operation tries to use staging before initialization finishes
      // Then it cannot start another execution
      await expect(session.validateChanges()).rejects.toThrow("Session operation already in progress");
      // When disposal is attempted while initialization is pending
      // Then it cannot abandon an operation that will resume later
      expect(() => session.dispose()).toThrow("Session operation already in progress");
    } finally {
      finishInitialization();
      await applying;
    }
    // When reading after the original operation finishes
    const tag = await session.read({ target: { ref: "tag" }, fields: ["name"] });
    // Then both sequential commands completed on the initialized staging graph
    expect(tag.values).toEqual({ name: "edited" });
  });

  it("applies multi-field values and references in order through batch replay", async () => {
    // Given a batch whose later commands reference earlier creations
    const session = newSession();
    // When creating an author and book, then setting both scalar and relationship fields
    const refs = await session.applyBatch([
      { op: "create", type: "Author", key: "author", values: { firstName: "Alice" } },
      { op: "create", type: "Book", key: "book", values: { title: "Draft", author: { ref: "author" } } },
      { op: "create", type: "Tag", key: "tag", values: { name: "draft" } },
      { op: "set", target: { ref: "tag" }, values: { name: "edited", books: [{ ref: "book" }] } },
      { op: "set", target: { ref: "author" }, values: { firstName: "Alicia", lastName: "Smith" } },
    ]);
    // Then each command returns its reference in input order
    expect(refs).toEqual([{ ref: "author" }, { ref: "book" }, { ref: "tag" }, { ref: "tag" }, { ref: "author" }]);
    // When previewing the batch
    const review = await session.previewChanges();
    if (review.status !== "valid") throw new Error("Expected a valid review");
    // Then each successful command advances the revision
    expect(review.revision).toEqual(5);
    // When committing the command log on a fresh manager
    const result = await session.commitChanges({ reviewToken: review.reviewToken });
    const em = newEntityManager();
    const tag = await em.load(Tag, result.ids.tag, { books: "author" });
    // Then the scalar edit survives replay
    expect(tag.name).toEqual("edited");
    // And the collection reference links to the book and updated author
    expect(tag.books.get.map((book) => [book.title, book.author.get.firstName, book.author.get.lastName])).toEqual([
      ["Draft", "Alicia", "Smith"],
    ]);
  });

  it("retains successful batch commands and stops at a decoding failure", async () => {
    // Given a reviewed author
    const session = newSession();
    await session.apply({ op: "create", type: "Author", key: "author", values: { firstName: "Alice" } });
    const oldReview = await session.previewChanges();
    if (oldReview.status !== "valid") throw new Error("Expected a valid review");
    // When a later multi-field command has an unknown field
    // Then the batch propagates the first error
    await expect(
      session.applyBatch([
        { op: "set", target: { ref: "author" }, values: { firstName: "Accepted", lastName: "Smith" } },
        { op: "set", target: { ref: "author" }, values: { firstName: "Not applied", missingField: "invalid" } },
        { op: "create", type: "Tag", key: "skipped", values: { name: "not reached" } },
      ]),
    ).rejects.toThrow("Unknown field missingField");
    // When reading the retained staging graph
    const author = await session.read({ target: { ref: "author" }, fields: ["firstName", "lastName"] });
    // Then the successful edit remains and decoding did not partially apply the rejected command
    expect(author.values).toEqual({ firstName: "Accepted", lastName: "Smith" });
    // When using the token from before the successful edit
    // Then the batch has invalidated it
    await expect(session.commitChanges({ reviewToken: oldReview.reviewToken })).rejects.toThrow(
      "Invalid or stale review token",
    );
    // When reusing the skipped creation key and committing a fresh review
    await session.apply({ op: "create", type: "Tag", key: "skipped", values: { name: "recovered" } });
    const review = await session.previewChanges();
    if (review.status !== "valid") throw new Error("Expected a valid review");
    await session.commitChanges({ reviewToken: review.reviewToken });
    // Then the failed and skipped commands are absent from replay
    expect(await select("tags")).toMatchObject([{ name: "recovered" }]);
    // And the earlier successful edit was recorded
    expect(await select("authors")).toMatchObject([{ first_name: "Accepted", last_name: "Smith" }]);
  });

  it("leaves business validation to explicit validation after a batch", async () => {
    // Given an author whose identical names will violate an ordinary validation rule
    const session = newSession();
    // When applying invalid domain values followed by another command
    await session.applyBatch([
      { op: "create", type: "Author", key: "author", values: { firstName: "Alice" } },
      { op: "set", target: { ref: "author" }, values: { firstName: "Same", lastName: "Same" } },
      { op: "create", type: "Tag", key: "tag", values: { name: "still applied" } },
    ]);
    // Then no implicit flush has persisted the tag
    expect(await select("tags")).toEqual([]);
    // When asking Joist to validate the staged graph
    const result = await session.validateChanges();
    // Then its ordinary rule reports the invalid author
    expect(result).toMatchObject({
      status: "invalid",
      errors: [{ message: "firstName and lastName must be different" }],
    });
    // When correcting the author with another multi-field command
    await session.apply({ op: "set", target: { ref: "author" }, values: { firstName: "Alice", lastName: "Smith" } });
    const review = await session.previewChanges();
    if (review.status !== "valid") throw new Error("Expected a valid review");
    await session.commitChanges({ reviewToken: review.reviewToken });
    // Then the command after the invalid domain values was retained
    expect(await select("tags")).toMatchObject([{ name: "still applied" }]);
  });

  it("taints the Session when an ordinary entity setter rejects a batch mutation", async () => {
    // Given a paid advance whose terminal status cannot return to pending
    await insertPublisher({ name: "publisher" });
    await insertAuthor({ first_name: "Alice" });
    await insertBook({ title: "Published", author_id: 1 });
    await insertBookAdvance({ book_id: 1, publisher_id: 1, status_id: 3 });
    const em = newEntityManager();
    const session = new Session({ types: [Tag, BookAdvance], createEm: () => em });
    // When a batch creates a tag and then attempts the forbidden transition
    // Then the ordinary setter's error is propagated
    await expect(
      session.applyBatch([
        { op: "create", type: "Tag", key: "tag", values: { name: "retained" } },
        { op: "set", target: { ref: "ba:1" }, values: { status: AdvanceStatus.Pending } },
        { op: "create", type: "Tag", key: "later", values: { name: "not reached" } },
      ]),
    ).rejects.toThrow("Cannot change status from Paid to Pending");
    // When inspecting the application's staging manager
    // Then earlier mutations remain and later commands were not attempted
    expect(em.entities.filter((entity) => entity instanceof Tag).map((tag) => tag.name)).toEqual(["retained"]);
    // When attempting to continue the potentially partially mutated Session
    // Then the existing mutation-failure semantics reject reuse
    await expect(session.validateChanges()).rejects.toThrow("Session is tainted");
  });
});

/** Uses the application's normal factory rather than cloning plugins or context. */
function newSession() {
  return new Session({
    createEm: newEntityManager,
    types: [Author, AuthorSchedule, Book, BookReview, SmallPublisher, Tag],
  });
}
