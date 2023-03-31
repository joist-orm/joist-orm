import { defaultConfig } from "./config";
import { collectionName, makeEntity, oneToOneName, referenceName } from "./EntityDbMetadata";
import { tableToEntityName } from "./utils";

const relationDummy: any = { type: "m2o", sourceTable: { m2oRelations: [] }, foreignKey: { columns: [{}] } };
const configDummy: any = { entities: [] };
const author = makeEntity("Author");
const book = makeEntity("Book");
const bookReview = makeEntity("BookReview");
const image = makeEntity("Image");

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
      // For `books.author_id` create `Author.books`
      expect(collectionName(configDummy, author, book, relationDummy).fieldName).toEqual("books");
    });

    it("handles author/mentor", () => {
      // For `authors.mentor_id` create `Author.authors` (ideally would be mentors?)
      expect(collectionName(configDummy, author, author, relationDummy).fieldName).toEqual("authors");
    });

    it("drops the book prefix from book reviews", () => {
      // For `book_reviews.book_id` create `Book.reviews`
      expect(collectionName(configDummy, book, bookReview, relationDummy).fieldName).toEqual("reviews");
    });

    it("does not drop the entity mid-name", () => {
      // For `markets.trade_partner_market_contacts` create `tradePartnerMarketContracts`
      const market = makeEntity("Market");
      const tpmc = makeEntity("TradePartnerMarketContact");
      expect(collectionName(configDummy, market, tpmc, relationDummy).fieldName).toEqual("tradePartnerMarketContacts");
    });

    it("returns an override", () => {
      // For `book_reviews.book_id` create `Book.renamedReviews`
      const relation = {
        ...relationDummy,
        foreignKey: { columns: [{ commentData: { collectionName: "renamedReviews" } }] },
      };
      expect(collectionName(configDummy, book, bookReview, relation as any).fieldName).toEqual("renamedReviews");
    });
  });

  describe("oneToOneName", () => {
    it("use the other side type name by default", () => {
      // For `images.book_id` create `Book.image`
      const relation = {
        foreignKey: { columns: [{ name: "book_id" }] },
        targetTable: { name: "images" },
        sourceTable: { m2oRelations: [] },
      };
      expect(oneToOneName(configDummy, book, image, relation as any)).toEqual("image");
    });

    it("keeps the column prefix if necessary to avoid collisions", () => {
      // For `authors.current_draft_book_id` create `Book.currentDraftAuthor`
      const relation = {
        // Given authors.current_draft_book_id is a m2o to book
        foreignKey: { columns: [{ name: "current_draft_book_id" }] },
        targetTable: { name: "authors" },
        // And `books` already has a m2o pointing back to `authors`
        sourceTable: { m2oRelations: [{ targetTable: { name: "authors" } }] },
      };
      // Then we use the tweaked column name
      expect(oneToOneName(configDummy, book, author, relation as any)).toEqual("currentDraftAuthor");
    });

    it("returns an override", () => {
      // For `images.book_id` create `Book.renamedImage`
      const relation = {
        foreignKey: { columns: [{ name: "book_id", commentData: { oneToOneName: "renamedImage" } }] },
        targetTable: { name: "images" },
        sourceTable: { m2oRelations: [] },
      };
      expect(oneToOneName(configDummy, book, author, relation as any)).toEqual("renamedImage");
    });
  });

  describe("referenceName", () => {
    it("returns the camel case of the column name without an id prefix", () => {
      // For `image.book_id` create `Image.book`
      const relation = {
        type: "m2o",
        foreignKey: { columns: [{ name: "book_id" }] },
        sourceTable: { name: "images" },
      };
      expect(referenceName(configDummy, image, relation as any)).toEqual("book");
    });

    it("uses a polymorphic name if one is present", () => {
      // For `authors.current_draft_book_id` create `Book.currentDraftAuthor`
      const relation = {
        type: "m2o",
        foreignKey: { columns: [{ name: "parent_book_id" }] },
        sourceTable: { name: "images" },
      };
      const config = { entities: { Image: { relations: { parent: { polymorphic: "notNull" } } } } };
      expect(referenceName(config as any, image, relation as any)).toEqual("parent");
    });

    it("returns an override", () => {
      // For `image.book_id` create `Image.renamedBook`
      const relation = {
        type: "m2o",
        foreignKey: { columns: [{ name: "book_id", commentData: { referenceName: "renamedBook" } }] },
        sourceTable: { name: "images" },
      };
      expect(referenceName(configDummy, image, relation as any)).toEqual("renamedBook");
    });
  });
});
