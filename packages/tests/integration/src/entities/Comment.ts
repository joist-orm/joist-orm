import { hasReactiveField, ReactiveField } from "joist-orm";
import { CommentCodegen } from "./entities";

export class Comment extends CommentCodegen {
  readonly parentTags: ReactiveField<Comment, string> = hasReactiveField(
    "parentTags",
    { parent: { tags: "name" } },
    (c) => {
      return c.parent.get.tags.get.map((t) => t.name).join("-");
    },
  );
}
