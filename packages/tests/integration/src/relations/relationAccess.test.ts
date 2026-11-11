import {
  type Entity,
  type EntityMetadata,
  type FindOperation,
  ManyToManyCollection,
  ManyToOneReferenceImpl,
  Plugin,
  isInTrustedContext,
  runInTrustedContext,
} from "joist-orm";
import { Author, Book, newAuthor, newBook, newTag } from "src/entities";
import { newEntityManager } from "src/testEm";

describe("relationAccess", () => {
  it("projects cached many-to-many membership without truncating the trusted view", async () => {
    // Given a book with a tag hidden by the plugin
    const em = newEntityManager();
    const visible = newTag(em, { name: "visible" });
    const hidden = newTag(em, { name: "hidden" });
    const book = newBook(em, { tags: [visible, hidden] });
    await em.flush();
    const userEm = newEntityManager();
    userEm.addPlugin(new HiddenMemberPlugin(hidden.id));
    const loaded = await userEm.load(Book, book.id, "tags");
    // When a public read projects the cached collection
    // Then only its visible member is exposed
    expect(loaded.tags.get.map((tag) => tag.id)).toEqual([visible.id]);
    // When business logic reads the same collection
    // Then the canonical membership is intact
    expect(runInTrustedContext(() => loaded.tags.get.map((tag) => tag.id))).toEqual([visible.id, hidden.id]);
  });

  it("preserves hidden join rows when replacing visible members", async () => {
    // Given a book with visible and hidden tags
    const em = newEntityManager();
    const visible = newTag(em, { name: "visible" });
    const hidden = newTag(em, { name: "hidden" });
    const book = newBook(em, { tags: [visible, hidden] });
    await em.flush();
    const userEm = newEntityManager();
    userEm.addPlugin(new HiddenMemberPlugin(hidden.id));
    const loaded = await userEm.load(Book, book.id, "tags");
    // When the user replaces all visible tags with an empty list
    loaded.tags.set([]);
    await userEm.flush();
    // Then the hidden join row remains in the database
    const reloaded = await newEntityManager().load(Book, book.id, "tags");
    expect(reloaded.tags.get.map((tag) => tag.id)).toEqual([hidden.id]);
  });

  it("preserves hidden join rows when removing all visible members", async () => {
    // Given a book with visible and hidden tags
    const em = newEntityManager();
    const visible = newTag(em, { name: "visible" });
    const hidden = newTag(em, { name: "hidden" });
    const book = newBook(em, { tags: [visible, hidden] });
    await em.flush();
    const userEm = newEntityManager();
    userEm.addPlugin(new HiddenMemberPlugin(hidden.id));
    const loaded = await userEm.load(Book, book.id, "tags");
    // When the user removes all visible tags
    loaded.tags.removeAll();
    await userEm.flush();
    // Then the hidden join row remains in the database
    const reloaded = await newEntityManager().load(Book, book.id, "tags");
    expect(reloaded.tags.get.map((tag) => tag.id)).toEqual([hidden.id]);
  });

  it("identifies reference loads without granting trusted execution to their queries", async () => {
    // Given a persisted book whose author is not in the reader's identity map
    const em = newEntityManager();
    const book = newBook(em);
    await em.flush();
    const reader = newEntityManager();
    const loaded = await reader.load(Book, book.id);
    const plugin = new QueryContextPlugin();
    reader.addPlugin(plugin);
    // When untrusted code loads the author
    await loaded.author.load();
    // Then query hooks can distinguish the relation load without becoming trusted
    expect(plugin.queries).toEqual([{ operation: "reference-load", trusted: false }]);
  });

  it("keeps collection loads and member lookups in the caller's execution context", async () => {
    // Given two authors with unloaded book collections
    const em = newEntityManager();
    const first = newAuthor(em);
    const second = newAuthor(em);
    newBook(em, { author: first });
    const book = newBook(em, { author: second });
    await em.flush();
    const reader = newEntityManager();
    const authors = await reader.loadAll(Author, [first.id, second.id]);
    const plugin = new QueryContextPlugin();
    reader.addPlugin(plugin);
    // When untrusted code loads one collection and looks up a member of the other
    await authors[0].books.load();
    await authors[1].books.find(book.id);
    // Then both queries retain the caller's untrusted context
    expect(plugin.queries).toEqual([
      { operation: "o2m-load", trusted: false },
      { operation: "o2m-find", trusted: false },
    ]);
  });
  it("lets a plugin restrict collection reads even in trusted code", async () => {
    // Given a book with a tag excluded by a context-independent plugin
    const em = newEntityManager();
    const visible = newTag(em, { name: "visible" });
    const hidden = newTag(em, { name: "hidden" });
    const book = newBook(em, { tags: [visible, hidden] });
    await em.flush();
    class RestrictedTagsPlugin extends Plugin {
      filterCollection(_entity: Entity, _field: string, values: readonly Entity[]): readonly Entity[] {
        return values.filter((value) => value.id !== hidden.id);
      }
    }
    // And the reader installs its plugin before constructing the relation
    const reader = newEntityManager();
    reader.addPlugin(new RestrictedTagsPlugin());
    const loaded = await reader.load(Book, book.id, "tags");
    // When trusted code reads the collection
    const tags = runInTrustedContext(() => loaded.tags.get);
    // Then the plugin's policy still applies
    expect(tags.map((tag) => tag.id)).toEqual([visible.id]);
  });

  it("lets a plugin reject reference reads even in trusted code", async () => {
    // Given a book whose author reference is restricted by a context-independent plugin
    const em = newEntityManager();
    const book = newBook(em);
    await em.flush();
    class RestrictedAuthorPlugin extends Plugin {
      beforeGetReference(_entity: Entity, field: string): void {
        if (field === "author") throw new Error("Author reference is restricted");
      }
    }
    // And the reader installs its plugin before constructing the relation
    const reader = newEntityManager();
    reader.addPlugin(new RestrictedAuthorPlugin());
    const loaded = await reader.load(Book, book.id, "author");
    // When trusted code reads the author
    // Then Joist does not bypass the plugin
    expect(() => runInTrustedContext(() => loaded.author.get)).toThrow("Author reference is restricted");
  });

  it("lets a plugin reject collection replacement even in trusted code", async () => {
    // Given a book with tags that cannot be replaced
    const em = newEntityManager();
    const book = newBook(em, { tags: [newTag(em, { name: "fixed" })] });
    await em.flush();
    class FixedTagsPlugin extends Plugin {
      beforeSetCollection(_entity: Entity, field: string, values: readonly Entity[]): readonly Entity[] {
        if (field === "tags") throw new Error("Tags cannot be replaced");
        return values;
      }
    }
    // And the reader installs its plugin before constructing the relation
    const reader = newEntityManager();
    reader.addPlugin(new FixedTagsPlugin());
    const loaded = await reader.load(Book, book.id, "tags");
    // When trusted code replaces the tags
    // Then Joist does not bypass the plugin
    expect(() => runInTrustedContext(() => loaded.tags.set([]))).toThrow("Tags cannot be replaced");
  });

  it("leaves already constructed collections unchanged after late registration", async () => {
    // Given a book whose collection was constructed without relation plugins
    const em = newEntityManager();
    const hidden = newTag(em, { name: "hidden" });
    const book = newBook(em, { tags: [hidden] });
    await em.flush();
    const tags = book.tags;
    // When a visibility plugin is installed after construction
    em.addPlugin(new HiddenMemberPlugin(hidden.id));
    // Then the existing collection retains its original behavior
    expect(tags.get.map((tag) => tag.id)).toEqual([hidden.id]);
  });

  it("intercepts lazy collections first constructed after registration", async () => {
    // Given an entity loaded before registration, with its collection still unconstructed
    const em = newEntityManager();
    const hidden = newTag(em, { name: "hidden" });
    const book = newBook(em, { tags: [hidden] });
    await em.flush();
    const reader = newEntityManager();
    const loaded = await reader.load(Book, book.id);
    // When a visibility plugin is installed before the first collection access
    reader.addPlugin(new HiddenMemberPlugin(hidden.id));
    const tags = await loaded.tags.load();
    // Then the newly constructed collection applies the plugin
    expect(tags).toEqual([]);
  });

  it("leaves already constructed references unchanged after late registration", async () => {
    // Given a book whose reference was constructed without relation plugins
    const em = newEntityManager();
    const author = newAuthor(em);
    const book = newBook(em, { author });
    await em.flush();
    const reference = book.author;
    // When a reference policy is installed after construction
    class RestrictedReferencePlugin extends Plugin {
      beforeGetReference(): void {
        throw new Error("Reference is restricted");
      }
    }
    em.addPlugin(new RestrictedReferencePlugin());
    // Then the existing reference retains its original behavior
    expect(reference.get).toEqual(author);
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
    const em = newEntityManager();
    const book = newBook(em);
    await em.flush();
    const reader = newEntityManager();
    const loaded = await reader.load(Book, book.id);
    // When a reference policy is installed before the first reference access
    class RestrictedReferencePlugin extends Plugin {
      beforeGetReference(): void {
        throw new Error("Reference is restricted");
      }
    }
    reader.addPlugin(new RestrictedReferencePlugin());
    // Then even an unloaded id-only read applies the plugin
    expect(() => loaded.author.id).toThrow("Reference is restricted");
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
  filterCollection(_entity: Entity, _field: string, values: readonly Entity[]): readonly Entity[] {
    if (isInTrustedContext()) return values;
    return values.filter((value) => value.id !== this.hiddenId);
  }

  /** Retains restricted membership when the caller replaces its visible list. */
  beforeSetCollection(
    _entity: Entity,
    _field: string,
    values: readonly Entity[],
    current: () => readonly Entity[],
  ): readonly Entity[] {
    if (isInTrustedContext()) return values;
    return [...values, ...current().filter((value) => value.id === this.hiddenId)];
  }
}
