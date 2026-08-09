import { buildValuesCte } from "./dataloaders/findDataLoader";
import { buildCteSql } from "./drivers/buildRawQuery";
import { DeleteOp, InsertOp, UpdateOp, generateOps } from "./drivers/EntityWriter";
import { getRuntimeConfig } from "./runtimeConfig";
import { batched, cleanSql } from "./utils";

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
