import { KeySerde, getMetadata, query, table, tables } from "joist-orm";
import { Author, Book, Comment } from "src/entities";
import { insertAuthor, insertBook, insertComment } from "src/entities/inserts";
import { newEntityManager, queries, resetQueryCount } from "src/testEm";

describe("EntityManager.setQueryCodecs", () => {
  it.each(["primary key", "foreign key"] as const)(
    "keeps ordinary polymorphic IN working with an unknown %s serde",
    async (source) => {
      // Given an Author that should match the polymorphic parent predicate
      await insertAuthor({ first_name: "Alice" });
      // And another Author that should not match the selected Author id
      await insertAuthor({ first_name: "Bob" });
      // And a Book whose Author FK targets Alice, not the Book that owns the column
      await insertBook({ title: "Alice's Book", author_id: 1 });
      // And a Comment on Alice that should survive either PK or FK selection
      await insertComment({ text: "Alice comment", parent_author_id: 1 });
      // And a Comment on Bob that should not match the selected id
      await insertComment({ text: "Bob comment", parent_author_id: 2 });
      // And a Comment on the Book whose equal physical id must not select the owning entity's component
      await insertComment({ text: "Book comment", parent_book_id: 1 });
      // And an EntityManager for an ordinary polymorphic read
      const em = newEntityManager();
      // And the selected alias field's original serde, retained for restoration after the regression
      const field = source === "primary key" ? getMetadata(Author).allFields.id : getMetadata(Book).allFields.author;
      const original = field.serde;
      try {
        // And an unmodeled key subclass whose inherited conversions still read and bind Author ids
        field.serde = new UnmodeledKeySerde("a", field.fieldName, source === "primary key" ? "id" : "author_id", "int");
        // And fresh aliases that read the temporarily replaced field serde
        const [a, b, c] = tables(Author, Book, Comment);
        // And an ordinary scalar subquery selecting Alice through the chosen PK or FK field
        const ids =
          source === "primary key"
            ? query({ from: a, where: a.id.eq("a:1"), select: a.id })
            : query({ from: b, select: b.author_id });
        // When the selected alias metadata supplies the polymorphic target despite the absent output codec
        const rows = await em.query({ from: c, where: c.parent.in(ids), select: { text: c.text } });
        // Then only the Author component matches, independently of which entity owns the selected field
        expect(field.serde.columns[0].outputType).toBeUndefined();
        expect(rows).toEqual([{ text: "Alice comment" }]);
      } finally {
        field.serde = original;
      }
    },
  );

  it.each(["primary key", "foreign key"] as const)(
    "rejects polymorphic IN compounds with an unknown %s serde before choosing a representative alias",
    (source) => {
      // Given the selected Author-id field's original serde so the mutation remains local to this test
      const field = source === "primary key" ? getMetadata(Author).allFields.id : getMetadata(Book).allFields.author;
      const original = field.serde;
      try {
        // And an unmodeled key subclass that cannot establish compound codec compatibility
        field.serde = new UnmodeledKeySerde("a", field.fieldName, source === "primary key" ? "id" : "author_id", "int");
        // And fresh aliases for the unknown key branch and the Comment parent predicate
        const [a, b, c] = tables(Author, Book, Comment);
        // And a POJO branch whose unknown codec, not its row shape, makes it invalid in a compound
        const branch =
          source === "primary key"
            ? query({ from: a, select: { id: a.id } })
            : query({ from: b, select: { id: b.author_id } });
        // And isolated query recording to detect accidental execution during validation
        resetQueryCount();
        // When a compound of those ordinary reads is supplied to polymorphic IN
        // Then validation rejects the unknown codec instead of falling back to the first alias's metadata
        expect(() => {
          const ids = query({ union: [branch, branch], as: "author_ids" });
          c.parent.in(query({ from: ids, select: ids.id }));
        }).toThrow(
          "Set column 'id' has an unknown or unsupported output codec; sql<R> does not declare a SQL type or codec",
        );
        expect(queries).toEqual([]);
      } finally {
        field.serde = original;
      }
    },
  );

  it("still rejects an ordinary id expression as a polymorphic IN subquery", () => {
    // Given a Comment alias whose parent condition requires an actual subquery
    const c = table(Comment);
    // And an Author-id alias expression with known metadata but no subquery identity
    const a = table(Author);
    // When passing the id expression directly instead of a scalar query value
    // Then the metadata fallback does not remove the actual-query guard
    expect(() => c.parent.in(a.id)).toThrow(
      "parent is polymorphic, so `in` needs a subquery selecting an id or FK column",
    );
  });
});

/** Inherited key conversions remain valid for ordinary reads, but unknown subclasses have no compound codec. */
class UnmodeledKeySerde extends KeySerde {}
