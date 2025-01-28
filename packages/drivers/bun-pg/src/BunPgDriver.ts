import { Driver, IdAssigner } from "joist-orm";

export class BunPgDriver implements Driver {
  private readonly idAssigner: IdAssigner;
}
