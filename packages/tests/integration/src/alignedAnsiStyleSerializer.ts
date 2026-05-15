import { stripAnsi } from "joist-utils";
import type { NewPlugin } from "pretty-format";

/** Drop the colorized ANSI chars b/c we're not trying to test Jest colorization itself. */
export const alignedAnsiStyleSerializer: NewPlugin = {
  serialize(val: string): string {
    return stripAnsi(val);
  },
  test(val: unknown): val is string {
    return typeof val === "string";
  },
};
