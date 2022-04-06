import { Author, newAuthorFavorite } from "../entities";
import { newEntityManager } from "../setupDbTests";

describe("AuthorFavorite", () => {
  it("can instantiate a FavoriteThing and assign parents to an existing Author", async () => {
    const em = newEntityManager();
    // When I create a newAuthorFavorite without any options
    const af1 = newAuthorFavorite(em);

    // Then I expect a new favoriteThing to be made
    expect(af1.favoriteThing.isSet).toBeTruthy();
    // And its parent to be set
    expect(af1.favoriteThing.get.parent.isSet).toBeTruthy();
    // And the author created for the AuthorFavorite to be automatically selected to be the parent of the FavoriteThing
    expect(af1.author.get).toEqual(await af1.favoriteThing.get.parent.load());

    // And when it flushes
    await em.flush();
    // I expect it to succeed, and for there to be only one author
    expect(await em.find(Author, {})).toHaveLength(1);
  });

  it("can override the default Author", async () => {
    const em = newEntityManager();
    // When I create a newAuthorFavorite and specify a new parent be created, without further details
    const af1 = newAuthorFavorite(em, {
      author: {},
      favoriteThing: { parent: {} },
    });

    // Then I expect a new favoriteThing to be made
    expect(af1.favoriteThing.isSet).toBeTruthy();
    // And its parent to be set
    expect(af1.favoriteThing.get.parent.isSet).toBeTruthy();
    // And the author created for the AuthorFavorite to be automatically selected to be the parent of the FavoriteThing
    expect(af1.author.get).not.toEqual(await af1.favoriteThing.get.parent.load());

    // And when it flushes
    await em.flush();
    // I expect it to succeed, and for there to be 2 authors
    expect(await em.find(Author, {})).toHaveLength(2);
  });
});
