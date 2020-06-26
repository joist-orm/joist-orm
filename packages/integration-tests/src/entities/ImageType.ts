export enum ImageType {
  BookImage = "BOOK_IMAGE",
  AuthorImage = "AUTHOR_IMAGE",
  PublisherImage = "PUBLISHER_IMAGE",
}

type Details = { id: number; code: ImageType; name: string };

const details: Record<ImageType, Details> = {
  [ImageType.BookImage]: { id: 1, code: ImageType.BookImage, name: "Book Image" },
  [ImageType.AuthorImage]: { id: 2, code: ImageType.AuthorImage, name: "Author Image" },
  [ImageType.PublisherImage]: { id: 3, code: ImageType.PublisherImage, name: "Publisher Image" },
};

export const ImageTypes = {
  getByCode(code: ImageType): Details {
    return details[code];
  },

  findByCode(code: string): Details | undefined {
    return details[code as ImageType];
  },

  findById(id: number): Details | undefined {
    return Object.values(details).find((d) => d.id === id);
  },

  getValues(): ReadonlyArray<ImageType> {
    return Object.values(ImageType);
  },

  getDetails(): ReadonlyArray<Details> {
    return Object.values(details);
  },
};
