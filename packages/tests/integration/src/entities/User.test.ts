import { User } from "@src/entities";
import { insertUser, select } from "@src/entities/inserts";
import { PasswordValue } from "@src/entities/types";
import { newEntityManager } from "@src/setupDbTests";

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
});
