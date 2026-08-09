import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { config } from "./config";
import { makeEntity } from "./EntityDbMetadata";
import { findAllEntityScopes } from "./findEntityScopes";

describe("findAllEntityScopes", () => {
  it("finds static scope properties with explicit and inferred types", async () => {
    const entitiesDirectory = await mkdtemp(join(tmpdir(), "joist-codegen-scopes-"));
    try {
      await writeFile(
        join(entitiesDirectory, "Author.ts"),
        `
          import { authorScope as scope } from "./entities";

          export class Author extends AuthorCodegen {
            static adult = scope({ age: { gte: 18 } });
            static recent = scope({}).orderBy({ createdAt: "DESC" });
            static inherited = Author.adult.orderBy({ createdAt: "DESC" });
            static explicit: AuthorScope = scope({});
            static explicitFn: ((prefix: string) => AuthorScope) = scope.fn((prefix: string) => (a) => a.name.eq(prefix));
            static named = scope.fn((prefix: string, count?: number, ...suffixes: string[]) => (a) => a.name.eq(prefix));
            static functionNamed = scope.fn(function (value: number) { return (a) => a.age.eq(value); });

            regular = scope({});
            static method() { return scope({}); }
            static ["computed"] = scope({});
            static wrongType: string = scope({});
            static missingType = scope.fn((prefix) => (a) => a.name.eq(prefix));
            static defaulted = scope.fn((prefix: string = "") => (a) => a.name.eq(prefix));
            static destructured = scope.fn(({ prefix }: { prefix: string }) => (a) => a.name.eq(prefix));
            static computedFn = scope["fn"]((prefix: string) => (a) => a.name.eq(prefix));
            static unrelated = other({});
          }
        `,
      );

      const scopes = await findAllEntityScopes(config.parse({ entitiesDirectory }), [makeEntity("Author")]);

      expect(scopes).toEqual({
        Author: [
          { name: "adult", type: "AuthorScope" },
          { name: "recent", type: "AuthorScope" },
          { name: "inherited", type: "AuthorScope" },
          { name: "explicit", type: "AuthorScope" },
          { name: "explicitFn", type: "((prefix: string) => AuthorScope)" },
          { name: "named", type: "(prefix: string, count?: number, ...suffixes: string[]) => AuthorScope" },
          { name: "functionNamed", type: "(value: number) => AuthorScope" },
        ],
      });
    } finally {
      await rm(entitiesDirectory, { recursive: true, force: true });
    }
  });
});
