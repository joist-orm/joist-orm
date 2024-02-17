import { authorMeta, bookMeta, bookReviewMeta, imageMeta, publisherMeta } from "@src/entities";
import {
  AsyncMethodImpl,
  CustomCollection,
  CustomReference,
  FieldProperty,
  ManyToManyCollection,
  ManyToOneReferenceImpl,
  OneToManyCollection,
  OneToOneReferenceImpl,
  UnknownProperty,
  getProperties,
} from "joist-orm";

describe("getProperties", () => {
  it("should work", () => {
    expect(Object.keys(getProperties(bookMeta)).sort()).toEqual([
      "advances",
      "author",
      "authorSetWhenDeleteRuns",
      "comments",
      "createdAt",
      "currentDraftAuthor",
      "deletedAt",
      "favoriteColorsRuleInvoked",
      "firstNameRuleInvoked",
      "id",
      "image",
      "notes",
      "numberOfBooks2RuleInvoked",
      "order",
      "publish",
      "reviews",
      "reviewsRuleInvoked",
      "rulesInvoked",
      "tags",
      "title",
      "updatedAt",
    ]);

    expect(getProperties(bookMeta)).toEqual({
      advances: expect.any(OneToManyCollection),
      author: expect.any(ManyToOneReferenceImpl),
      authorSetWhenDeleteRuns: expect.any(UnknownProperty),
      comments: expect.any(OneToManyCollection),
      createdAt: expect.any(FieldProperty),
      currentDraftAuthor: expect.any(OneToOneReferenceImpl),
      deletedAt: expect.any(FieldProperty),
      favoriteColorsRuleInvoked: 0,
      firstNameRuleInvoked: 0,
      id: expect.any(FieldProperty),
      image: expect.any(OneToOneReferenceImpl),
      notes: expect.any(FieldProperty),
      numberOfBooks2RuleInvoked: 0,
      order: expect.any(FieldProperty),
      publish: expect.any(AsyncMethodImpl),
      reviews: expect.any(OneToManyCollection),
      reviewsRuleInvoked: 0,
      rulesInvoked: 0,
      tags: expect.any(ManyToManyCollection),
      title: expect.any(FieldProperty),
      updatedAt: expect.any(FieldProperty),
    });
  });

  it("does not include getters", () => {
    const p = getProperties(authorMeta);
    expect(p["fullName"]).toEqual("undefined");
    expect(p["firstName"]).toBeInstanceOf(FieldProperty);
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
