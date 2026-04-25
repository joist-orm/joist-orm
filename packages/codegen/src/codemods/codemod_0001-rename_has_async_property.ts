import { type Transform } from "jscodeshift";
import { JscodeshiftMod } from "./JscodeshiftMod";

export const codemod_0001_rename_has_async_property = new JscodeshiftMod(
  1,
  "codemod_0001-rename_has_async_property",
  "Rename `hasAsyncProperty` to `hasProperty`",
  (config) => `${config.entitiesDirectory}/*.ts`,
);

const renames: Record<string, string> = {
  hasAsyncProperty: "hasProperty",
  hasReactiveAsyncProperty: "hasReactiveProperty",
  AsyncProperty: "Property",
  AsyncPropertyImpl: "PropertyImpl",
  isAsyncProperty: "isProperty",
  isLoadedAsyncProperty: "isLoadedProperty",
};

/** Find/replace the various `*AsyncProperty*` symbols with their `*Property*` counterparts. */
const transform: Transform = (file, api) => {
  const j = api.jscodeshift;
  return j(file.source)
    .find(j.Identifier)
    .filter((path) => path.node.name in renames)
    .forEach((path) => {
      j(path).replaceWith(j.identifier(renames[path.node.name]));
    })
    .toSource();
};

export default transform;
