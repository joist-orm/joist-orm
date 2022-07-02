export class PublisherType {
  public static readonly Small = new PublisherType(1, "SMALL", "Small");
  public static readonly Big = new PublisherType(2, "BIG", "Big");

  public static findByCode(code: string): PublisherType | undefined {
    return PublisherType.getValues().find((d) => d.code === code);
  }

  public static findById(id: number): PublisherType | undefined {
    return PublisherType.getValues().find((d) => d.id === id);
  }

  public static getValues(): ReadonlyArray<PublisherType> {
    return [PublisherType.Small, PublisherType.Big];
  }

  private constructor(public id: number, public code: string, public name: string) {}

  public get isSmall(): boolean {
    return this === PublisherType.Small;
  }

  public get isBig(): boolean {
    return this === PublisherType.Big;
  }
}
