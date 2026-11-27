import { expectTypeOf } from "expect-type";
import { type Entity, Plugin, isInTrustedContext, runInTrustedContext, toJSON } from "joist-orm";
import {
  Author,
  type AuthorId,
  Book,
  type BookId,
  Color,
  FavoriteShape,
  ParentGroup,
  type PublisherId,
  newAuthor,
  newSmallPublisher,
} from "src/entities";
import {
  insertAuthor,
  insertAuthorToTag,
  insertBook,
  insertImage,
  insertParentGroup,
  insertPublisher,
  insertSmallPublisherGroup,
  insertTag,
} from "src/entities/inserts";
import { newEntityManager } from "src/testEm";

describe("Entity.json", () => {
  it("can toJSON a primitive", async () => {
    const em = newEntityManager();
    const a = newAuthor(em);
    const payload = await toJSON(a, "firstName");
    expect(payload).toEqual({ firstName: "a1" });
    expectTypeOf(payload).toEqualTypeOf<{ firstName: string }>();
  });

  it("can toJSON multiple primitives", async () => {
    // Given a persisted author
    const em = newEntityManager();
    const a = newAuthor(em);
    await em.flush();
    // When the author's id, name, and favorite shape are requested
    const payload = await a.toJSON(["id", "firstName", "favoriteShape"]);
    // Then only the requested author fields are returned
    expect(payload).toEqual({
      id: "a:1",
      firstName: "a1",
      favoriteShape: undefined,
    });
    expectTypeOf(payload).toEqualTypeOf<{
      id: AuthorId | null;
      firstName: string;
      favoriteShape: FavoriteShape | undefined;
    }>();
  });

  it("support misc types", async () => {
    const em = newEntityManager();
    const a = newAuthor(em);
    await em.flush();
    const payload = await a.toJSON({
      reviews: "rating", // hasManyThrough
      latestComment: "text", // hasOneDerived
      numberOfPublicReviews: {}, // ReactiveField
      initials: {}, // getter
      favoriteBook: "title", // ReactiveReference
      numberOfBooks2: {}, // hasReactiveProperty
      hasLowerCaseFirstName: {}, // ReactiveGetter
    });
    expect(payload).toEqual({
      favoriteBook: undefined,
      hasLowerCaseFirstName: true,
      initials: "a",
      latestComment: undefined,
      numberOfBooks2: 0,
      numberOfPublicReviews: 0,
      reviews: [],
    });
    expectTypeOf(payload).toMatchTypeOf<{
      initials: string;
      numberOfBooks2: number;
      numberOfPublicReviews: number;
      favoriteBook: { title: string } | undefined;
      hasLowerCaseFirstName: boolean;
      latestComment: { text: string | undefined } | undefined;
      reviews: { rating: number }[];
    }>();
  });

  describe("m2o", () => {
    it("can be just the id", async () => {
      // Given a persisted author with a publisher
      await insertPublisher({ name: "p1" });
      await insertAuthor({ first_name: "a1", publisher_id: 1 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      // When only the publisher is requested without nested fields
      const payload = await a.toJSON(["publisher"]);
      // Then we output only the id
      expect(payload).toEqual({ publisher: "p:1" });
      expectTypeOf(payload).toEqualTypeOf<{ publisher: string | null }>();
    });

    it("can be just the id suffixed", async () => {
      // Given a persisted author with a publisher
      await insertPublisher({ name: "p1" });
      await insertAuthor({ first_name: "a1", publisher_id: 1 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      // When the author id and publisher id are requested
      const payload = await a.toJSON({ id: {}, publisherId: {} });
      // Then we output only the id
      expect(payload).toEqual({ id: "a:1", publisherId: "p:1" });
      expectTypeOf(payload).toMatchTypeOf<{ id: AuthorId | null; publisherId: string | null }>();
    });

    it("can nest the id and name", async () => {
      // Given a persisted author with a publisher
      await insertPublisher({ name: "p1" });
      await insertAuthor({ first_name: "a1", publisher_id: 1 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      // When the publisher's id and name are requested
      const payload = await toJSON(a, { publisher: ["id", "name"] });
      // Then we output the nested keys
      expect(payload).toEqual({ publisher: { id: "p:1", name: "p1" } });
      // ...why does toExpectTypeOf not work here?
      expectTypeOf(payload).toMatchTypeOf<{ publisher: { id: PublisherId | null; name: string } }>();
    });

    it("can nest multiple levels", async () => {
      await insertSmallPublisherGroup({ id: 1, name: "pg1" });
      await insertPublisher({ name: "p1", group_id: 1 });
      await insertAuthor({ first_name: "a1", publisher_id: 1 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      // Given two levels of nesting
      const payload = await toJSON(a, {
        publisher: { name: {}, group: "name" },
      });
      // Then we output the publisher child + group grandchild
      expect(payload).toEqual({
        publisher: {
          name: "p1",
          group: { name: "pg1" },
        },
      });
      // And it's typed correctly
      expectTypeOf(payload).toMatchTypeOf<{
        publisher: {
          name: string;
          group: { name: string | undefined };
        };
      }>();
    });

    it("can have custom names", async () => {
      // Given an author whose publisher belongs to a named group
      await insertSmallPublisherGroup({ id: 1, name: "pg1" });
      await insertPublisher({ name: "p1", group_id: 1 });
      await insertAuthor({ first_name: "a1", publisher_id: 1 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      // When the group name is requested as a custom publisher field
      const payload = await toJSON(a, {
        publisher: {
          id: {},
          // The custom field loads the publisher's group to obtain its name.
          groupName: async (p) => {
            // ...and this code is kind of gross...
            return (await p.populate("group")).group.get?.name;
          },
        },
      });
      // Then we output the custom key
      expect(payload).toEqual({
        publisher: { id: "p:1", groupName: "pg1" },
      });
      expectTypeOf(payload).toMatchTypeOf<{
        publisher: { id: PublisherId | null; groupName: string | undefined };
      }>();
    });
  });

  describe("o2m", () => {
    it("can be just the ids", async () => {
      // Given an author with two persisted books
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 1 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      // When books are requested without nested fields
      const payload = await toJSON(a, "books");
      // Then we output the nested keys
      expect(payload).toEqual({
        books: ["b:1", "b:2"],
      });
      expectTypeOf(payload).toMatchTypeOf<{ books: (string | null)[] }>();
    });

    it("can be just the ids suffixes", async () => {
      // Given an author with two persisted books
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 1 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      // When book ids are requested
      const payload = await a.toJSON({ bookIds: true });
      // Then we output the nested keys
      expect(payload).toEqual({ bookIds: ["b:1", "b:2"] });
      expectTypeOf(payload).toMatchTypeOf<{ bookIds: (BookId | null)[] }>();
    });

    it("can nest the id and name", async () => {
      // Given an author with two persisted books
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 1 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      // When book ids and titles are requested
      const payload = await toJSON(a, { books: ["id", "title"] });
      // Then we output the nested keys
      expect(payload).toEqual({
        books: [
          { id: "b:1", title: "b1" },
          { id: "b:2", title: "b2" },
        ],
      });
      expectTypeOf(payload).toMatchTypeOf<{ books: { id: BookId | null; title: string }[] }>();
    });
  });

  describe("m2m", () => {
    it("can be just the ids", async () => {
      // Given an author with two persisted tags
      await insertTag({ name: "t1" });
      await insertTag({ name: "t2" });
      await insertAuthor({ first_name: "a1" });
      await insertAuthorToTag({ author_id: 1, tag_id: 1 });
      await insertAuthorToTag({ author_id: 1, tag_id: 2 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      // When tags are requested without nested fields
      const payload = await toJSON(a, "tags");
      // Then we output the nested keys
      expect(payload).toEqual({
        tags: ["t:1", "t:2"],
      });
      expectTypeOf(payload).toMatchTypeOf<{ tags: (string | null)[] }>();
    });

    it("can nest the id and name", async () => {
      await insertTag({ name: "t1" });
      await insertTag({ name: "t2" });
      await insertAuthor({ first_name: "a1" });
      await insertAuthorToTag({ author_id: 1, tag_id: 1 });
      await insertAuthorToTag({ author_id: 1, tag_id: 2 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      // Given a hint that recurses into the tags
      const payload = await toJSON(a, { tags: "name" });
      // Then we output the nested keys
      expect(payload).toEqual({
        tags: [{ name: "t1" }, { name: "t2" }],
      });
      expectTypeOf(payload).toMatchTypeOf<{ tags: { name: string }[] }>();
    });
  });

  describe("o2o", () => {
    it("can be just the ids", async () => {
      // Given an author with a persisted image
      await insertAuthor({ first_name: "a1" });
      await insertImage({ type_id: 1, file_name: "f1", author_id: 1 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      // When the image is requested without nested fields
      const payload = await toJSON(a, "image");
      // Then only the image id is returned
      expect(payload).toEqual({ image: "i:1" });
      expectTypeOf(payload).toMatchTypeOf<{ image: string | null }>();
    });

    it("can nest the id and name", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertImage({ type_id: 1, file_name: "f1", author_id: 1 });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      const payload = await toJSON(a, { image: "fileName" });
      expect(payload).toEqual({ image: { fileName: "f1" } });
      expectTypeOf(payload).toMatchTypeOf<{ image: { fileName: string } }>();
    });
  });

  it("works on lists", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    const a2 = newAuthor(em);
    const payload = await toJSON([a1, a2], "firstName");
    expect(payload).toEqual([{ firstName: "a1" }, { firstName: "a2" }]);
    expectTypeOf(payload).toEqualTypeOf<{ firstName: string }[]>();
  });

  it("is available as a toJSON overload", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    const payload = await a1.toJSON(["firstName"]);
    expect(payload).toEqual({ firstName: "a1" });
    expectTypeOf(payload).toEqualTypeOf<{ firstName: string }>();
  });

  it("is not broken by JSON.stringify", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    const a2 = newAuthor(em);
    expect(JSON.stringify([a1, a2])).toBe(`[{"id":null},{"id":null}]`);
  });

  it("can use true to enable fields", async () => {
    // Given an author with two persisted books
    const em = newEntityManager();
    const a = newAuthor(em, { books: [{}, {}] });
    await em.flush();
    // When the name and books are enabled without nested fields
    const payload = await a.toJSON({ firstName: true, books: true });
    // Then the name and book ids are returned
    expect(payload).toEqual({ firstName: "a1", books: ["b:1", "b:2"] });
    expectTypeOf(payload).toMatchTypeOf<{ firstName: string; books: (BookId | null)[] }>();
  });

  it("keeps the no-hint default limited to the id", async () => {
    // Given a persisted author with a name
    const em = newEntityManager();
    const a = newAuthor(em);
    await em.flush();
    // When no fields are explicitly requested
    const payload = a.toJSON();
    // Then the name is not exposed
    expect(payload).toEqual({ id: "a:1" });
  });

  it("can include Date fields", async () => {
    // Given a persisted author with a creation timestamp
    const em = newEntityManager();
    const a = newAuthor(em);
    await em.flush();
    // When the creation timestamp is requested
    const payload = await toJSON(a, { createdAt: true });
    // Then the Date is preserved for JSON.stringify to encode
    expect(payload).toEqual({ createdAt: a.createdAt });
    expectTypeOf(payload).toEqualTypeOf<{ createdAt: Date }>();
  });

  it("encodes Date fields as ISO strings in JSON", async () => {
    // Given a persisted author with a creation timestamp
    const em = newEntityManager();
    const a = newAuthor(em);
    await em.flush();
    // When a hinted timestamp is encoded as JSON
    const json = JSON.stringify(await a.toJSON({ createdAt: true }));
    // Then the timestamp uses the standard Date JSON representation
    expect(json).toEqual(JSON.stringify({ createdAt: a.createdAt.toISOString() }));
  });

  it("uses null for the id of an unflushed author", async () => {
    // Given an author that has not been flushed
    const em = newEntityManager();
    const a = newAuthor(em);
    // When its id and name are requested
    const payload = await toJSON(a, ["id", "firstName"]);
    // Then the missing id does not prevent the name from being serialized
    expect(payload).toEqual({ id: null, firstName: "a1" });
    expectTypeOf(payload).toEqualTypeOf<{ id: AuthorId | null; firstName: string }>();
  });

  it("uses null for an unflushed reference id", async () => {
    // Given an author with a new publisher
    const em = newEntityManager();
    const a = newAuthor(em, { publisher: {} });
    // When only the publisher id is requested
    const payload = await a.toJSON({ publisherId: true });
    // Then the publisher's missing id is represented as null
    expect(payload).toEqual({ publisherId: null });
    expectTypeOf(payload).toEqualTypeOf<{ publisherId: string | null }>();
  });

  it("uses null for unflushed collection ids", async () => {
    // Given an author with a new book
    const em = newEntityManager();
    const a = newAuthor(em, { books: [{}] });
    // When only the book ids are requested
    const payload = await a.toJSON({ bookIds: true });
    // Then the book's missing id is represented as null
    expect(payload).toEqual({ bookIds: [null] });
    expectTypeOf(payload).toEqualTypeOf<{ bookIds: (BookId | null)[] }>();
  });

  it("can include ids in nested unflushed entities", async () => {
    // Given an author with a new book
    const em = newEntityManager();
    const a = newAuthor(em, { books: [{ title: "New book" }] });
    // When book ids and titles are requested together
    const payload = await a.toJSON({ books: ["id", "title"] });
    // Then the missing id does not prevent nested serialization
    expect(payload).toEqual({ books: [{ id: null, title: "New book" }] });
    expectTypeOf(payload).toEqualTypeOf<{ books: { id: BookId | null; title: string }[] }>();
  });

  it("unwraps selected persisted lazy fields", async () => {
    // Given a group with an unloaded array-valued embedding
    await insertParentGroup({ name: "pg1", lazy_embedding: "[1,2,3]" });
    const group = await newEntityManager().load(ParentGroup, "parentGroup:1");
    // When the embedding is selected
    const payload = await toJSON(group, { lazyEmbedding: true });
    // Then the original column value is serialized as data, not as entity IDs
    expect(payload).toStrictEqual({ lazyEmbedding: [1, 2, 3] });
  });

  it("keeps enum array values", async () => {
    // Given a publisher whose logo is red
    const publisher = newSmallPublisher(newEntityManager(), { logoColors: [Color.Red] });
    // When its logo colors are selected
    const payload = await toJSON(publisher, "logoColors");
    // Then the array contains the color code
    expect(payload).toEqual({ logoColors: [Color.Red] });
  });

  describe("with access policies", () => {
    it("applies field grants separately to books in the same collection", async () => {
      // Given an author with a public book and a private draft
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "Public", author_id: 1 });
      await insertBook({ title: "Draft", author_id: 1 });
      // And the draft's title is private
      const em = newEntityManager();
      em.addPlugin(
        new (class extends Plugin {
          canReadField(entity: Entity, field: string): boolean {
            return !(entity instanceof Book && entity.id === "b:2" && field === "title");
          }
        })(),
      );
      const author = await em.load(Author, "a:1");
      // When both book titles are requested
      const payload = await toJSON(author, { books: { title: true } });
      // Then the draft is still present, but its title is omitted
      expect(payload).toStrictEqual({ books: [{ title: "Public" }, {}] });
    });

    it("omits a denied relationship's ID alias", async () => {
      // Given an author with a publisher
      await insertPublisher({ name: "p1" });
      await insertAuthor({ first_name: "a1", publisher_id: 1 });
      // And the publisher link is not readable
      const em = newEntityManager();
      em.addPlugin(
        new (class extends Plugin {
          canReadField(_entity: Entity, field: string): boolean {
            return field !== "publisher";
          }
        })(),
      );
      const author = await em.load(Author, "a:1");
      // When the relationship's ID alias is selected
      const payload = await toJSON(author, { firstName: true, publisherId: true });
      // Then the alias is omitted
      expect(payload).toStrictEqual({ firstName: "a1" });
    });

    it("does not expose a hidden author's ID through a book", async () => {
      // Given a visible book whose author is hidden
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      const em = newEntityManager();
      em.addPlugin(
        new (class extends Plugin {
          canViewEntity(entity: Entity): boolean {
            return !(entity instanceof Author);
          }
        })(),
      );
      const book = await em.load(Book, "b:1");
      // When only the author ID is requested
      const payload = await toJSON(book, { authorId: true });
      // Then the relationship does not expose the hidden target's ID
      expect(payload).toStrictEqual({ authorId: undefined });
    });

    it("returns undefined for a hidden single root", async () => {
      // Given an author that is not visible to the caller
      const em = newEntityManager();
      const author = newAuthor(em);
      em.addPlugin(
        new (class extends Plugin {
          canViewEntity(): boolean {
            return false;
          }
        })(),
      );
      // When the author is projected
      const payload = await toJSON(author, "firstName");
      // Then the caller receives no author object
      expect(payload).toBeUndefined();
    });

    it("does not swallow errors from relationship read hooks", async () => {
      // Given a book with a visible author but a relationship field the caller cannot read
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      const em = newEntityManager();
      const denial = new Error("Book author field is private");
      em.addPlugin(
        new (class extends Plugin {
          canViewEntity(): boolean {
            return true;
          }
          beforeGetField(_entity: Entity, field: string): void {
            if (field === "author" && !isInTrustedContext()) throw denial;
          }
        })(),
      );
      const book = await em.load(Book, "b:1");
      // When the relationship is selected
      const payload = toJSON(book, { author: true });
      // Then the EM's normal field denial still propagates
      await expect(payload).rejects.toBe(denial);
    });

    it("omits hidden roots and collection members without reordering", async () => {
      // Given three authors, the first and last each with a private and a public book
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      await insertAuthor({ first_name: "a3" });
      await insertBook({ title: "Private", author_id: 1 });
      await insertBook({ title: "First", author_id: 1 });
      await insertBook({ title: "Last", author_id: 3 });
      await insertBook({ title: "Private", author_id: 3 });
      // And the middle author and the private books are hidden
      const em = newEntityManager();
      em.addPlugin(
        new (class extends Plugin {
          canViewEntity(entity: Entity): boolean {
            return (
              entity.id !== "a:2" && !(entity instanceof Book && runInTrustedContext(() => entity.title) === "Private")
            );
          }
        })(),
      );
      const authors = await runInTrustedContext(() => em.loadAll(Author, ["a:3", "a:2", "a:1"]));
      // When projecting the authors and their books
      const payload = await toJSON(authors, { books: "title" });
      // Then the remaining authors and books are emitted in their original order
      expect(payload).toStrictEqual([{ books: [{ title: "Last" }] }, { books: [{ title: "First" }] }]);
    });

    it("omits bulk data for groups where the field is not readable", async () => {
      // Given two groups with bulk data
      await insertParentGroup({ name: "public", bulk_data: { size: 1 } });
      await insertParentGroup({ name: "private", bulk_data: { size: 2 } });
      const em = newEntityManager();
      const groups = await em.loadAll(ParentGroup, ["parentGroup:1", "parentGroup:2"]);
      // And only the first group permits reading bulk data
      em.addPlugin(
        new (class extends Plugin {
          canReadField(entity: Entity, field: string): boolean {
            return field !== "bulkData" || entity === groups[0];
          }
        })(),
      );
      // When the field is selected for both groups
      const payload = await toJSON(groups, "bulkData");
      // Then only the public group's data is returned
      expect(payload).toStrictEqual([{ bulkData: { size: 1 } }, {}]);
    });

    it("includes denied fields when called from a trusted context", async () => {
      // Given an author whose first name is not readable
      const em = newEntityManager();
      const author = newAuthor(em);
      em.addPlugin(
        new (class extends Plugin {
          canReadField(): boolean {
            return false;
          }
        })(),
      );
      // When the author is projected from a hook-like trusted operation
      const payload = await runInTrustedContext(() => toJSON(author, "firstName"));
      // Then the first name is included
      expect(payload).toStrictEqual({ firstName: "a1" });
    });
  });
});
