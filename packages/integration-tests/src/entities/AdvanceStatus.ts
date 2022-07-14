export enum AdvanceStatus {
  Pending = "PENDING",
  Signed = "SIGNED",
  Paid = "PAID",
}

export type AdvanceStatusDetails = {
  id: number;
  code: AdvanceStatus;
  name: string;
  isPending: boolean;
  isSigned: boolean;
  isPaid: boolean;
};

const details: Record<AdvanceStatus, AdvanceStatusDetails> = {
  [AdvanceStatus.Pending]: {
    id: 1,
    code: AdvanceStatus.Pending,
    name: "Pending",
    isPending: true,
    isSigned: false,
    isPaid: false,
  },
  [AdvanceStatus.Signed]: {
    id: 2,
    code: AdvanceStatus.Signed,
    name: "Signed",
    isPending: false,
    isSigned: true,
    isPaid: false,
  },
  [AdvanceStatus.Paid]: {
    id: 3,
    code: AdvanceStatus.Paid,
    name: "Paid",
    isPending: false,
    isSigned: false,
    isPaid: true,
  },
};

export const AdvanceStatuses = {
  Pending: details[AdvanceStatus.Pending],
  Signed: details[AdvanceStatus.Signed],
  Paid: details[AdvanceStatus.Paid],

  getByCode(code: AdvanceStatus): AdvanceStatusDetails {
    return details[code];
  },

  findByCode(code: string): AdvanceStatusDetails | undefined {
    return details[code as AdvanceStatus];
  },

  findById(id: number): AdvanceStatusDetails | undefined {
    return Object.values(details).find((d) => d.id === id);
  },

  getValues(): ReadonlyArray<AdvanceStatus> {
    return Object.values(AdvanceStatus);
  },

  getDetails(): ReadonlyArray<AdvanceStatusDetails> {
    return Object.values(details);
  },
};
