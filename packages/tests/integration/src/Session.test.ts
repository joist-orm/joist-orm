import { type Entity, Plugin, Session, ValidationErrors, getInstanceData, readSessionEntityData } from "joist-orm";
import { AdvanceStatus, Author, BookAdvance, Tag } from "src/entities";
import { insertAuthor, insertBook, insertBookAdvance, insertPublisher, insertTag, select } from "src/entities/inserts";
import { newEntityManager, queries, resetQueryCount } from "src/testEm";

describe("Session", () => {
  describe("apply", () => {
    it("decodes array fields using their column shape", async () => {
      // Given explicit caller-provided author nicknames
      const session = newSession();
      await session.apply({
        op: "create",
        type: "Author",
        $clientId: "a#1",
        values: { firstName: "Alice", nickNames: ["Al", "Alice"] },
      });
      // When reading the staged array
      const result = await session.read({ entity: "a#1", fields: ["nickNames"] });
      // Then JSON array input is not mistaken for a scalar string field
      expect(result.values.nickNames).toEqual(["Al", "Alice"]);
    });

    it("loads a book's author and reviewer in one query when staging a create", async () => {
      // Given two authors who are not loaded in the Session
      await insertAuthor({ first_name: "Alice" });
      await insertAuthor({ first_name: "Bob" });
      const session = newSession();
      // When assigning both references in the same create command
      resetQueryCount();
      await session.apply({
        op: "create",
        type: "Book",
        $clientId: "b#1",
        values: { title: "Draft", author: "a:1", reviewer: "a:2" },
      });
      // Then both authors are fetched together
      expect(queries).toHaveLength(1);
    });

    it("rejects entity types that are not registered with Joist", async () => {
      // Given a Session using the application's registered entity metadata
      const session = newSession();
      // When a create command names an unknown type
      // Then it is rejected before any entity is created
      await expect(
        session.apply({ op: "create", type: "UnknownEntity", $clientId: "unknown#1", values: {} }),
      ).rejects.toThrow("Unknown type UnknownEntity");
    });
  });

  describe("applyBatch", () => {
    it("applies multi-field values and references in order through batch replay", async () => {
      // Given a batch whose later commands reference earlier creations
      const session = newSession();
      // When creating an author and book, then setting both scalar and relationship fields
      const targets = await session.applyBatch([
        { op: "create", type: "Author", $clientId: "a#1", values: { firstName: "Alice" } },
        { op: "create", type: "Book", $clientId: "b#1", values: { title: "Draft", author: "a#1" } },
        { op: "create", type: "Tag", $clientId: "t#1", values: { name: "draft" } },
        { op: "update", entity: "t#1", values: { name: "edited", books: ["b#1"] } },
        { op: "update", entity: "a#1", values: { firstName: "Alicia", lastName: "Smith" } },
      ]);
      // Then each command returns its ID in input order
      expect(targets).toEqual([{ id: "a#1" }, { id: "b#1" }, { id: "t#1" }, { id: "t#1" }, { id: "a#1" }]);
      // When previewing the batch
      const review = await session.previewChanges();
      if (review.status !== "valid") throw new Error("Expected a valid review");
      // Then each successful command advances the revision
      expect(review.revision).toEqual(5);
      // When committing the command log on a fresh manager
      await session.commitChanges();
      // Then the saved book links to the updated author and tag
      const authors = await select("authors");
      const books = await select("books");
      const tags = await select("tags");
      expect(authors).toMatchObject([{ first_name: "Alicia", last_name: "Smith" }]);
      expect(books).toMatchObject([{ title: "Draft", author_id: authors[0].id }]);
      expect(tags).toMatchObject([{ name: "edited" }]);
      expect(await select("books_to_tags")).toMatchObject([{ book_id: books[0].id, tag_id: tags[0].id }]);
    });

    it("retains successful batch commands and stops at a decoding failure", async () => {
      // Given a pending author
      const session = newSession();
      await session.apply({ op: "create", type: "Author", $clientId: "a#1", values: { firstName: "Alice" } });
      // When a later multi-field command has an unknown field
      // Then the batch propagates the first error
      await expect(
        session.applyBatch([
          { op: "update", entity: "a#1", values: { firstName: "Accepted", lastName: "Smith" } },
          { op: "update", entity: "a#1", values: { firstName: "Not applied", missingField: "invalid" } },
          { op: "create", type: "Tag", $clientId: "t#2", values: { name: "not reached" } },
        ]),
      ).rejects.toThrow("Unknown field missingField");
      // When reading the retained staging graph
      const author = await session.read({ entity: "a#1", fields: ["firstName", "lastName"] });
      // Then the successful edit remains and decoding did not partially apply the rejected command
      expect(author.values).toEqual({ firstName: "Accepted", lastName: "Smith" });
      // When reusing the skipped client ID and committing a fresh review
      await session.apply({ op: "create", type: "Tag", $clientId: "t#2", values: { name: "recovered" } });
      const review = await session.previewChanges();
      if (review.status !== "valid") throw new Error("Expected a valid review");
      await session.commitChanges();
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
        { op: "create", type: "Author", $clientId: "a#1", values: { firstName: "Alice" } },
        { op: "update", entity: "a#1", values: { firstName: "Same", lastName: "Same" } },
        { op: "create", type: "Tag", $clientId: "t#1", values: { name: "still applied" } },
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
      await session.apply({ op: "update", entity: "a#1", values: { firstName: "Alice", lastName: "Smith" } });
      const review = await session.previewChanges();
      if (review.status !== "valid") throw new Error("Expected a valid review");
      await session.commitChanges();
      // Then the command after the invalid domain values was retained
      expect(await select("tags")).toMatchObject([{ name: "still applied" }]);
    });

    it("can retry a whole update after a setter rejects part of a batch", async () => {
      // Given a paid advance whose terminal status cannot return to pending
      await insertPublisher({ name: "publisher" });
      await insertAuthor({ first_name: "Alice" });
      await insertBook({ title: "Published", author_id: 1 });
      await insertBookAdvance({ book_id: 1, publisher_id: 1, status_id: 3 });
      // And another book to assign the advance to
      await insertBook({ title: "Revised", author_id: 1 });
      const session = newSession();
      // When a batch creates a tag, changes the advance's book, and attempts the forbidden transition
      // Then the ordinary setter's error is propagated
      await expect(
        session.applyBatch([
          { op: "create", type: "Tag", $clientId: "t#1", values: { name: "retained" } },
          { op: "update", entity: "ba:1", values: { book: "b:2", status: AdvanceStatus.Pending } },
          { op: "create", type: "Tag", $clientId: "t#2", values: { name: "not reached" } },
        ]),
      ).rejects.toThrow("Cannot change status from Paid to Pending");
      // When reading the advance in the same Session
      const advance = await session.read({ entity: "ba:1", fields: ["book", "status"] });
      // Then the first setter took effect even though the second rejected the update
      expect(advance.values).toEqual({ book: "b:2", status: AdvanceStatus.Paid });
      // When previewing the commands that succeeded
      const preview = await session.previewChanges();
      if (preview.status !== "valid") throw new Error("Expected a valid preview");
      // Then only the first tag is included
      expect(preview.changes.map((change) => change.id)).toEqual(["t#1"]);
      // When retrying the whole update with the correct status and committing
      await session.apply({ op: "update", entity: "ba:1", values: { book: "b:2", status: AdvanceStatus.Paid } });
      await session.commitChanges();
      // Then the reassignment is saved even though the book already looked correct in the Session
      expect(await select("book_advances")).toMatchObject([{ book_id: 2, status_id: 3 }]);
    });
  });

  describe("entity identity", () => {
    it("registers explicit client IDs in the application's EntityManager", async () => {
      // Given an application-owned staging manager
      const em = newEntityManager();
      const session = new Session({ createEm: () => em });
      // When Session creates a tag with a non-sequential client ID
      await session.apply({ op: "create", type: "Tag", $clientId: "t#7", values: { name: "draft" } });
      // Then ordinary EM lookup resolves the entity with that same client identity
      expect(em.getEntity("t#7")?.$clientId).toEqual("t#7");
    });

    it("rejects duplicate client IDs before mutation", async () => {
      // Given a registered tag
      const session = newSession();
      await session.apply({ op: "create", type: "Tag", $clientId: "t#7", values: { name: "original" } });
      // When another creation claims that identity
      // Then the original registration cannot be reassigned
      await expect(
        session.apply({ op: "create", type: "Tag", $clientId: "t#7", values: { name: "replacement" } }),
      ).rejects.toThrow("Client id t#7 is already registered");
    });

    it("rejects a client ID with another entity's tag", async () => {
      // Given a workspace that allows authors and tags
      const session = newSession();
      // When creating a tag with an author identity
      // Then Joist's client ID validation rejects the wrong type
      await expect(
        session.apply({ op: "create", type: "Tag", $clientId: "a#7", values: { name: "draft" } }),
      ).rejects.toThrow("Invalid client id a#7; expected tag t for Tag");
    });

    it("does not reuse client IDs after deleting their creation", async () => {
      // Given a tag that was created and then deleted in the same workspace
      const session = newSession();
      await session.apply({ op: "create", type: "Tag", $clientId: "t#7", values: { name: "discarded" } });
      // And the caller removes it from the proposal
      await session.apply({ op: "delete", entity: "t#7" });
      // When another creation claims the deleted identity
      // Then the command log retains one meaning for that ID
      await expect(
        session.apply({ op: "create", type: "Tag", $clientId: "t#7", values: { name: "replacement" } }),
      ).rejects.toThrow("Client id t#7 is already registered");
    });

    it("keeps explicit client IDs stable when staging hooks create extra entities", async () => {
      // Given staging hooks that have already allocated additional client IDs
      const session = newSession();
      await session.apply({ op: "create", type: "Tag", $clientId: "t#1", values: { name: "create sibling" } });
      await session.validateChanges();
      await session.validateChanges();
      // And a later caller creation has its own explicit identity
      await session.apply({ op: "create", type: "Tag", $clientId: "t#7", values: { name: "caller tag" } });
      // When preview replays on a fresh EM without the accumulated staging history
      const review = await session.previewChanges();
      if (review.status !== "valid") throw new Error("Expected a valid review");
      // Then the caller's identity does not depend on replay creation order
      expect(review.changes.find((change) => change.fields.name.newValue === "caller tag")?.id).toEqual("t#7");
    });

    it("allows reads of hook-created tags but rejects commands that depend on them", async () => {
      // Given a generated sibling visible in advisory changes
      const session = newSession();
      await session.apply({ op: "create", type: "Tag", $clientId: "t#1", values: { name: "create sibling" } });
      await session.validateChanges();
      // When inspecting the sibling on the editing EM
      const sibling = await session.read({ entity: "t#2", fields: ["name"] });
      // Then its fields are available
      expect(sibling.values).toEqual({ name: "generated sibling" });
      // When using the sibling as a command target or a relationship value
      // Then both edits are rejected because the sibling does not exist before replay flushes
      const message =
        "Cannot use client ID t#2 in this command. No earlier create command in this Session supplied that ID.";
      await expect(session.apply({ op: "update", entity: "t#2", values: { name: "edited" } })).rejects.toThrow(message);
      await expect(
        session.apply({ op: "create", type: "Author", $clientId: "a#1", values: { tags: ["t#2"] } }),
      ).rejects.toThrow(message);
    });

    it("maps client IDs to committed database IDs for the replayed graph", async () => {
      // Given an explicitly identified author and book
      const session = newSession();
      await session.apply({ op: "create", type: "Author", $clientId: "a#7", values: { firstName: "Alice" } });
      // And the relationship uses the author's client ID
      await session.apply({
        op: "create",
        type: "Book",
        $clientId: "b#2",
        values: { title: "Draft", author: "a#7" },
      });
      const review = await session.previewChanges();
      if (review.status !== "valid") throw new Error("Expected a valid review");
      // When committing the reviewed graph on another fresh EM
      const result = await session.commitChanges();
      // Then the committed relationship points to the mapped author, not a speculative preview ID
      const [author] = await select("authors");
      const [book] = await select("books");
      expect(result.ids).toEqual({ "a#7": `a:${author.id}`, "b#2": `b:${book.id}` });
      expect(book.author_id).toEqual(author.id);
    });

    it("uses database identity for persisted entities without assigning client aliases", async () => {
      // Given a saved author with no client identity in this workspace
      await insertAuthor({ first_name: "Alice" });
      const em = newEntityManager();
      const session = new Session({ createEm: () => em });
      // When reading the author by its database ID
      await session.read({ entity: "a:1", fields: ["firstName"] });
      // Then loading a persisted row does not attach a client alias
      expect(em.getEntity("a:1")?.$clientId).toEqual(undefined);
    });
  });

  describe("read", () => {
    it("returns JSON without exposing staging entities", async () => {
      // Given a session with a staged tag
      const session = newSession();
      await session.apply({ op: "create", type: "Tag", $clientId: "t#1", values: { name: "draft" } });
      // When reading its fields
      const result = await session.read({ entity: "t#1", fields: ["name"] });
      // Then the caller receives only a JSON snapshot
      expect(JSON.parse(JSON.stringify(result))).toEqual({ id: "t#1", type: "Tag", values: { name: "draft" } });
    });

    it("keeps standalone read errors recoverable", async () => {
      // Given an editing session and a missing durable row
      const session = newSession();
      await expect(session.read({ entity: "t:404", fields: ["name"] })).rejects.toThrow();
      // When staging work after that failed read
      await session.apply({ op: "create", type: "Tag", $clientId: "t#1", values: { name: "still editable" } });
      // Then the failed read did not taint staging
      expect(await session.read({ entity: "t#1", fields: ["name"] })).toMatchObject({
        values: { name: "still editable" },
      });
    });

    it("batches a book's author and reviewer when reading both fields", async () => {
      // Given two different authors
      await insertAuthor({ first_name: "Alice" });
      await insertAuthor({ first_name: "Bob" });
      // And a book written by Alice and reviewed by Bob
      await insertBook({ title: "Draft", author_id: 1, reviewer_id: 2 });
      const session = newSession();
      // When reading both references on a fresh Session
      resetQueryCount();
      const book = await session.read({ entity: "b:1", fields: ["author", "reviewer"] });
      // Then one query loads the book and one loads both authors
      expect(book.values).toEqual({ author: "a:1", reviewer: "a:2" });
      expect(queries).toHaveLength(2);
    });
  });

  describe("query", () => {
    it("serializes application query results as JSON", async () => {
      // Given an existing tag
      await insertTag({ name: "existing" });
      // And a Session using the application's createEm
      const session = newSession();
      // When application code queries and serializes its selected fields
      const result = await session.query(async (em) => {
        const tags = await em.find(Tag, { name: "existing" });
        return Promise.all(tags.map((tag) => readSessionEntityData(tag, ["name"])));
      });
      // Then neither the entity nor its manager escapes
      expect(result).toEqual([{ id: "t:1", type: "Tag", values: { name: "existing" } }]);
    });

    it("runs trusted queries on the same staging EM as commands", async () => {
      // Given a tag created through the Session command log
      const session = newSession();
      await session.apply({ op: "create", type: "Tag", $clientId: "t#7", values: { name: "pending" } });
      // When application code queries the staging identity map
      const names = await session.query((em) => em.getEntities(Tag).map((tag) => tag.name));
      // Then the query sees the uncommitted tag without rebuilding the EM
      expect(names).toEqual(["pending"]);
    });

    it("uses database filter membership but staged field values for ordinary find", async () => {
      // Given a persisted tag whose name has a pending edit
      await insertTag({ name: "stored" });
      const session = newSession();
      await session.apply({ op: "update", entity: "t:1", values: { name: "staged" } });
      // When trusted application code finds the row by its stored name
      const names = await session.query(async (em) => {
        const tags = await em.find(Tag, { name: "stored" });
        return tags.map((tag) => tag.name);
      });
      // Then hydration preserves the pending edit on the shared entity
      expect(names).toEqual(["staged"]);
    });

    it("allows a trusted query to choose findWithNewOrChanged", async () => {
      // Given a new tag that ordinary database queries cannot return
      const session = newSession();
      await session.apply({ op: "create", type: "Tag", $clientId: "t#7", values: { name: "pending" } });
      // When application code explicitly requests an in-memory query overlay
      const names = await session.query(async (em) => {
        const tags = await em.findWithNewOrChanged(Tag, { name: "pending" });
        return tags.map((tag) => tag.name);
      });
      // Then the application's chosen ORM API includes the new entity
      expect(names).toEqual(["pending"]);
    });

    it("keeps queries on staging after preview uses a disposable EM", async () => {
      // Given a tag whose preview has been prepared on a fresh EM
      const managers: ReturnType<typeof newEntityManager>[] = [];
      const session = new Session({
        createEm: () => {
          const em = newEntityManager();
          managers.push(em);
          return em;
        },
      });
      await session.apply({ op: "create", type: "Tag", $clientId: "t#7", values: { name: "pending" } });
      await session.previewChanges();
      // When application code borrows the current editing EM
      const sameStaging = await session.query((em) => em === managers[0]);
      // Then the disposable preview EM has not replaced staging
      expect(sameStaging).toEqual(true);
    });

    it("does not replay query callbacks during preview or commit", async () => {
      // Given a staged tag and an application query
      const session = newSession();
      await session.apply({ op: "create", type: "Tag", $clientId: "t#7", values: { name: "pending" } });
      let queried = 0;
      await session.query((em) => {
        queried++;
        return em.getEntities(Tag).length;
      });
      // When previewing and committing the command log
      const review = await session.previewChanges();
      if (review.status !== "valid") throw new Error("Expected a valid review");
      await session.commitChanges();
      // Then only the original query invocation ran
      expect(queried).toEqual(1);
    });

    it("does not advance the command revision when application code queries staging", async () => {
      // Given a preview of one creation command
      const session = newSession();
      await session.apply({ op: "create", type: "Tag", $clientId: "t#7", values: { name: "pending" } });
      const review = await session.previewChanges();
      if (review.status !== "valid") throw new Error("Expected a valid review");
      // When querying and previewing the same commands again
      await session.query((em) => em.getEntities(Tag).map((tag) => tag.name));
      const next = await session.previewChanges();
      if (next.status !== "valid") throw new Error("Expected a valid review");
      // Then the query has not changed the command revision
      expect(next.revision).toEqual(review.revision);
    });

    it("keeps edits available after an ordinary read's database error", async () => {
      // Given a PostgreSQL read containing a NUL byte that text columns cannot represent
      const session = newSession();
      await expect(session.query((em) => em.find(Tag, { name: "bad\u0000name" }))).rejects.toThrow();
      // When issuing a valid read on the same workspace
      const result = await session.query((em) => em.find(Tag, {}));
      // Then a transient read failure does not poison the session
      expect(result).toEqual([]);
    });

    it("keeps staging editable after a query callback rejects", async () => {
      // Given a tag and an unsuccessful application query
      const session = newSession();
      await session.apply({ op: "create", type: "Tag", $clientId: "t#7", values: { name: "pending" } });
      await expect(
        session.query(() => {
          throw new Error("Query unavailable");
        }),
      ).rejects.toThrow("Query unavailable");
      // When correcting the tag after that read failure
      await session.apply({ op: "update", entity: "t#7", values: { name: "corrected" } });
      const names = await session.query((em) => em.getEntities(Tag).map((tag) => tag.name));
      // Then the callback failure did not taint the editing workspace
      expect(names).toEqual(["corrected"]);
    });

    it("holds the operation lock until an asynchronous query finishes", async () => {
      // Given an asynchronous query that is still using staging
      const session = newSession();
      let finishQuery!: () => void;
      const pending = new Promise<void>((resolve) => {
        finishQuery = resolve;
      });
      let queryStarted!: () => void;
      const started = new Promise<void>((resolve) => {
        queryStarted = resolve;
      });
      const querying = session.query(async (em) => {
        queryStarted();
        await pending;
        return em.getEntities(Tag).length;
      });
      await started;
      try {
        // When another command tries to mutate staging during the query
        // Then it cannot interleave with the callback
        await expect(
          session.apply({ op: "create", type: "Tag", $clientId: "t#7", values: { name: "too early" } }),
        ).rejects.toThrow("Session operation already in progress");
      } finally {
        finishQuery();
        await querying;
      }
    });

    it("does not elevate field permissions inside a query callback", async () => {
      // Given an application policy that denies caller reads of tag names
      class ReadPolicy extends Plugin {
        /** Enable per-access field checks without hiding the entity itself. */
        canViewEntity(): boolean {
          return true;
        }

        /** ORM-internal field access must not grant the callback permission. */
        beforeGetField(entity: Entity, field: string): void {
          if (field === "name" && getInstanceData(entity).data.name !== undefined) throw new Error("Cannot read name");
        }
      }
      const session = new Session({
        createEm: () => {
          const em = newEntityManager();
          em.addPlugin(new ReadPolicy());
          return em;
        },
      });
      await session.apply({ op: "create", type: "Tag", $clientId: "t#7", values: { name: "secret" } });
      // When application code reads the field through the general query API
      // Then the callback still uses normal caller permissions
      await expect(session.query((em) => em.getEntities(Tag).map((tag) => tag.name))).rejects.toThrow(
        "Cannot read name",
      );
    });
  });

  describe("validateChanges", () => {
    it("preserves structured validation errors", async () => {
      // Given an author rejected by an existing domain rule
      const session = newSession();
      await session.apply({
        op: "create",
        type: "Author",
        $clientId: "a#1",
        values: { firstName: "Alice", lastName: "NotAllowedLastName" },
      });
      // When requesting advisory validation
      const result = await session.validateChanges();
      // Then the error refers to the session entity and preserves its field and code
      expect(result).toMatchObject({
        status: "invalid",
        errors: [{ id: "a#1", field: "lastName", code: "invalid-name", message: "lastName is invalid" }],
      });
    });

    it("keeps the same physical EM after validation corrections", async () => {
      // Given a createEm callback that records each staging EM
      const managers: ReturnType<typeof newEntityManager>[] = [];
      const session = new Session({
        createEm: () => {
          const em = newEntityManager();
          managers.push(em);
          return em;
        },
      });
      // And a tag with a missing required name
      await session.apply({ op: "create", type: "Tag", $clientId: "t#1", values: {} });
      await session.validateChanges();
      // When correcting it and validating twice
      await session.apply({ op: "update", entity: "t#1", values: { name: "fixed" } });
      await session.validateChanges();
      await session.validateChanges();
      // Then no replacement manager was created
      expect(managers.length).toEqual(1);
    });

    it("can repeatedly validate new entities before their SQL-dependent fields are derived", async () => {
      // Given a new author and book whose derived values participate in flush
      const session = newSession();
      await session.apply({ op: "create", type: "Author", $clientId: "a#1", values: { firstName: "Alice" } });
      await session.apply({
        op: "create",
        type: "Book",
        $clientId: "b#1",
        values: { title: "Draft", author: "a#1" },
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
      await session.apply({ op: "create", type: "Tag", $clientId: "t#1", values: { name: "draft" } });
      // When validating repeatedly
      await session.validateChanges();
      await session.validateChanges();
      // Then no tag reached durable storage
      expect(await select("tags")).toEqual([]);
    });

    it("does not write SQL or begin a transaction during staging validation", async () => {
      // Given a publisher rename and a new review that will require RQF processing at preview
      await insertPublisher({ name: "publisher" });
      await insertAuthor({ first_name: "Alice", publisher_id: 1 });
      await insertBook({ title: "Draft", author_id: 1 });
      const session = newSession();
      await session.apply({ op: "update", entity: "p:1", values: { name: "renamed" } });
      await session.apply({
        op: "create",
        type: "BookReview",
        $clientId: "br#1",
        values: { book: "b:1", rating: 1 },
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

    it("retains many-to-many edits across pre-write validations", async () => {
      // Given an author tagged with a newly created tag
      const session = newSession();
      await session.apply({ op: "create", type: "Author", $clientId: "a#1", values: { firstName: "Alice" } });
      await session.apply({ op: "create", type: "Tag", $clientId: "t#1", values: { name: "tagged" } });
      await session.apply({ op: "add", entity: "a#1", field: "tags", value: "t#1" });
      await session.validateChanges();
      // When validating the same pending membership again
      const result = await session.validateChanges();
      if (result.status !== "valid") throw new Error("Expected valid changes");
      // Then its pending membership remains visible
      expect(result.changes.find((change) => change.id === "a#1")?.relationships.tags).toEqual({
        added: ["t#1"],
        removed: [],
      });
    });

    it("retains cascade deletes across pre-write validations", async () => {
      // Given a persisted author whose book is cascade-deleted
      await insertAuthor({ first_name: "Alice" });
      await insertBook({ title: "Draft", author_id: 1 });
      const session = newSession();
      await session.apply({ op: "delete", entity: "a:1" });
      await session.validateChanges();
      // When validating those pending deletions again
      const result = await session.validateChanges();
      if (result.status !== "valid") throw new Error("Expected valid deletions");
      // Then both effective deletions remain represented
      expect(result.changes.map((change) => change.id)).toEqual(["a:1", "b:1"]);
    });

    it("retains accepted commands after an unexpected validation flush failure", async () => {
      // Given a plugin that breaks the flush rather than returning validation feedback
      class Broken extends Plugin {
        /** Models a non-recoverable application failure during flush. */
        beforeValidate(): void {
          throw new Error("broken flush");
        }
      }
      const session = new Session({
        createEm: () => {
          const em = newEntityManager();
          em.addPlugin(new Broken());
          return em;
        },
      });
      await session.apply({ op: "create", type: "Tag", $clientId: "t#1", values: { name: "draft" } });
      await expect(session.validateChanges()).rejects.toThrow("broken flush");
      // When editing the tag after the failed flush
      await session.apply({ op: "update", entity: "t#1", values: { name: "retry" } });
      // Then the original creation is still available under its client ID
      expect((await session.read({ entity: "t#1", fields: ["name"] })).values).toEqual({ name: "retry" });
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
  });

  describe("transition recovery", () => {
    it("retries transition guards after correcting a validation failure", async () => {
      // Given an existing advance whose signature guard rejects the book
      await insertPublisher({ name: "publisher" });
      await insertAuthor({ first_name: "Alice" });
      await insertBook({ title: "Unapproved", author_id: 1 });
      await insertBookAdvance({ book_id: 1, publisher_id: 1 });
      const managers: ReturnType<typeof newEntityManager>[] = [];
      const session = new Session({
        createEm: () => {
          const em = newEntityManager();
          managers.push(em);
          return em;
        },
      });
      // And a signature followed by revocation, leaving no net status change
      await session.apply({ op: "update", entity: "ba:1", values: { status: AdvanceStatus.Signed } });
      await session.apply({ op: "update", entity: "ba:1", values: { status: AdvanceStatus.Pending } });
      const invalid = await session.validateChanges();
      if (invalid.status !== "invalid") throw new Error("Expected the signature guard to fail");
      // When correcting the book and validating the same transition history
      await session.apply({ op: "update", entity: "b:1", values: { title: "Approved" } });
      await session.validateChanges();
      // Then both transitions run after recovery on the original manager
      expect((managers[0].getEntity("ba:1") as BookAdvance).transientFields.transitions).toEqual([
        AdvanceStatus.Signed,
        AdvanceStatus.Pending,
      ]);
    });

    it("replays a partially run signature callback before validating corrected edits", async () => {
      // Given an advance whose signature callback records the transition and then rejects the book
      await insertPublisher({ name: "publisher" });
      await insertAuthor({ first_name: "Alice" });
      await insertBook({ title: "Missing contract", author_id: 1 });
      await insertBookAdvance({ book_id: 1, publisher_id: 1 });
      const session = newSession();
      // And an accepted command to sign the advance
      await session.apply({ op: "update", entity: "ba:1", values: { status: AdvanceStatus.Signed } });
      // When validating twice before correcting the book
      const invalid = { status: "invalid", errors: [{ id: "ba:1", message: "Missing signature contract" }] };
      // Then both attempts report the error, even though the first consumed the pending transition
      expect(await session.validateChanges()).toEqual(invalid);
      expect(await session.validateChanges()).toEqual(invalid);
      // When supplying the contract without resubmitting the signature
      await session.apply({ op: "update", entity: "b:1", values: { title: "Signed contract" } });
      const corrected = await session.validateChanges();
      // Then both signature callbacks have run once on the corrected book
      expect(corrected.status).toBe("valid");
      const advance = await session.query((em) => (em.getEntity("ba:1") as BookAdvance).transientFields);
      expect(advance.transitions).toEqual([AdvanceStatus.Signed]);
      expect(advance.signedTitle).toBe("Signed contract");
    });
  });

  describe("previewChanges", () => {
    it("retains relationship client IDs rather than provisional database IDs", async () => {
      // Given explicitly created author and book references
      const session = newSession();
      await session.apply({ op: "create", type: "Author", $clientId: "a#1", values: { firstName: "Alice" } });
      await session.apply({
        op: "create",
        type: "Book",
        $clientId: "b#1",
        values: { title: "Draft", author: "a#1" },
      });
      // When previewing after IDs have been allocated
      const review = await session.previewChanges();
      if (review.status !== "valid") throw new Error("Expected a valid review");
      // Then the reference still names the explicit creation
      expect(review.changes.find((change) => change.id === "b#1")?.fields.author).toEqual({
        oldValue: null,
        newValue: "a#1",
      });
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
        $clientId: "br#1",
        values: { book: "b:1", rating: 1 },
      });
      await session.validateChanges();
      // When previewing the pending review with real SQL and an RQF loop
      const result = await session.previewChanges();
      if (result.status !== "valid") throw new Error("Expected valid changes");
      // Then the publisher's SQL-derived value still includes the review
      expect(result.changes.find((change) => change.id === "p:1")?.fields.numberOfBookReviews.newValue).toEqual(1);
    });

    it("validates a publisher updated both before and during the RQF loop", async () => {
      // Given a persisted publisher with an author and book
      const updatedAt = new Date("2020-01-01T00:00:00.000Z");
      await insertPublisher({ name: "publisher", number_of_book_reviews: 0, updated_at: updatedAt });
      await insertAuthor({ first_name: "Alice", publisher_id: 1 });
      await insertBook({ title: "Draft", author_id: 1 });
      const session = newSession();
      // And a rename that writes the publisher before its review count is recalculated
      await session.apply({ op: "update", entity: "p:1", values: { name: "renamed" } });
      // And a review that changes the same publisher's count after the first write
      await session.apply({
        op: "create",
        type: "BookReview",
        $clientId: "br#1",
        values: { book: "b:1", rating: 1 },
      });
      // When preview derives the count after staging validation
      await session.validateChanges();
      const result = await session.previewChanges();
      // Then the preview shows the count rising from zero to one, but rollback leaves the stored count at zero
      if (result.status !== "valid") throw new Error("Expected a valid preview");
      expect(result.changes.find((change) => change.id === "p:1")?.fields.numberOfBookReviews).toEqual({
        oldValue: 0,
        newValue: 1,
      });
      expect(await select("publishers")).toMatchObject([
        { name: "publisher", number_of_book_reviews: 0, updated_at: updatedAt },
      ]);
    });

    it("defers commit-rule failures until preview", async () => {
      // Given three schedules that violate the SQL-dependent commit rule
      const session = newSession();
      await session.apply({ op: "create", type: "Author", $clientId: "a#1", values: { firstName: "Alice" } });
      for (const $clientId of ["authorSchedule#1", "authorSchedule#2", "authorSchedule#3"]) {
        await session.apply({ op: "create", type: "AuthorSchedule", $clientId, values: { author: "a#1" } });
      }
      // When asking only for pre-write feedback
      const result = await session.validateChanges();
      // Then staging explicitly reports partial coverage rather than executing the commit rule
      expect(result).toMatchObject({ status: "valid", scope: "pre-write" });
    });

    it("keeps staging editable after preview rejects a commit rule", async () => {
      // Given three schedules that violate the real post-write rule
      const session = newSession();
      await session.apply({ op: "create", type: "Author", $clientId: "a#1", values: { firstName: "Alice" } });
      for (const $clientId of ["authorSchedule#1", "authorSchedule#2", "authorSchedule#3"]) {
        await session.apply({ op: "create", type: "AuthorSchedule", $clientId, values: { author: "a#1" } });
      }
      const invalid = await session.previewChanges();
      if (invalid.status !== "invalid") throw new Error("Expected the commit rule to reject three schedules");
      // When correcting the same staging graph and trying again
      await session.apply({ op: "delete", entity: "authorSchedule#3" });
      const corrected = await session.previewChanges();
      // Then fresh replay sees the corrected graph
      expect(corrected.status).toEqual("valid");
    });

    it("previews one hook-created sibling even after validating twice", async () => {
      // Given a tag whose beforeCreate hook creates a sibling tag
      const session = newSession();
      await session.apply({ op: "create", type: "Tag", $clientId: "t#1", values: { name: "create sibling" } });
      // When validating the same tag twice on the editing EM
      await session.validateChanges();
      await session.validateChanges();
      // Then staging has just one generated sibling
      expect(
        await session.query((em) =>
          em
            .getEntities(Tag)
            .map((tag) => tag.name)
            .sort(),
        ),
      ).toEqual(["create sibling", "generated sibling"]);
      // When preview replays the create command on a fresh EM
      const review = await session.previewChanges();
      if (review.status !== "valid") throw new Error("Expected a valid review");
      // Then the preview contains the original tag and one sibling
      expect(review.changes.map((change) => change.fields.name.newValue).sort()).toEqual([
        "create sibling",
        "generated sibling",
      ]);
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
        createEm: () => {
          const em = newEntityManager();
          em.addPlugin(new ReadPolicy());
          return em;
        },
      });
      await session.apply({ op: "create", type: "Tag", $clientId: "t#1", values: { name: "secret" } });
      // When serializing the effective changes outside trusted execution
      // Then internal access does not become an authorization bypass
      await expect(session.previewChanges()).rejects.toThrow("Cannot read name");
    });

    it("does not allow returned JSON to modify logged intent", async () => {
      // Given a reviewed tag and a caller that changes its returned copy
      const session = newSession();
      await session.apply({ op: "create", type: "Tag", $clientId: "t#1", values: { name: "reviewed" } });
      const review = await session.previewChanges();
      if (review.status !== "valid") throw new Error("Expected a valid review");
      review.changes[0].fields.name.newValue = "tampered";
      // When committing the logged commands
      await session.commitChanges();
      // Then the original command value becomes durable
      expect(await select("tags")).toMatchObject([{ name: "reviewed" }]);
    });
  });

  describe("commitChanges", () => {
    it("commits without validation or preview", async () => {
      // Given a pending tag that has not been validated or previewed
      const session = newSession();
      await session.apply({ op: "create", type: "Tag", $clientId: "t#1", values: { name: "saved directly" } });
      // When the application chooses to save it
      await session.commitChanges();
      // Then the ordinary flush persists the tag
      expect(await select("tags")).toMatchObject([{ name: "saved directly" }]);
    });

    it("runs ordinary validation when committing without preview", async () => {
      // Given a pending tag with a missing required name
      const session = newSession();
      await session.apply({ op: "create", type: "Tag", $clientId: "t#1", values: {} });
      // When committing without a separate validation or preview
      // Then ordinary flush validation still rejects it
      await expect(session.commitChanges()).rejects.toThrow(ValidationErrors);
    });

    it("previews and commits the corrected intent on fresh managers", async () => {
      // Given original work followed by a validation correction
      const session = newSession();
      await session.apply({ op: "create", type: "Tag", $clientId: "t#1", values: {} });
      await session.validateChanges();
      await session.apply({ op: "update", entity: "t#1", values: { name: "fixed" } });
      // When reviewing and approving the corrected log
      const review = await session.previewChanges();
      if (review.status !== "valid") throw new Error("Expected a valid review");
      await session.commitChanges();
      // Then exactly the reviewed tag is committed
      expect(await select("tags")).toMatchObject([{ name: "fixed" }]);
    });

    it("commits replayed intent without comparing against the advisory preview", async () => {
      // Given an approved rename
      await insertTag({ name: "original" });
      const session = newSession();
      await session.apply({ op: "update", entity: "t:1", values: { name: "reviewed" } });
      const review = await session.previewChanges();
      if (review.status !== "valid") throw new Error("Expected a valid review");
      // And a different writer changes the approved original
      const other = newEntityManager();
      const tag = await other.load(Tag, "t:1");
      tag.name = "concurrent";
      await other.flush();
      // When trying to commit the old review
      await session.commitChanges();
      // Then the ordinary fresh flush applies the requested name
      expect(await select("tags")).toMatchObject([{ name: "reviewed" }]);
    });

    it("commits changes made after an optional preview", async () => {
      // Given a previewed new tag
      const session = newSession();
      await session.apply({ op: "create", type: "Tag", $clientId: "t#1", values: { name: "reviewed" } });
      const review = await session.previewChanges();
      if (review.status !== "valid") throw new Error("Expected a valid review");
      // And an edit after preview
      await session.apply({ op: "update", entity: "t#1", values: { name: "unreviewed" } });
      // When committing without another preview
      await session.commitChanges();
      // Then the current commands are saved, not the earlier preview
      expect(await select("tags")).toMatchObject([{ name: "unreviewed" }]);
    });

    it("commits reviewed many-to-many changes", async () => {
      // Given an existing author and a new tag
      await insertAuthor({ first_name: "Alice" });
      const session = newSession();
      await session.apply({ op: "create", type: "Tag", $clientId: "t#1", values: { name: "tagged" } });
      await session.apply({ op: "add", entity: "a:1", field: "tags", value: "t#1" });
      // When reviewing and committing the log
      const review = await session.previewChanges();
      if (review.status !== "valid") throw new Error("Expected a valid review");
      await session.commitChanges();
      // Then one join row reached the database
      expect((await select("authors_to_tags")).length).toEqual(1);
    });

    it("commits hook-created entities together with caller intent", async () => {
      // Given a reviewed parent whose hook creates a sibling
      const session = newSession();
      await session.apply({ op: "create", type: "Tag", $clientId: "t#1", values: { name: "create sibling" } });
      const review = await session.previewChanges();
      if (review.status !== "valid") throw new Error("Expected a valid review");
      // When committing through a fresh ordinary flush
      await session.commitChanges();
      // Then both reviewed entities are durable
      expect((await select("tags")).map((row) => row.name).sort()).toEqual(["create sibling", "generated sibling"]);
    });

    it("commits a create-then-delete log without reporting a nonexistent ID", async () => {
      // Given a creation that the caller undoes before review
      const session = newSession();
      await session.apply({ op: "create", type: "Tag", $clientId: "t#1", values: { name: "temporary" } });
      await session.apply({ op: "delete", entity: "t#1" });
      const review = await session.previewChanges();
      if (review.status !== "valid") throw new Error("Expected a valid empty review");
      // When committing that effective no-op
      const result = await session.commitChanges();
      // Then the result contains no durable identity for the discarded creation
      expect(result).toEqual({ ids: {} });
      expect(await select("tags")).toEqual([]);
    });

    it("rejects a second commit after saving without preview", async () => {
      // Given a Session whose tag has already been saved
      const session = newSession();
      await session.apply({ op: "create", type: "Tag", $clientId: "t#1", values: { name: "saved once" } });
      await session.commitChanges();
      // When the application tries to save the same Session again
      // Then the completed Session cannot replay a duplicate insert
      await expect(session.commitChanges()).rejects.toThrow("Session is committed");
      expect(await select("tags")).toMatchObject([{ name: "saved once" }]);
    });

    it("rejects reuse after an after-commit failure with a durable write", async () => {
      // Given an effect that fails after the database commit
      const session = new Session({
        createEm: () => {
          const em = newEntityManager();
          em.afterCommit(() => {
            throw new Error("effect failed");
          });
          return em;
        },
      });
      await session.apply({ op: "create", type: "Tag", $clientId: "t#1", values: { name: "committed" } });
      const review = await session.previewChanges();
      if (review.status !== "valid") throw new Error("Expected a valid review");
      await expect(session.commitChanges()).rejects.toThrow("effect failed");
      // When attempting to prepare another commit of that intent
      // Then ambiguous retries are rejected instead of duplicating a durable write
      await expect(session.previewChanges()).rejects.toThrow("tainted");
      expect(await select("tags")).toMatchObject([{ name: "committed" }]);
    });
  });

  describe("commit hooks", () => {
    it("skips transaction beforeCommit checks during staging validation", async () => {
      // Given a veto followed by another transaction check that queries the inserted tag
      let checkedTags = 0;
      const session = new Session({
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
      await session.apply({ op: "create", type: "Tag", $clientId: "t#1", values: { name: "draft" } });
      // When validating without attempting to commit
      await session.validateChanges();
      // Then neither transaction callback runs
      expect(checkedTags).toEqual(0);
    });

    it("skips transaction beforeCommit callbacks during preview", async () => {
      // Given a transaction callback that vetoes persistence
      const session = new Session({
        createEm: () => {
          const em = newEntityManager();
          em.beforeCommit(() => {
            throw new ValidationErrors("transaction veto");
          });
          return em;
        },
      });
      await session.apply({ op: "create", type: "Tag", $clientId: "t#1", values: { name: "draft" } });
      // When preparing a review
      const result = await session.previewChanges();
      // Then the transaction veto is outside the preview contract
      expect(result.status).toEqual("valid");
    });

    it("does not run successful-after-commit effects during validation or review", async () => {
      // Given a createEm callback that registers an after-commit effect
      let effects = 0;
      const session = new Session({
        createEm: () => {
          const em = newEntityManager();
          em.afterCommit(() => {
            effects++;
          });
          return em;
        },
      });
      await session.apply({ op: "create", type: "Tag", $clientId: "t#1", values: { name: "draft" } });
      // When executing both speculative paths
      await session.validateChanges();
      await session.previewChanges();
      // Then neither reports a successful commit
      expect(effects).toEqual(0);
    });

    it("runs successful-after-commit effects only for the real commit", async () => {
      // Given a createEm callback that registers an after-commit effect
      let effects = 0;
      const session = new Session({
        createEm: () => {
          const em = newEntityManager();
          em.afterCommit(() => {
            effects++;
          });
          return em;
        },
      });
      await session.apply({ op: "create", type: "Tag", $clientId: "t#1", values: { name: "draft" } });
      await session.validateChanges();
      const review = await session.previewChanges();
      if (review.status !== "valid") throw new Error("Expected a valid review");
      // When committing the reviewed log
      await session.commitChanges();
      // Then exactly one successful commit effect was released
      expect(effects).toEqual(1);
    });
  });

  describe("EM creation and lifecycle", () => {
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
      await session.apply({ op: "create", type: "Tag", $clientId: "t#1", values: { name: "draft" } });
      await session.validateChanges();
      const review = await session.previewChanges();
      if (review.status !== "valid") throw new Error("Expected a valid review");
      // Then neither execution persists the tag
      expect(await select("tags")).toEqual([]);
      // When committing the reviewed tag through another initialized application EM
      await session.commitChanges();
      // Then the original context and plugin execute in all three roles
      expect(requests).toEqual(["1:draft", "2:draft", "3:draft"]);
      // And the ordinary commit persists the tag
      expect(await select("tags")).toMatchObject([{ name: "draft" }]);
      // When attempting another operation after success
      // Then the Session remains terminal
      await expect(session.validateChanges()).rejects.toThrow("Session is committed");
    });

    it("enforces plugins installed by createEm when committing", async () => {
      // Given authorization that permits the reviewed work
      const permission = { allowed: true };
      class Authorize extends Plugin {
        /** Rejects writes when the request no longer has permission. */
        beforeValidate(): void {
          if (!permission.allowed) throw new Error("Permission denied");
        }
      }
      const session = new Session({
        createEm: () => {
          const em = newEntityManager();
          em.addPlugin(new Authorize());
          return em;
        },
      });
      await session.apply({ op: "create", type: "Tag", $clientId: "t#1", values: { name: "draft" } });
      await session.validateChanges();
      const review = await session.previewChanges();
      if (review.status !== "valid") throw new Error("Expected a valid review");
      // And permission is revoked before commit
      permission.allowed = false;
      // When committing the reviewed log
      // Then a fresh plugin still denies the operation
      await expect(session.commitChanges()).rejects.toThrow("Permission denied");
    });

    it("can retry a create with the same client ID after createEm fails", async () => {
      // Given a context service that is initially unavailable to createEm
      let unavailable = true;
      const session = new Session({
        createEm: async () => {
          await Promise.resolve();
          if (unavailable) throw new Error("Context unavailable");
          return newEntityManager();
        },
      });
      // When staging while initialization fails
      // Then the caller sees the context error
      await expect(
        session.apply({ op: "create", type: "Tag", $clientId: "t#1", values: { name: "lost" } }),
      ).rejects.toThrow("Context unavailable");
      // And the context service recovers
      unavailable = false;
      // When retrying the same client ID and committing
      await session.apply({ op: "create", type: "Tag", $clientId: "t#1", values: { name: "saved" } });
      const review = await session.previewChanges();
      if (review.status !== "valid") throw new Error("Expected a valid review");
      await session.commitChanges();
      // Then only the accepted command was replayed
      expect(await select("tags")).toMatchObject([{ name: "saved" }]);
    });

    it("retains staged edits when createEm fails during preview", async () => {
      // Given a staged tag and a context service that createEm depends on
      let unavailable = false;
      const session = new Session({
        createEm: async () => {
          await Promise.resolve();
          if (unavailable) throw new Error("Context unavailable");
          return newEntityManager();
        },
      });
      await session.apply({ op: "create", type: "Tag", $clientId: "t#1", values: { name: "draft" } });
      // And the context service becomes unavailable before preview
      unavailable = true;
      // When requesting a preview
      // Then the context error reaches the caller
      await expect(session.previewChanges()).rejects.toThrow("Context unavailable");
      // And the context service recovers
      unavailable = false;
      // When correcting the retained tag and obtaining a new preview
      await session.apply({ op: "update", entity: "t#1", values: { name: "corrected" } });
      const review = await session.previewChanges();
      if (review.status !== "valid") throw new Error("Expected a valid review");
      await session.commitChanges();
      // Then replay includes the original creation and its correction
      expect(await select("tags")).toMatchObject([{ name: "corrected" }]);
    });

    it("can retry commit after createEm fails", async () => {
      // Given a pending tag and a context service that createEm depends on
      let unavailable = false;
      const session = new Session({
        createEm: async () => {
          await Promise.resolve();
          if (unavailable) throw new Error("Context unavailable");
          return newEntityManager();
        },
      });
      await session.apply({ op: "create", type: "Tag", $clientId: "t#1", values: { name: "draft" } });
      // And the context service becomes unavailable before commit
      unavailable = true;
      // When committing the pending command
      // Then the context error reaches the caller
      await expect(session.commitChanges()).rejects.toThrow("Context unavailable");
      // And the context service recovers
      unavailable = false;
      // When retrying the commit now that createEm can return an EM
      await session.commitChanges();
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
        createEm: async () => {
          await initialized;
          return newEntityManager();
        },
      });
      const applying = session.applyBatch([
        { op: "create", type: "Tag", $clientId: "t#1", values: { name: "draft" } },
        { op: "update", entity: "t#1", values: { name: "edited" } },
      ]);
      try {
        // When another operation tries to use staging before initialization finishes
        // Then it cannot start another execution
        await expect(session.validateChanges()).rejects.toThrow("Session operation already in progress");
      } finally {
        finishInitialization();
        await applying;
      }
      // When reading after the original operation finishes
      const tag = await session.read({ entity: "t#1", fields: ["name"] });
      // Then both sequential commands completed on the initialized staging graph
      expect(tag.values).toEqual({ name: "edited" });
    });
  });
});

/** Creates each EM with the application's normal plugins and context. */
function newSession() {
  return new Session({
    createEm: newEntityManager,
  });
}
