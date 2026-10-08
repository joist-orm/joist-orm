import type { EnumMetadata } from "joist-orm";

export enum PublisherStatus {
  Draft = "DRAFT",
  Active = "ACTIVE",
}

export type PublisherStatusDetails = { id: number; code: PublisherStatus; name: string };

const details: Record<PublisherStatus, PublisherStatusDetails> = {
  [PublisherStatus.Draft]: { id: 1, code: PublisherStatus.Draft, name: "Draft" },
  [PublisherStatus.Active]: { id: 2, code: PublisherStatus.Active, name: "Active" },
};

export const PublisherStatusDetails = {
  Draft: details[PublisherStatus.Draft],
  Active: details[PublisherStatus.Active],
};

export const PublisherStatuses: EnumMetadata<PublisherStatus, PublisherStatusDetails, number> = {
  name: "PublisherStatus",

  getByCode(code: PublisherStatus): PublisherStatusDetails {
    return details[code];
  },

  findByCode(code: string): PublisherStatusDetails | undefined {
    return details[code as PublisherStatus];
  },

  findById(id: number): PublisherStatusDetails | undefined {
    return Object.values(details).find((d) => d.id === id);
  },

  getValues(): ReadonlyArray<PublisherStatus> {
    return Object.values(PublisherStatus);
  },

  getDetails(): ReadonlyArray<PublisherStatusDetails> {
    return Object.values(details);
  },
};
