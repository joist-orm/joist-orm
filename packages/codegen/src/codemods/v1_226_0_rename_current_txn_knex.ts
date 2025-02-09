import { Transform } from "jscodeshift";
import { JscodeshiftMod } from "./JscodeshiftMod";

export const v1_226_0_rename_current_txn_knex = new JscodeshiftMod(
  "1.226.0",
  "v1_226_0_rename_current_txn_knex",
  "Rename `currentTxnKnex` to `txn`",
  (config) => `src/**/*.ts`,
);

/** Find/replace `currentTxnKnex` with `txn` */
const transform: Transform = (file, api) => {
  const j = api.jscodeshift;
  // Find all member expressions where property is 'currentTxnKnex'
  return j(file.source)
    .find(j.MemberExpression, {
      property: { name: "currentTxnKnex" },
    })
    .forEach((path) => {
      // Create new member expression
      const newNode = j.memberExpression(
        path.node.object,
        j.identifier("txn"),
        path.node.computed, // Preserve computed property access if present
      );
      // If the original node had optional chaining, preserve it
      if (path.node.optional) newNode.optional = true;
      j(path).replaceWith(newNode);
    })
    .toSource();
};

export default transform;
