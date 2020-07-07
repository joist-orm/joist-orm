import { Image, ImageType, PublisherCodegen, publisherConfig } from "./entities";
import { Collection, CustomCollection, getEm, Loaded } from "joist-orm";

const allImagesHint = { images: [], authors: { image: [], books: "image" } } as const;
export class Publisher extends PublisherCodegen {
  readonly allImages: Collection<Publisher, Image> = new CustomCollection(this, {
    load: (entity) => entity.populate(allImagesHint),
    get: (entity) => {
      const loaded = entity as Loaded<Publisher, typeof allImagesHint>;
      const images = [...loaded.images.get] as (Image | undefined)[];
      loaded.authors.get.forEach((author) => {
        images.push(author.image.get);
        author.books.get.forEach((book) => images.push(book.image.get));
      });
      return images.filter((imageOrUndefined) => imageOrUndefined !== undefined) as Image[];
    },
    set: (entity, values) => {
      const allImages = (entity as Loaded<Publisher, "allImages">).allImages;
      values.forEach((image) => allImages.add(image));
      allImages.get.filter((image) => !values.includes(image)).forEach((image) => allImages.remove(image));
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

publisherConfig.addRule("authors", (p) => {
  if (p.authors.get.length === 13) {
    return "Cannot have 13 authors";
  }
});
