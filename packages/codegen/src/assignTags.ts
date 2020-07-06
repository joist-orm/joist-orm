import { snakeCase, camelCase } from "change-case";
import { DbMetadata } from "./index";
import { Config } from "./config";

/**
 * Looks for any entities that don't have tags in `config` yet, and guesses at what a good tag would be.
 *
 * The current guess is `BookReview` -> `br`. If that guess is already taken, we use the full entity name,
 * i.e. `bookReview`. The user can then customize the tags as they want directly in `joist-codegen.json`.
 *
 * We also mutate `config` by putting the new tag into the `config`'s entity entry.
 */
export function assignTags(config: Config, dbMetadata: DbMetadata): void {
  const existingTags = Object.fromEntries(
    Object.entries(config.entities).map(([name, conf]) => {
      return [name, conf.tag];
    }),
  );

  const existingTagNames = Object.values(existingTags);

  dbMetadata.entities
    .filter((e) => !existingTags[e.name])
    .forEach((e) => {
      const abbreviatedTag = guessTagName(e.name);
      const tagName = existingTagNames.includes(abbreviatedTag) ? camelCase(e.name) : abbreviatedTag;
      const oc = config.entities[e.name];
      if (!oc) {
        config.entities[e.name] = { tag: tagName, fields: {} };
      } else {
        oc.tag = tagName;
      }
      existingTagNames.push(tagName);
    });

  // TODO ensure tags are unique
}

/** Abbreviates `BookReview` -> `book_review` -> `br`. */
function guessTagName(name: string): string {
  return snakeCase(name)
    .split("_")
    .map((w) => w[0])
    .join("");
}
