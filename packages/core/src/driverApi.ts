import { buildValuesCte } from "./dataloaders/findDataLoader";
import { DeleteOp, generateOps, InsertOp, UpdateOp } from "./drivers/EntityWriter";
import { buildCteSql } from "./drivers/buildRawQuery";
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
