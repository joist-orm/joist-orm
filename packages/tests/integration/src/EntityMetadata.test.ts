import { expectTypeOf } from "expect-type";
import { type ColumnsOf, type FieldsOf, getMetadata } from "joist-orm";

import { Author, Book, type BookColumns, Color, Comment, SmallPublisher, TaskOld } from "./entities";

describe("EntityMetadata", () => {
  it("maps physical columns to their domain fields", () => {
    expect(getMetadata(Book).columns.author_id).toEqual({ fieldName: "author" });
    expect(getMetadata(Book).columns.created_at).toEqual({ fieldName: "createdAt" });
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
    expect(meta.columns.parent_book_id).toEqual({ fieldName: "parent" });
    expect(meta.columns.parent_author_id).toEqual({ fieldName: "parent" });
    const field = meta.allFields[meta.columns.parent_book_id.fieldName];
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

  it("inherits CTI and STI column mappings without strengthening database nullability", () => {
    expect(getMetadata(SmallPublisher).columns.name).toEqual({ fieldName: "name" });
    expect(getMetadata(SmallPublisher).columns.city).toEqual({ fieldName: "city" });
    expect(getMetadata(SmallPublisher).columns.group_id).toEqual({ fieldName: "group" });
    expect(getMetadata(TaskOld).columns.created_at).toEqual({ fieldName: "createdAt" });
    expect(getMetadata(TaskOld).columns.special_old_field).toEqual({ fieldName: "specialOldField" });
    expectTypeOf<ColumnsOf<SmallPublisher>["name"]["type"]>().toEqualTypeOf<string>();
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
