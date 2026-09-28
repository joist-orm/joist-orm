import { buildValuesCte } from "src/dataloaders/findDataLoader.ts";
import { type DeleteOp, type InsertOp, type UpdateOp, generateOps } from "src/drivers/EntityWriter.ts";
import { buildCteSql } from "src/queries/find/buildFindQuery.ts";
import { getRuntimeConfig } from "src/runtimeConfig.ts";
import { batched, cleanSql } from "src/utils.ts";

export const driverApi = {
  buildValuesCte,
  generateOps,
  buildCteSql,
  getRuntimeConfig,
  batched,
  cleanSql,
};

export type driverApi = {
  DeleteOp: DeleteOp;
  UpdateOp: UpdateOp;
  InsertOp: InsertOp;
};
