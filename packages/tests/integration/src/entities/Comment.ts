import { hasReactiveField, ReactiveField } from "joist-orm";
import { CommentCodegen } from "./entities";

export class Comment extends CommentCodegen {
  readonly parentTags: ReactiveField<Comment, string> = hasReactiveField(
    "parentTags",
    { parent: { commentParentInfo: {}, tags: "name" } },
    (c) => {
      return [c.parent.get?.commentParentInfo.get, ...(c.parent.get?.tags.get.map((t) => t.name) ?? [])].join("-");
    },
  );

  readonly parentTaggedId: ReactiveField<Comment, string> = hasReactiveField(
    "parentTaggedId",
    "parent",
    // `as string` because `c.parent.id` is incorrectly coming back as IdType like `number | string`
    (c) => c.parent.id as string,
  );
}
