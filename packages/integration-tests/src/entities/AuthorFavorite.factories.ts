import { FactoryOpts, New, newTestInstance } from "joist-orm";
import { EntityManager } from "src/entities";
import { AuthorFavorite } from "./entities";

export function newAuthorFavorite(em: EntityManager, opts: FactoryOpts<AuthorFavorite> = {}): New<AuthorFavorite> {
  return newTestInstance(em, AuthorFavorite, opts);
}
