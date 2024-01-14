import { Transform } from "jscodeshift";

/** Find/replace `hasPersistedAsyncProperty` with `hasReactiveField` */
export const transform: Transform = (file, api) => {
  const j = api.jscodeshift;
  return j(file.source)
    .find(j.Identifier)
    .filter(({ node }) => node.name === "hasPersistedAsyncProperty" || node.name === "PersistedAsyncProperty")
    .forEach((path) => {
      if (path.node.name === "PersistedAsyncProperty") {
        j(path).replaceWith(j.identifier("ReactiveField"));
      } else {
        j(path).replaceWith(j.identifier("hasReactiveField"));
      }
    })
    .toSource();
};

export default transform;
