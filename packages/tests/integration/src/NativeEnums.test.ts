import { Author, FavoriteShape, newAuthor } from "@src/entities";
import { insertAuthor, select } from "@src/entities/inserts";
import { newEntityManager } from "./setupDbTests";

describe("NativeEnums", () => {
  it("can save native enums", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em, { favoriteShape: FavoriteShape.Triangle });
    await em.flush();
    const rows = await select("authors");
    expect(rows[0].favorite_shape).toEqual(FavoriteShape.Triangle);
  });

  it("can load native enums", async () => {
    await insertAuthor({ first_name: "a1", favorite_shape: FavoriteShape.Triangle });
    const em = newEntityManager();
    const a1 = await em.load(Author, "a:1");
    expect(a1.favoriteShape).toEqual(FavoriteShape.Triangle);
  });
});
