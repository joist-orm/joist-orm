import { BookCodegen, bookConfig as config } from "./entities";

export class Book extends BookCodegen {
  rulesInvoked = 0;
  firstNameRuleInvoked = 0;
  favoriteColorsRuleInvoked = 0;
}

config.addRule((book) => {
  book.rulesInvoked++;
});

// A noop rule to make Book reactive on author.firstName
config.addRule({ author: "firstName" }, (b) => {
  b.entity.firstNameRuleInvoked++;
});

// Another noop rule to make Book reactive on author.favoriteColors
config.addRule({ author: "favoriteColors" }, (b) => {
  b.entity.favoriteColorsRuleInvoked++;
});

config.cascadeDelete("reviews");
