import { Transform } from "jscodeshift";
import { JscodeshiftMod } from "./JscodeshiftMod";

export const v1_151_0_rename_derived_reference = new JscodeshiftMod(
  "1.151.0",
  "v1_151_0_rename_derived_async_reference",
  "Rename `hasPersistedAsyncReference` to `hasReactiveReference`",
  (config) => `${config.entitiesDirectory}/*.ts`,
);

/** Find/replace `hasPersistedAsyncReference` with `hasReactiveField` */
const transform: Transform = (file, api) => {
  const j = api.jscodeshift;
  return j(file.source)
    .find(j.Identifier)
    .filter(
      ({ node }) =>
        node.name === "hasPersistedAsyncReference" ||
        node.name === "PersistedAsyncReference" ||
        node.name === "isPersistedAsyncReference",
    )
    .forEach((path) => {
      if (path.node.name === "PersistedAsyncReference") {
        j(path).replaceWith(j.identifier("ReactiveReference"));
      } else if (path.node.name === "isPersistedAsyncReference") {
        j(path).replaceWith(j.identifier("isReactiveReference"));
      } else {
        j(path).replaceWith(j.identifier("hasReactiveReference"));
      }
    })
    .toSource();
};

export default transform;
