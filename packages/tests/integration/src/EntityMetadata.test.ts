import { expectTypeOf } from "expect-type";
import {
  Column,
  type ColumnsOf,
  type FieldsOf,
  type IdOf,
  PrimitiveSerde,
  getInstanceData,
  getMetadata,
  table,
} from "joist-orm";

import {
  Author,
  Book,
  type BookColumns,
  Color,
  Comment,
  Publisher,
  PublisherGroup,
  SmallPublisher,
  Task,
  TaskNew,
  TaskOld,
} from "./entities";
import { insertAuthor, select } from "./entities/inserts";
import { newEntityManager } from "./testEm";

describe("EntityMetadata", () => {
  it("returns a single domain value without populating entity data", async () => {
    // Given two Author rows with different names and a nullable age
    await insertAuthor({ first_name: "First", age: 10 });
    // And a second Author whose age is SQL NULL
    await insertAuthor({ first_name: "Second", age: null });
    // And both rows hydrated without accessing their scalar fields
    const em = newEntityManager();
    const authors = await em.find(Author, {}, { orderBy: { id: "ASC" } });
    const instance = getInstanceData(authors[1]);
    const meta = getMetadata(Author);

    // When inspecting the hydrated Author before scalar access
    // Then its name has not been cached
    expect("firstName" in instance.data).toBe(false);
    // When decoding the second Author directly from the shared row data
    // Then the decoders return its domain values without populating entity data
    expect(meta.fields.firstName.serde!.fromRow(instance.rowData, instance.rowIndex)).toBe("Second");
    expect(meta.fields.age.serde!.fromRow(instance.rowData, instance.rowIndex)).toBeUndefined();
    expect("firstName" in instance.data).toBe(false);
    expect("age" in instance.data).toBe(false);
    expectTypeOf(meta.fields.firstName.serde!.fromRow(instance.rowData, instance.rowIndex)).toEqualTypeOf<unknown>();

    // And the age decoder is observed to distinguish cached undefined from repeated decoding
    const decode = jest.spyOn(meta.fields.age.serde!, "fromRow");
    try {
      // When the generated getter accesses the SQL NULL
      // Then the caller caches an explicit undefined
      expect(authors[1].age).toBeUndefined();
      expect("age" in instance.data).toBe(true);
      // When the generated getter accesses age again
      // Then it returns the cached undefined without decoding again
      expect(authors[1].age).toBeUndefined();
      expect(decode).toHaveBeenCalledTimes(1);
    } finally {
      decode.mockRestore();
    }
  });

  it("reads a physical replacement codec directly and rejects unchecked subclass compatibility", async () => {
    // Given an Author row whose case makes the subclass conversion observable
    await insertAuthor({ first_name: "Mixed" });
    // And a scalar subclass with a different conversion but no explicit compatibility proof
    class LowercaseSerde extends PrimitiveSerde {
      mapFromDb(value: unknown): unknown {
        const decoded = super.mapFromDb(value);
        return typeof decoded === "string" ? decoded.toLowerCase() : decoded;
      }
    }
    // And an expression holding the original physical descriptor
    const em = newEntityManager();
    const originalTable = table(Author);
    const originalRead = { from: originalTable, select: { name: originalTable.first_name } };
    const meta = getMetadata(Author);
    const original = meta.columns.first_name;
    // And only the SQL descriptor is deliberately replaced; the domain field still binds the original column
    const replacement = new Column(
      original.columnName,
      original.sqlNullable,
      original.hasDefault,
      original.isGenerated,
      original.insertOptional,
      original.writable,
      original.idMetadata,
      new LowercaseSerde(original.dbType),
    );
    meta.columns.first_name = replacement;
    const changedTable = table(Author);
    const changedRead = { from: changedTable, select: { name: changedTable.first_name } };
    try {
      // When inspecting the replaced SQL descriptor and the Author field binding
      // Then the field retains its original column and the replacement has no compatibility proof
      expect(meta.fields.firstName.serde!.columns[0].column).toBe(original);
      expect(replacement.outputType).toBeUndefined();
      // When querying with the replacement descriptor
      // Then SQL reads use its lowercase conversion directly
      expect(await em.query(changedRead)).toEqual([{ name: "mixed" }]);
      // When combining the original and replacement descriptors in a union
      // Then the unchecked subclass codec is rejected
      await expect(em.query({ union: [originalRead, changedRead] })).rejects.toThrow(
        "unknown or unsupported output codec",
      );
    } finally {
      meta.columns.first_name = original;
    }
  });

  it("shares scalar conversion between SQL reads/writes and entity hydration/flush", async () => {
    // Given a persisted Author created without invoking the ORM codec
    await insertAuthor({ first_name: "Original" });
    // And the actual introspected column's scalar converters are observed
    const codec = getMetadata(Author).columns.first_name.codec;
    const decode = jest.spyOn(codec, "mapFromDb");
    const encode = jest.spyOn(codec, "mapToDbValue");
    // And an EntityManager with no hydrated entities
    const em = newEntityManager();
    const a = table(Author);
    try {
      // When reading the Author name through SQL
      // Then the scalar decoder runs without hydrating an Author
      expect(await em.query({ from: a, select: a.first_name })).toEqual(["Original"]);
      expect(em.entities).toEqual([]);
      expect(decode).toHaveBeenCalledTimes(1);
      // When loading the Author and accessing its name
      const author = await em.load(Author, "a:1");
      // Then entity hydration uses the same scalar decoder
      expect(author.firstName).toBe("Original");
      expect(decode).toHaveBeenCalledTimes(2);
      // When updating the Author name through SQL
      await em.execute({ update: a, set: { first_name: "SQL" }, where: a.id.eq(author.id) });
      // Then the SQL assignment uses the scalar encoder
      expect(encode).toHaveBeenCalledTimes(1);
      // And the Author is refreshed because direct SQL changed its oplock timestamp without updating the entity
      await em.refresh(author);
      // When changing the refreshed Author's name and flushing
      author.firstName = "Entity";
      await em.flush();
      // Then entity flush uses the same encoder and persists the new name
      expect(encode).toHaveBeenCalledTimes(2);
      expect(await select("authors")).toMatchObject([{ first_name: "Entity" }]);
    } finally {
      decode.mockRestore();
      encode.mockRestore();
    }
  });

  it("binds domain fields to the same independent physical columns", () => {
    // When inspecting Book's generated field and column metadata
    const meta = getMetadata(Book);
    // Then domain fields bind to shared physical columns without adding domain behavior to those columns
    expect(meta.fields.author).toMatchObject({ kind: "m2o", fieldName: "author", required: true });
    expect(meta.fields.author).toMatchObject({ default: "config" });
    expect(meta.columns.author_id).toMatchObject({
      columnName: "author_id",
      sqlNullable: false,
      hasDefault: false,
    });
    expect(meta.fields.author.serde!.columns[0].column).toBe(meta.columns.author_id);
    expect(meta.fields.author.serde!.columns[0].codec).toBe(meta.columns.author_id.codec);
    expect(meta.fields.createdAt.serde!.columns[0].column).toBe(meta.columns.created_at);
    expect(meta.columns.author_id.idMetadata!()).toBe(getMetadata(Author));
    expect(meta.columns.author_id.outputType).toEqual(getMetadata(Author).columns.id.outputType);
    expect("field" in meta.columns.author_id).toBe(false);
    expect("fieldName" in meta.columns.author_id.codec).toBe(false);
    expect("fromRow" in meta.columns.author_id.codec).toBe(false);
    expect("dbValue" in meta.columns.author_id.codec).toBe(false);
    expect(getMetadata(Book).columns.author).toBeUndefined();
    expect(getMetadata(Book).columns.reviews).toBeUndefined();
    // When inspecting the generated Book and Author types
    // Then storage types use scalar IDs and keep write capabilities separate from domain fields
    expectTypeOf<ColumnsOf<Book>>().toEqualTypeOf<BookColumns>();
    expectTypeOf<ColumnsOf<Book>["id"]["type"]>().toEqualTypeOf<IdOf<Book>>();
    expectTypeOf<ColumnsOf<Book>["author_id"]["type"]>().toEqualTypeOf<IdOf<Author>>();
    expectTypeOf<ColumnsOf<Book>["author_id"]["entity"]>().toEqualTypeOf<Author>();
    expectTypeOf<ColumnsOf<Book>["author_id"]["nullable"]>().toEqualTypeOf<false>();
    expectTypeOf<ColumnsOf<Book>["author_id"]["insert"]>().toEqualTypeOf<"required">();
    expectTypeOf<ColumnsOf<Book>["author_id"]["update"]>().toEqualTypeOf<true>();
    expectTypeOf<Extract<keyof ColumnsOf<Book>["author_id"], "columns">>().toEqualTypeOf<never>();
    expectTypeOf<Extract<keyof FieldsOf<Book>["author"], "columns" | "insert" | "update">>().toEqualTypeOf<never>();
    expectTypeOf<FieldsOf<Book>["author"]["nullable"]>().toEqualTypeOf<never>();
    expectTypeOf<
      {
        [K in keyof FieldsOf<Author>]: Extract<keyof FieldsOf<Author>[K], "columns" | "insert" | "update">;
      }[keyof FieldsOf<Author>]
    >().toEqualTypeOf<never>();
    expectTypeOf<
      {
        [K in keyof ColumnsOf<Author>]: Extract<
          keyof ColumnsOf<Author>[K],
          "columns" | "kind" | "unique" | "derived" | "native"
        >;
      }[keyof ColumnsOf<Author>]
    >().toEqualTypeOf<never>();
  });

  it("binds each polymorphic component to an independent scalar ID column", () => {
    // When inspecting Comment's polymorphic parent metadata
    const meta = getMetadata(Comment);
    // Then each component binds to a nullable physical column with its target's ID domain
    expect(meta.columns.parent_book_id).toMatchObject({
      columnName: "parent_book_id",
      sqlNullable: true,
    });
    const field = meta.fields.parent;
    expect(field.serde?.columns.find((binding) => binding.columnName === "parent_book_id")?.column).toBe(
      meta.columns.parent_book_id,
    );
    expect(meta.columns.parent_author_id.idMetadata!()).toBe(getMetadata(Author));
    expect(meta.columns.parent_book_id.idMetadata!()).toBe(getMetadata(Book));
    expect(meta.columns.parent_author_id.outputType).toEqual(getMetadata(Author).columns.id.outputType);
    // When converting the Book component between domain and database IDs
    // Then its codec converts between tagged Book IDs and scalar integers
    expect(meta.columns.parent_book_id.mapToDbValue("b:1")).toBe(1);
    expect(meta.columns.parent_book_id.mapFromDb(1)).toBe("b:1");
    // When inspecting the generated Book component type
    // Then it exposes a nullable Book ID without direct SQL write capabilities
    expectTypeOf<ColumnsOf<Comment>["parent_book_id"]["type"]>().toEqualTypeOf<IdOf<Book>>();
    expectTypeOf<ColumnsOf<Comment>["parent_book_id"]>().toEqualTypeOf<{
      type: IdOf<Book>;
      entity: Book;
      nullable: true;
      insert: "never";
      update: false;
    }>();
  });

  it("keeps CTI columns local and STI columns shared without strengthening storage domains", () => {
    // When inspecting Publisher CTI and Task STI column metadata
    // Then CTI columns stay on their owning table while STI subtypes share Task's columns
    expect(getMetadata(SmallPublisher).columns.name).toBeUndefined();
    expect(getMetadata(SmallPublisher).fields.city.serde!.columns[0].column).toBe(
      getMetadata(SmallPublisher).columns.city,
    );
    expect(getMetadata(SmallPublisher).columns.group_id).toBeUndefined();
    expect(getMetadata(Publisher).fields.group.serde!.columns[0].column).toBe(getMetadata(Publisher).columns.group_id);
    expect(getMetadata(TaskOld).columns).toBe(getMetadata(Task).columns);
    expect(getMetadata(TaskNew).columns).toBe(getMetadata(Task).columns);
    expect(getMetadata(TaskOld).columns.copied_from_id.idMetadata!()).toBe(getMetadata(Task));
    expect(getMetadata(TaskOld).allFields.copiedFrom.serde!.columns[0].column).toBe(
      getMetadata(Task).columns.copied_from_id,
    );
    // When inspecting the generated inheritance types
    // Then storage retains table-level IDs and nullability independently of subtype field constraints
    expectTypeOf<Extract<keyof ColumnsOf<SmallPublisher>, "name" | "group_id">>().toEqualTypeOf<never>();
    expectTypeOf<ColumnsOf<Publisher>["group_id"]["type"]>().toEqualTypeOf<IdOf<PublisherGroup>>();
    expectTypeOf<ColumnsOf<TaskOld>>().toEqualTypeOf<ColumnsOf<Task>>();
    expectTypeOf<ColumnsOf<TaskNew>>().toEqualTypeOf<ColumnsOf<Task>>();
    expectTypeOf<ColumnsOf<TaskOld>["copied_from_id"]["type"]>().toEqualTypeOf<IdOf<Task>>();
    expectTypeOf<FieldsOf<TaskOld>["copiedFrom"]["type"]>().toEqualTypeOf<TaskOld>();
    expectTypeOf<FieldsOf<TaskOld>["specialOldField"]["nullable"]>().toEqualTypeOf<never>();
    expectTypeOf<ColumnsOf<TaskOld>["special_old_field"]["nullable"]>().toEqualTypeOf<true>();
    expectTypeOf<ColumnsOf<TaskOld>["special_old_field"]["insert"]>().toEqualTypeOf<"optional">();
    expectTypeOf<ColumnsOf<TaskOld>["special_old_field"]["update"]>().toEqualTypeOf<true>();
  });

  it("keeps nullable enum arrays physical while preserving domain array types", () => {
    expectTypeOf<FieldsOf<Author>["favoriteColors"]["nullable"]>().toEqualTypeOf<never>();
    expectTypeOf<ColumnsOf<Author>["favorite_colors"]["nullable"]>().toEqualTypeOf<true>();
    expectTypeOf<ColumnsOf<Author>["favorite_colors"]["type"]>().toEqualTypeOf<Color[]>();
  });

  describe("getMetadata", () => {
    it("fails when passed undefined", () => {
      expect(() => getMetadata(undefined as any)).toThrow("Cannot getMetadata of undefined");
    });
  });
});
