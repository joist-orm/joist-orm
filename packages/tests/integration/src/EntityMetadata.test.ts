import { expectTypeOf } from "expect-type";
import { type ColumnsOf, type FieldsOf, getMetadata } from "joist-orm";

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

describe("EntityMetadata", () => {
  it("maps physical columns to their domain fields", () => {
    expect(getMetadata(Book).columns.author_id).toMatchObject({
      fieldName: "author",
      field: { kind: "m2o", fieldName: "author", required: true },
    });
    expect("default" in getMetadata(Book).columns.author_id.field).toBe(false);
    expect(getMetadata(Book).columns.author_id.field.serde?.columns[0]).toMatchObject({
      columnName: "author_id",
      sqlNullable: false,
      hasDefault: false,
    });
    expect(getMetadata(Book).columns.created_at).toEqual({
      fieldName: "createdAt",
      field: getMetadata(Book).fields.createdAt,
    });
    expect(getMetadata(Book).columns.author).toBeUndefined();
    expect(getMetadata(Book).columns.reviews).toBeUndefined();
    expectTypeOf<ColumnsOf<Book>>().toEqualTypeOf<BookColumns>();
    expectTypeOf<ColumnsOf<Book>["author_id"]["type"]>().toEqualTypeOf<Author>();
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
        [K in keyof ColumnsOf<Author>]: Extract<keyof ColumnsOf<Author>[K], "columns">;
      }[keyof ColumnsOf<Author>]
    >().toEqualTypeOf<never>();
  });

  it("maps each polymorphic component to its owning field", () => {
    const meta = getMetadata(Comment);
    expect(meta.columns.parent_book_id).toMatchObject({
      fieldName: "parent",
      field: { kind: "poly", fieldName: "parent" },
    });
    expect(meta.columns.parent_author_id.field).toBe(meta.columns.parent_book_id.field);
    expect(meta.columns.parent_author_id.fieldName).toBe("parent");
    const field = meta.columns.parent_book_id.field;
    expect(field.serde?.columns.find((column) => column.columnName === "parent_book_id")?.columnName).toEqual(
      "parent_book_id",
    );
    expectTypeOf<ColumnsOf<Comment>["parent_book_id"]["type"]>().toEqualTypeOf<Book>();
    expectTypeOf<ColumnsOf<Comment>["parent_book_id"]>().toEqualTypeOf<{
      kind: "m2o";
      type: Book;
      nullable: true;
      insert: "never";
      update: false;
    }>();
  });

  it("keeps CTI columns local and STI columns shared without strengthening storage domains", () => {
    expect(getMetadata(SmallPublisher).columns.name).toBeUndefined();
    expect(getMetadata(SmallPublisher).columns.city).toEqual({
      fieldName: "city",
      field: getMetadata(SmallPublisher).fields.city,
    });
    expect(getMetadata(SmallPublisher).columns.group_id).toBeUndefined();
    expect(getMetadata(Publisher).columns.group_id.field).toBe(getMetadata(Publisher).fields.group);
    expect(getMetadata(TaskOld).columns).toEqual(getMetadata(Task).columns);
    expect(getMetadata(TaskNew).columns).toEqual(getMetadata(Task).columns);
    expect(getMetadata(TaskOld).columns.copied_from_id.field).toBe(getMetadata(Task).fields.copiedFrom);
    expectTypeOf<Extract<keyof ColumnsOf<SmallPublisher>, "name" | "group_id">>().toEqualTypeOf<never>();
    expectTypeOf<ColumnsOf<Publisher>["group_id"]["type"]>().toEqualTypeOf<PublisherGroup>();
    expectTypeOf<ColumnsOf<TaskOld>>().toEqualTypeOf<ColumnsOf<Task>>();
    expectTypeOf<ColumnsOf<TaskNew>>().toEqualTypeOf<ColumnsOf<Task>>();
    expectTypeOf<ColumnsOf<TaskOld>["copied_from_id"]["type"]>().toEqualTypeOf<Task>();
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
