import { Employee } from "src/entities";
import type { QueryResolvers } from "src/generated/graphql-types";

export const employee: Pick<QueryResolvers, "employee"> = {
  async employee(_, args, ctx) {
    return ctx.em.load(Employee, args.id);
  },
};
