import { authorMeta, bookMeta, bookReviewMeta, imageMeta, publisherMeta } from "@src/entities";
import { CustomCollection, CustomReference, getProperties } from "joist-orm";

describe("getProperties", () => {
  it("should work", () => {
    const props = getProperties(bookMeta);

    expect(Object.keys(props).sort()).toEqual([
      "advances",
      "author",
      "commentParentInfo",
      "comments",
      "createdAt",
      "currentDraftAuthor",
      "favoriteAuthor",
      "image",
      "prequel",
      "prequelsRecursive",
      "randomComment",
      "reviewer",
      "reviews",
      "search",
      "sequel",
      "sequelsRecursive",
      "tags",
      "updatedAt",
    ]);

    expect(
      Object.fromEntries(
        Object.entries(props).map(([key, value]) => {
          return [key, value.constructor?.name ?? typeof value];
        }),
      ),
    ).toMatchInlineSnapshot(`
     {
       "advances": "OneToManyCollection",
       "author": "ManyToOneReferenceImpl",
       "commentParentInfo": "AsyncPropertyImpl",
       "comments": "OneToManyCollection",
       "createdAt": "UnknownProperty",
       "currentDraftAuthor": "OneToOneReferenceImpl",
       "favoriteAuthor": "OneToOneReferenceImpl",
       "image": "OneToOneReferenceImpl",
       "prequel": "ManyToOneReferenceImpl",
       "prequelsRecursive": "RecursiveParentsCollectionImpl",
       "randomComment": "ManyToOneReferenceImpl",
       "reviewer": "ManyToOneReferenceImpl",
       "reviews": "OneToManyCollection",
       "search": "ReactiveFieldImpl",
       "sequel": "OneToOneReferenceImpl",
       "sequelsRecursive": "RecursiveChildrenCollectionImpl",
       "tags": "ManyToManyCollection",
       "updatedAt": "UnknownProperty",
     }
    `);
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
        "reviews",
        "reviewedBooks",
        "latestComment",
        "favoriteBook",
        "numberOfBooks2",
        "latestComment2",
        "allPublisherAuthorNames",
        "latestComments",
        "commentParentInfo",
        "booksWithTitle",
        "booksTitles",
        "hasLowerCaseFirstName",
        "withLoadedBooks",
        "fullName",
        "fullName2",
        "hasBooks",
        "setWasEverPopular",
        "isFew",
        "isLot",
        "favoriteColorsDetails",
        "isRed",
        "isGreen",
        "isBlue",
        "isCircle",
        "isSquare",
        "isTriangle",
        "mentees",
        "menteesRecursive",
        "schedules",
        "books",
        "comments",
        "tasks",
        "mentor",
        "mentorsRecursive",
        "currentDraftBook",
        "publisher",
        "image",
        "userOneToOne",
        "tags",
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
