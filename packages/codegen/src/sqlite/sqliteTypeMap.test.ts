import { sqliteColumnType } from "./sqliteTypeMap.ts";

describe("sqliteTypeMap", () => {
  it("maps integer to the same type as a PostgreSQL int4", () => {
    // When we map an INTEGER column
    const type = sqliteColumnType("INTEGER");
    // Then it has the `int` short name that foreign key serdes need
    expect(type).toEqual({ name: "integer", shortName: "int" });
  });

  it("maps bigint", () => {
    expect(sqliteColumnType("BIGINT")).toEqual({ name: "bigint" });
  });

  it("maps tinyint to smallint", () => {
    expect(sqliteColumnType("TINYINT")).toEqual({ name: "smallint" });
  });

  it("maps boolean", () => {
    expect(sqliteColumnType("BOOL")).toEqual({ name: "boolean" });
  });

  it("maps text", () => {
    expect(sqliteColumnType("TEXT")).toEqual({ name: "text", shortName: "text" });
  });

  it("strips the size from varchar", () => {
    expect(sqliteColumnType("VARCHAR(255)")).toEqual({ name: "character varying" });
  });

  it("strips the precision from decimal", () => {
    expect(sqliteColumnType("DECIMAL(10,2)")).toEqual({ name: "numeric", shortName: "numeric" });
  });

  it("maps double", () => {
    expect(sqliteColumnType("DOUBLE")).toEqual({ name: "double precision" });
  });

  it("maps datetime to a timestamp without time zone", () => {
    expect(sqliteColumnType("DATETIME")).toEqual({ name: "timestamp without time zone" });
  });

  it("maps timestamptz", () => {
    expect(sqliteColumnType("TIMESTAMPTZ")).toEqual({ name: "timestamp with time zone" });
  });

  it("maps blob to bytea", () => {
    expect(sqliteColumnType("BLOB")).toEqual({ name: "bytea", shortName: "bytea" });
  });

  it("maps json to jsonb", () => {
    expect(sqliteColumnType("JSON")).toEqual({ name: "jsonb", shortName: "jsonb" });
  });

  it("maps uuid", () => {
    expect(sqliteColumnType("UUID")).toEqual({ name: "uuid", shortName: "uuid" });
  });

  it("is case insensitive", () => {
    expect(sqliteColumnType("Integer")).toEqual({ name: "integer", shortName: "int" });
  });

  it("falls back to integer affinity", () => {
    expect(sqliteColumnType("UNSIGNED INTEGER")).toEqual({ name: "integer", shortName: "int" });
  });

  it("falls back to text affinity", () => {
    expect(sqliteColumnType("NVARCHAR(100)")).toEqual({ name: "text", shortName: "text" });
  });

  it("falls back to numeric affinity", () => {
    expect(sqliteColumnType("MONEY")).toEqual({ name: "numeric", shortName: "numeric" });
  });
});
