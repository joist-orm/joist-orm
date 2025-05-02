import { Transform } from "jscodeshift";
import { JscodeshiftMod } from "./JscodeshiftMod";

export const v1_245_0_upsert_rename = new JscodeshiftMod(
  "1.245.0",
  "v1_245_0_upsert_rename",
  "Rename `createOrUpdatePartial` to `upsert`",
  () => `src/**/*.ts`,
);

/** Find/replace `createOrUpdatePartial` with `upsert` */
const transform: Transform = (file, api) => {
  const j = api.jscodeshift;
  return j(file.source)
    .find(j.MemberExpression, {
      property: { name: "createOrUpdatePartial" },
    })
    .forEach((path) => {
      // Create new member expression with 'upsert' identifier
      const newNode = j.memberExpression(
        path.node.object,
        j.identifier("upsert"),
        path.node.computed, // Preserve computed property access if present
      );
      // If the original node had optional chaining, preserve it
      if (path.node.optional) newNode.optional = true;
      j(path).replaceWith(newNode);
    })
    .toSource();
};

export default transform;
