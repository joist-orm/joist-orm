import { CustomReference, Reference } from "joist-orm";
import { Author, Book, ImageCodegen, imageConfig as config, ImageType, Publisher } from "./entities";
type ImageOwner = Book | Publisher | Author;
export class Image extends ImageCodegen {
  // We don't use hasOneThrough or hasOneDerived b/c we use the ImageType to do a
  // selective .load instead of a load hint that probes every possible table.
  readonly owner: Reference<Image, ImageOwner, undefined> = new CustomReference<Image, ImageOwner, undefined>(this, {
    load: async (image) => {
      await image.ownerRef.load();
    },
    get: (image) => (image.ownerRef as any).get,
    set: (image, other) => {
      // TODO should validate other matches ImageType
      image.ownerRef.set(other as any);
    },
  });
  private get ownerRef() {
    return {
      [ImageType.AuthorImage]: this.author,
      [ImageType.BookImage]: this.book,
      [ImageType.PublisherImage]: this.publisher,
    }[this.type];
  }
}
config.addRule((image) => {
  const set = [image.author.isSet, image.publisher.isSet, image.book.isSet];
  if (set.filter((t) => t).length !== 1) {
    return "One and only one owner must be set";
  }
});
