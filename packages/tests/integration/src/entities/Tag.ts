import { TagCodegen, tagConfig as config } from "./entities";

export class Tag extends TagCodegen {}

// Example of a trigger for a many to many field
config.touchOnChange("books");
config.beforeFlush(async (tag) => {
  if (tag.changes.fields.includes("books")) {
    tag.name = "Books Changed";
  }
});
