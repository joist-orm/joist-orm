import { BookReviewCodegen, BookReviewOpts } from "./entities";
import { EntityManager } from "joist-orm";

export class BookReview extends BookReviewCodegen {
  constructor(em: EntityManager, opts: BookReviewOpts) {
    super(em, opts);
  }
}
