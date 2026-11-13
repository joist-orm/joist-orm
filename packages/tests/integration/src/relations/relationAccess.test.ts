import {
  type Entity,
  type EntityMetadata,
  type FindOperation,
  ManyToManyCollection,
  ManyToOneReferenceImpl,
  Plugin,
  isInTrustedContext,
  isLoadedCollection,
  runInTrustedContext,
} from "joist-orm";
import { Author, Book, PublisherGroup, Tag, newBook } from "src/entities";
import {
  insertAuthor,
  insertAuthorToTag,
  insertBook,
  insertBookToTag,
  insertComment,
  insertCritic,
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
      class ProtectedAuthorPlugin extends Plugin {
        canViewEntity(): boolean {
          return true;
        }
        beforeGetField(_entity: Entity, field: string): void {
          if (field === "author") throw new Error("Cannot read author");
        }
      }
      em.addPlugin(new ProtectedAuthorPlugin());
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
      class ProtectedCommentPlugin extends Plugin {
        canViewEntity(): boolean {
          return true;
        }
        beforeGetField(_entity: Entity, field: string): void {
          if (field === "randomComment") throw new Error("Cannot read randomComment");
        }
      }
      em.addPlugin(new ProtectedCommentPlugin());
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
