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

  readonly parentTaggedId: ReactiveField<Comment, string | undefined> = hasReactiveField(
    "parentTaggedId",
    "parent",
    // Use idIfSet because parent is allowed to be null, both to not breaking existing
    // tests, including one PolymorphicReference test that explicitly tests deleting the
    // target of a poly field, and watching it get unhooked.
    (c) => c.parent.idIfSet,
  );
}
