import {
  type Entity,
  type EntityMetadata,
  type FindOperation,
  ManyToManyCollection,
  ManyToOneReferenceImpl,
  Plugin,
  isInTrustedContext,
  isLoaded,
  isLoadedCollection,
  runInTrustedContext,
} from "joist-orm";
import { Author, Book, BookReview, PublisherGroup, SmallPublisher, Tag, newBook } from "src/entities";
import {
  insertAuthor,
  insertAuthorToTag,
  insertBook,
  insertBookReview,
  insertBookToTag,
  insertComment,
  insertCritic,
  insertPublisher,
  insertPublisherGroup,
  insertTag,
  select,
} from "src/entities/inserts";
import { newEntityManager } from "src/testEm";

describe("relationAccess", () => {
  describe("ManyToManyCollection", () => {
    it("projects cached many-to-many membership without truncating the trusted view", async () => {
      // Given a book with a tag hidden by the plugin
      await insertAuthor({ first_name: "author" });
      await insertBook({ title: "book", author_id: 1 });
      await insertTag({ name: "visible" });
      await insertTag({ name: "hidden" });
      await insertBookToTag({ book_id: 1, tag_id: 1 });
      await insertBookToTag({ book_id: 1, tag_id: 2 });
      const em = newEntityManager();
      em.addPlugin(new HiddenMemberPlugin("t:2"));
      const loaded = await em.load(Book, "b:1", "tags");
      // When a public read projects the cached collection
      // Then only its visible member is exposed
      expect(loaded.tags.get.map((tag) => tag.id)).toEqual(["t:1"]);
      // When business logic reads the same collection
      // Then the canonical membership is intact
      expect(runInTrustedContext(() => loaded.tags.get.map((tag) => tag.id))).toEqual(["t:1", "t:2"]);
    });

    it("preserves hidden join rows when replacing visible members", async () => {
      // Given a book with visible and hidden tags
      await insertAuthor({ first_name: "author" });
      await insertBook({ title: "book", author_id: 1 });
      await insertTag({ name: "visible" });
      await insertTag({ name: "hidden" });
      await insertBookToTag({ book_id: 1, tag_id: 1 });
      await insertBookToTag({ book_id: 1, tag_id: 2 });
      const em = newEntityManager();
      em.addPlugin(new HiddenMemberPlugin("t:2"));
      const loaded = await em.load(Book, "b:1", "tags");
      // When the user replaces all visible tags with an empty list
      loaded.tags.set([]);
      await em.flush();
      // Then the hidden join row remains in the database
      expect(await select("books_to_tags")).toMatchObject([{ book_id: 1, tag_id: 2 }]);
    });

    it("preserves hidden join rows when removing all visible members", async () => {
      // Given a book with visible and hidden tags
      await insertAuthor({ first_name: "author" });
      await insertBook({ title: "book", author_id: 1 });
      await insertTag({ name: "visible" });
      await insertTag({ name: "hidden" });
      await insertBookToTag({ book_id: 1, tag_id: 1 });
      await insertBookToTag({ book_id: 1, tag_id: 2 });
      const em = newEntityManager();
      em.addPlugin(new HiddenMemberPlugin("t:2"));
      const loaded = await em.load(Book, "b:1", "tags");
      // When the user removes all visible tags
      loaded.tags.removeAll();
      await em.flush();
      // Then the hidden join row remains in the database
      expect(await select("books_to_tags")).toMatchObject([{ book_id: 1, tag_id: 2 }]);
    });

    it("bypasses visibility policy for trusted collection reads", async () => {
      // Given a book with a tag excluded by a context-independent plugin
      await insertAuthor({ first_name: "author" });
      await insertBook({ title: "book", author_id: 1 });
      await insertTag({ name: "visible" });
      await insertTag({ name: "hidden" });
      await insertBookToTag({ book_id: 1, tag_id: 1 });
      await insertBookToTag({ book_id: 1, tag_id: 2 });
      class RestrictedTagsPlugin extends Plugin {
        canViewEntity(entity: Entity): boolean {
          return entity.id !== "t:2";
        }
      }
      // And the reader installs its plugin before constructing the relation
      const em = newEntityManager();
      em.addPlugin(new RestrictedTagsPlugin());
      const loaded = await em.load(Book, "b:1", "tags");
      // When trusted code reads the collection
      const tags = runInTrustedContext(() => loaded.tags.get);
      // Then trusted reads see complete membership
      expect(tags.map((tag) => tag.id)).toEqual(["t:1", "t:2"]);
    });

    it("lets a plugin reject collection replacement even in trusted code", async () => {
      // Given a book with tags that cannot be replaced
      await insertAuthor({ first_name: "author" });
      await insertBook({ title: "book", author_id: 1 });
      await insertTag({ name: "fixed" });
      await insertBookToTag({ book_id: 1, tag_id: 1 });
      class FixedTagsPlugin extends Plugin {
        canViewEntity(): boolean {
          return true;
        }

        beforeSetField(_entity: Entity, field: string): void {
          if (field === "tags") throw new Error("Tags cannot be replaced");
        }
      }
      // And the reader installs its plugin before constructing the relation
      const em = newEntityManager();
      em.addPlugin(new FixedTagsPlugin());
      const loaded = await em.load(Book, "b:1", "tags");
      // When trusted code replaces the tags
      // Then Joist does not bypass the plugin
      expect(() => runInTrustedContext(() => loaded.tags.set([]))).toThrow("Tags cannot be replaced");
    });

    it("leaves already constructed collections unchanged after late registration", async () => {
      // Given a book whose collection was constructed without relation plugins
      await insertAuthor({ first_name: "author" });
      await insertBook({ title: "book", author_id: 1 });
      await insertTag({ name: "hidden" });
      await insertBookToTag({ book_id: 1, tag_id: 1 });
      const em = newEntityManager();
      const book = await em.load(Book, "b:1", "tags");
      const tags = book.tags;
      // When a visibility plugin is installed after construction
      em.addPlugin(new HiddenMemberPlugin("t:1"));
      // Then the existing collection retains its original behavior
      expect(tags.get.map((tag) => tag.id)).toEqual(["t:1"]);
    });

    it("intercepts lazy collections first constructed after registration", async () => {
      // Given an entity loaded before registration, with its collection still unconstructed
      await insertAuthor({ first_name: "author" });
      await insertBook({ title: "book", author_id: 1 });
      await insertTag({ name: "hidden" });
      await insertBookToTag({ book_id: 1, tag_id: 1 });
      const em = newEntityManager();
      const loaded = await em.load(Book, "b:1");
      // When a visibility plugin is installed before the first collection access
      em.addPlugin(new HiddenMemberPlugin("t:1"));
      const tags = await loaded.tags.load();
      // Then the newly constructed collection applies the plugin
      expect(tags).toEqual([]);
    });

    it("uses ordinary collections when plugins have no collection hooks", () => {
      // Given an EM with a query-only plugin
      const em = newEntityManager();
      em.addPlugin(new QueryContextPlugin());
      // When a book's collection is constructed
      const book = newBook(em);
      // Then it uses the implementation with no relation dispatch
      expect(book.tags.constructor).toEqual(ManyToManyCollection);
    });

    it("filters soft-deleted m2m members without permission to read their deletion timestamps", async () => {
      // Given a tag with an active book and a soft-deleted book
      await insertAuthor({ first_name: "author" });
      await insertBook({ title: "active", author_id: 1 });
      await insertBook({ title: "deleted", author_id: 1, deleted_at: new Date() });
      await insertTag({ name: "tag" });
      await insertBookToTag({ book_id: 1, tag_id: 1 });
      await insertBookToTag({ book_id: 2, tag_id: 1 });
      // And the reader may see books but not their deletion timestamps
      const em = newEntityManager();
      class ProtectedTimestampPlugin extends Plugin {
        canViewEntity(): boolean {
          return true;
        }
        beforeGetField(_entity: Entity, field: string): void {
          if (field === "deletedAt") throw new Error("Cannot read deletedAt");
        }
      }
      em.addPlugin(new ProtectedTimestampPlugin());
      const loaded = await em.load(Tag, "t:1");
      await loaded.books.load({ withDeleted: true });
      if (!isLoadedCollection(loaded.books)) throw new Error("Expected books to be loaded");
      // When the getter filters complete membership using stored deletion state
      const books = loaded.books.get;
      // Then only the active book is returned
      expect(books.map((book) => book.id)).toEqual(["b:1"]);
    });

    it("does not authorize a deletion timestamp after filtering m2m membership", async () => {
      // Given a tag with a book whose deletion timestamp is protected
      await insertAuthor({ first_name: "author" });
      await insertBook({ title: "book", author_id: 1 });
      await insertTag({ name: "tag" });
      await insertBookToTag({ book_id: 1, tag_id: 1 });
      // And the reader may see books but not their deletion timestamps
      const em = newEntityManager();
      class ProtectedTimestampPlugin extends Plugin {
        canViewEntity(): boolean {
          return true;
        }
        beforeGetField(_entity: Entity, field: string): void {
          if (field === "deletedAt") throw new Error("Cannot read deletedAt");
        }
      }
      em.addPlugin(new ProtectedTimestampPlugin());
      const loaded = await em.load(Tag, "t:1");
      await loaded.books.load({ withDeleted: true });
      if (!isLoadedCollection(loaded.books)) throw new Error("Expected books to be loaded");
      // When the getter reads the stored timestamp to determine membership
      const book = loaded.books.get[0];
      // Then a public timestamp read still requires permission
      expect(() => book.deletedAt).toThrow("Cannot read deletedAt");
    });

    it("loads hidden m2m targets without granting trusted execution to query hooks", async () => {
      // Given an unloaded book collection with a hidden tag
      await insertAuthor({ first_name: "author" });
      await insertBook({ title: "book", author_id: 1 });
      await insertTag({ name: "hidden" });
      await insertBookToTag({ book_id: 1, tag_id: 1 });
      const em = newEntityManager();
      em.addPlugin(new HiddenMemberPlugin("t:1"));
      const loaded = await em.load(Book, "b:1");
      // And another plugin observes the context used for relation hydration
      const plugin = new QueryContextPlugin();
      em.addPlugin(plugin);
      // When untrusted code loads the collection
      await loaded.tags.load();
      // Then join lookup and target hydration both retain the caller's context
      expect(plugin.queries).toEqual([
        { operation: "m2m-load", trusted: false },
        { operation: "load", trusted: false },
      ]);
    });

    it("retains hidden m2m members after an untrusted collection load", async () => {
      // Given an unloaded book collection with visible and hidden tags
      await insertAuthor({ first_name: "author" });
      await insertBook({ title: "book", author_id: 1 });
      await insertTag({ name: "visible" });
      await insertTag({ name: "hidden" });
      await insertBookToTag({ book_id: 1, tag_id: 1 });
      await insertBookToTag({ book_id: 1, tag_id: 2 });
      const em = newEntityManager();
      em.addPlugin(new HiddenMemberPlugin("t:2"));
      const loaded = await em.load(Book, "b:1");
      // When untrusted code loads and projects the collection
      const tags = await loaded.tags.load();
      // Then the public result contains only visible members
      expect(tags.map((tag) => tag.id)).toEqual(["t:1"]);
      // When trusted business logic reads the loaded membership
      const complete = await runInTrustedContext(() => loaded.tags.load());
      // Then the hidden member remains available
      expect(complete.map((tag) => tag.id)).toEqual(["t:1", "t:2"]);
    });

    it("finds m2m targets without granting trusted execution to query hooks", async () => {
      // Given a book whose tag is hidden from public reads
      await insertAuthor({ first_name: "author" });
      await insertBook({ title: "book", author_id: 1 });
      await insertTag({ name: "hidden" });
      await insertBookToTag({ book_id: 1, tag_id: 1 });
      const em = newEntityManager();
      em.addPlugin(new HiddenMemberPlugin("t:1"));
      const loaded = await em.load(Book, "b:1");
      // And a plugin observes relation lookup and hydration
      const plugin = new QueryContextPlugin();
      em.addPlugin(plugin);
      // When the caller looks up the hidden tag
      await loaded.tags.find("t:1");
      // Then membership lookup and target hydration retain the caller's context
      expect(plugin.queries).toEqual([
        { operation: "m2m-find", trusted: false },
        { operation: "load", trusted: false },
      ]);
    });
  });

  describe("ManyToManyLargeCollection", () => {
    it("omits a hidden large-m2m target after internal hydration", async () => {
      // Given a tag with an author hidden from public reads
      await insertAuthor({ first_name: "hidden" });
      await insertTag({ name: "tag" });
      await insertAuthorToTag({ author_id: 1, tag_id: 1 });
      const em = newEntityManager();
      em.addPlugin(new HiddenMemberPlugin("a:1"));
      const loaded = await em.load(Tag, "t:1");
      // When the caller looks up the hidden author through the large collection
      const found = await loaded.authors.find("a:1");
      // Then visibility is projected as an absent member instead of failing hydration
      expect(found).toBeUndefined();
    });
  });

  describe("ManyToOneReference", () => {
    it("hydrates references with the shared load operation without granting trusted execution", async () => {
      // Given a persisted book whose author is not in the reader's identity map
      await insertAuthor({ first_name: "author" });
      await insertBook({ title: "book", author_id: 1 });
      const em = newEntityManager();
      // And a visibility plugin selects the plugin-aware reference implementation
      em.addPlugin(
        new (class extends Plugin {
          canViewEntity(): boolean {
            return true;
          }
        })(),
      );
      const loaded = await em.load(Book, "b:1");
      // And another plugin observes the hydration context
      const plugin = new QueryContextPlugin();
      em.addPlugin(plugin);
      // When untrusted code loads the author
      await loaded.author.load();
      // Then query hooks observe the shared load operation in the caller's context
      expect(plugin.queries).toEqual([{ operation: "load", trusted: false }]);
    });

    it("bypasses visibility policy for trusted reference reads", async () => {
      // Given a book whose author reference is restricted by a context-independent plugin
      await insertAuthor({ first_name: "author" });
      await insertBook({ title: "book", author_id: 1 });
      class RestrictedAuthorPlugin extends Plugin {
        canViewEntity(entity: Entity): boolean {
          return !(entity instanceof Author);
        }
      }
      // And the reader installs its plugin before constructing the relation
      const em = newEntityManager();
      em.addPlugin(new RestrictedAuthorPlugin());
      const loaded = await em.load(Book, "b:1", "author");
      // When trusted code reads the author
      // Then Joist returns the actual target without consulting the policy
      expect(runInTrustedContext(() => loaded.author.get.id)).toEqual("a:1");
    });

    it("leaves already constructed references unchanged after late registration", async () => {
      // Given a book whose reference was constructed without relation plugins
      await insertAuthor({ first_name: "author" });
      await insertBook({ title: "book", author_id: 1 });
      const em = newEntityManager();
      const book = await em.load(Book, "b:1", "author");
      const author = book.author.get;
      const reference = book.author;
      // When a reference policy is installed after construction
      class RestrictedReferencePlugin extends Plugin {
        canViewEntity(): boolean {
          return false;
        }
      }
      em.addPlugin(new RestrictedReferencePlugin());
      // Then the existing reference retains its original behavior
      expect(reference.get).toEqual(author);
    });

    it("uses ordinary references when plugins have no reference hooks", () => {
      // Given an EM with a query-only plugin
      const em = newEntityManager();
      em.addPlugin(new QueryContextPlugin());
      // When a book's reference is constructed
      const book = newBook(em);
      // Then it uses the implementation with no relation dispatch
      expect(book.author.constructor).toEqual(ManyToOneReferenceImpl);
    });

    it("intercepts lazy references first constructed after registration", async () => {
      // Given an entity loaded before registration, with its reference still unconstructed
      await insertAuthor({ first_name: "author" });
      await insertBook({ title: "book", author_id: 1 });
      const em = newEntityManager();
      const loaded = await em.load(Book, "b:1");
      // When a reference policy is installed before the first reference access
      class RestrictedReferencePlugin extends Plugin {
        canViewEntity(): boolean {
          return false;
        }
      }
      em.addPlugin(new RestrictedReferencePlugin());
      // Then loading the target applies the plugin
      await expect(loaded.author.load()).rejects.toThrow("No read permission for Book.author target");
    });

    it("populates a protected FK without granting permission to read the relationship", async () => {
      // Given a reader that cannot read a book's author relationship
      await insertAuthor({ first_name: "author" });
      await insertBook({ title: "book", author_id: 1 });
      const em = newEntityManager();
      em.addPlugin(new ProtectedFieldsPlugin(["author"]));
      // When population reads the FK and loads its target in trusted context
      const loaded = await em.load(Book, "b:1", "author");
      // Then the public getter still requires permission
      expect(() => loaded.author.get).toThrow("Cannot read author");
    });

    it("cascades deletion through a protected reference field", async () => {
      // Given a book whose cascade-delete reference cannot be read by the caller
      await insertAuthor({ first_name: "author" });
      await insertComment({ text: "comment" });
      await insertBook({ title: "book", author_id: 1, random_comment_id: 1 });
      const em = newEntityManager();
      em.addPlugin(new ProtectedFieldsPlugin(["randomComment"]));
      const loaded = await em.load(Book, "b:1", "randomComment");
      // When deletion follows the loaded cascade reference
      em.delete(loaded);
      await em.flush();
      // Then the dependent comment is deleted without requiring field-read permission
      expect(await select("comments")).toEqual([]);
    });
  });

  describe("OneToManyCollection", () => {
    it("keeps collection loads and member lookups in the caller's execution context", async () => {
      // Given two authors with unloaded book collections
      await insertAuthor({ first_name: "first" });
      await insertAuthor({ first_name: "second" });
      await insertBook({ title: "first", author_id: 1 });
      await insertBook({ title: "second", author_id: 2 });
      const em = newEntityManager();
      const authors = await em.loadAll(Author, ["a:1", "a:2"]);
      // And a visibility-aware plugin observes the relation query context
      const plugin = new (class extends QueryContextPlugin {
        canViewEntity(): boolean {
          return true;
        }
      })();
      em.addPlugin(plugin);
      // When untrusted code loads one collection and looks up a member of the other
      await authors[0].books.load();
      await authors[1].books.find("b:2");
      // Then both queries retain the caller's untrusted context
      expect(plugin.queries).toEqual([
        { operation: "o2m-load", trusted: false },
        { operation: "o2m-find", trusted: false },
      ]);
    });

    it("checks collection membership without requiring permission to the inverse field", async () => {
      // Given a book whose author FK is protected but whose collection is readable
      await insertAuthor({ first_name: "author" });
      await insertBook({ title: "book", author_id: 1 });
      const em = newEntityManager();
      class ProtectedAuthorPlugin extends Plugin {
        canViewEntity(): boolean {
          return true;
        }
        beforeGetField(_entity: Entity, field: string): void {
          if (field === "author") throw new Error("Cannot read author");
        }
      }
      em.addPlugin(new ProtectedAuthorPlugin());
      const loadedAuthor = await em.load(Author, "a:1");
      const loadedBook = await em.load(Book, "b:1");
      // When membership is checked without loading the collection
      const included = await loadedAuthor.books.includes(loadedBook);
      // Then bookkeeping can read the protected FK
      expect(included).toEqual(true);
    });

    it("loads and sorts o2m membership without permission to its bookkeeping fields", async () => {
      // Given an author's books in insertion order opposite to their configured sort order
      await insertAuthor({ first_name: "author" });
      await insertBook({ title: "last", author_id: 1, order: 2 });
      await insertBook({ title: "first", author_id: 1, order: 1 });
      await insertBook({ title: "deleted", author_id: 1, order: 0, deleted_at: new Date() });
      // And the reader cannot read the inverse FK, sort key, or deletion timestamp
      const em = newEntityManager();
      class ProtectedBookkeepingPlugin extends Plugin {
        canViewEntity(): boolean {
          return true;
        }
        beforeGetField(_entity: Entity, field: string): void {
          if (["author", "order", "deletedAt"].includes(field)) throw new Error(`Cannot read ${field}`);
        }
      }
      em.addPlugin(new ProtectedBookkeepingPlugin());
      const loaded = await em.load(Author, "a:1");
      // When the reader loads the collection without entering trusted context
      const books = await loaded.books.load();
      // Then membership is sorted and soft-deleted members are excluded
      expect(books.map((book) => book.id)).toEqual(["b:2", "b:1"]);
    });
  });

  describe("OneToManyLargeCollection", () => {
    it("finds large-collection members without requiring permission to their inverse field", async () => {
      // Given a critic in a group whose membership is readable but whose inverse FK is protected
      await insertPublisherGroup({ name: "group" });
      await insertCritic({ name: "critic", group_id: 1 });
      const em = newEntityManager();
      class ProtectedGroupPlugin extends Plugin {
        canViewEntity(): boolean {
          return true;
        }
        beforeGetField(_entity: Entity, field: string): void {
          if (field === "group") throw new Error("Cannot read group");
        }
      }
      em.addPlugin(new ProtectedGroupPlugin());
      const loaded = await em.load(PublisherGroup, "pg:1");
      // When membership lookup reads the inverse FK for bookkeeping
      const found = await loaded.critics.find("c:1");
      // Then the readable collection still returns its member
      expect(found?.id).toEqual("c:1");
    });
  });

  describe("ReactiveField", () => {
    it("returns the persisted value when an unloaded dependency is protected", async () => {
      // Given a review whose persisted isPublic is stale
      await insertAuthor({ first_name: "author", age: 30, graduated: new Date() });
      await insertBook({ title: "book", author_id: 1 });
      await insertBookReview({ book_id: 1, rating: 1, is_public: false });
      // And the plugin protects `book` with beforeGetField and also implements canViewEntity
      const em = newEntityManager();
      em.addPlugin(
        new (class extends Plugin {
          canViewEntity(): boolean {
            return true;
          }
          beforeGetField(_entity: Entity, field: string): void {
            if (field === "book" && !isInTrustedContext()) throw new Error("Cannot read book");
          }
        })(),
      );
      const review = await em.load(BookReview, "br:1");
      // When the caller reads the reactive field without its dependencies loaded
      const isPublic = review.isPublic.get;
      // Then the visibility-aware EM returns the stored value without requiring caller access to `book`
      expect(isPublic).toBe(false);
    });

    it("returns the persisted value when a field-only plugin protects the dependency", async () => {
      // Given a review whose persisted isPublic is stale
      await insertAuthor({ first_name: "author", age: 30, graduated: new Date() });
      await insertBook({ title: "book", author_id: 1 });
      await insertBookReview({ book_id: 1, rating: 1, is_public: false });
      // And the plugin protects `book` with beforeGetField alone; there is no canViewEntity hook
      const em = newEntityManager();
      em.addPlugin(
        new (class extends Plugin {
          beforeGetField(_entity: Entity, field: string): void {
            if (field === "book" && !isInTrustedContext()) throw new Error("Cannot read book");
          }
        })(),
      );
      const review = await em.load(BookReview, "br:1");
      // When the caller reads the reactive field without its dependencies loaded
      const isPublic = review.isPublic.get;
      // Then the load check still runs as trusted and the caller gets the stored value
      expect(isPublic).toBe(false);
    });

    it("recalculates through a protected dependency when loaded", async () => {
      // Given a review whose persisted isPublic is stale
      await insertAuthor({ first_name: "author", age: 30, graduated: new Date() });
      await insertBook({ title: "book", author_id: 1 });
      await insertBookReview({ book_id: 1, rating: 1, is_public: false });
      // And the caller cannot read the review's book
      const em = newEntityManager();
      em.addPlugin(new ProtectedFieldsPlugin(["book"]));
      const review = await em.load(BookReview, "br:1");
      // And the reactive field's dependencies are loaded
      await em.populate(review, { book: "author", comment: {} });
      // When the caller reads the reactive field
      const isPublic = review.isPublic.get;
      // Then the calculation reads the book as trusted domain logic
      expect(isPublic).toBe(true);
    });

    it("loads and recalculates through a protected dependency", async () => {
      // Given a review whose persisted isPublic is stale
      await insertAuthor({ first_name: "author", age: 30, graduated: new Date() });
      await insertBook({ title: "book", author_id: 1 });
      await insertBookReview({ book_id: 1, rating: 1, is_public: false });
      // And the caller cannot read the review's book
      const em = newEntityManager();
      em.addPlugin(new ProtectedFieldsPlugin(["book"]));
      const review = await em.load(BookReview, "br:1");
      // When the caller loads the reactive field
      const isPublic = await review.isPublic.load();
      // Then the calculation reads the book as trusted domain logic
      expect(isPublic).toBe(true);
    });

    it("denies the persisted value when the reactive field is protected", async () => {
      // Given a review with a persisted isPublic
      await insertAuthor({ first_name: "author", age: 30, graduated: new Date() });
      await insertBook({ title: "book", author_id: 1 });
      await insertBookReview({ book_id: 1, rating: 1, is_public: false });
      // And the caller cannot read isPublic
      const em = newEntityManager();
      em.addPlugin(new ProtectedFieldsPlugin(["isPublic"]));
      const review = await em.load(BookReview, "br:1");
      // When the caller reads the reactive field without its dependencies loaded
      // Then the read is denied
      expect(() => review.isPublic.get).toThrow("Cannot read isPublic");
    });

    it("denies the recalculated value when the reactive field is protected", async () => {
      // Given a review whose persisted isPublic is stale
      await insertAuthor({ first_name: "author", age: 30, graduated: new Date() });
      await insertBook({ title: "book", author_id: 1 });
      await insertBookReview({ book_id: 1, rating: 1, is_public: false });
      // And the caller cannot read isPublic
      const em = newEntityManager();
      em.addPlugin(new ProtectedFieldsPlugin(["isPublic"]));
      const review = await em.load(BookReview, "br:1");
      // And the reactive field's dependencies are loaded
      await em.populate(review, { book: "author", comment: {} });
      // When the caller reads the reactive field
      // Then the read is denied
      expect(() => review.isPublic.get).toThrow("Cannot read isPublic");
    });

    it("does not recalculate for a caller denied the reactive field", async () => {
      // Given a review whose persisted isPublic is stale
      await insertAuthor({ first_name: "author", age: 30, graduated: new Date() });
      await insertBook({ title: "book", author_id: 1 });
      await insertBookReview({ book_id: 1, rating: 1, is_public: false });
      // And the caller cannot read isPublic
      const em = newEntityManager();
      em.addPlugin(new ProtectedFieldsPlugin(["isPublic"]));
      const review = await em.load(BookReview, "br:1");
      // And the reactive field's dependencies are loaded
      await em.populate(review, { book: "author", comment: {} });
      // When the caller attempts to read the reactive field
      expect(() => review.isPublic.get).toThrow();
      // Then the calculation never ran
      expect(review.transientFields.numberOfIsPublicCalcs).toBe(0);
    });

    it("does not load or recalculate for a caller denied the reactive field", async () => {
      // Given a review whose persisted isPublic is stale
      await insertAuthor({ first_name: "author", age: 30, graduated: new Date() });
      await insertBook({ title: "book", author_id: 1 });
      await insertBookReview({ book_id: 1, rating: 1, is_public: false });
      // And the caller cannot read isPublic
      const em = newEntityManager();
      em.addPlugin(new ProtectedFieldsPlugin(["isPublic"]));
      const review = await em.load(BookReview, "br:1");
      // When the caller attempts to load the reactive field
      await expect(review.isPublic.load()).rejects.toThrow("Cannot read isPublic");
      // Then its dependencies were not loaded on the caller's behalf
      expect(runInTrustedContext(() => review.book.isLoaded)).toBe(false);
    });

    it("keeps a field-only plugin's unloaded dependency protected after reading the reactive field", async () => {
      // Given a review whose book the caller cannot read
      await insertAuthor({ first_name: "author", age: 30, graduated: new Date() });
      await insertBook({ title: "book", author_id: 1 });
      await insertBookReview({ book_id: 1, rating: 1, is_public: false });
      const em = newEntityManager();
      em.addPlugin(new ProtectedFieldsHookPlugin(["book"]));
      const review = await em.load(BookReview, "br:1");
      // And the caller has read the reactive field
      void review.isPublic.get;
      // When the caller reads the protected FK directly
      // Then the trusted loaded-state probe did not authorize the caller
      expect(() => review.book.id).toThrow("Cannot read book");
    });

    it("keeps a loaded dependency protected after recalculating the reactive field", async () => {
      // Given a review whose book the caller cannot read
      await insertAuthor({ first_name: "author", age: 30, graduated: new Date() });
      await insertBook({ title: "book", author_id: 1 });
      await insertBookReview({ book_id: 1, rating: 1, is_public: false });
      const em = newEntityManager();
      em.addPlugin(new ProtectedFieldsPlugin(["book"]));
      // And the reactive field's dependencies are loaded
      const review = await em.load(BookReview, "br:1", { book: "author", comment: {} });
      // And the caller has recalculated the reactive field
      void review.isPublic.get;
      // When the caller reads the protected dependency directly
      // Then the trusted calculation did not authorize the caller
      expect(() => review.book.get).toThrow("Cannot read book");
    });

    it("still calls a field-only plugin for the loaded-state probe of a dependency", async () => {
      // Given a review with a persisted isPublic
      await insertAuthor({ first_name: "author", age: 30, graduated: new Date() });
      await insertBook({ title: "book", author_id: 1 });
      await insertBookReview({ book_id: 1, rating: 1, is_public: false });
      // And a field-only plugin that denies the review's book even to trusted reads
      class AlwaysProtectedBookPlugin extends Plugin {
        beforeGetField(_entity: Entity, field: string): void {
          if (field === "book") throw new Error("Cannot read book");
        }
      }
      const em = newEntityManager();
      em.addPlugin(new AlwaysProtectedBookPlugin());
      const review = await em.load(BookReview, "br:1");
      // When the caller reads the reactive field, which probes whether the book is loaded
      // Then Joist does not skip the plugin only because the probe is bookkeeping
      expect(() => review.isPublic.get).toThrow("Cannot read book");
    });
  });
  describe("ReactiveReference", () => {
    it("checks field access before calculating the favorite book", async () => {
      // Given a caller who cannot read the derived reference
      await insertAuthor({ first_name: "author" });
      const em = newEntityManager();
      em.addPlugin(new ProtectedFieldsHookPlugin(["favoriteBook"]));
      const author = await em.load(Author, "a:1");
      // When the caller requests a fresh favorite book
      await expect(author.favoriteBook.load({ forceReload: true })).rejects.toThrow("Cannot read favoriteBook");
      // Then the calculation did not run on the caller's behalf
      expect(author.transientFields.favoriteBookCalcInvoked).toBe(0);
    });

    it("checks the calculated target after evaluating all books", async () => {
      // Given an author whose only book is hidden
      await insertAuthor({ first_name: "author" });
      await insertBook({ title: "hidden", author_id: 1 });
      const em = newEntityManager();
      em.addPlugin(new HiddenMemberPlugin("b:1"));
      const author = await em.load(Author, "a:1");
      // When the favorite is calculated from the complete collection
      // Then the hidden favorite cannot be returned to the caller
      await expect(author.favoriteBook.load({ forceReload: true })).rejects.toThrow(
        "No read permission for Author.favoriteBook target",
      );
    });

    it("checks the reference field even when the favorite book is cached", async () => {
      // Given a caller who can see the book but cannot read the favoriteBook reference
      await insertAuthor({ first_name: "author" });
      await insertBook({ title: "favorite", author_id: 1 });
      const em = newEntityManager();
      em.addPlugin(new ProtectedFieldsHookPlugin(["favoriteBook"]));
      const author = await em.load(Author, "a:1");
      // And trusted code has already calculated the reference
      await runInTrustedContext(() => author.favoriteBook.load({ forceReload: true }));
      if (!isLoaded(author, "favoriteBook")) throw new Error("Expected favorite book to be loaded");
      // When the caller reads the cached reference
      // Then the reference still requires caller permission
      expect(() => author.favoriteBook.get).toThrow("Cannot read favoriteBook");
    });
  });

  describe("ReactiveManyToMany", () => {
    it("derives from protected ratings but filters hidden reviews from the result", async () => {
      // Given two qualifying reviews, one of which the caller cannot see
      await insertAuthor({ first_name: "author" });
      await insertBook({ title: "book", author_id: 1 });
      await insertBookReview({ book_id: 1, rating: 5 });
      await insertBookReview({ book_id: 1, rating: 5 });
      const em = newEntityManager();
      em.addPlugin(new HiddenMemberPlugin("br:2"));
      // And the caller cannot read the ratings used to select reviews
      em.addPlugin(new ProtectedFieldsHookPlugin(["rating"]));
      const author = await em.load(Author, "a:1");
      // When the caller requests the best reviews
      const reviews = await author.bestReviews.load({ forceReload: true });
      if (!isLoaded(author, "bestReviews")) throw new Error("Expected best reviews to be loaded");
      // Then only the visible review is returned
      expect(reviews.map((review) => review.id)).toEqual(["br:1"]);
      // When trusted code reads the same cached collection
      // Then both qualifying reviews remain members
      expect(runInTrustedContext(() => author.bestReviews.get.map((review) => review.id).sort())).toEqual([
        "br:1",
        "br:2",
      ]);
    });

    it("checks the collection field even when membership is cached", async () => {
      // Given a field-only plugin protecting already calculated membership
      await insertAuthor({ first_name: "author" });
      const em = newEntityManager();
      em.addPlugin(new ProtectedFieldsHookPlugin(["bestReviews"]));
      const author = await em.load(Author, "a:1");
      await runInTrustedContext(() => author.bestReviews.load({ forceReload: true }));
      if (!isLoaded(author, "bestReviews")) throw new Error("Expected best reviews to be loaded");
      // When the caller reads the cached collection
      // Then the trusted load did not grant access to the field
      expect(() => author.bestReviews.get).toThrow("Cannot read bestReviews");
    });
  });

  describe("AsyncReactiveField", () => {
    it("checks access before running the query for a derived count", async () => {
      // Given a publisher whose book review count the caller cannot read
      await insertPublisher({ name: "publisher" });
      const em = newEntityManager();
      em.addPlugin(new ProtectedFieldsHookPlugin(["numberOfBookReviews"]));
      const publisher = await em.load(SmallPublisher, "p:1");
      // When the caller requests the count
      await expect(publisher.numberOfBookReviews.load()).rejects.toThrow("Cannot read numberOfBookReviews");
      // Then the query calculation never started
      expect(publisher.transientFields.numberOfBookReviewCalcs).toBe(0);
    });

    it("runs the derived count query in trusted context", async () => {
      // Given a plugin that records the context of the book review query
      await insertPublisher({ name: "publisher" });
      const em = newEntityManager();
      const observer = new QueryContextPlugin();
      em.addPlugin(observer);
      // And a field-only policy that permits the count
      em.addPlugin(new ProtectedFieldsHookPlugin(["name"]));
      const publisher = await em.load(SmallPublisher, "p:1");
      // When the caller requests the derived count
      await publisher.numberOfBookReviews.load();
      // Then its query ran on behalf of the calculation
      expect(observer.queries.filter((query) => query.operation === "find-count")).toEqual([
        { operation: "find-count", trusted: true },
      ]);
    });
  });
});

/** Records the execution context observable by another plugin during real relation queries. */
class QueryContextPlugin extends Plugin {
  readonly queries: { operation: FindOperation; trusted: boolean }[] = [];

  /** Observes query classification without changing query execution. */
  beforeFind(_meta: EntityMetadata, operation: FindOperation): void {
    this.queries.push({ operation, trusted: isInTrustedContext() });
  }
}

/** Models a restricted member without changing the canonical relationship. */
class HiddenMemberPlugin extends Plugin {
  constructor(private readonly hiddenId: string) {
    super();
  }

  /** Excludes the restricted member from user reads. */
  canViewEntity(entity: Entity): boolean {
    return isInTrustedContext() || entity.id !== this.hiddenId;
  }
}

/** Denies untrusted reads of the named fields on a visibility-aware EM. */
class ProtectedFieldsPlugin extends Plugin {
  constructor(private readonly fields: string[]) {
    super();
  }

  canViewEntity(): boolean {
    return true;
  }

  beforeGetField(_entity: Entity, field: string): void {
    if (!isInTrustedContext() && this.fields.includes(field)) throw new Error(`Cannot read ${field}`);
  }
}

/** Denies untrusted cold reads of the named fields on an ordinary EM, where the plugin owns the trusted bypass. */
class ProtectedFieldsHookPlugin extends Plugin {
  constructor(private readonly fields: string[]) {
    super();
  }

  beforeGetField(_entity: Entity, field: string): void {
    if (!isInTrustedContext() && this.fields.includes(field)) throw new Error(`Cannot read ${field}`);
  }
}
