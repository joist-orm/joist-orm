import { Transform } from "jscodeshift";

/** Find/replace `hasPersistedAsyncProperty` with `hasReactiveField` */
export const transform: Transform = (file, api) => {
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
