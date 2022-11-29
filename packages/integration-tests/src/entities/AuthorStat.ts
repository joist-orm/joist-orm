import { rangeValueRule } from "joist-orm";
import { AuthorStatCodegen, authorStatConfig as config } from "./entities";

export class AuthorStat extends AuthorStatCodegen {}

// Range rule to limit a field to be between 0 and 100
config.addRule(rangeValueRule("integerNull", 0, 100));
