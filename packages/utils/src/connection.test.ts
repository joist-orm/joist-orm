import { parsePgConnectionConfig } from "./connection";

describe("connection", () => {
  it("should parse RDS-style json", () => {
    const info = parsePgConnectionConfig(
      `{"host":"db","port":5432,"username":"joist","password":"local","dbname":"joist"}`,
    );
    expect(info).toMatchInlineSnapshot(`
      Object {
        "database": "joist",
        "host": "db",
        "password": "local",
        "port": 5432,
        "user": "joist",
      }
    `);
  });

  it("should parse connection-string-style", () => {
    const info = parsePgConnectionConfig("postgres://joist:local@db:5432/joist");
    expect(info).toMatchInlineSnapshot(`
      Object {
        "database": "joist",
        "host": "db",
        "password": "local",
        "port": 5432,
        "ssl": undefined,
        "user": "joist",
      }
    `);
  });
});
