import { TagCodegen, tagConfig as config } from "./entities";

export class Tag extends TagCodegen {}

// Example of a trigger for a many-to-many field
config.touchOnChange("books");

config.beforeFlush("books", (tag) => {
  // this is an arbritrary logic to identify that this hook fired on unit tests, the relevant logic here is the `tag.changes.fields.includes("books")`
  const firstBookTitle = tag.books.get?.[0]?.title ?? "";
  const shouldChangeTagName = firstBookTitle === "Tags Changed" || firstBookTitle.includes("To be changed by hook");
  if (tag.changes.fields.includes("books") && shouldChangeTagName) {
    tag.name = `Books Changed`;
  }
});
