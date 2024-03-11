import { Transform } from "jscodeshift";
import { JscodeshiftMod } from "./JscodeshiftMod";

export const v1_143_0_rename_derived_async_property = new JscodeshiftMod(
  "1.143.0",
  "v1_143_0_rename_derived_async_property",
  "Rename `hasPersistedAsyncProperty` to `hasReactiveField`",
  (config) => `${config.entitiesDirectory}/*.ts`,
);

/** Find/replace `hasPersistedAsyncProperty` with `hasReactiveField` */
const transform: Transform = (file, api) => {
  const j = api.jscodeshift;
  return j(file.source)
    .find(j.Identifier)
    .filter(
      ({ node }) =>
        node.name === "hasPersistedAsyncProperty" ||
        node.name === "PersistedAsyncProperty" ||
        node.name === "isPersistedAsyncProperty",
    )
    .forEach((path) => {
      if (path.node.name === "PersistedAsyncProperty") {
        j(path).replaceWith(j.identifier("ReactiveField"));
      } else if (path.node.name === "isPersistedAsyncProperty") {
        j(path).replaceWith(j.identifier("isReactiveField"));
      } else {
        j(path).replaceWith(j.identifier("hasReactiveField"));
      }
    })
    .toSource();
};

export default transform;
