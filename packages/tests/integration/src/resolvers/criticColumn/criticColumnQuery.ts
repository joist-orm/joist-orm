import { CriticColumn } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";

export const criticColumn: Pick<QueryResolvers, "criticColumn"> = {
  async criticColumn(_, args, ctx) {
    return ctx.em.load(CriticColumn, args.id);
  },
};
