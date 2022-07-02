export class AdvanceStatus {
  public static readonly Pending = new AdvanceStatus(1, "PENDING", "Pending");
  public static readonly Signed = new AdvanceStatus(2, "SIGNED", "Signed");
  public static readonly Paid = new AdvanceStatus(3, "PAID", "Paid");

  public static findByCode(code: string): AdvanceStatus | undefined {
    return AdvanceStatus.getValues().find((d) => d.code === code);
  }

  public static findById(id: number): AdvanceStatus | undefined {
    return AdvanceStatus.getValues().find((d) => d.id === id);
  }

  public static getValues(): ReadonlyArray<AdvanceStatus> {
    return [AdvanceStatus.Pending, AdvanceStatus.Signed, AdvanceStatus.Paid];
  }

  private constructor(public id: number, public code: string, public name: string) {}

  public get isPending(): boolean {
    return this === AdvanceStatus.Pending;
  }

  public get isSigned(): boolean {
    return this === AdvanceStatus.Signed;
  }

  public get isPaid(): boolean {
    return this === AdvanceStatus.Paid;
  }
}
