import { EntityManager, HasKnex } from "joist-orm";

export interface Context extends HasKnex {
  makeApiCall(request: string): Promise<void>;
  em: EntityManager;
}
