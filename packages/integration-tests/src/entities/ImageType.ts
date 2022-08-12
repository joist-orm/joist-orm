export enum ImageType {
  BookImage = "BOOK_IMAGE",
  AuthorImage = "AUTHOR_IMAGE",
  PublisherImage = "PUBLISHER_IMAGE",
}

export type ImageTypeDetails = {
  id: number;
  code: ImageType;
  name: string;
  sortOrder: 100 | 200 | 300;
  visible: boolean;
  nickname: "book_image" | "author_image" | "publisher_image";
  isBookImage: boolean;
  isAuthorImage: boolean;
  isPublisherImage: boolean;
};

const details: Record<ImageType, ImageTypeDetails> = {
  [ImageType.BookImage]: {
    id: 1,
    code: ImageType.BookImage,
    name: "Book Image",
    isBookImage: true,
    isAuthorImage: false,
    isPublisherImage: false,
    sortOrder: 100,
    visible: true,
    nickname: "book_image",
  },
  [ImageType.AuthorImage]: {
    id: 2,
    code: ImageType.AuthorImage,
    name: "Author Image",
    isBookImage: false,
    isAuthorImage: true,
    isPublisherImage: false,
    sortOrder: 200,
    visible: true,
    nickname: "author_image",
  },
  [ImageType.PublisherImage]: {
    id: 3,
    code: ImageType.PublisherImage,
    name: "Publisher Image",
    isBookImage: false,
    isAuthorImage: false,
    isPublisherImage: true,
    sortOrder: 300,
    visible: true,
    nickname: "publisher_image",
  },
};

export const ImageTypes = {
  BookImage: details[ImageType.BookImage],
  AuthorImage: details[ImageType.AuthorImage],
  PublisherImage: details[ImageType.PublisherImage],

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
