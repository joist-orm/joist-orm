import { maxValueRule, minValueRule, rangeValueRule } from "joist-orm";
import { AuthorStatCodegen, authorStatConfig as config } from "./entities";
export class AuthorStat extends AuthorStatCodegen {}

// Range rule to limit a field to be between 0 and 100
config.addRule(minValueRule("nullableInteger", 0));
config.addRule(maxValueRule("nullableInteger", 100));

// Similar range rule to above, but using the `rangeValueRule` helper
config.addRule(rangeValueRule("integer", 0, 100));

// Attempting to use a numeric range value on a non-numeric field.
// Expect an error to be thrown when set.
config.addRule(rangeValueRule("nullableText", 0, 100));
