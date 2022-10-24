import { Author, Book, ImageType, PublisherSize } from "@src/entities";
import "joist-orm";
import { getMetadata } from "joist-orm";
import { parseFilter } from "joist-orm/build/src/QueryBuilder";

describe("QueryBuilder", () => {
  describe(parseFilter, () => {
    it("can parse primitives", () => {
      expect(parseFilter(getMetadata(Author), { firstName: "a1" })).toMatchInlineSnapshot(`
        {
          "firstName": {
            "kind": "eq",
            "value": "a1",
          },
        }
      `);
    });

    it("can parse joins", () => {
      expect(parseFilter(getMetadata(Author), { publisher: { name: "p1" } })).toMatchInlineSnapshot(`
        {
          "publisher": {
            "kind": "join",
            "subFilter": {
              "name": {
                "kind": "eq",
                "value": "p1",
              },
            },
          },
        }
      `);
    });

    it("can parse m2o fk matches", () => {
      expect(parseFilter(getMetadata(Author), { publisher: "p:1" })).toMatchInlineSnapshot(`
        {
          "publisher": {
            "kind": "eq",
            "value": 1,
          },
        }
      `);
    });

    it("can parse multiple conditions", () => {
      expect(
        parseFilter(getMetadata(Author), { firstName: "a1", publisher: { name: "p1", size: PublisherSize.Large } }),
      ).toMatchInlineSnapshot(`
        {
          "firstName": {
            "kind": "eq",
            "value": "a1",
          },
          "publisher": {
            "kind": "join",
            "subFilter": {
              "name": {
                "kind": "eq",
                "value": "p1",
              },
              "size": {
                "kind": "eq",
                "value": "LARGE",
              },
            },
          },
        }
      `);
    });

    it("can parse o2o fk matches", () => {
      expect(parseFilter(getMetadata(Book), { image: { type: ImageType.BookImage } })).toMatchInlineSnapshot(`
        {
          "image": {
            "kind": "join",
            "subFilter": {
              "type": {
                "kind": "eq",
                "value": "BOOK_IMAGE",
              },
            },
          },
        }
      `);
    });
  });
});
