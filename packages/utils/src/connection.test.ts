import { newPgConnectionConfig } from "./connection";

describe("connection", () => {
  it("should parse single DATABASE_URL", () => {
    const info = newPgConnectionConfig({ DATABASE_URL: "postgres://joist:local@db:5432/joist" });
    expect(info).toEqual({
      database: "joist",
      host: "db",
      password: "local",
      port: 5432,
      user: "joist",
      ssl: undefined,
    });
  });

  it("should parse multiple DB variables", () => {
    const info = newPgConnectionConfig({
      DB_USER: "joist",
      DB_PASSWORD: "local",
      DB_DATABASE: "joist",
      DB_HOST: "db",
      DB_PORT: "5432",
      DB_SSL: "true",
    });
    expect(info).toEqual({
      database: "joist",
      host: "db",
      password: "local",
      port: 5432,
      ssl: true,
      user: "joist",
    });
  });

  it("should parse a DATABASE_URL with ssl=true", () => {
    const info = newPgConnectionConfig({ DATABASE_URL: "postgres://joist:local@db:5432/joist?ssl=true" });
    expect(info).toEqual({
      database: "joist",
      host: "db",
      password: "local",
      port: 5432,
      user: "joist",
      ssl: true,
    });
  });
});
