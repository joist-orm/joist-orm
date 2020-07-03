export enum AdvanceStatus {
  Pending = "PENDING",
  Signed = "SIGNED",
  Paid = "PAID",
}

type Details = { id: number; code: AdvanceStatus; name: string };

const details: Record<AdvanceStatus, Details> = {
  [AdvanceStatus.Pending]: { id: 1, code: AdvanceStatus.Pending, name: "Pending" },
  [AdvanceStatus.Signed]: { id: 2, code: AdvanceStatus.Signed, name: "Signed" },
  [AdvanceStatus.Paid]: { id: 3, code: AdvanceStatus.Paid, name: "Paid" },
};

export const AdvanceStatuses = {
  getByCode(code: AdvanceStatus): Details {
    return details[code];
  },

  findByCode(code: string): Details | undefined {
    return details[code as AdvanceStatus];
  },

  findById(id: number): Details | undefined {
    return Object.values(details).find((d) => d.id === id);
  },

  getValues(): ReadonlyArray<AdvanceStatus> {
    return Object.values(AdvanceStatus);
  },

  getDetails(): ReadonlyArray<Details> {
    return Object.values(details);
  },
};
