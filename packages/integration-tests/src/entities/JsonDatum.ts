import { JsonDatumCodegen, JsonDatumOpts } from "./entities";
import { EntityManager } from "joist-orm";

export class JsonDatum extends JsonDatumCodegen {
  constructor(em: EntityManager, opts: JsonDatumOpts) {
    super(em, opts);
  }
}
