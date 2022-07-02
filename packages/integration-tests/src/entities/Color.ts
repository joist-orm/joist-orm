export class Color {
  public static readonly Red = new Color(1, "RED", "Red");
  public static readonly Green = new Color(2, "GREEN", "Green");
  public static readonly Blue = new Color(3, "BLUE", "Blue");

  public static findByCode(code: string): Color | undefined {
    return Color.getValues().find((d) => d.code === code);
  }

  public static findById(id: number): Color | undefined {
    return Color.getValues().find((d) => d.id === id);
  }

  public static getValues(): ReadonlyArray<Color> {
    return [Color.Red, Color.Green, Color.Blue];
  }

  private constructor(public id: number, public code: string, public name: string) {}

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
