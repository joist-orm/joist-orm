import { sql, TransactionSQL } from "bun";
import { Driver, IdAssigner } from "joist-orm";

async function main() {
  await sql.begin(async (tx) => {
    return [tx`asdfa`];
  });
}

export class BunPgDriver implements Driver<TransactionSQL> {
  private readonly idAssigner: IdAssigner;
}
