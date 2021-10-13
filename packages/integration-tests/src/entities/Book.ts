import { BookCodegen, bookConfig as config } from "./entities";

export class Book extends BookCodegen {
  rulesInvoked = 0;
}

config.addRule((book) => {
  book.rulesInvoked++;
});

// A noop rule to make book reactive on author
config.addRule("author", () => {});

config.cascadeDelete("reviews");
