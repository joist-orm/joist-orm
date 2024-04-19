import { hasReactiveField, ReactiveField } from "joist-orm";
import { CommentCodegen } from "./entities";

export class Comment extends CommentCodegen {
  readonly parentTags: ReactiveField<Comment, string> = hasReactiveField("parentTags", { parent: "tags" }, (c) => {
    return c.parent.get.tags.get.join("-");
  });
}
