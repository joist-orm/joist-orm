import { Transform } from "jscodeshift";

/** Find/replace `hasPersistedAsyncProperty` with `hasReactiveField` */
export const transform: Transform = (file, api) => {
  const j = api.jscodeshift;
  return j(file.source)
    .find(j.Identifier)
    .filter(({ node }) => node.name === "hasPersistedAsyncProperty")
    .forEach((path) => {
      j(path).replaceWith(j.identifier("hasReactiveField"));
    })
    .toSource();
};

export default transform;
