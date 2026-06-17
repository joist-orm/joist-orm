import { Child } from "src/entities";
import { MutationResolvers } from "src/generated/graphql-types";
import { saveEntity } from "src/resolvers/utils";

export const saveChild: Pick<MutationResolvers, "saveChild"> = {
  async saveChild(_, args, ctx) {
    return { child: await saveEntity(ctx, Child, args.input) };
  },
};
