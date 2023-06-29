import { cannotBeUpdated, Collection, CustomCollection, getEm, Loaded } from "joist-orm";
import { Image, ImageType, ImageTypes, PublisherCodegen, publisherConfig as config } from "./entities";
const allImagesHint = ({ images: [], authors: { image: [], books: "image" } } as const);
export abstract class Publisher extends PublisherCodegen {
  readonly allImages: Collection<Publisher, Image> = new CustomCollection(this, {
    load: (entity, opts) => entity.populate({ hint: allImagesHint, ...opts }),
    get: (entity) => {
      const loaded = (entity as Loaded<Publisher, typeof allImagesHint>);
      return loaded.authors.get.reduce((images, author) => {
        images.push(author.image.get!);
        author.books.get.forEach((book) => images.push(book.image.get!));
        return images;
      }, [...loaded.images.get]).filter((imageOrUndefined) => imageOrUndefined !== undefined).sort((a, b) =>
        ImageTypes.findByCode(a.type)!.sortOrder - ImageTypes.findByCode(b.type)!.sortOrder
      );
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
  });
}

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
