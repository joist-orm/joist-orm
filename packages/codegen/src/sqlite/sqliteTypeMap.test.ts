import { mapSqliteType, getSqliteTypeShortName } from "./sqliteTypeMap";

describe("mapSqliteType", () => {
  it("maps integer types", () => {
    expect(mapSqliteType("INTEGER")).toBe("integer");
    expect(mapSqliteType("INT")).toBe("integer");
    expect(mapSqliteType("SMALLINT")).toBe("smallint");
    expect(mapSqliteType("BIGINT")).toBe("bigint");
    expect(mapSqliteType("TINYINT")).toBe("smallint");
  });

  it("maps text types", () => {
    expect(mapSqliteType("TEXT")).toBe("text");
    expect(mapSqliteType("VARCHAR(255)")).toBe("varchar");
    expect(mapSqliteType("CHARACTER VARYING")).toBe("character varying");
    expect(mapSqliteType("CLOB")).toBe("text");
  });

  it("maps boolean", () => {
    expect(mapSqliteType("BOOLEAN")).toBe("boolean");
    expect(mapSqliteType("BOOL")).toBe("boolean");
  });

  it("maps real types", () => {
    expect(mapSqliteType("REAL")).toBe("real");
    expect(mapSqliteType("DOUBLE")).toBe("double precision");
    expect(mapSqliteType("DOUBLE PRECISION")).toBe("double precision");
    expect(mapSqliteType("FLOAT")).toBe("real");
  });

  it("maps date/time types", () => {
    expect(mapSqliteType("DATE")).toBe("date");
    expect(mapSqliteType("DATETIME")).toBe("timestamp without time zone");
    expect(mapSqliteType("TIMESTAMP")).toBe("timestamp without time zone");
    expect(mapSqliteType("TIMESTAMPTZ")).toBe("timestamp with time zone");
  });

  it("maps binary", () => {
    expect(mapSqliteType("BLOB")).toBe("bytea");
  });

  it("maps json", () => {
    expect(mapSqliteType("JSON")).toBe("jsonb");
    expect(mapSqliteType("JSONB")).toBe("jsonb");
  });

  it("maps uuid", () => {
    expect(mapSqliteType("UUID")).toBe("uuid");
  });

  it("handles type affinity fallback", () => {
    expect(mapSqliteType("UNSIGNED INTEGER")).toBe("integer");
    expect(mapSqliteType("CHARACTER(50)")).toBe("text");
    expect(mapSqliteType("NVARCHAR(100)")).toBe("text");
  });

  it("strips size from types", () => {
    expect(mapSqliteType("VARCHAR(255)")).toBe("varchar");
    expect(mapSqliteType("DECIMAL(10,2)")).toBe("decimal");
    expect(mapSqliteType("NUMERIC(15,4)")).toBe("numeric");
  });

  it("is case insensitive", () => {
    expect(mapSqliteType("integer")).toBe("integer");
    expect(mapSqliteType("Integer")).toBe("integer");
    expect(mapSqliteType("INTEGER")).toBe("integer");
  });
});

describe("getSqliteTypeShortName", () => {
  it("returns short names for common types", () => {
    expect(getSqliteTypeShortName("INTEGER")).toBe("int");
    expect(getSqliteTypeShortName("CHARACTER VARYING")).toBe("varchar");
    expect(getSqliteTypeShortName("DOUBLE PRECISION")).toBe("double");
    expect(getSqliteTypeShortName("BOOLEAN")).toBe("bool");
  });

  it("returns normalized type for unknown types", () => {
    expect(getSqliteTypeShortName("TEXT")).toBe("text");
    expect(getSqliteTypeShortName("BLOB")).toBe("blob");
  });

  it("strips size from type", () => {
    expect(getSqliteTypeShortName("VARCHAR(255)")).toBe("varchar");
  });
});
