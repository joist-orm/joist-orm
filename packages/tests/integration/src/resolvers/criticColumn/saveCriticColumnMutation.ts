import { CriticColumn } from "src/entities";
import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntity } from "src/resolvers/utils";

export const saveCriticColumn: Pick<MutationResolvers, "saveCriticColumn"> = {
  async saveCriticColumn(_, args, ctx) {
    return { criticColumn: await saveEntity(ctx, CriticColumn, args.input) };
  },
};
