import { type Transform } from "jscodeshift";
import { JscodeshiftMod } from "./JscodeshiftMod";

export const codemod_0002_rename_async_query_fields = new JscodeshiftMod(
  2,
  "codemod_0002-rename_async_query_fields",
  "Rename async query property/field APIs to async property/field APIs",
);

const renames = new Map<string, string>([
  ["AsyncQueryProperty", "Property"],
  ["AsyncQueryPropertyImpl", "AsyncPropertyImpl"],
  ["hasAsyncQueryProperty", "hasAsyncProperty"],
  ["isAsyncQueryProperty", "isAsyncProperty"],
  ["isLoadedAsyncQueryProperty", "isLoadedAsyncProperty"],
  ["ReactiveQueryField", "AsyncReactiveField"],
  ["ReactiveQueryFieldImpl", "AsyncReactiveFieldImpl"],
  ["hasReactiveQueryField", "hasAsyncReactiveField"],
  ["isReactiveQueryField", "isAsyncReactiveField"],
  ["isLoadedReactiveQueryField", "isLoadedAsyncReactiveField"],
]);

/** Find/replace the async query symbols with their async property/field counterparts. */
const transform: Transform = function (file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  root
    .find(j.Identifier)
    .forEach((path) => {
      const rename = renames.get(path.node.name);
      if (!rename) {
        return;
      }
      j(path).replaceWith(j.identifier(rename));
    });
  root
    .find(j.ImportDeclaration)
    .forEach((path) => {
      const rename = renameModulePath(path.node.source.value);
      if (rename) {
        path.node.source.value = rename;
      }
    });
  root
    .find(j.ExportNamedDeclaration)
    .forEach((path) => {
      const rename = renameModulePath(path.node.source?.value);
      if (rename && path.node.source) {
        path.node.source.value = rename;
      }
    });
  return root.toSource();
};

/** Renames direct module paths to the moved relation files. */
function renameModulePath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const rename = value
    .replace(/hasAsyncQueryProperty$/, "AsyncProperty")
    .replace(/ReactiveQueryField$/, "AsyncReactiveField");
  return rename === value ? undefined : rename;
}

export default transform;
