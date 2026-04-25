import { type Config } from "../config";

/**
 * A generic interface for Joist codemods.
 *
 * This can either be traditional jscodeshift mods that change the AST, or
 * also "dumber" mods that `mv` files around.
 */
export type Codemod = {
  codemodVersion: number;
  name: string;
  description: string;
  run(config: Config): Promise<void>;
};
