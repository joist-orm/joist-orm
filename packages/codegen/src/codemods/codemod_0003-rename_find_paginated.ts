import { type Transform } from "jscodeshift";
import { JscodeshiftMod } from "./JscodeshiftMod";

export const codemod_0003_rename_find_paginated = new JscodeshiftMod(
  3,
  "codemod_0003-rename_find_paginated",
  "Rename EntityManager findPaginated APIs to find APIs",
);

const renames = new Map<string, string>([
  ["findPaginated", "find"],
  ["findGqlPaginated", "findGql"],
]);

/** Rewrites EntityManager paginated find method calls to the now-paginated find APIs. */
const transform: Transform = function (file, api) {
  const j = api.jscodeshift;
  return j(file.source)
    .find(j.MemberExpression)
    .forEach((path) => {
      const { property } = path.node;
      if (property.type !== "Identifier") {
        return;
      }
      const rename = renames.get(property.name);
      if (!rename) {
        return;
      }
      property.name = rename;
    })
    .toSource();
};

export default transform;
