import { getMetadata } from "joist-orm";
import { insertAuthor, insertBook, insertUser, newEntityManager, User } from "joist-tests-integration";
import { AuthRule, parseAuthRule } from "./authRule";

const um = getMetadata(User);
const r = "r";
const rw = "rw";
const i = "i";

describe("rebac-auth", () => {
  it("should work", async () => {
    // Should there be a single rule from the user -> everything they can see/do/touch?
    // Or per-entity rules that are stitched together?
    //
    // Per-entity rules are more scalable, but loose "how did we get here" context
    // (i.e. is it 'my book' or 'your book' depends on the FKs that were walked to get
    // here) and also "what user is this?" I.e. to have per-user type rules, the per-entity
    // rule would need to be parameterized by the user.
    //
    // A single per-user rule seems more able to "do one up-front query" i.e. to find
    // Tasks the user can see, and then use the subrules to apply/check auth in memory.
    //
    // A single per-unit rule would be hard to adapt for a user that changes roles based
    // on the scope, i.e. in Project A they're a super, but in Project B they're a PM.
    // Granted, this seems odd but needs to be supported. With a single-user rule, these
    // checked would move into `where { role: ... }` clauses within a giant "internal user"
    // rule.
    //
    // A single per-unit rule is easy to know ahead-of-time, vs. a per-entity rule, we need
    // to ask "what [tasks | books | authors] can this person see?" before even having
    // "which task" loaded from the db.
    const rule: AuthRule<User> = {
      email: r,
      name: rw,
      bio: rw,
      authorManyToOne: {
        // Support binding alias { as: m }
        where: { firstName: "u1" },
        books: {
          title: rw,
          "*": rw,
          publish: i,
        },
      },
    };

    // select *, p1, p2 from books where (path1 or path2)
    // somehow drill the paths down into preloading joins? eesh.

    // Book -> author -> user = ?
    // Author -> user = ?

    // const targets = reverseReactiverule(User, User, rule);
    // console.log(targets);

    // Given two authors with their own books
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 2 });
    await insertUser({ name: "u1", author_id: 1 });

    // and the user can only see one
    const em = newEntityManager();
  });

  it("can parse star field rules", () => {
    // Given a rule that uses `*` to mean "all fields"
    const rule: AuthRule<User> = {
      "*": rw,
      authorManyToOne: { books: { "*": r } },
    };
    // Then we can parse it
    const parsed = parseAuthRule(um, rule);
    expect(parsed).toMatchObject({
      User: [{ fields: { "*": "rw" }, pathToUser: [] }],
      Author: [{ fields: {}, pathToUser: ["userOneToOne"] }],
      Book: [{ fields: { "*": "r" }, pathToUser: ["userOneToOne", "author"] }],
    });
  });

  it("can parse method invocation rules", () => {
    // Given a rule that can invoke the `publish` method
    const rule: AuthRule<User> = {
      authorManyToOne: { books: { publish: i } },
    };
    // Then we can parse it
    const parsed = parseAuthRule(um, rule);
    expect(parsed).toMatchObject({
      Book: [{ methods: { publish: "i" } }],
    });
  });

  it("can parse where scopes", () => {
    // Given a rule that can invoke the `publish` method
    const rule: AuthRule<User> = {
      authorManyToOne: { books: { where: { title: "b1" } } },
    };
    // Then we can parse it
    const parsed = parseAuthRule(um, rule);
    expect(parsed).toMatchObject({
      Book: [{ where: { title: "b1" } }],
    });
  });
});

type ToWords<S extends string> = S extends `${infer H} ${infer T}` ? H | `${ToWords<T>}` : S;

function w<S extends string>(_: S): ToWords<S>[] {
  return _.split(" ") as ToWords<S>[];
}

// gets typed as `("foo" | "bar" | "zaz")[]`
const words = w(`foo bar zaz`);

// maybe use it for auth rules like:
// { read: "fullName email", write: "firstName lastName" }
