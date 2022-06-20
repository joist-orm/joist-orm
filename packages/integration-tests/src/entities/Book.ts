import { BookCodegen, bookConfig as config } from "./entities";

export class Book extends BookCodegen {
  rulesInvoked = 0;
  firstNameRuleInvoked = 0;
  favoriteColorsRuleInvoked = 0;
  numberOfBooks2RuleInvoked = 0;
}

config.addRule((book) => {
  book.rulesInvoked++;
});

// A noop rule to make Book reactive on author.firstName
config.addRule({ author: "firstName" }, (b) => {
  b.entity.firstNameRuleInvoked++;
});

// Another noop rule to make Book reactive on author.favoriteColors
config.addRule({ author: ["favoriteColors", "firstName:ro"] }, (b) => {
  if (b.author.get.favoriteColors.length > 2) {
    return `${b.author.get.firstName} has too many colors`;
  }
  b.entity.favoriteColorsRuleInvoked++;
});

// Another noop rule to make Book reactive on author.numberOfBooks2, an async property
config.addRule({ author: "numberOfBooks2" }, (b) => {
  b.entity.numberOfBooks2RuleInvoked++;
});

config.cascadeDelete("reviews");
