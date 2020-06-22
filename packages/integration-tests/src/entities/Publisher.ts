import { PublisherCodegen, publisherConfig } from "./entities";

export class Publisher extends PublisherCodegen {}

publisherConfig.addRule("authors", (p) => {
  if (p.authors.get.length === 13) {
    return "Cannot have 13 authors";
  }
});
