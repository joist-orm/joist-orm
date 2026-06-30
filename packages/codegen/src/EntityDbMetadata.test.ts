import { config } from "./config";
import {
  canonicalizeOtherEntities,
  collectionName,
  makeEntity,
  oneToOneName,
  referenceName,
  resolveNameConflicts,
} from "./EntityDbMetadata";
import { tableToEntityName } from "./utils";

const relationDummy: any = { type: "m2o", sourceTable: { m2oRelations: [] }, foreignKey: { columns: [{}] } };
const configDummy: any = { entities: [] };
const author = makeEntity("Author");
const book = makeEntity("Book");
const bookReview = makeEntity("BookReview");
const image = makeEntity("Image");
const defaultConfig = config.parse({});

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
        foreignKey: { columns: [{ commentData: { otherFieldName: "renamedReviews" } }] },
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
        foreignKey: { columns: [{ name: "book_id", commentData: { otherFieldName: "renamedImage" } }] },
        targetTable: { name: "images" },
        sourceTable: { m2oRelations: [] },
      };
      expect(oneToOneName(configDummy, book, author, relation as any)).toEqual("renamedImage");
    });
  });

  describe("canonicalizeOtherEntities", () => {
    it("points relation otherEntitys at the single primary instance", () => {
      const author = fakeMeta("Author");
      const book = fakeMeta("Book");
      // A fresh, duplicate `Author` object, as `makeEntity` produces for each relation
      book.manyToOnes = [{ otherEntity: makeEntity("Author") }];
      const db = asDb([author, book]);
      canonicalizeOtherEntities(db);
      expect(book.manyToOnes[0].otherEntity).toBe(author.entity);
    });
  });

  describe("resolveNameConflicts", () => {
    it("defaults to conventional names", () => {
      expect(makeEntity("Author")).toMatchObject({
        idName: "AuthorId",
        fieldsName: "AuthorFields",
        optsName: "AuthorOpts",
        idsOptsName: "AuthorIdsOpts",
        filterName: "AuthorFilter",
        graphqlFilterName: "AuthorGraphQLFilter",
        orderName: "AuthorOrder",
        factoryExtrasName: "AuthorFactoryExtras",
        scopeName: "AuthorScope",
        scopesName: "AuthorScopes",
      });
    });

    it("leaves names alone when there is no conflict", () => {
      const entities = [fakeMeta("Author"), fakeMeta("Book")];
      resolveNameConflicts(defaultConfig, asDb(entities));
      expect(entities[0].entity).toMatchObject({ scopeName: "AuthorScope", orderName: "AuthorOrder" });
    });

    it("falls back to underscore names when an entity is named EntityScope", () => {
      const entities = [fakeMeta("Author"), fakeMeta("AuthorScope")];
      resolveNameConflicts(defaultConfig, asDb(entities));
      // Only the colliding symbol is underscored; the rest stay conventional
      expect(entities[0].entity).toMatchObject({ scopeName: "Author_Scope", orderName: "AuthorOrder" });
    });

    it("falls back to underscore names for any colliding codegen'd type", () => {
      const entities = [fakeMeta("Author"), fakeMeta("AuthorOrder"), fakeMeta("AuthorFilter")];
      resolveNameConflicts(defaultConfig, asDb(entities));
      expect(entities[0].entity).toMatchObject({
        orderName: "Author_Order",
        filterName: "Author_Filter",
        optsName: "AuthorOpts",
      });
    });

    it("rewrites cross-entity references to stay in sync", () => {
      const author = fakeMeta("Author");
      const book = fakeMeta("Book");
      book.manyToOnes = [{ otherEntity: makeEntity("Author") }];
      // An entity named `AuthorId` collides with Author's own `AuthorId` type
      const db = asDb([author, book, fakeMeta("AuthorId")]);
      canonicalizeOtherEntities(db);
      resolveNameConflicts(defaultConfig, db);
      expect(author.entity.idName).toEqual("Author_Id");
      // Book's m2o points at Author's single primary instance, so it follows the rename
      expect(book.manyToOnes[0].otherEntity.idName).toEqual("Author_Id");
    });

    it("falls back when an enum is named EntityScope", () => {
      const entities = [fakeMeta("Author")];
      // The `author_scopes` enum table is exported as the singularized `AuthorScope`, and its pluralized
      // metadata const `AuthorScopes` collides with the entity's `Scopes` type, so both are underscored.
      const enums = [{ table: { name: "author_scopes" } }];
      resolveNameConflicts(defaultConfig, asDb(entities, enums));
      expect(entities[0].entity).toMatchObject({ scopeName: "Author_Scope", scopesName: "Author_Scopes" });
    });

    it("falls back when a pg enum is named EntityOrder", () => {
      const entities = [fakeMeta("Author")];
      const pgEnums = [{ name: "AuthorOrder" }];
      resolveNameConflicts(defaultConfig, asDb(entities, [], pgEnums));
      expect(entities[0].entity).toMatchObject({ orderName: "Author_Order" });
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
        foreignKey: { columns: [{ name: "book_id", commentData: { fieldName: "renamedBook" } }] },
        sourceTable: { name: "images" },
      };
      expect(referenceName(configDummy, image, relation as any)).toEqual("renamedBook");
    });
  });
});

function fakeMeta(name: string): any {
  return {
    name,
    entity: makeEntity(name),
    manyToOnes: [],
    oneToManys: [],
    largeOneToManys: [],
    oneToOnes: [],
    manyToManys: [],
    largeManyToManys: [],
    polymorphics: [],
  };
}

function asDb(entities: any[], enums: any[] = [], pgEnums: any[] = []): any {
  return {
    entities,
    entitiesByName: Object.fromEntries(entities.map((e) => [e.name, e])),
    enums: Object.fromEntries(enums.map((e) => [e.table.name, e])),
    pgEnums: Object.fromEntries(pgEnums.map((e) => [e.name, e])),
  };
}
