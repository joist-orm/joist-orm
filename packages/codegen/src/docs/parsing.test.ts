import { applyEdits, buildJSDocEdit, parseEntityJSDocs } from "./parsing";

describe("parsing", () => {
  describe("parseEntityJSDocs", () => {
    it("extracts class-level JSDoc", () => {
      const source = ["/** The Author entity. */", "export class Author extends AuthorCodegen {}"].join("\n");
      const { classDoc } = parseEntityJSDocs(source);
      expect(classDoc).toBe("The Author entity.");
    });

    it("extracts class-level JSDoc when no doc present", () => {
      const source = "export class Author extends AuthorCodegen {}";
      const { classDoc } = parseEntityJSDocs(source);
      expect(classDoc).toBeUndefined();
    });

    it("extracts field JSDoc from class properties", () => {
      const source = [
        "export class Author extends AuthorCodegen {",
        "  /** The first name. */",
        '  readonly firstName: string = "";',
        '  lastName: string = "";',
        "}",
      ].join("\n");
      const { members } = parseEntityJSDocs(source);
      expect(members).toMatchObject([
        { name: "firstName", kind: "property", doc: "The first name." },
        { name: "lastName", kind: "property", doc: undefined },
      ]);
    });

    it("extracts JSDoc from getters, setters, and methods", () => {
      const source = [
        "export class Author extends AuthorCodegen {",
        "  /** Getter doc. */",
        '  get fullName(): string { return ""; }',
        "  /** Setter doc. */",
        "  set fullName(v: string) {}",
        "  /** Method doc. */",
        "  async doStuff(): Promise<void> {}",
        "}",
      ].join("\n");
      const { members } = parseEntityJSDocs(source);
      expect(members).toMatchObject([
        { name: "fullName", kind: "getter", doc: "Getter doc." },
        { name: "fullName", kind: "setter", doc: "Setter doc." },
        { name: "doStuff", kind: "method", doc: "Method doc." },
      ]);
    });

    it("handles multi-line JSDoc", () => {
      const source = [
        "export class Author extends AuthorCodegen {",
        "  /**",
        "   * Line one.",
        "   * Line two.",
        "   */",
        '  readonly notes: string = "";',
        "}",
      ].join("\n");
      const { members } = parseEntityJSDocs(source);
      expect(members[0].doc).toBe("Line one.\nLine two.");
    });
  });

  describe("buildJSDocEdit / applyEdits", () => {
    it("does not produce trailing spaces on blank lines in multi-line docs", () => {
      const source = ["export class Author extends AuthorCodegen {", '  readonly notes: string = "";', "}"].join("\n");
      const { members } = parseEntityJSDocs(source);
      const edit = buildJSDocEdit(members[0].node, "First paragraph.\n\nSecond paragraph.");
      const output = applyEdits(source, [edit]);
      for (const line of output.split("\n")) {
        expect(line).toBe(line.trimEnd());
      }
      expect(output).toMatch(/\* First paragraph\.\n\s+\*\n\s+\* Second paragraph\./);
    });

    it("replaces an existing comment without reformatting other code", () => {
      const source = [
        "/** Old class doc. */",
        "export class Foo {",
        "  /** Old field doc. */",
        '  readonly name: string = "";',
        "}",
      ].join("\n");
      const { classNode, members } = parseEntityJSDocs(source);
      const edits = [buildJSDocEdit(classNode!, "New class doc."), buildJSDocEdit(members[0].node, "New field doc.")];
      const output = applyEdits(source, edits);
      expect(output).toBe(
        [
          "/** New class doc. */",
          "export class Foo {",
          "  /** New field doc. */",
          '  readonly name: string = "";',
          "}",
        ].join("\n"),
      );
    });

    it("inserts a new comment where none existed", () => {
      const source = ["export class Foo {", '  readonly name: string = "";', "}"].join("\n");
      const { members } = parseEntityJSDocs(source);
      const output = applyEdits(source, [buildJSDocEdit(members[0].node, "The name.")]);
      expect(output).toBe(
        ["export class Foo {", "  /** The name. */", '  readonly name: string = "";', "}"].join("\n"),
      );
    });

    it("indents multi-line field docs to match the field's indentation", () => {
      const source = [
        "export class Invoice extends InvoiceCodegen {",
        "  /** Old doc. */",
        "  readonly pocInvoicedToDateInCents: number = 0;",
        "}",
      ].join("\n");
      const { members } = parseEntityJSDocs(source);
      const text = "Calculate the POC as of this invoice creation.\nFilter out Void and Rejected invoices.";
      const output = applyEdits(source, [buildJSDocEdit(members[0].node, text)]);
      expect(output).toBe(
        [
          "export class Invoice extends InvoiceCodegen {",
          "  /**",
          "   * Calculate the POC as of this invoice creation.",
          "   * Filter out Void and Rejected invoices.",
          "   */",
          "  readonly pocInvoicedToDateInCents: number = 0;",
          "}",
        ].join("\n"),
      );
    });

    it("preserves all original formatting when replacing docs", () => {
      const source = [
        "/** The entity. */",
        "export class Author extends AuthorCodegen {",
        "  readonly transientFields = {",
        '    beforeFlushRan: { type: "boolean", default: false },',
        '    beforeCreateRan: { type: "boolean", default: false },',
        "  };",
        "}",
      ].join("\n");
      const { classNode } = parseEntityJSDocs(source);
      const output = applyEdits(source, [buildJSDocEdit(classNode!, "Updated entity.")]);
      expect(output).toBe(
        [
          "/** Updated entity. */",
          "export class Author extends AuthorCodegen {",
          "  readonly transientFields = {",
          '    beforeFlushRan: { type: "boolean", default: false },',
          '    beforeCreateRan: { type: "boolean", default: false },',
          "  };",
          "}",
        ].join("\n"),
      );
    });
  });

  describe("fieldDocs", () => {
    it("prefers getter doc over setter doc for same name", () => {
      const source = [
        "export class Author extends AuthorCodegen {",
        "  /** The full name. */",
        '  get fullName(): string { return ""; }',
        "  /** Set the full name. */",
        "  set fullName(v: string) {}",
        "}",
      ].join("\n");
      const { fieldDocs } = parseEntityJSDocs(source);
      expect(fieldDocs).toEqual({ fullName: "The full name." });
    });

    it("uses setter doc when getter has no doc", () => {
      const source = [
        "export class Author extends AuthorCodegen {",
        '  get fullName(): string { return ""; }',
        "  /** Set the full name. */",
        "  set fullName(v: string) {}",
        "}",
      ].join("\n");
      const { fieldDocs } = parseEntityJSDocs(source);
      expect(fieldDocs).toEqual({ fullName: "Set the full name." });
    });

    it("skips members without docs", () => {
      const source = [
        "export class Author extends AuthorCodegen {",
        "  /** A doc. */",
        '  readonly a: string = "";',
        '  readonly b: string = "";',
        "}",
      ].join("\n");
      const { fieldDocs } = parseEntityJSDocs(source);
      expect(fieldDocs).toEqual({ a: "A doc." });
    });

    it("skips methods", () => {
      const source = [
        "export class Author extends AuthorCodegen {",
        "  /** The first name. */",
        '  readonly firstName: string = "";',
        "  /** Text representation. */",
        "  async toDetailString(): Promise<string> { return ''; }",
        "}",
      ].join("\n");
      const { fieldDocs } = parseEntityJSDocs(source);
      expect(fieldDocs).toEqual({ firstName: "The first name." });
    });
  });
});
