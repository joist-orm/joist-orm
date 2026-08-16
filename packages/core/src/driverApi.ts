import { buildValuesCte } from "./dataloaders/findDataLoader.ts";
import { buildCteSql } from "./drivers/buildRawQuery.ts";
import { type DeleteOp, type InsertOp, type UpdateOp, generateOps } from "./drivers/EntityWriter.ts";
import { getRuntimeConfig } from "./runtimeConfig.ts";
import { batched, cleanSql } from "./utils.ts";

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
