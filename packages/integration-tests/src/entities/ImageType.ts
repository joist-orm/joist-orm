type ImageTypeCodes = "BOOK_IMAGE" | "AUTHOR_IMAGE" | "PUBLISHER_IMAGE";

export class ImageType<C extends ImageTypeCodes = ImageTypeCodes> {
  public static readonly BookImage = new ImageType<"BOOK_IMAGE">(
    1,
    "BOOK_IMAGE",
    "Book Image",
    100,
    true,
    "book_image",
  );
  public static readonly AuthorImage = new ImageType<"AUTHOR_IMAGE">(
    2,
    "AUTHOR_IMAGE",
    "Author Image",
    200,
    true,
    "author_image",
  );
  public static readonly PublisherImage = new ImageType<"PUBLISHER_IMAGE">(
    3,
    "PUBLISHER_IMAGE",
    "Publisher Image",
    300,
    true,
    "publisher_image",
  );

  public static findByCode(code: string): ImageType | undefined {
    return ImageType.getValues().find((d) => d.code === code);
  }

  public static findById(id: number): ImageType | undefined {
    return ImageType.getValues().find((d) => d.id === id);
  }

  public static getValues(): ReadonlyArray<ImageType> {
    return [ImageType.BookImage, ImageType.AuthorImage, ImageType.PublisherImage];
  }

  private constructor(
    public id: number,
    public code: C,
    public name: string,
    public sortOrder: 100 | 200 | 300,
    public visible: boolean,
    public nickname: "book_image" | "author_image" | "publisher_image",
  ) {}

  public get isBookImage(): boolean {
    return this === ImageType.BookImage;
  }

  public get isAuthorImage(): boolean {
    return this === ImageType.AuthorImage;
  }

  public get isPublisherImage(): boolean {
    return this === ImageType.PublisherImage;
  }
}
