import { BookCodegen, bookConfig as config } from "./entities";

export class Book extends BookCodegen {
  rulesInvoked = 0;
  firstNameRuleInvoked = 0;
  favoriteColorsRuleInvoked = 0;
  reviewsRuleInvoked = 0;
  numberOfBooks2RuleInvoked = 0;
  authorSetWhenDeleteRuns: boolean | undefined = undefined;
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

config.cascadeDelete("reviews");

// Verify that beforeDelete hooks see their pre-unhooked-state, because if they run
// after the entity is unhooked, they won't be able to access their relationships.
config.beforeDelete("author", (b) => {
  b.authorSetWhenDeleteRuns = b.author.getWithDeleted !== undefined;
});

function noop(param: any): void {}
