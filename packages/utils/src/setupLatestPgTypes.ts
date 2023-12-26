import { types } from "pg";
import { builtins, getTypeParser } from "pg-types";

export function setupLatestPgTypes(): void {
  // Object.entries(builtins).forEach(([name, oid]) => {
  //   console.log("Setting up pg type", name, oid);
  //   types.setTypeParser(oid as any, getTypeParser(oid as any));
  // });
  types.setTypeParser(types.builtins.TIMESTAMPTZ, getTypeParser(builtins.TIMESTAMPTZ));
}
