import { defaultConfig } from "./config";
import { collectionName, makeEntity } from "./EntityDbMetadata";
import { tableToEntityName } from "./utils";

const relationDummy: any = { targetTable: { m2oRelations: [] } };
const configDummy: any = { relationNameOverrides: {} };

describe("EntityDbMetadata", () => {
  describe("tableToEntityName", () => {
    it("singularizes the table names", () => {
      expect(tableToEntityName(defaultConfig, { name: "authors" } as any)).toEqual("Author");
    });

    it("uses config for the table names", () => {
      const config = {
        ...defaultConfig,
        entities: { Author: { tag: "a", tableName: "TBL_ATHR" } },
      };
      expect(tableToEntityName(config, { name: "TBL_ATHR" } as any)).toEqual("Author");
    });
  });

  describe("collectionName", () => {
    it("handles base case", () => {
      expect(collectionName(configDummy, makeEntity("Author"), makeEntity("Book"), relationDummy).fieldName).toEqual(
        "books",
      );
    });

    it("handles author/mentor", () => {
      expect(collectionName(configDummy, makeEntity("Author"), makeEntity("Author"), relationDummy).fieldName).toEqual(
        "authors",
      );
    });

    it("handles book/book review", () => {
      expect(
        collectionName(configDummy, makeEntity("Book"), makeEntity("BookReview"), relationDummy).fieldName,
      ).toEqual("reviews");
    });
  });
});
