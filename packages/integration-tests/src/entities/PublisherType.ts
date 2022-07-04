type PublisherTypeCodes = "SMALL" | "BIG";

export class PublisherType<C extends PublisherTypeCodes = PublisherTypeCodes> {
  public static readonly Small = new PublisherType<"SMALL">(1, "SMALL", "Small");
  public static readonly Big = new PublisherType<"BIG">(2, "BIG", "Big");

  public static findByCode(code: string): PublisherType | undefined {
    return PublisherType.getValues().find((d) => d.code === code);
  }

  public static findById(id: number): PublisherType | undefined {
    return PublisherType.getValues().find((d) => d.id === id);
  }

  public static getValues(): ReadonlyArray<PublisherType> {
    return [PublisherType.Small, PublisherType.Big];
  }

  private constructor(public id: number, public code: C, public name: string) {}

  public get isSmall(): boolean {
    return this === PublisherType.Small;
  }

  public get isBig(): boolean {
    return this === PublisherType.Big;
  }
}
