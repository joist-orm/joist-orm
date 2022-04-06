import { FactoryOpts, maybeNewPoly, New, newTestInstance } from "joist-orm";
import { Author, Book, EntityManager, FavoriteThingParent, Publisher } from "src/entities";
import { FavoriteThing } from "./entities";

export function newFavoriteThing(em: EntityManager, opts: FactoryOpts<FavoriteThing> = {}): New<FavoriteThing> {
  return newTestInstance(em, FavoriteThing, {
    parent: maybeNewPoly<FavoriteThingParent>(Author, {}, Book, Publisher),
    ...opts,
  });
}
