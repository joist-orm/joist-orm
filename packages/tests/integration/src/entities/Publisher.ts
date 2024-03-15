import {
  cannotBeUpdated,
  Collection,
  CustomCollection,
  getEm,
  hasReactiveQueryField,
  isLoaded,
  Loaded,
  ReactiveField,
} from "joist-orm";
import {
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
  /** Example of a reactive query. */
  readonly numberOfBookReviews: ReactiveField<Publisher, number> = hasReactiveQueryField(
    "numberOfBookReviews",
    // this hint will recalc + be available on `p`
    "id",
    // this hint will recalc + not be available on `p`
    { authors: { books: "reviews" } },
    // This is N+1 safe
    (p) => p.em.findCount(BookReview, { book: { author: { publisher: p.id } } }),
  );

  // Example of a custom collection that can add/remove
  readonly allImages: Collection<Publisher, Image> = new CustomCollection(this, {
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
        getEm(entity).delete(value);
      }
    },
    isLoaded: () => isLoaded(this, allImagesHint as any),
  });
}

/** Test the types for an enum default value (even though it is already matched by the db defaultValues). */
config.setDefault("type", () => PublisherType.Big);

// Example of a rule against a base type
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

// Example of reactive rule being fired by a persisted async property
config.addRule({ authors: "numberOfBooks" }, (p) => {
  const sum = p.authors.get.map((a) => a.numberOfBooks.get).reduce((a, b) => a + b, 0);
  if (sum === 15) {
    return "A publisher cannot have 15 books";
  }
});

// Example of an abstract/base CTI cascade deleting
config.cascadeDelete("bookAdvances");
