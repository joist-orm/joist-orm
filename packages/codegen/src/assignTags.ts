import { camelCase, snakeCase } from "change-case";
import { groupBy } from "joist-utils";
import { Config } from "./config";
import { DbMetadata } from "./index";
import { logger } from "./logger";

/**
 * Looks for any entities that don't have tags in `config` yet, and guesses at what a good tag would be.
 *
 * The current guess is `BookReview` -> `br`. If that guess is already taken, we use the full entity name,
 * i.e. `bookReview`. The user can then customize the tags as they want directly in `joist-config.json`.
 *
 * We also mutate `config` by putting the new tag into the `config`'s entity entry.
 */
export function assignTags(config: Config, dbMetadata: DbMetadata): void {
  // Existing names (Author, Book) to find new/missing entities
  const existingEntities = Object.keys(config.entities);

  // Group by tag to get existing tag names + check for duplicates
  const existingByTag = groupBy(
    Object.entries(config.entities).filter(([name]) => !dbMetadata.entitiesByName[name].baseType),
    ([, ec]) => ec.tag,
    ([name]) => name,
  );
  for (const [tag, entities] of Object.entries(existingByTag)) {
    if (entities.length > 1) {
      logger.error(`Tag ${tag} is used by multiple entities: ${entities.join(", ")}`);
    }
  }

  const existingTagNames = Object.keys(existingByTag);

  dbMetadata.entities
    .filter((e) => !existingEntities.includes(e.name))
    // Subclass entities share their base entity's tag
    .filter((e) => !e.baseClassName)
    .forEach((e) => {
      const abbreviatedTag = guessTagName(e.name);
      // If the abbreviation is taken, fallback on the full name
      const tagName = existingTagNames.includes(abbreviatedTag) ? camelCase(e.name) : abbreviatedTag;
      const entityConfig = config.entities[e.name];
      if (!entityConfig) {
        config.entities[e.name] = { tag: tagName };
      } else {
        entityConfig.tag = tagName;
      }
      e.tagName = tagName;
      existingTagNames.push(tagName);
    });

  // Assign subtypes the same tag as the base
  dbMetadata.entities
    .filter((e) => e.baseClassName)
    .forEach((e) => {
      const entityConfig = config.entities[e.name];
      const baseTypeTagName = config.entities[e.baseClassName!].tag;
      if (!entityConfig) {
        config.entities[e.name] = { tag: baseTypeTagName };
      } else {
        entityConfig.tag = baseTypeTagName;
      }
      e.tagName = baseTypeTagName;
    });
}

/** Abbreviates `BookReview` -> `book_review` -> `br`. */
function guessTagName(name: string): string {
  return snakeCase(name)
    .split("_")
    .map((w) => w[0])
    .join("");
}
