type ColorCodes = "RED" | "GREEN" | "BLUE";

export class Color<C extends ColorCodes = ColorCodes> {
  public static readonly Red = new Color<"RED">(1, "RED", "Red");
  public static readonly Green = new Color<"GREEN">(2, "GREEN", "Green");
  public static readonly Blue = new Color<"BLUE">(3, "BLUE", "Blue");

  public static findByCode(code: string): Color | undefined {
    return Color.getValues().find((d) => d.code === code);
  }

  public static findById(id: number): Color | undefined {
    return Color.getValues().find((d) => d.id === id);
  }

  public static getValues(): ReadonlyArray<Color> {
    return [Color.Red, Color.Green, Color.Blue];
  }

  private constructor(public id: number, public code: C, public name: string) {}

  public get isRed(): boolean {
    return this === Color.Red;
  }

  public get isGreen(): boolean {
    return this === Color.Green;
  }

  public get isBlue(): boolean {
    return this === Color.Blue;
  }
}
