import { type Transform } from "jscodeshift";
import { JscodeshiftMod } from "./JscodeshiftMod";

export const codemod_0001_rename_has_async_property = new JscodeshiftMod(
  1,
  "codemod_0001-rename_has_async_property",
  "Rename `hasAsyncProperty` to `hasProperty`",
);

const renames = new Map<string, string>([
  ["hasAsyncProperty", "hasProperty"],
  ["hasReactiveAsyncProperty", "hasReactiveProperty"],
  ["AsyncProperty", "Property"],
  ["AsyncPropertyImpl", "PropertyImpl"],
  ["isAsyncProperty", "isProperty"],
  ["isLoadedAsyncProperty", "isLoadedProperty"],
]);

/** Find/replace the various `*AsyncProperty*` symbols with their `*Property*` counterparts. */
const transform: Transform = function (file, api) {
  const j = api.jscodeshift;
  return j(file.source)
    .find(j.Identifier)
    .forEach((path) => {
      const rename = renames.get(path.node.name);
      if (!rename) {
        return;
      }
      j(path).replaceWith(j.identifier(rename));
    })
    .toSource();
};

export default transform;
