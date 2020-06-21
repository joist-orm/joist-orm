import { EntityManager } from "joist-orm";
import { knex } from "../setupDbTests";
import { JsonDatum } from "./JsonDatum";

describe("JsonDatum", () => {
  it("creates JsonDatum too", async () => {
    const em = new EntityManager(knex);
    const notNullJson = { some: { data: "here" } }
    const datum = em.create(JsonDatum, { notNullJson });
    expect(datum.notNullJson).toEqual(notNullJson)

  });
});
