import { type Entity, Plugin, runInTrustedContext } from "joist-orm";
import {
  Author,
  Book,
  type BookOpts,
  Comment,
  Image,
  ImageType,
  LargePublisher,
  SmallPublisher,
  Tag,
  newBook,
} from "src/entities";
import { insertAuthor, insertBook, select } from "src/entities/inserts";
import { jan1 } from "src/testDates";
import { newEntityManager, queries, resetQueryCount } from "src/testEm";

describe("EntityManager.clientIds", () => {
  describe("create", () => {
    it("assigns explicit identity independently of creation order", () => {
      // Given an unrelated author was created first
      const em = newEntityManager();
      em.create(Author, { firstName: "Other" });
      // When the caller supplies its own identity
      const author = em.create(Author, { $clientId: "a#7", firstName: "Ursula" });
      // Then client identity exists without a database identity
      expect(author).toMatchEntity({ $clientId: "a#7", idMaybe: undefined });
    });

    it("skips explicitly occupied identities during automatic allocation", () => {
      // Given the second automatic identity is already reserved
      const em = newEntityManager();
      em.create(Author, { $clientId: "a#2", firstName: "Explicit" });
      // And the first automatic identity is used
      em.create(Author, { firstName: "First" });
      // When another automatic author is created
      const author = em.create(Author, { firstName: "Next" });
      // Then allocation skips the reserved identity
      expect(author.$clientId).toEqual("a#3");
    });

    it("rejects creation using an occupied automatic identity", () => {
      // Given an author already owns the automatic identity
      const em = newEntityManager();
      em.create(Author, { firstName: "First" });
      // When another author requests that identity
      // Then creation fails rather than selecting or replacing the first author
      expect(() => em.create(Author, { $clientId: "a#1", firstName: "Second" })).toThrow(
        "Client id a#1 is already registered",
      );
    });

    it("rejects database-shaped client IDs at the public boundary", () => {
      // Given an EM without any authors
      const em = newEntityManager();
      // When a database ID is supplied as client identity
      // Then runtime validation rejects it
      expect(() => {
        em.create(Author, { $clientId: "a:7", firstName: "Ursula" });
      }).toThrow("Invalid client id a:7");
    });

    it("rejects a client ID for the wrong entity family", () => {
      // Given a client identity for books
      const em = newEntityManager();
      const id = em.create(Book, { $clientId: "b#7", title: "Earthsea" }).$clientId!;
      // When it is used to identify an author
      // Then runtime validation rejects the wrong tag
      expect(() => {
        em.create(Author, { $clientId: id, firstName: "Ursula" });
      }).toThrow("expected tag a for Author");
    });

    it("rejects a client ID in create's id option", () => {
      // Given an empty EM
      const em = newEntityManager();
      // When creation receives a client ID as the database primary key
      // Then it rejects the client ID instead of assigning it to the database id
      expect(() => em.create(Author, { id: "a#7", firstName: "Ursula" })).toThrow("id must be a database id");
    });

    it("accepts typed creation options with client relationship inputs", () => {
      // Given an author available by client identity
      const em = newEntityManager();
      const author = em.create(Author, { $clientId: "a#7", firstName: "Ursula" });
      const opts: BookOpts = { title: "Earthsea", author: author.$clientId! };
      // When a book is created using those public options
      const book = em.create(Book, { ...opts, $clientId: "b#2" });
      // Then the typed client reference resolves to the author
      expect(book.author.isLoaded).toBe(true);
    });

    it("maintains inverse relationships for client references", () => {
      // Given an author available by client identity
      const em = newEntityManager();
      const author = em.create(Author, { $clientId: "a#7", firstName: "Ursula" });
      // When a book refers to that author
      const book = em.create(Book, { title: "Earthsea", author: "a#7" });
      // Then the inverse collection includes the book immediately
      expect(author.books.get).toMatchEntity([book]);
    });

    it("rejects wrong-family relationship targets clearly", () => {
      // Given a registered tag
      const em = newEntityManager();
      em.create(Tag, { $clientId: "t#7", name: "Fantasy" });
      // When a book uses it as an author
      // Then the actual target must be an author, not a tag
      expect(() => em.create(Book, { title: "Earthsea", author: "t#7" })).toThrow("t#7 is Tag but should be Author");
    });

    it("checks target visibility for synchronous create references", () => {
      // Given a registered author hidden from callers
      const em = newEntityManager();
      em.create(Author, { $clientId: "a#7", firstName: "Hidden" });
      em.addPlugin(new HideClientId("a#7"));
      // When a book refers to the hidden author
      // Then client references do not bypass visibility
      expect(() => em.create(Book, { title: "Earthsea", author: "a#7" })).toThrow("a#7 was not found");
    });

    it("does not parse caller-supplied client identity suffixes", () => {
      // Given an EM without registered authors
      const em = newEntityManager();
      // When creation supplies a nonnumeric client identity
      const author = em.create(Author, { $clientId: "a#draft", firstName: "Ursula" });
      // Then the caller's identity is preserved without interpreting its suffix
      expect(author.$clientId).toEqual("a#draft");
    });

    it("retains required creation-option types when assigning client identity", async () => {
      // Given an empty EM
      const em = newEntityManager();
      // When creation supplies identity but omits the required author name
      // @ts-expect-error Client identity does not replace required domain fields
      em.create(Author, { $clientId: "a#7" });
      // Then runtime validation also rejects the incomplete author
      await expect(em.flush()).rejects.toThrow("firstName is required");
    });

    it("checks the concrete client target type during synchronous creation", () => {
      // Given a large publisher with a client ID in the shared publisher namespace
      const em = newEntityManager();
      em.create(LargePublisher, { $clientId: "p#7", name: "Large", rating: 1 });
      // When a small publisher uses it for a small-publisher-only relationship
      // Then the relationship rejects the incompatible target
      expect(() => em.create(SmallPublisher, { name: "Small", selfReferential: "p#7" })).toThrow(
        "p#7 is LargePublisher but should be SmallPublisher",
      );
    });

    it("assigns automatic identity when creation explicitly supplies an undefined client ID", () => {
      // Given an empty EM
      const em = newEntityManager();
      // When an author is created with an explicitly undefined client ID
      const author = em.create(Author, { $clientId: undefined, firstName: "Ursula" });
      // Then the creation-only option is ignored and automatic identity is assigned
      expect(author.$clientId).toEqual("a#1");
    });

    it("accepts frozen creation inputs with an explicit client ID", () => {
      // Given an author input that the caller does not allow Joist to mutate
      const em = newEntityManager();
      const opts = Object.freeze({ $clientId: "a#7", firstName: "Ursula" });
      // When an author is created from that input
      const author = em.create(Author, opts);
      // Then creation uses the requested identity without changing the frozen input
      expect(author.$clientId).toEqual("a#7");
    });
  });

  describe("upsert", () => {
    it("selects an already registered automatic identity during upsert", async () => {
      // Given an author with an automatic client ID
      const em = newEntityManager();
      const author = em.create(Author, { firstName: "Original" });
      // When upsert addresses that identity
      const updated = await em.upsert(Author, { id: author.$clientId, firstName: "Updated" });
      // Then it updates the canonical author rather than creating a duplicate
      expect(updated).toMatchEntity(author);
      // And the ordinary partial update is applied
      expect(author.firstName).toEqual("Updated");
    });

    it("assigns an automatic client ID when upsert creates an entity", async () => {
      // Given an empty EM
      const em = newEntityManager();
      // When an author is upserted without an ID
      const author = await em.upsert(Author, { firstName: "Ursula" });
      // Then the new entity receives the normal automatic client ID
      expect(author).toMatchEntity({ $clientId: "a#1", isNewEntity: true, idMaybe: undefined });
    });

    it("selects the same registered client ID during concurrent upserts", async () => {
      // Given an author already registered by client ID
      const em = newEntityManager();
      em.create(Author, { $clientId: "a#7", firstName: "Original" });
      // When two upserts address that same identity
      const authors = await Promise.all([
        em.upsert(Author, { id: "a#7", firstName: "Ursula" }),
        em.upsert(Author, { id: "a#7", lastName: "Le Guin" }),
      ]);
      // Then both operations select the same canonical entity
      expect(authors[0]).toMatchEntity(authors[1]);
    });

    it("rejects the client-ID assignment option in upsert", async () => {
      // Given an existing author
      await insertAuthor({ first_name: "Ursula" });
      const em = newEntityManager();
      await em.load(Author, "a:1");
      // When upsert supplies the creation-only client-ID option
      // Then both its input type and runtime reject that option
      // @ts-expect-error Client IDs are assigned through create or createPartial, not upsert
      await expect(em.upsert(Author, { id: "a:1", $clientId: "a#7" })).rejects.toThrow(
        "$clientId can only be assigned by em.create or em.createPartial",
      );
    });

    it("selects an entity by its retained client ID after flush", async () => {
      // Given a persisted author retaining its creation alias
      const em = newEntityManager();
      const author = em.create(Author, { $clientId: "a#7", firstName: "Original" });
      await em.flush();
      // When upsert addresses its original client ID
      const updated = await em.upsert(Author, { id: author.$clientId, firstName: "Updated" });
      // Then it selects the same entity
      expect(updated).toMatchEntity(author);
    });

    it("rejects an unknown client ID instead of creating an entity for it", async () => {
      // Given an EM without the requested author
      const em = newEntityManager();
      // When upsert addresses an unregistered client ID
      // Then id keeps its existing lookup-only meaning
      await expect(em.upsert(Author, { id: "a#7", firstName: "Ursula" })).rejects.toThrow("a#7 was not found");
    });

    it("rejects debug strings as relationship identities", async () => {
      // Given a registered author
      const em = newEntityManager();
      em.create(Author, { $clientId: "a#7", firstName: "Ursula" });
      // When a formatted debug string is used as a reference
      // Then it is rejected instead of becoming a database key
      await expect(em.upsert(Book, { title: "Earthsea", author: "a#7:123" })).rejects.toThrow("a#7:123 was not found");
    });

    it("accepts client references in upsert's collections", async () => {
      // Given a tag available by client identity
      const em = newEntityManager();
      const tag = em.create(Tag, { $clientId: "t#7", name: "Fantasy" });
      // When a book includes the tag by identity
      const book = await em.upsert(Book, { title: "Earthsea", tags: [tag.$clientId!] });
      // Then the collection contains the real entity
      expect(await book.tags.load()).toMatchEntity([tag]);
    });

    it("accepts client references in upsert's inverse to-one inputs", async () => {
      // Given an image available by client identity
      const em = newEntityManager();
      const image = em.create(Image, { $clientId: "i#7", type: ImageType.AuthorImage, fileName: "ursula.png" });
      // When an author assigns its image
      const author = await em.upsert(Author, { firstName: "Ursula", image: image.$clientId! });
      // Then the inverse reference resolves to the real image
      expect(await author.image.load()).toMatchEntity(image);
    });

    it("accepts polymorphic client references", async () => {
      // Given an author available by client identity
      const em = newEntityManager();
      const author = em.create(Author, { $clientId: "a#7", firstName: "Ursula" });
      // When a comment refers to the author through a polymorphic field
      const comment = await em.upsert(Comment, { parent: author.$clientId!, text: "A note" });
      // Then the polymorphic target is resolved
      expect(await comment.parent.load()).toMatchEntity(author);
    });

    it("rejects polymorphic client targets outside the allowed components", async () => {
      // Given a tag, which cannot be a comment parent
      const em = newEntityManager();
      em.create(Tag, { $clientId: "t#7", name: "Fantasy" });
      // When a comment uses that tag as its parent
      // Then the relationship rejects the wrong entity type
      await expect(em.upsert(Comment, { parent: "t#7" })).rejects.toThrow(
        "Tag#7 cannot be set as 'parent' on Comment#1",
      );
    });

    it("rejects an incompatible subtype sharing the same tag", async () => {
      // Given a large publisher in the shared publisher namespace
      const em = newEntityManager();
      em.create(LargePublisher, { $clientId: "p#7", name: "Large", rating: 1 });
      // When a small publisher points its small-publisher-only reference at it
      // Then family-tag equality does not bypass concrete type checks
      await expect(em.upsert(SmallPublisher, { name: "Small", selfReferential: "p#7" })).rejects.toThrow(
        "is LargePublisher but should be SmallPublisher",
      );
    });

    it("mixes client and persisted targets without an early flush", async () => {
      // Given a persisted reviewer
      await insertAuthor({ first_name: "Reviewer" });
      const em = newEntityManager();
      // And a new author
      em.create(Author, { $clientId: "a#7", firstName: "Ursula" });
      // When a new book combines both targets and the graph is flushed once
      await em.upsert(Book, { title: "Earthsea", author: "a#7", reviewer: "a:1" });
      await em.flush();
      // Then both foreign keys refer to their real database rows
      expect(await select("books")).toMatchObject([{ author_id: 2, reviewer_id: 1, title: "Earthsea" }]);
    });

    it("resurrects by a persisted parent referred to through a client alias", async () => {
      // Given an author created with a client ID and already flushed
      const em = newEntityManager();
      em.create(Author, { $clientId: "a#7", firstName: "Ursula" });
      await em.flush();
      // And its book was soft-deleted
      await insertBook({ title: "Earthsea", author_id: 1, deleted_at: jan1 });
      // When the book's unique identity uses that alias
      const book = await em.upsert(Book, { title: "Earthsea", authorId: "a#7" });
      // Then resurrection uses the real parent rather than sending its alias to SQL
      expect(book).toMatchEntity({ id: "b:1", $clientId: undefined, deletedAt: undefined, isNewEntity: false });
    });

    it("keeps explicit-null creation distinct from resurrection", async () => {
      // Given an author that omitted-ID upsert could resurrect
      await insertAuthor({ first_name: "Old", ssn: "123", deleted_at: jan1 });
      const em = newEntityManager();
      // When upsert supplies an explicit null ID
      const author = await em.upsert(Author, { id: null, ssn: "123", firstName: "New" });
      // Then creation is forced as before
      expect(author).toMatchEntity({ isNewEntity: true, idMaybe: undefined, $clientId: "a#1" });
    });

    it("selects nested to-one targets by client identity instead of patching the current target", async () => {
      // Given a persisted author with a mentor
      await insertAuthor({ first_name: "Old mentor" });
      await insertAuthor({ first_name: "Student", mentor_id: 1 });
      const em = newEntityManager();
      // And a separately registered mentor
      const mentor = em.create(Author, { $clientId: "a#7", firstName: "New mentor" });
      // When nested upsert supplies the new mentor's identity
      const author = await em.upsert(Author, { id: "a:2", mentor: { id: "a#7", lastName: "Updated" } });
      // Then the selected mentor replaces the old target
      expect(await author.mentor.load()).toMatchEntity(mentor);
    });

    it("updates a pre-created nested entity by client ID", async () => {
      // Given an author registered before its nested fields are supplied
      const em = newEntityManager();
      const author = em.createPartial(Author, { $clientId: "a#7" });
      // When a book's nested input selects that author by client ID
      const book = await em.upsert(Book, {
        title: "Earthsea",
        author: { id: "a#7", firstName: "Ursula" },
      });
      // Then nested upsert uses the existing registered author
      expect(await book.author.load()).toMatchEntity(author);
    });

    it("mixes client and database IDs in collection inputs", async () => {
      // Given an existing book
      await insertAuthor({ first_name: "Old author" });
      await insertBook({ title: "Existing", author_id: 1 });
      const em = newEntityManager();
      // And a separately registered new book
      const book = em.create(Book, { $clientId: "b#7", title: "New" });
      // When an author adopts both books
      const author = await em.upsert(Author, { firstName: "Ursula", books: [book.$clientId!, "b:1"] });
      // Then the collection contains both new and existing targets
      expect(await author.books.load()).toMatchEntity([{ title: "Existing" }, { title: "New" }]);
    });

    it("rejects unknown scalar client references without querying for them", async () => {
      // Given an EM without the requested author
      const em = newEntityManager();
      resetQueryCount();
      // When a book refers to an unregistered client identity
      await expect(em.upsert(Book, { title: "Earthsea", author: "a#7" })).rejects.toThrow("a#7 was not found");
      // Then no query or ID allocation was attempted
      expect(queries).toEqual([]);
    });

    it("constructs cycles in two phases without placeholders or allocated database IDs", async () => {
      // Given both authors have been registered
      const em = newEntityManager();
      const first = em.createPartial(Author, { $clientId: "a#7", firstName: "First" });
      const second = em.createPartial(Author, { $clientId: "a#8", firstName: "Second" });
      // When their references are connected after registration
      await em.upsert(Author, { id: "a#7", mentor: "a#8" });
      await em.upsert(Author, { id: "a#8", mentor: "a#7" });
      // Then the graph contains real cyclic references before persistence
      expect(await first.mentor.load()).toMatchEntity(second);
      // And the back reference points to the original instance
      expect(await second.mentor.load()).toMatchEntity(first);
    });

    it("does not create a duplicate when an occupied alias is hidden", async () => {
      // Given an author hidden from public lookup
      const em = newEntityManager();
      em.create(Author, { $clientId: "a#7", firstName: "Hidden" });
      em.addPlugin(new HideClientId("a#7"));
      // When upsert addresses its alias
      await expect(em.upsert(Author, { id: "a#7", firstName: "Replacement" })).rejects.toThrow("a#7 was not found");
      // Then canonical membership still contains only the original author
      expect(runInTrustedContext(() => em.getEntities(Author))).toMatchEntity([{ firstName: "Hidden" }]);
    });

    it("retains ordinary write authorization for alias-based updates", async () => {
      // Given an author whose first name cannot be changed
      const em = newEntityManager();
      em.create(Author, { $clientId: "a#7", firstName: "Original" });
      em.addPlugin(new DenyFirstName());
      // When upsert selects the author by client identity
      // Then the ordinary field-set policy still rejects the update
      await expect(em.upsert(Author, { id: "a#7", firstName: "Changed" })).rejects.toThrow("Cannot change firstName");
    });

    it("uses the existing deleted author when upserting by client ID", async () => {
      // Given a deleted client-identified author
      const em = newEntityManager();
      const author = em.create(Author, { $clientId: "a#7", firstName: "Ursula" });
      em.delete(author);
      // When upsert tries to change the author's name through its client ID
      const updated = await em.upsert(Author, { id: "a#7", firstName: "Replacement" });
      // Then upsert returns the registered author rather than creating a replacement
      expect(updated).toMatchEntity(author);
    });

    it("selects nested inverse to-one targets by client identity", async () => {
      // Given an author with an existing image
      const em = newEntityManager();
      const original = em.create(Image, { type: ImageType.AuthorImage, fileName: "original.png" });
      const author = em.create(Author, { $clientId: "a#7", firstName: "Ursula", image: original });
      // And another registered image
      const replacement = em.create(Image, { $clientId: "i#7", type: ImageType.AuthorImage, fileName: "new.png" });
      // When nested upsert identifies the replacement image
      await em.upsert(Author, { id: "a#7", image: { id: "i#7", fileName: "updated.png" } });
      // Then the current image is replaced, not patched
      expect(await author.image.load()).toMatchEntity(replacement);
    });

    it("supports existing incremental collection operations with client identities", async () => {
      // Given an author and a separately registered book
      const em = newEntityManager();
      const author = em.create(Author, { $clientId: "a#7", firstName: "Ursula" });
      const book = em.create(Book, { $clientId: "b#7", title: "Earthsea" });
      // When upsert incrementally includes the identified book
      await em.upsert(Author, { id: "a#7", books: [{ id: "b#7", op: "include" }] });
      // Then the ordinary inverse relationship is assigned
      expect(await book.author.load()).toMatchEntity(author);
    });

    it("does not resurrect a soft-deleted row when selected by database ID", async () => {
      // Given a soft-deleted author in the database
      await insertAuthor({ first_name: "Original", ssn: "123", deleted_at: jan1 });
      const em = newEntityManager();
      // When upsert selects it by its database ID
      await em.upsert(Author, { id: "a:1", firstName: "Changed" });
      // Then the author retains its soft-delete marker without receiving a client ID
      expect(await em.load(Author, "a:1")).toMatchEntity({
        firstName: "Changed",
        deletedAt: jan1,
        $clientId: undefined,
      });
    });
  });

  describe("getEntity", () => {
    it("resolves client identity synchronously", () => {
      // Given an author with an explicit identity
      const em = newEntityManager();
      const author = em.create(Author, { $clientId: "a#7", firstName: "Ursula" });
      // When application code resolves that identity
      const found = em.getEntity("a#7");
      // Then it receives the canonical entity
      expect(found).toMatchEntity(author);
    });

    it("hides client identity-map lookups when visibility denies the target", () => {
      // Given an author hidden by an ordinary visibility policy
      const em = newEntityManager();
      em.create(Author, { $clientId: "a#7", firstName: "Hidden" });
      em.addPlugin(new HideClientId("a#7"));
      // When application code resolves its alias
      // Then the hidden entity is not exposed
      expect(em.getEntity("a#7")).toMatchEntity(undefined);
    });

    it("retains deleted entities in identity-map lookups", () => {
      // Given a client-identified author
      const em = newEntityManager();
      const author = em.create(Author, { $clientId: "a#7", firstName: "Ursula" });
      // When the author is marked for deletion
      em.delete(author);
      // Then getEntity keeps its ordinary identity-map behavior for client IDs too
      expect(em.getEntity("a#7")).toMatchEntity(author);
    });

    it("returns undefined for an unregistered client ID with an unknown tag", () => {
      // Given an author registered under its own client ID
      const em = newEntityManager();
      em.create(Author, { $clientId: "a#7", firstName: "Ursula" });
      // When application code looks up a key that was never registered
      // Then the lookup returns no entity without trying to interpret its tag
      expect(em.getEntity("unknown#7")).toMatchEntity(undefined);
    });

    it("returns undefined when a debug string is used as a lookup key", async () => {
      // Given a persisted author whose debug string includes its database ID
      const em = newEntityManager();
      const author = em.create(Author, { $clientId: "a#7", firstName: "Ursula" });
      await em.flush();
      // When application code looks up the debug string instead of the stored client ID
      // Then no entity is registered under that key
      expect(em.getEntity(author.toTaggedString())).toMatchEntity(undefined);
    });
  });

  describe("load", () => {
    it("loads an automatic client identity without querying", async () => {
      // Given an automatically identified author
      const em = newEntityManager();
      const author = em.create(Author, { firstName: "Ursula" });
      resetQueryCount();
      // When the application loads its client identity
      const found = await em.load(Author, author.$clientId!);
      // Then the same entity is returned
      expect(found).toMatchEntity(author);
      // And no database load or ID allocation was needed
      expect(queries).toEqual([]);
    });

    it("supports tagged client loads without a constructor", async () => {
      // Given a registered author
      const em = newEntityManager();
      const author = em.create(Author, { $clientId: "a#7", firstName: "Ursula" });
      // When only the client ID is supplied
      const found = await em.load("a#7");
      // Then the tag identifies the correct canonical entity
      expect(found).toMatchEntity(author);
    });

    it("keeps both lookups canonical after flush", async () => {
      // Given a client-identified author
      const em = newEntityManager();
      const author = em.create(Author, { $clientId: "a#7", firstName: "Ursula" });
      // When the author is persisted
      await em.flush();
      // Then client lookup still returns the same entity
      expect(await em.load(Author, "a#7")).toMatchEntity(author);
      // And database lookup returns that entity too
      expect(await em.load(Author, author.id)).toMatchEntity(author);
      // And the public alias does not acquire the debug string's database suffix
      expect(author.$clientId).toEqual("a#7");
    });

    it("does not persist aliases into a fresh EM", async () => {
      // Given a persisted client-identified author
      const em = newEntityManager();
      const author = em.create(Author, { $clientId: "a#7", firstName: "Ursula" });
      await em.flush();
      // When another EM loads the database row
      const loaded = await newEntityManager().load(Author, author.id);
      // Then the client identity is absent
      expect(loaded.$clientId).toBeUndefined();
    });
  });

  describe("loadAll", () => {
    it("loads mixed client and database identities together", async () => {
      // Given a persisted author and a registered new author
      await insertAuthor({ first_name: "Persisted" });
      const em = newEntityManager();
      const author = em.create(Author, { $clientId: "a#7", firstName: "New" });
      // When a bulk load includes both identity namespaces
      const authors = await em.loadAll(Author, ["a#7", "a:1"]);
      // Then client identity is resolved in input order alongside database identity
      expect(authors).toMatchEntity([author, { id: "a:1", firstName: "Persisted" }]);
    });

    it("applies visibility to bulk loads of unsaved client targets", async () => {
      // Given a hidden, unsaved author
      const em = newEntityManager();
      em.create(Author, { $clientId: "a#7", firstName: "Hidden" });
      em.addPlugin(new HideClientId("a#7"));
      // When a bulk load addresses its client identity
      // Then visibility denial reports the client ID without requiring a database ID
      await expect(em.loadAll(Author, ["a#7"])).rejects.toThrow("a#7 were not found");
    });

    it("includes deleted authors in bulk loads through either identity", async () => {
      // Given a persisted author with both identities
      const em = newEntityManager();
      const author = em.create(Author, { $clientId: "a#7", firstName: "Ursula" });
      await em.flush();
      // And the author is marked for deletion
      em.delete(author);
      // When both identities appear in a bulk load
      const authors = await em.loadAll(Author, ["a#7", author.id]);
      // Then neither identity filters out the registered author
      expect(authors).toMatchEntity([author, author]);
    });
  });

  describe("loadAllIfExists", () => {
    it("omits unknown client identities from optional bulk loads without querying", async () => {
      // Given one registered author
      const em = newEntityManager();
      const author = em.create(Author, { $clientId: "a#7", firstName: "Ursula" });
      resetQueryCount();
      // When an optional bulk load includes an unknown alias
      const authors = await em.loadAllIfExists(Author, ["a#8", "a#7"]);
      // Then the unknown entry is omitted rather than leaving a hole
      expect(authors).toMatchEntity([author]);
      // And no alias was sent to the database
      expect(queries).toEqual([]);
    });

    it("includes deleted authors in optional bulk loads through either identity", async () => {
      // Given a persisted author with both identities
      const em = newEntityManager();
      const author = em.create(Author, { $clientId: "a#7", firstName: "Ursula" });
      await em.flush();
      // And the author is marked for deletion
      em.delete(author);
      // When both identities appear in an optional bulk load
      const authors = await em.loadAllIfExists(Author, ["a#7", author.id]);
      // Then neither identity filters out the registered author
      expect(authors).toMatchEntity([author, author]);
    });
  });

  describe("delete", () => {
    it("reserves a client ID after deleting an author that was never persisted", async () => {
      // Given an author created and deleted before its first flush
      const em = newEntityManager();
      const author = em.create(Author, { $clientId: "a#7", firstName: "Ursula" });
      em.delete(author);
      // When deletion is flushed
      await em.flush();
      // Then a different entity cannot reuse the alias
      expect(() => em.create(Author, { $clientId: "a#7", firstName: "Replacement" })).toThrow(
        "Client id a#7 is already registered",
      );
    });

    it("reserves a client ID after deleting a persisted author", async () => {
      // Given a persisted author with an explicit client ID
      const em = newEntityManager();
      const author = em.create(Author, { $clientId: "a#7", firstName: "Ursula" });
      await em.flush();
      // When the database row is deleted and the deletion is flushed
      em.delete(author);
      await em.flush();
      // Then a new entity cannot reuse the deleted author's client ID
      expect(() => em.create(Author, { $clientId: "a#7", firstName: "Replacement" })).toThrow(
        "Client id a#7 is already registered",
      );
    });
  });

  describe("fork", () => {
    it("copies explicit client identities into a fork without depending on creation order", async () => {
      // Given an author with a non-sequential client identity and a related book
      const em = newEntityManager();
      em.create(Author, { $clientId: "a#7", firstName: "Ursula" });
      em.create(Book, { $clientId: "b#2", title: "Earthsea", author: "a#7" });
      // When a pending graph is forked
      const fork = em.fork({ allowPendingChanges: true });
      const book = await fork.load(Book, "b#2");
      // Then the copied relationship uses the fork's canonical alias target
      expect(await book.author.load()).toMatchEntity(fork.getEntity<Author>("a#7"));
    });

    it("keeps persisted aliases when forking", async () => {
      // Given a flushed author retaining its client identity
      const em = newEntityManager();
      em.create(Author, { $clientId: "a#7", firstName: "Ursula" });
      await em.flush();
      // When the EM is forked
      const fork = em.fork();
      // Then the copied entity retains the explicit alias
      expect(fork.getEntity("a#7")).toMatchEntity({ id: "a:1", $clientId: "a#7" });
    });
  });

  describe("setDeepPartial", () => {
    it("does not let deep partial updates put client identity into primary-key storage", async () => {
      // Given a new author whose client identity is already established
      const em = newEntityManager();
      const author = em.create(Author, { $clientId: "a#7", firstName: "Ursula" });
      // When a deep partial update supplies a client ID as database identity
      // Then the regular option setter also rejects the namespace mix-up
      await expect(author.setDeepPartial({ id: "a#7" })).rejects.toThrow("id must be a database id");
    });

    it("rejects assigning a client ID to a loaded author through deep partial updates", async () => {
      // Given an author that already exists in the database
      await insertAuthor({ first_name: "Ursula" });
      const em = newEntityManager();
      const author = await em.load(Author, "a:1");
      // When a deep partial update attempts to add a client ID
      // Then both the input type and runtime reject the creation-only option
      // @ts-expect-error Deep partial updates do not accept client-ID assignment
      await expect(author.setDeepPartial({ $clientId: "a#7" })).rejects.toThrow(
        "$clientId can only be assigned by em.create or em.createPartial",
      );
    });
  });

  describe("flush", () => {
    it("retains normal validation for client-identified entities", async () => {
      // Given a client-identified author missing its required first name
      const em = newEntityManager();
      em.createPartial(Author, { $clientId: "a#7" });
      await em.upsert(Author, { id: "a#7", firstName: null });
      // When the graph is flushed
      // Then ordinary required-field validation still applies
      await expect(em.flush()).rejects.toThrow("firstName is required");
    });

    it("runs existing creation hooks for client-identified entities", async () => {
      // Given a client-identified author
      const em = newEntityManager();
      const author = em.create(Author, { $clientId: "a#7", firstName: "Ursula" });
      // When the graph is flushed
      await em.flush();
      // Then ordinary entity hooks have run
      expect(author.transientFields.beforeCreateRan).toBe(true);
    });
  });

  it("keeps client identity after database ID allocation", async () => {
    // Given an author with an explicit client identity
    const em = newEntityManager();
    const author = em.create(Author, { $clientId: "a#7", firstName: "Ursula" });
    // When database identity is allocated without insertion
    await em.assignNewIds();
    // Then both identities coexist without changing the client ID
    expect(author).toMatchEntity({ $clientId: "a#7", id: "a:1", isNewEntity: true });
  });

  it("keeps client identity read-only", () => {
    // Given a client-identified author
    const em = newEntityManager();
    const author = em.create(Author, { $clientId: "a#7", firstName: "Ursula" });
    // When application code tries to replace the public identity
    // Then the getter cannot be assigned
    expect(() => {
      // @ts-expect-error Client identity is immutable
      author.$clientId = "a#8";
    }).toThrow();
  });

  it("does not copy a persisted alias when importing into another EM", async () => {
    // Given a persisted author with an EM-local identity
    const em = newEntityManager();
    const author = em.create(Author, { $clientId: "a#7", firstName: "Ursula" });
    await em.flush();
    // When another EM imports the entity's database state
    const imported = newEntityManager().importEntity(author);
    // Then the source EM's alias is not imported
    expect(imported.$clientId).toBeUndefined();
  });

  it("does not serialize client identity through the default entity JSON", () => {
    // Given a client-identified author
    const em = newEntityManager();
    const author = em.create(Author, { $clientId: "a#7", firstName: "Ursula" });
    // When the ordinary entity JSON is requested
    // Then only database identity is serialized
    expect(author.toJSON()).toEqual({ id: null });
  });

  it("gives cloned entities a new client identity", async () => {
    // Given an author with a caller-assigned identity
    const em = newEntityManager();
    const author = em.create(Author, { $clientId: "a#7", firstName: "Ursula" });
    // When the entity is cloned within the same EM
    const clone = await em.clone(author);
    // Then the clone does not inherit the source identity
    expect(clone.$clientId).toEqual("a#1");
  });

  it("formats a created author's debug identity from its client ID after flush", async () => {
    // Given an author with an explicit client ID
    const em = newEntityManager();
    const author = em.create(Author, { $clientId: "a#7", firstName: "Ursula" });
    // When the author receives its database ID
    await em.flush();
    // Then debug output retains the client ID and appends the database ID
    expect(author.toTaggedString()).toEqual("a#7:1");
  });

  it("uses the same client identity for factory references after flush", async () => {
    // Given a persisted author created with an explicit client ID
    const em = newEntityManager();
    const author = em.create(Author, { $clientId: "a#7", firstName: "Ursula" });
    await em.flush();
    // When a factory refers to the author's client ID
    const book = newBook(em, { author: "a#7" });
    const bookAuthor: Author = book.author.get;
    // Then the factory resolves the same canonical author
    expect(bookAuthor).toMatchEntity(author);
  });
});

/** A real visibility policy over client identity, including unsaved targets. */
class HideClientId extends Plugin {
  constructor(private readonly hidden: string) {
    super();
  }

  /** Do not read a required database ID while checking visibility of an unsaved entity. */
  canViewEntity(entity: Entity): boolean {
    return entity.$clientId !== this.hidden;
  }
}

/** Rejects ordinary domain writes regardless of how upsert selected the entity. */
class DenyFirstName extends Plugin {
  beforeSetField(_entity: Entity, field: string): void {
    if (field === "firstName") throw new Error("Cannot change firstName");
  }
}
