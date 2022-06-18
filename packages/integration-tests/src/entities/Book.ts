import { Loaded, LoadHint, Reacted, ReactiveHint } from "joist-orm";
import { BookCodegen, bookConfig as config, BookReview } from "./entities";

export class Book extends BookCodegen {
  rulesInvoked = 0;
  firstNameRuleInvoked = 0;
}

config.addRule((book) => {
  book.rulesInvoked++;
});

// A noop rule to make book reactive on author
config.addRule({ author: "firstName" }, (b) => {
  b.entity.firstNameRuleInvoked++;
});

config.cascadeDelete("reviews");

function testLoads() {
  const b1: LoadHint<BookReview> = { book: { author: "publisher" } };
  const br: Loaded<BookReview, { book: { author: "publisher" } }> = null!;
  console.log(br.book.get.author.get.publisher.get);
}

function testing() {
  const b1: ReactiveHint<Book> = { author: "firstName" };

  const b2: ReactiveHint<Book> = { author: ["firstName", "lastName"] };
  const b2e: Reacted<Book, { author: ["firstName", "lastName"] }> = null!;
  console.log(b2e.author.get.firstName, b2e.author.get.lastName);

  const b3: ReactiveHint<Book> = { author: { publisher: "name", firstName: {} } };
  const b3e: Reacted<Book, { author: { publisher: "name"; firstName: {} } }> = null!;
  console.log(b3e.author.get.firstName, b3e.author.get.publisher.get!.name);

  const b4: ReactiveHint<Book> = "title";
  const b4e: Reacted<Book, "title"> = null!;
  console.log(b4e.title);

  const b5: ReactiveHint<Book> = ["title", "order"];
  const b5e: Reacted<Book, ["title", "order"]> = null!;
  console.log(b5e.order, b5e.title);
}
