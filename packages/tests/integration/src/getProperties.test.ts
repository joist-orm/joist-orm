import { authorMeta, bookMeta, bookReviewMeta, imageMeta, publisherMeta } from "@src/entities";
import {
  CustomCollection,
  CustomReference,
  ManyToManyCollection,
  ManyToOneReferenceImpl,
  OneToManyCollection,
  OneToOneReferenceImpl,
  UnknownProperty,
  getProperties,
} from "joist-orm";

describe("getProperties", () => {
  it("should work", () => {
    expect(getProperties(bookMeta)).toStrictEqual({
      advances: expect.any(OneToManyCollection),
      reviews: expect.any(OneToManyCollection),
      comments: expect.any(OneToManyCollection),
      author: expect.any(ManyToOneReferenceImpl),
      authorSetWhenDeleteRuns: expect.any(UnknownProperty),
      currentDraftAuthor: expect.any(OneToOneReferenceImpl),
      image: expect.any(OneToOneReferenceImpl),
      tags: expect.any(ManyToManyCollection),
      favoriteColorsRuleInvoked: 0,
      firstNameRuleInvoked: 0,
      reviewsRuleInvoked: 0,
      rulesInvoked: 0,
      numberOfBooks2RuleInvoked: 0,
    });
  });

  it("works for custom references", () => {
    expect(getProperties(imageMeta)).toEqual(
      expect.objectContaining({
        owner: expect.any(CustomReference),
      }),
    );
  });

  it("works for custom collections", () => {
    expect(getProperties(publisherMeta)).toEqual(
      expect.objectContaining({
        allImages: expect.any(CustomCollection),
      }),
    );
  });

  it("works for hasOneThrough and hasOneDerived", () => {
    expect(getProperties(bookReviewMeta)).toEqual(
      expect.objectContaining({
        author: expect.any(CustomReference),
        publisher: expect.any(CustomReference),
      }),
    );
  });

  it("works for hasManyThrough and hasManyDerived", () => {
    expect(getProperties(authorMeta)).toEqual(
      expect.objectContaining({
        reviews: expect.any(CustomCollection),
        reviewedBooks: expect.any(CustomCollection),
      }),
    );
  });

  it("includes non-relations", () => {
    expect(Object.keys(getProperties(authorMeta))).toEqual(
      expect.arrayContaining([
        "withLoadedBooks",
        "initials",
        "fullName",
        "isPopular",
        "hasBooks",
        "authors",
        "books",
        "mentor",
        "publisher",
        "image",
      ]),
    );
  });

  it("does not include fullNonReactiveAccess", () => {
    const p = Object.keys(getProperties(authorMeta));
    expect(p).not.toEqual(expect.arrayContaining(["fullNonReactiveAccess"]));
  });

  it("does not include transientFields", () => {
    const p = Object.keys(getProperties(authorMeta));
    expect(p).not.toEqual(expect.arrayContaining(["transientFields"]));
  });
});
