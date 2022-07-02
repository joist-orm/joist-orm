export class PublisherSize {
  public static readonly Small = new PublisherSize(1, "SMALL", "Small");
  public static readonly Large = new PublisherSize(2, "LARGE", "Large");

  public static findByCode(code: string): PublisherSize | undefined {
    return PublisherSize.getValues().find((d) => d.code === code);
  }

  public static findById(id: number): PublisherSize | undefined {
    return PublisherSize.getValues().find((d) => d.id === id);
  }

  public static getValues(): ReadonlyArray<PublisherSize> {
    return [PublisherSize.Small, PublisherSize.Large];
  }

  private constructor(public id: number, public code: string, public name: string) {}

  public get isSmall(): boolean {
    return this === PublisherSize.Small;
  }

  public get isLarge(): boolean {
    return this === PublisherSize.Large;
  }
}
