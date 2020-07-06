import { snakeCase } from "change-case";
import { DbMetadata } from "./index";
import { Config } from "./config";

/**
 * Looks for any entities that don't have tags in `config` yet, and guesses at what a good tag would be.
 *
 * The current guess is `BookReview` -> `br`.
 *
 * We also mutate `config` by putting the guessed tag (assuming it's not already taken) on the entity's config.
 *
 * If a guessed tag name is already taken, we'll prompt the user to set their own tag in joist-codegen.json.
 */
export function assignTags(config: Config, dbMetadata: DbMetadata): { needsManuallyAssigned: string[] } {
  const existingTags = Object.fromEntries(
    Object.entries(config.entities).map(([name, conf]) => {
      return [name, conf.tag];
    }),
  );

  const needsManuallyAssigned: string[] = [];

  dbMetadata.entities
    .filter((e) => !existingTags[e.entity.name])
    .forEach((e) => {
      // Abbreviate BookReview -> book_review -> br
      const potentialTag = snakeCase(e.entity.name)
        .split("_")
        .map((w) => w[0])
        .join("");
      if (Object.values(existingTags).includes(potentialTag)) {
        needsManuallyAssigned.push(e.entity.name);
      } else {
        let oc = config.entities[e.entity.name];
        if (!oc) {
          oc = config.entities[e.entity.name] = { tag: potentialTag, fields: {} };
        }
        oc.tag = potentialTag;
      }
    });

  return { needsManuallyAssigned };
}
