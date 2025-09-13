import {
  AsyncProperty,
  cannotBeUpdated,
  Collection,
  hasCustomCollection,
  hasReactiveAsyncProperty,
  hasReactiveField,
  hasReactiveQueryField,
  hasReactiveReference,
  isLoaded,
  Loaded,
  ReactiveField,
  ReactiveReference,
} from "joist-orm";
import {
  Author,
  authorMeta,
  BookReview,
  publisherConfig as config,
  Image,
  ImageType,
  ImageTypes,
  PublisherCodegen,
  PublisherType,
} from "./entities";

const allImagesHint = { images: [], authors: { image: [], books: "image" } } as const;

export abstract class Publisher extends PublisherCodegen {
  transientFields = {
    numberOfBookReviewEvals: 0,
    numberOfBookReviewCalcs: 0,
    wasNewInBeforeCommit: undefined as boolean | undefined,
    changedInBeforeCommit: [] as string[],
    bookAdvanceTitlesSnapshotCalcs: 0,
    numberOfBookAdvancesSnapshotCalcs: 0,
  };

  static afterMetadataHasSubTypes = false;

  /** Example of a reactive query. */
  readonly numberOfBookReviews: ReactiveField<Publisher, number> = hasReactiveQueryField(
    "numberOfBookReviews",
    // this hint will recalc + be available on `p`
    "id",
    // this hint will recalc + not be available on `p`
    { authors: { books: "reviews" } },
    // findCount is N+1 safe
    (p) => {
      p.transientFields.numberOfBookReviewCalcs++;
      return p.em.findCount(BookReview, { book: { author: { publisher: p.id } } });
    },
  );

  /** Example of a ReactiveField reacting to ReactiveReferences (where a.favoriteBook is a unique). */
  readonly titlesOfFavoriteBooks: ReactiveField<Publisher, string | undefined> = hasReactiveField(
    "titlesOfFavoriteBooks",
    { authors: { favoriteBook: "title" } },
    (p) => {
      return (
        p.authors.get
          .map((a) => a.favoriteBook.get)
          .filter((b) => b !== undefined)
          .map((b) => b.title)
          .join(", ") || undefined
      );
    },
  );

  /** Example of a ReactiveReference in an entity with subtypes. */
  readonly favoriteAuthor: ReactiveReference<Publisher, Author, undefined> = hasReactiveReference(
    authorMeta,
    "favoriteAuthor",
    { authors: "books" },
    (p) => {
      // Prefer authors with the most books
      return [...p.authors.get].sort((a, b) => b.books.get.length - a.books.get.length)[0];
    },
  );

  /** Example of a ReactiveField reacting to ReactiveReferences (where p.favoriteAuthor is not unique) . */
  readonly favoriteAuthorName: ReactiveField<Publisher, string> = hasReactiveField(
    "favoriteAuthorName",
    // _ro suffixes work around this for now
    { favoriteAuthor_ro: "firstName:ro" },
    (p) => {
      return p.favoriteAuthor.get?.firstName || "";
    },
  );

  /** Example of a RF that uses a lot of read-only hints, it should recalc only when p.name itself changes. */
  readonly bookAdvanceTitlesSnapshot: ReactiveField<Publisher, string> = hasReactiveField(
    "bookAdvanceTitlesSnapshot",
    { name: {}, bookAdvances_ro: "status_ro" },
    (p) => {
      p.transientFields.bookAdvanceTitlesSnapshotCalcs++;
      return [p.name, ...p.bookAdvances.get.map((ba) => ba.status)].join(",");
    },
  );

  /** Example of a RF that uses solely a o2m read-only hints, it should recalc only when p.name itself changes. */
  readonly numberOfBookAdvancesSnapshot: ReactiveField<Publisher, string> = hasReactiveField(
    "numberOfBookAdvancesSnapshot",
    { bookAdvances_ro: {} },
    (p) => {
      p.transientFields.numberOfBookAdvancesSnapshotCalcs++;
      return String(p.bookAdvances.get.length);
    },
  );

  // Example of a custom collection that can add/remove
  readonly allImages: Collection<Publisher, Image> = hasCustomCollection<Publisher, Image>({
    load: (entity, opts) => entity.populate({ hint: allImagesHint, ...opts }),
    get: (entity) => {
      const loaded = entity as Loaded<Publisher, typeof allImagesHint>;
      return loaded.authors.get
        .reduce(
          (images, author) => {
            images.push(author.image.get!);
            author.books.get.forEach((book) => images.push(book.image.get!));
            return images;
          },
          [...loaded.images.get],
        )
        .filter((imageOrUndefined) => imageOrUndefined !== undefined)
        .sort((a, b) => ImageTypes.findByCode(a.type)!.sortOrder - ImageTypes.findByCode(b.type)!.sortOrder);
    },
    add: (entity, value) => {
      const allImages = (entity as Loaded<Publisher, "allImages">).allImages;
      if (!allImages.get.includes(value)) {
        value.type = ImageType.PublisherImage;
        value.author.set(undefined);
        value.book.set(undefined);
        value.publisher.set(entity);
      }
    },
    remove: (entity, value) => {
      const allImages = (entity as Loaded<Publisher, "allImages">).allImages;
      if (allImages.get.includes(value)) {
        entity.em.delete(value);
      }
    },
    isLoaded: (entity) => isLoaded(entity, allImagesHint as any),
  });

  /** For testing reacting to poly CommentParent properties. */
  readonly commentParentInfo: AsyncProperty<Publisher, string> = hasReactiveAsyncProperty([], () => ``);
}

config.afterMetadata((meta) => {
  Publisher.afterMetadataHasSubTypes = meta.subTypes.length > 0;
  // For testing rules added from afterMetadatas
  config.addRule("name", (p) => {
    if (p.name === "invalid") {
      return "Name cannot be 'invalid'";
    }
  });
});

/** Test the types for an enum default value (even though it is already matched by the db defaultValues). */
config.setDefault("type", () => PublisherType.Big);

/** Test that base class defaults are processed and persisted */
config.setDefault("baseSyncDefault", () => "BaseSyncDefault");
config.setDefault("baseAsyncDefault", "authors", () => "BaseAsyncDefault");

/** Test that defaults will be skipped when set to null. */
config.setDefault("spotlightAuthor", "authors", (p) => {
  return p.authors.get[0];
});

// Example of a rule directly on a base type, against a base type field
config.addRule(cannotBeUpdated("type"));

config.addRule("authors", (p) => {
  if (p.authors.get.length === 13) {
    return "Cannot have 13 authors";
  }
});

// Example of reactive rule being fired by an async property
config.addRule({ authors: "numberOfBooks2" }, (p) => {
  const sum = p.authors.get.map((a) => a.numberOfBooks2.get).reduce((a, b) => a + b, 0);
  if (sum === 13) {
    return "A publisher cannot have 13 books";
  }
});

// Example of reactive rule being fired by a ReactiveField
config.addRule({ authors: "numberOfBooks" }, (p) => {
  const sum = p.authors.get.map((a) => a.numberOfBooks.get).reduce((a, b) => a + b, 0);
  if (sum === 15) {
    return "A publisher cannot have 15 books";
  }
});

// Example of a reactive rule being fired by a ReactiveQueryField
config.addRule(["name", "numberOfBookReviews"], (p) => {
  p.transientFields.numberOfBookReviewEvals++;
  if (p.name === "four" && p.numberOfBookReviews.get === 4) {
    return "Publisher 'four' cannot have 4 books";
  }
});

// Example of reactive rule being fired on ReactiveReference change.
// Currently, these must be a `_ro` because there is not a `author.favoriteOfPublishers` field to reverse walk.
// `reverseReactiveHint` should enforce the read-only-ness
config.addRule({ favoriteAuthor_ro: "firstName:ro", name: {} }, (p) => {
  if (p.favoriteAuthor.get?.firstName === p.name) {
    return "Favorite Author firstName cannot be the publisher's name";
  }
});

// Example of a read-only rule only being fired on create
// ...we have to go all the way to `randomComment` to find an entity that will not
// already kick off a bunch of reactivity & require loading the publisher
config.addRule({ authors_ro: { books_ro: { randomComment_ro: "text_ro" } }, name: {} }, (p) => {
  const comments = p.authors.get.flatMap((a) => a.books.get.flatMap((b) => b.randomComment.get));
  if (comments.some((c) => c?.text === p.name)) {
    return "Publisher name cannot equal the comment text";
  }
});

// For testing touchOnChange from base types
config.touchOnChange("tags");

// Example of an abstract/base CTI cascade deleting
config.cascadeDelete("bookAdvances");

/** For testing beforeCommits observe the right data with RQFs. */
config.beforeCommit((p) => {
  p.transientFields.wasNewInBeforeCommit = p.isNewEntity;
  p.transientFields.changedInBeforeCommit = [...p.changes.fields];
});
