import { AsyncProperty, hasReactiveAsyncProperty, hasReactiveField, ReactiveField } from "joist-orm";
import { Author, BookCodegen, bookConfig as config } from "./entities";

export class Book extends BookCodegen {
  rulesInvoked = 0;
  firstNameRuleInvoked = 0;
  favoriteColorsRuleInvoked = 0;
  reviewsRuleInvoked = 0;
  numberOfBooks2RuleInvoked = 0;
  authorSetWhenDeleteRuns: boolean | undefined = undefined;
  afterCommitCheckTagsChanged: boolean | undefined = undefined;
  transientFields = { throwNpeInSearch: false };

  /** For testing reacting to poly CommentParent properties. */
  readonly commentParentInfo: AsyncProperty<Book, string> = hasReactiveAsyncProperty(
    { reviews: "isPublic" },
    (b) => `reviews=${b.reviews.get.filter((r) => r.isPublic.get).length}`,
  );

  /** For testing accessing `book.author.get` when it's undefined. */
  readonly search: ReactiveField<Book, string> = hasReactiveField("search", { author: "firstName", title: {} }, (b) => {
    // Ensure that NPEs that aren't from validation errors aren't suppressed
    if (b.transientFields.throwNpeInSearch) {
      (undefined as any).willFail();
    }
    // This will NPE if author is undefined (which is what we're testing)
    const { firstName } = b.author.get;
    return [firstName, b.title].join(" ");
  });
}

config.addRule((book) => {
  book.rulesInvoked++;
});

// A noop rule to make Book reactive on author.firstName
config.addRule({ author: "firstName" }, (b) => {
  // Assert that this compiles
  noop(b.author.get.changes.firstName.hasChanged);
  // Assert this does not
  // @ts-expect-error
  noop(b.author.get.changes.lastName.hasChanged);
  // And record the side effect for assertions
  b.fullNonReactiveAccess.firstNameRuleInvoked++;
});

// Another noop rule to make Book reactive on author.favoriteColors
config.addRule({ author: ["favoriteColors", "firstName:ro"] }, (b) => {
  if (b.author.get.favoriteColors.length > 2) {
    return `${b.author.get.firstName} has too many colors`;
  }
  b.fullNonReactiveAccess.favoriteColorsRuleInvoked++;
});

// Example of a rule on reviews, where the BookReview.book is cannotBeUpdated
config.addRule("reviews", (b) => {
  b.fullNonReactiveAccess.reviewsRuleInvoked++;
});

// Another noop rule to make Book reactive on author.numberOfBooks2, an async property
config.addRule({ author: "numberOfBooks2" }, (b) => {
  b.fullNonReactiveAccess.numberOfBooks2RuleInvoked++;
});

/**
 * Example of a synchronous default.
 *
 * Explicitly using single quotes for scanEntityFiles detection
 */
// prettier-ignore
config.setDefault('notes', (b) => `Notes for ${b.title}`);

/** Example of an asynchronous default. */
config.setDefault("order", { author: "books" }, (b) => b.author.get?.books.get.indexOf(b) + 1);

/** Example of an asynchronous-but-sync default that returns an entity. */
// Elaborate hint to test returning a Reacted<Author>
config.setDefault("author", { tags: { publishers: "authors" } }, (b, { em }) => {
  // Test returning a Reacted<Author> can pass type check
  // ...and also synchronously returning an entity from an async default
  return b.tags.get[0]?.publishers.get[0]?.authors.get[0];
});

/** Example of an asynchronous-and-actually-async default that returns an entity. */
config.setDefault("reviewer", "title", async (b, { em }) => {
  // See if we have an author with the same name as the book title
  return em.findOne(Author, { lastName: b.title });
});

/** Example of cross-entity setDefault dependencies. */
config.setDefault("authorsNickNames", { author: "nickNames" }, (b) => {
  return b.author.get.nickNames?.join(", ") ?? "-";
});

config.cascadeDelete("reviews");

// Verify that beforeDelete hooks see their pre-unhooked-state, because if they run
// after the entity is unhooked, they won't be able to access their relationships.
config.beforeDelete("author", (b) => {
  b.authorSetWhenDeleteRuns = b.author.getWithDeleted !== undefined;
});

// Test m2m reactivity on collection size
config.addRule("tags", (b) => {
  return b.tags.get.length === 3 ? "Cannot have exactly three tags" : undefined;
});

// Example of a trigger for a many-to-many field
config.touchOnChange("tags");

config.beforeFlush((book) => {
  // Arbitrary logic to show this hook fired, the relevant logic here is the `book.changes.fields.includes("tags")`
  if (book.changes.fields.includes("tags") && book.title.includes("To be changed by hook")) {
    book.title = "Tags Changed";
  }
});

// Example to ensure the m2m changes are tracked until afterCommit is called
config.afterCommit((book) => {
  if (book.changes.fields.includes("tags")) {
    // Arbitrary logic to identify that this hook fired on unit tests
    book.afterCommitCheckTagsChanged = true;
  }
});

function noop(_: any): void {}
