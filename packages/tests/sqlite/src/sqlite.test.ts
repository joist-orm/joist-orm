import { getDMMF } from "@prisma/sdk";
import { readFile } from "node:fs/promises";

describe("sqlite", () => {
  it("should work", async () => {
    // Just load the file, as getDMMF `prismaPath` requires an absolute path
    const schema = await readFile("./schema.prisma", { encoding: "utf8" });
    const dmmf = await getDMMF({ datamodel: schema });
    dmmf.datamodel.models.forEach((m) => {
      console.log(m);
    });
    console.log(dmmf);
    expect(dmmf.datamodel.models.map((m) => m.name)).toEqual(["User", "Post"]);
    expect(true).toBe(true);
  });
});
