import { type Entity, Plugin, getField, isInTrustedContext, runInTrustedContext } from "joist-orm";
import { Author, Book, ParentGroup } from "src/entities";
import { insertAuthor, insertBook, insertParentGroup, select } from "src/entities/inserts";
import { newEntityManager } from "src/testEm";

describe("EntityManager.visibility", () => {
  it("omits hidden entities from the public identity-map list", async () => {
    // Given two cached authors, one hidden by the plugin
    await insertAuthor({ first_name: "visible" });
    await insertAuthor({ first_name: "hidden" });
    const em = newEntityManager();
    const [visible, hidden] = await em.loadAll(Author, ["a:1", "a:2"]);
    em.addPlugin(new VisibilityPlugin(hidden.id));
    // When the caller lists the identity map
    // Then only visible entities are returned
    expect(em.entities).toMatchEntity([visible]);
  });

  it("preserves complete identity-map membership for trusted code", async () => {
    // Given a cached author hidden from public callers
    await insertAuthor({ first_name: "hidden" });
    const em = newEntityManager();
    const hidden = await em.load(Author, "a:1");
    em.addPlugin(new VisibilityPlugin(hidden.id));
    // When trusted business logic lists entities
    // Then the plugin allows the complete view
    expect(runInTrustedContext(() => em.entities)).toMatchEntity([hidden]);
  });

  it("filters the type-specific identity-map list", async () => {
    // Given visible and hidden authors in the same identity map
    await insertAuthor({ first_name: "visible" });
    await insertAuthor({ first_name: "hidden" });
    const em = newEntityManager();
    const [visible, hidden] = await em.loadAll(Author, ["a:1", "a:2"]);
    em.addPlugin(new VisibilityPlugin(hidden.id));
    // When the caller lists authors
    // Then hidden authors are omitted
    expect(em.getEntities(Author)).toMatchEntity([visible]);
  });

  it("hides cached entities from getEntity", async () => {
    // Given a cached author whose visibility is denied
    await insertAuthor({ first_name: "hidden" });
    const em = newEntityManager();
    const hidden = await em.load(Author, "a:1");
    em.addPlugin(new VisibilityPlugin(hidden.id));
    // When the caller looks up the author without querying
    // Then the cached entity is not disclosed
    expect(em.getEntity(hidden.id)).toMatchEntity(undefined);
  });

  it("allows trusted getEntity without removing the hidden instance", async () => {
    // Given a cached author hidden from public callers
    await insertAuthor({ first_name: "hidden" });
    const em = newEntityManager();
    const hidden = await em.load(Author, "a:1");
    em.addPlugin(new VisibilityPlugin(hidden.id));
    // When trusted business logic retrieves the cached author
    // Then the canonical instance is still present
    expect(runInTrustedContext(() => em.getEntity(hidden.id))).toMatchEntity(hidden);
  });

  it("rejects hidden em.load identity-map hits", async () => {
    // Given a cached author hidden from public callers
    await insertAuthor({ first_name: "hidden" });
    const em = newEntityManager();
    const hidden = await em.load(Author, "a:1");
    em.addPlugin(new VisibilityPlugin(hidden.id));
    // When the caller loads the cached id
    // Then the cache hit has the same not-found behavior as an absent entity
    await expect(em.load(Author, hidden.id)).rejects.toThrow(`${hidden.id} was not found`);
  });

  it("checks visibility after a cache-miss load hydrates its entity", async () => {
    // Given a hidden author absent from the reader's identity map
    await insertAuthor({ first_name: "hidden" });
    const em = newEntityManager();
    em.addPlugin(new VisibilityPlugin("a:1"));
    // When the caller loads the author from the database
    // Then hydration does not bypass public visibility
    await expect(em.load(Author, "a:1")).rejects.toThrow("a:1 was not found");
  });

  it("retains a rejected load for subsequent trusted access", async () => {
    // Given a hidden author rejected at the public return boundary
    await insertAuthor({ first_name: "hidden" });
    const em = newEntityManager();
    em.addPlugin(new VisibilityPlugin("a:1"));
    await em.load(Author, "a:1").catch(() => undefined);
    // When trusted business logic loads that author
    const loaded = await runInTrustedContext(() => em.load(Author, "a:1"));
    // Then the canonical entity remains usable
    expect(loaded).toMatchEntity({ id: "a:1" });
  });

  it("rechecks visibility after trusted loads", async () => {
    // Given an author hydrated by trusted code
    await insertAuthor({ first_name: "hidden" });
    const em = newEntityManager();
    em.addPlugin(new VisibilityPlugin("a:1"));
    await runInTrustedContext(() => em.load(Author, "a:1"));
    // When an untrusted caller loads the same id
    // Then the trusted result is not reused as an authorization decision
    await expect(em.load(Author, "a:1")).rejects.toThrow("a:1 was not found");
  });

  it("rejects hidden members in loadAll cache hits", async () => {
    // Given two cached authors with different visibility
    await insertAuthor({ first_name: "visible" });
    await insertAuthor({ first_name: "hidden" });
    const em = newEntityManager();
    const [visible, hidden] = await em.loadAll(Author, ["a:1", "a:2"]);
    em.addPlugin(new VisibilityPlugin(hidden.id));
    // When the caller requires both authors
    // Then loadAll reports the invisible author as missing
    await expect(em.loadAll(Author, [visible.id, hidden.id])).rejects.toThrow(`${hidden.id} were not found`);
  });

  it("omits hidden members from loadAllIfExists", async () => {
    // Given two persisted authors with different visibility
    await insertAuthor({ first_name: "visible" });
    await insertAuthor({ first_name: "hidden" });
    const em = newEntityManager();
    em.addPlugin(new VisibilityPlugin("a:2"));
    // When the caller loads whichever authors are visible
    const loaded = await em.loadAllIfExists(Author, ["a:1", "a:2"]);
    // Then the hidden author is omitted
    expect(loaded).toMatchEntity([{ id: "a:1" }]);
  });

  it("filters find results even without query-filtering hooks", async () => {
    // Given two authors and an entity-visibility-only plugin
    await insertAuthor({ first_name: "visible" });
    await insertAuthor({ first_name: "hidden" });
    const em = newEntityManager();
    em.addPlugin(new VisibilityPlugin("a:2"));
    // When the caller finds all authors
    const found = await em.find(Author, {});
    // Then only visible entities cross the public boundary
    expect(found).toMatchEntity([{ id: "a:1" }]);
  });

  it("rechecks a cached find result after visibility changes", async () => {
    // Given an author returned before the plugin hides it
    await insertAuthor({ first_name: "author" });
    const em = newEntityManager();
    const plugin = new VisibilityPlugin();
    em.addPlugin(plugin);
    await em.find(Author, {});
    // When visibility changes without clearing the find cache
    plugin.hiddenId = "a:1";
    // Then the cached result is filtered using the current policy
    expect(await em.find(Author, {})).toMatchEntity([]);
  });

  it("allows synchronous reference ids without loading hidden targets", async () => {
    // Given a book loaded without its author in a visibility-aware EM
    await insertAuthor({ first_name: "author" });
    await insertBook({ title: "book", author_id: 1 });
    const em = newEntityManager();
    em.addPlugin(new VisibilityPlugin("a:1"));
    const loaded = await em.load(Book, "b:1");
    // When the caller reads an unloaded reference id
    // Then the stored FK is readable despite the target's visibility
    expect(loaded.author.id).toEqual("a:1");
  });

  it("allows reference ids once their visible target has been loaded", async () => {
    // Given a book whose visible author is not initially cached
    await insertAuthor({ first_name: "author" });
    await insertBook({ title: "book", author_id: 1 });
    const em = newEntityManager();
    em.addPlugin(new VisibilityPlugin());
    const loaded = await em.load(Book, "b:1");
    // When the caller loads the reference before reading its id
    await loaded.author.load();
    // Then loading the target does not change its readable id
    expect(loaded.author.id).toEqual("a:1");
  });

  it("keeps hidden children available for cascade deletion", async () => {
    // Given an author with a hidden book in a visibility-aware EM
    await insertAuthor({ first_name: "author" });
    await insertBook({ title: "book", author_id: 1 });
    const em = newEntityManager();
    em.addPlugin(new VisibilityPlugin("b:1"));
    const author = await em.load(Author, "a:1", "books");
    // When the author is deleted and flushed
    em.delete(author);
    await em.flush();
    // Then canonical cleanup still deletes the hidden book
    expect(await select("books")).toEqual([]);
  });

  it("omits hidden entities from pending changes", async () => {
    // Given a hidden author's pending name change
    await insertAuthor({ first_name: "author" });
    const em = newEntityManager();
    const author = await em.load(Author, "a:1");
    em.addPlugin(new VisibilityPlugin(author.id));
    author.firstName = "changed";
    // When the caller inspects pending changes
    // Then the hidden entity is omitted from the public list
    expect(em.pendingChanges).toEqual([]);
  });

  it("filters flush results outside trusted execution", async () => {
    // Given a pending change to an entity hidden from the caller
    await insertAuthor({ first_name: "author" });
    const em = newEntityManager();
    const author = await em.load(Author, "a:1");
    em.addPlugin(new VisibilityPlugin(author.id));
    author.firstName = "changed";
    // When flush persists the change using trusted bookkeeping
    const flushed = await em.flush();
    // Then its public result does not expose the hidden entity
    expect(flushed).toMatchEntity([]);
  });

  it("filters custom-row hydration without losing canonical state", async () => {
    // Given a persisted author and its actual database row
    await insertAuthor({ first_name: "author" });
    const rows = await select("authors");
    const em = newEntityManager();
    em.addPlugin(new VisibilityPlugin("a:1"));
    // When the caller hydrates that row using the public API
    const hydrated = em.hydrate(Author, rows);
    // Then the hidden entity is omitted from the result
    expect(hydrated).toMatchEntity([]);
  });

  it("keeps filtered custom-row hydration available to trusted code", async () => {
    // Given a hidden author hydrated through the public custom-row API
    await insertAuthor({ first_name: "author" });
    const rows = await select("authors");
    const em = newEntityManager();
    em.addPlugin(new VisibilityPlugin("a:1"));
    em.hydrate(Author, rows);
    // When trusted business logic accesses the identity map
    // Then the full row was retained despite filtering the public result
    expect(runInTrustedContext(() => em.getEntity("a:1"))).toMatchEntity({ id: "a:1" });
  });

  it("does not expose hidden matches from an existing identity-map index", async () => {
    // Given enough authors for an indexed lookup before plugin registration
    for (let i = 0; i < 500; i++) await insertAuthor({ first_name: "indexed" });
    const em = newEntityManager();
    const authors = await em.find(Author, {});
    em.filterEntities(Author, { firstName: "indexed" });
    // When a plugin hides one of the previously indexed authors
    class RestrictedAuthorPlugin extends Plugin {
      canViewEntity(entity: Entity): boolean {
        return entity !== authors[0];
      }
    }
    em.addPlugin(new RestrictedAuthorPlugin());
    // Then the public lookup cannot reuse the index's unfiltered membership
    expect(em.filterEntities(Author, { firstName: "indexed" })).toMatchEntity(authors.slice(1));
  });

  it("allows isSet for an unloaded hidden reference", async () => {
    // Given a book whose author is hidden from the reader
    await insertAuthor({ first_name: "author" });
    await insertBook({ title: "book", author_id: 1 });
    const em = newEntityManager();
    em.addPlugin(new VisibilityPlugin("a:1"));
    // When the book is loaded without its author
    const loaded = await em.load(Book, "b:1");
    // Then the relationship can reveal that its target exists
    expect(loaded.author.isSet).toEqual(true);
  });

  it("still authorizes the relationship field when reading an unloaded reference id", async () => {
    // Given a plugin that permits entities but denies the author field
    await insertAuthor({ first_name: "author" });
    await insertBook({ title: "book", author_id: 1 });
    const em = newEntityManager();
    class RestrictedFieldPlugin extends VisibilityPlugin {
      beforeGetField(_entity: Entity, field: string): void {
        if (field === "author") throw new Error("Cannot read author");
      }
    }
    em.addPlugin(new RestrictedFieldPlugin());
    // When the book is loaded without its author
    const loaded = await em.load(Book, "b:1");
    // Then reading the FK still requires field permission
    expect(() => loaded.author.id).toThrow("Cannot read author");
  });

  it("keeps trusted field approvals out of subsequent untrusted reads", async () => {
    // Given a reader that cannot read an author's name
    await insertAuthor({ first_name: "private" });
    const em = newEntityManager();
    em.addPlugin(new FieldVisibilityPlugin("firstName"));
    const loaded = await em.load(Author, "a:1");
    // When trusted code warms the generated getter
    runInTrustedContext(() => loaded.firstName);
    // Then the untrusted getter still requires permission
    expect(() => loaded.firstName).toThrow("Cannot read firstName");
  });

  it("returns trusted fields without invoking a denying read hook", async () => {
    // Given a field policy that denies names regardless of context
    await insertAuthor({ first_name: "private" });
    const em = newEntityManager();
    em.addPlugin(new FieldVisibilityPlugin("firstName"));
    const loaded = await em.load(Author, "a:1");
    // When trusted code reads the field twice
    const name = runInTrustedContext(() => {
      getField(loaded, "firstName");
      return loaded.firstName;
    });
    // Then both the cold read and warm getter bypass authorization
    expect(name).toEqual("private");
  });

  it("rechecks untrusted fields after permission is revoked", async () => {
    // Given a visibility-aware reader allowed to read names
    await insertAuthor({ first_name: "private" });
    const em = newEntityManager();
    const plugin = new FieldVisibilityPlugin("firstName");
    plugin.allowed = true;
    em.addPlugin(plugin);
    const loaded = await em.load(Author, "a:1");
    loaded.firstName;
    // When the permission is revoked after an approved read
    plugin.allowed = false;
    // Then the getter cannot reuse the earlier approval
    expect(() => loaded.firstName).toThrow("Cannot read firstName");
  });

  it("keeps trusted extra-word fields out of untrusted direct reads", async () => {
    // Given an author with a protected field beyond the first read bitmap word
    await insertAuthor({ first_name: "author", ssn: "private" });
    const em = newEntityManager();
    em.addPlugin(new FieldVisibilityPlugin("ssn"));
    const loaded = await em.load(Author, "a:1");
    // When trusted code reads the field
    runInTrustedContext(() => loaded.ssn);
    // Then a direct untrusted read still checks permission
    expect(() => getField(loaded, "ssn")).toThrow("Cannot read ssn");
  });

  it("invalidates existing field approvals when visibility is enabled late", async () => {
    // Given an ordinary entity whose name getter has been warmed
    await insertAuthor({ first_name: "private" });
    const em = newEntityManager();
    const author = await em.load(Author, "a:1");
    author.firstName;
    // When a visibility plugin is installed after entity construction
    em.addPlugin(new FieldVisibilityPlugin("firstName"));
    // Then the earlier approval cannot bypass the new policy
    expect(() => author.firstName).toThrow("Cannot read firstName");
  });

  it("isolates concurrent trusted and untrusted reads of the same entity", async () => {
    // Given a reader with access to the author but not the name
    await insertAuthor({ first_name: "private" });
    const em = newEntityManager();
    em.addPlugin(new FieldVisibilityPlugin("firstName"));
    const loaded = await em.load(Author, "a:1");
    // When asynchronous trusted work warms the getter alongside an untrusted read
    const trusted = runInTrustedContext(async () => {
      await Promise.resolve();
      return loaded.firstName;
    });
    const untrusted = Promise.resolve().then(() => loaded.firstName);
    // Then only the trusted task can read the field
    await expect(Promise.all([trusted, untrusted])).rejects.toThrow("Cannot read firstName");
  });

  it("does not extend trusted population into the caller's callback", async () => {
    // Given a visibility-aware reader populating an author's books
    await insertAuthor({ first_name: "author" });
    await insertBook({ title: "book", author_id: 1 });
    const em = newEntityManager();
    em.addPlugin(new VisibilityPlugin());
    const loaded = await em.load(Author, "a:1");
    // When population invokes the application callback
    const trusted = await em.populate(loaded, "books", () => isInTrustedContext());
    // Then the callback retains the caller's untrusted context
    expect(trusted).toEqual(false);
  });

  it("does not cache a reentrant field read made by an authorization hook", async () => {
    // Given a hook that reads the protected field while deciding permission
    await insertAuthor({ first_name: "private" });
    const em = newEntityManager();
    class ReentrantPlugin extends VisibilityPlugin {
      beforeGetField(entity: Entity, field: string): void {
        if (field !== "firstName") return;
        getField(entity, field);
        throw new Error("Cannot read firstName");
      }
    }
    em.addPlugin(new ReentrantPlugin());
    const loaded = await em.load(Author, "a:1");
    // When the hook reenters the getter before rejecting access
    // Then reentrancy terminates without authorizing the outer read
    expect(() => loaded.firstName).toThrow("Cannot read firstName");
  });

  it("checks intermediate relationship permissions for SQL lenses", async () => {
    // Given a book whose author relationship is protected
    await insertAuthor({ first_name: "author" });
    await insertBook({ title: "book", author_id: 1 });
    const em = newEntityManager();
    em.addPlugin(new FieldVisibilityPlugin("author"));
    const book = await em.load(Book, "b:1");
    // When a SQL lens traverses the protected relationship
    // Then the intermediate field permission is enforced
    await expect(book.load((b) => b.author.books, { sql: true })).rejects.toThrow("Cannot read author");
  });

  it("filters SQL lens results after a trusted traversal warmed the loader", async () => {
    // Given an author with one hidden book
    await insertAuthor({ first_name: "author" });
    await insertBook({ title: "visible", author_id: 1 });
    await insertBook({ title: "hidden", author_id: 1 });
    const em = newEntityManager();
    em.addPlugin(new VisibilityPlugin("b:2"));
    const book = await em.load(Book, "b:1");
    // And a trusted SQL traversal has loaded both books
    await runInTrustedContext(() => book.load((b) => b.author.books, { sql: true }));
    // When an untrusted caller repeats the traversal
    const books = await book.load((b) => b.author.books, { sql: true });
    // Then only the visible book is returned
    expect(books).toMatchEntity([{ id: "b:1" }]);
  });

  it("checks lazy-column permissions after trusted hydration", async () => {
    // Given a protected lazy column
    await insertParentGroup({ name: "group", bulk_data: { secret: true } });
    const em = newEntityManager();
    em.addPlugin(new FieldVisibilityPlugin("bulkData"));
    const group = await em.load(ParentGroup, "parentGroup:1");
    // And trusted code has loaded its value
    const loaded = await runInTrustedContext(() => em.populate(group, "bulkData"));
    // When an untrusted caller reads the cached column
    // Then the field remains protected
    expect(() => loaded.bulkData.get).toThrow("Cannot read bulkData");
  });

  it("checks each caller sharing a trusted lazy-column load", async () => {
    // Given a protected lazy column that has not been loaded
    await insertParentGroup({ name: "group", bulk_data: { secret: true } });
    const em = newEntityManager();
    em.addPlugin(new FieldVisibilityPlugin("bulkData"));
    const group = await em.load(ParentGroup, "parentGroup:1");
    // When trusted and untrusted callers share the pending hydration
    const trusted = runInTrustedContext(() => group.bulkData.load());
    const untrusted = group.bulkData.load();
    // Then the trusted caller cannot authorize the untrusted caller's result
    await expect(Promise.all([trusted, untrusted])).rejects.toThrow("Cannot read bulkData");
  });
});

/** Models a plugin-maintained synchronous decision and later policy changes. */
class VisibilityPlugin extends Plugin {
  constructor(public hiddenId?: string) {
    super();
  }

  /** Reads only precomputed policy state, never issuing queries from a visibility check. */
  canViewEntity(entity: Entity): boolean {
    return entity.id !== this.hiddenId;
  }
}

/** Checks field permission without a plugin-owned trusted bypass. */
class FieldVisibilityPlugin extends VisibilityPlugin {
  allowed = false;

  constructor(private readonly field: string) {
    super();
  }

  beforeGetField(_entity: Entity, field: string): void {
    if (field === this.field && !this.allowed) throw new Error(`Cannot read ${field}`);
  }
}
