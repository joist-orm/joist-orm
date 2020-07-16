export enum ImageType {
  BookImage = "BOOK_IMAGE",
  AuthorImage = "AUTHOR_IMAGE",
  PublisherImage = "PUBLISHER_IMAGE",
}

export type ImageTypeDetails = { id: number; code: ImageType; name: string; sortOrder: number };

const details: Record<ImageType, ImageTypeDetails> = {
  [ImageType.BookImage]: { id: 1, code: ImageType.BookImage, name: "Book Image", sortOrder: 100 },
  [ImageType.AuthorImage]: { id: 2, code: ImageType.AuthorImage, name: "Author Image", sortOrder: 200 },
  [ImageType.PublisherImage]: { id: 3, code: ImageType.PublisherImage, name: "Publisher Image", sortOrder: 300 },
};

export const ImageTypes = {
  getByCode(code: ImageType): ImageTypeDetails {
    return details[code];
  },

  findByCode(code: string): ImageTypeDetails | undefined {
    return details[code as ImageType];
  },

  findById(id: number): ImageTypeDetails | undefined {
    return Object.values(details).find((d) => d.id === id);
  },

  getValues(): ReadonlyArray<ImageType> {
    return Object.values(ImageType);
  },

  getDetails(): ReadonlyArray<ImageTypeDetails> {
    return Object.values(details);
  },
};
