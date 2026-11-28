import { ensureRectangularArraySizes, getMetadata } from "joist-orm";
import { User } from "src/entities";
import { insertUser, select } from "src/entities/inserts";
import { PasswordValue } from "src/entities/types";
import { jan1, jan2 } from "src/testDates";
import { knex, newEntityManager } from "src/testEm";

const PASSWORD = "correct.horse.battery.staple";
const PASSWORD_ENCODED = "Y29ycmVjdC5ob3JzZS5iYXR0ZXJ5LnN0YXBsZQ==";

describe("User", () => {
  it("custom type is exposed", async () => {
    const em = newEntityManager();
    // @ts-expect-error
    const a1 = em.create(User, { name: "a1", email: "test@test.com", ipAddress: "127.0.0.1" });
    await expect(em.flush()).resolves.toEqual([a1]);
  });

  it("can interact with serde value", async () => {
    const em = newEntityManager();
    const a1 = em.create(User, {
      name: "a1",
      email: "test@test.com",
      password: PasswordValue.fromPlainText(PASSWORD),
      originalEmail: "test@test.com",
    });
    await expect(em.flush()).resolves.toEqual([a1]);
    await expect(a1.password?.encoded).toEqual(PASSWORD_ENCODED);
  });

  it("loads serde values correctly", async () => {
    await insertUser({
      id: 1,
      name: "a1",
      email: "test@test.com",
      password: PASSWORD_ENCODED,
    });

    const em = newEntityManager();
    const a1 = await em.load(User, "u:1");
    await expect(a1.password?.encoded).toEqual(PASSWORD_ENCODED);

    expect((await select("users"))[0].password).toEqual(PASSWORD_ENCODED);
  });

  it("can interact with serde value", async () => {
    await insertUser({
      id: 1,
      name: "a1",
      email: "test@test.com",
      password: PASSWORD_ENCODED,
    });

    const em = newEntityManager();
    const a1 = await em.load(User, "u:1");
    a1.password = PasswordValue.fromPlainText("another");
    await expect(em.flush()).resolves.toEqual([a1]);
    expect(a1.password.matches(PASSWORD)).toBe(false);
  });

  it("can interact with tstzrange values", async () => {
    const em = newEntityManager();
    const u1 = em.create(User, {
      name: "u1",
      email: "test@test.com",
      trialPeriod: `[${jan1.toISOString()},${jan2.toISOString()})`,
    });
    await expect(em.flush()).resolves.toEqual([u1]);
    await expect(u1.trialPeriod).toEqual("[2018-01-01T00:00:00.000Z,2018-01-02T00:00:00.000Z)");
  });

  it("serializes nullable array markers through the generated custom serde", () => {
    // Given User's real PasswordValue[] column and its domain-to-text conversion
    const column = getMetadata(User).fields.passwordHistory.serde!.columns[0];
    const password = PasswordValue.fromPlainText(PASSWORD);
    const bindings = [[null, column.mapToDbValue([]), column.mapToDbValue([password])]];
    // When core encodes absent, empty, and populated password histories
    ensureRectangularArraySizes([column], bindings);
    // Then the unnest null/set marker uses the physical db type, text, rather than PasswordValue
    expect(bindings).toEqual([
      [
        [null, null],
        ["", null],
        ["", PASSWORD_ENCODED],
      ],
    ]);
  });

  it("bulk updates nullable custom-serde arrays to absent, empty, and populated histories", async () => {
    // Given three Users with previous password histories
    await insertUser({ id: 1, name: "u1", password_history: ["b2xk"] });
    await insertUser({ id: 2, name: "u2", password_history: ["b2xk"] });
    await insertUser({ id: 3, name: "u3", password_history: ["b2xk"] });
    const em = newEntityManager();
    const users = await em.loadAll(User, ["u:1", "u:2", "u:3"]);
    // When their histories become absent, empty, and populated in the same bulk update
    users[0].passwordHistory = undefined;
    users[1].passwordHistory = [];
    users[2].passwordHistory = [PasswordValue.fromPlainText(PASSWORD)];
    await em.flush();
    // Then stored arrays distinguish null from empty and contain encoded passwords without markers
    expect(await select("users")).toMatchObject([
      { password_history: null },
      { password_history: [] },
      { password_history: [PASSWORD_ENCODED] },
    ]);
  });

  it("keeps Date-backed markers in the generated codec's serialized representation", () => {
    // Given a generated Date-backed timestamp column, whose writes use ISO strings rather than Dates
    const column = getMetadata(User).fields.createdAt.serde!.columns[0];
    // When the codec returns the unnest null/set marker as the physical db type
    const marker = column.notNullMarker;
    // Then the marker has the Date codec's physical db type, an ISO string
    expect(marker).toEqual("2000-01-01T00:00:00.000Z");
  });

  it("persists self-referencing m2ms whose default index names exceed 63 chars", async () => {
    // Given two users related through a m2m table with a long name and two columns sharing a long prefix
    const em = newEntityManager();
    const [u1, u2] = [
      em.create(User, { name: "u1", email: "u1@test.com" }),
      em.create(User, { name: "u2", email: "u2@test.com" }),
    ];
    u1.relatedToUsers.add(u2);
    // When it is saved
    await em.flush();
    // Then the relation round trips in both directions
    const em2 = newEntityManager();
    const [r1, r2] = await em2.loadAll(User, [u1.idTagged, u2.idTagged]);
    expect((await r1.relatedToUsers.load()).map((u) => u.name)).toEqual(["u2"]);
    expect((await r2.relatedFromUsers.load()).map((u) => u.name)).toEqual(["u1"]);
    // And each index got its own name, i.e. Postgres did not truncate them into one
    expect(await indexNames("users_related_to_users_for_testing_long_index_name_clash")).toMatchInlineSnapshot(`
     [
       "users_related_to_users_for_testing_long_index_name_cla_832f51fc",
       "users_related_to_users_for_testing_long_index_name_cla_ec92f229",
       "users_related_to_users_for_testing_long_index_name_clash_pkey",
     ]
    `);
  });

  it("persists self-referencing m2ms whose default index names exceed 63 bytes of multibyte chars", async () => {
    // Given two users related through a m2m table whose name is multibyte, so its 54 char prefix is over 54 bytes
    const em = newEntityManager();
    const [u1, u2] = [
      em.create(User, { name: "u1", email: "u1@test.com" }),
      em.create(User, { name: "u2", email: "u2@test.com" }),
    ];
    u1.koreanToUsers.add(u2);
    // When it is saved
    await em.flush();
    // Then the relation round trips in both directions
    const em2 = newEntityManager();
    const [r1, r2] = await em2.loadAll(User, [u1.idTagged, u2.idTagged]);
    expect((await r1.koreanToUsers.load()).map((u) => u.name)).toEqual(["u2"]);
    expect((await r2.koreanFromUsers.load()).map((u) => u.name)).toEqual(["u1"]);
    // And each index got its own name, within 63 bytes
    const names = await indexNames("users_to_users_관련_사용자_with_long_index_clash");
    expect(names.every((n) => Buffer.byteLength(n) <= 63)).toBe(true);
    expect(names).toMatchInlineSnapshot(`
     [
       "users_to_users_관련_사용자_with_long_index_clash__0007a787",
       "users_to_users_관련_사용자_with_long_index_clash__9e53bccf",
       "users_to_users_관련_사용자_with_long_index_clash_pkey",
     ]
    `);
  });
});

async function indexNames(table: string): Promise<string[]> {
  const { rows } = await knex.raw("SELECT indexname FROM pg_indexes WHERE tablename = ? ORDER BY indexname", [table]);
  return rows.map((r: { indexname: string }) => r.indexname);
}
