import { parseMarkdownContent, testing } from "./markdown";
const { mergeMarkdownContent } = testing;

describe("markdown", () => {
  describe("parseMarkdownContent", () => {
    it("parses overview and fields", () => {
      const md = [
        "## Overview",
        "This is the Author entity.",
        "",
        "## Fields",
        "",
        "### firstName",
        "",
        "The author's first name.",
        "",
        "### lastName",
        "",
        "The author's last name.",
        "",
      ].join("\n");
      expect(parseMarkdownContent(md)).toEqual({
        overview: "This is the Author entity.",
        fields: {
          firstName: "The author's first name.",
          lastName: "The author's last name.",
        },
      });
    });

    it("handles multi-line overview", () => {
      const md = ["## Overview", "Line one.", "", "Line two after blank.", "", "## Fields", ""].join("\n");
      expect(parseMarkdownContent(md)).toEqual({
        overview: "Line one.\n\nLine two after blank.",
        fields: {},
      });
    });

    it("handles multi-line field docs", () => {
      const md = [
        "## Overview",
        "Entity doc.",
        "",
        "## Fields",
        "",
        "### notes",
        "First paragraph.",
        "",
        "Second paragraph.",
        "",
      ].join("\n");
      expect(parseMarkdownContent(md)).toEqual({
        overview: "Entity doc.",
        fields: {
          notes: "First paragraph.\n\nSecond paragraph.",
        },
      });
    });

    it("returns empty strings when sections are empty", () => {
      const md = "## Overview\n\n## Fields\n";
      expect(parseMarkdownContent(md)).toEqual({
        overview: "",
        fields: {},
      });
    });

    it("ignores unknown sections", () => {
      const md = [
        "## Overview",
        "The overview.",
        "",
        "## SomeOtherSection",
        "Should be ignored.",
        "",
        "## Fields",
        "",
        "### name",
        "The name.",
        "",
      ].join("\n");
      expect(parseMarkdownContent(md)).toEqual({
        overview: "The overview.",
        fields: { name: "The name." },
      });
    });

    it("parses field docs with markdown tables", () => {
      const md = [
        "## Overview",
        "Entity.",
        "",
        "## Fields",
        "",
        "### status",
        "",
        "The current status. Possible values:",
        "",
        "| Value | Meaning |",
        "|-------|---------|",
        "| ACTIVE | Currently active |",
        "| INACTIVE | No longer active |",
        "",
      ].join("\n");
      expect(parseMarkdownContent(md)).toMatchObject({
        fields: {
          status: [
            "The current status. Possible values:",
            "",
            "| Value | Meaning |",
            "|-------|---------|",
            "| ACTIVE | Currently active |",
            "| INACTIVE | No longer active |",
          ].join("\n"),
        },
      });
    });
  });

  describe("mergeMarkdownContent", () => {
    it("preserves custom sections between Overview and Fields", () => {
      const existing = [
        "## Overview",
        "Old overview.",
        "",
        "## Business Rules",
        "",
        "| Rule | Description |",
        "|------|-------------|",
        "| no nulls | Name is required |",
        "",
        "## Fields",
        "",
        "### name",
        "",
        "The name.",
        "",
      ].join("\n");

      const result = mergeMarkdownContent(existing, "New overview.", {});
      expect(result).toBe(
        [
          "## Overview",
          "New overview.",
          "",
          "## Business Rules",
          "",
          "| Rule | Description |",
          "|------|-------------|",
          "| no nulls | Name is required |",
          "",
          "## Fields",
          "",
          "### name",
          "",
          "The name.",
          "",
        ].join("\n"),
      );
    });

    it("preserves custom sections after Fields", () => {
      const existing = [
        "## Overview",
        "The overview.",
        "",
        "## Fields",
        "",
        "### name",
        "",
        "The name.",
        "",
        "## Notes",
        "",
        "```typescript",
        "const a = 1;",
        "```",
        "",
      ].join("\n");

      const result = mergeMarkdownContent(existing, undefined, { age: "The age." });
      expect(result).toBe(
        [
          "## Overview",
          "The overview.",
          "",
          "## Fields",
          "",
          "### name",
          "",
          "The name.",
          "",
          "### age",
          "",
          "The age.",
          "",
          "## Notes",
          "",
          "```typescript",
          "const a = 1;",
          "```",
          "",
        ].join("\n"),
      );
    });

    it("appends new fields without touching existing ones", () => {
      const existing = [
        "## Overview",
        "The overview.",
        "",
        "## Fields",
        "",
        "### name",
        "",
        "User-written name doc with **bold** text.",
        "",
      ].join("\n");

      const result = mergeMarkdownContent(existing, undefined, { age: "The age." });
      expect(result).toBe(
        [
          "## Overview",
          "The overview.",
          "",
          "## Fields",
          "",
          "### name",
          "",
          "User-written name doc with **bold** text.",
          "",
          "### age",
          "",
          "The age.",
          "",
        ].join("\n"),
      );
    });

    it("replaces an existing field's doc", () => {
      const existing = ["## Overview", "The overview.", "", "## Fields", "", "### name", "", "Old name doc.", ""].join(
        "\n",
      );
      const result = mergeMarkdownContent(existing, undefined, { name: "New name doc." });
      expect(result).toBe(
        ["## Overview", "The overview.", "", "## Fields", "", "### name", "", "New name doc.", ""].join("\n"),
      );
    });

    it("creates Fields section if it doesn't exist", () => {
      const existing = ["## Overview", "The overview.", ""].join("\n");
      const result = mergeMarkdownContent(existing, undefined, { name: "The name." });
      expect(result).toBe(
        ["## Overview", "The overview.", "", "", "## Fields", "", "### name", "", "The name.", ""].join("\n"),
      );
    });

    it("does not modify content when nothing to merge", () => {
      const existing = ["## Overview", "The overview.", "", "## Fields", "", "### name", "", "The name.", ""].join(
        "\n",
      );
      const result = mergeMarkdownContent(existing, undefined, {});
      expect(result).toBe(existing);
    });
  });
});
